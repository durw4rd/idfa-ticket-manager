import { db } from '@vercel/postgres';
import { sql } from './db';
import { CrewMember, Group, GroupMember } from './types';
import { assignCrewLooks, type Badge, getDisplayName } from './display';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Emails whose tickets and ratings the user can see: the user plus everyone
 * who is an active member of one of the user's active groups.
 */
export async function getVisibleEmails(userEmail: string): Promise<string[]> {
  const me = normalizeEmail(userEmail);
  const result = await sql`
    SELECT DISTINCT other.user_email as "email"
    FROM group_members mine
    JOIN group_members other ON other.group_id = mine.group_id
    WHERE mine.user_email = ${me} AND mine.status = 'active' AND other.status = 'active'
  `;

  const emails = new Set<string>([me]);
  for (const row of result.rows) {
    emails.add(row.email as string);
  }
  return Array.from(emails);
}

/**
 * The viewer plus everyone in `visibleEmails`, with display names, badges and colours (see
 * assignCrewLooks). The viewer comes first, then crew-mates in the order they joined.
 *
 * A badge clash goes to whoever joined any group first, then by email. That doesn't depend on which
 * groups the viewer shares with them, so viewers with the same crew agree on who has the badge.
 */
export async function getCrew(viewer: { email: string; visibleEmails: string[] }): Promise<CrewMember[]> {
  const result = await sql`
    SELECT m.user_email as "email", MIN(g.created_at) as "groupCreated", MIN(m.created_at) as "joined",
           p.name, p.badge,
           (SELECT MIN(x.created_at) FROM group_members x
            WHERE x.user_email = m.user_email AND x.status = 'active') as "firstJoined"
    FROM group_members m
    JOIN groups g ON g.id = m.group_id
    LEFT JOIN profiles p ON p.email = m.user_email
    WHERE m.status = 'active' AND m.user_email = ANY(${viewer.visibleEmails as any}::text[])
      AND m.group_id IN (SELECT group_id FROM group_members WHERE user_email = ${viewer.email} AND status = 'active')
    GROUP BY m.user_email, p.name, p.badge
    ORDER BY MIN(g.created_at) ASC, MIN(m.created_at) ASC, m.user_email ASC
  `;

  const rows = result.rows.length > 0 ? result.rows : [{ email: viewer.email, ...(await getProfile(viewer.email)) }];
  const byPrecedence = [...rows].sort(
    (a, b) =>
      new Date(a.firstJoined ?? 0).getTime() - new Date(b.firstJoined ?? 0).getTime() ||
      String(a.email).localeCompare(String(b.email))
  );
  const looks = assignCrewLooks(byPrecedence.map((row) => ({ email: row.email as string, badge: row.badge })));
  const crew: CrewMember[] = rows.map((row) => ({
    email: row.email as string,
    name: (row.name as string | null) || getDisplayName(row.email as string),
    ...looks.get(row.email as string)!,
    isMe: row.email === viewer.email,
  }));
  return crew.sort((a, b) => Number(b.isMe) - Number(a.isMe));
}

async function getProfile(email: string): Promise<{ name: string | null; badge: string | null }> {
  const result = await sql`SELECT name, badge FROM profiles WHERE email = ${email}`;
  return { name: result.rows[0]?.name ?? null, badge: result.rows[0]?.badge ?? null };
}

/** Set your own display name; an empty name goes back to the default from your email. */
export async function setProfileName(email: string, name: string): Promise<void> {
  const me = normalizeEmail(email);
  const value = name || null;
  await sql`
    INSERT INTO profiles (email, name) VALUES (${me}, ${value})
    ON CONFLICT (email) DO UPDATE SET name = ${value}, updated_at = NOW()
  `;
}

/**
 * Set your own badge, or null to show your initial. Returns false if someone in your crew already
 * has it. Two people picking the same badge at once can both get through; getCrew settles that.
 */
export async function setProfileBadge(
  viewer: { email: string; visibleEmails: string[] },
  badge: Badge | null
): Promise<boolean> {
  const me = normalizeEmail(viewer.email);
  if (badge) {
    const taken = await sql`
      SELECT 1 FROM profiles
      WHERE badge = ${badge} AND email <> ${me} AND email = ANY(${viewer.visibleEmails as any}::text[])
      LIMIT 1
    `;
    if (taken.rows.length > 0) {
      return false;
    }
  }
  await sql`
    INSERT INTO profiles (email, badge) VALUES (${me}, ${badge})
    ON CONFLICT (email) DO UPDATE SET badge = ${badge}, updated_at = NOW()
  `;
  return true;
}

/**
 * True if the email belongs to any group, active or invited. Used to let invited
 * users sign in, and as the access fallback when LaunchDarkly is unreachable.
 */
export async function isKnownMember(userEmail: string): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM group_members WHERE user_email = ${normalizeEmail(userEmail)} LIMIT 1
  `;
  return result.rows.length > 0;
}

export async function getGroupsForUser(userEmail: string): Promise<Group[]> {
  const me = normalizeEmail(userEmail);
  const result = await sql`
    SELECT g.id, g.name, g.created_by as "createdBy", mine.role, mine.status,
           other.user_email as "memberEmail", other.role as "memberRole", other.status as "memberStatus"
    FROM group_members mine
    JOIN groups g ON g.id = mine.group_id
    JOIN group_members other ON other.group_id = mine.group_id
    WHERE mine.user_email = ${me}
    ORDER BY g.created_at ASC, other.created_at ASC
  `;

  const groups = new Map<string, Group>();
  for (const row of result.rows) {
    if (!groups.has(row.id)) {
      groups.set(row.id, {
        id: row.id,
        name: row.name,
        createdBy: row.createdBy,
        role: row.role,
        status: row.status,
        members: [],
      });
    }
    const member: GroupMember = {
      userEmail: row.memberEmail,
      role: row.memberRole,
      status: row.memberStatus,
    };
    groups.get(row.id)!.members.push(member);
  }
  return Array.from(groups.values());
}

export async function createGroup(userEmail: string, name: string): Promise<string> {
  const me = normalizeEmail(userEmail);
  const result = await sql`
    INSERT INTO groups (name, created_by) VALUES (${name}, ${me}) RETURNING id
  `;
  const groupId = result.rows[0].id as string;
  await sql`
    INSERT INTO group_members (group_id, user_email, role, status) VALUES (${groupId}, ${me}, 'owner', 'active')
  `;
  return groupId;
}

type GroupQuery = typeof sql;

/**
 * Run a group membership change in one transaction holding a per-group lock. Invites, joins,
 * leaves, and removals for the same group then happen one at a time, so every authorization
 * check sees the membership as it is when the change is written.
 */
async function withGroupLock<T>(groupId: string, change: (query: GroupQuery) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    // Hash the canonical uuid text, so every spelling of the same id (e.g. upper case) shares one lock
    await client.sql`SELECT pg_advisory_xact_lock(hashtextextended(${groupId}::uuid::text, 0))`;
    const result = await change(client.sql.bind(client) as GroupQuery);
    await client.sql`COMMIT`;
    return result;
  } catch (error) {
    await client.sql`ROLLBACK`.catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Invite someone to a group. Any active member can invite.
 * Returns false if the inviter is not an active member of the group.
 */
export async function inviteMember(inviterEmail: string, groupId: string, inviteeEmail: string): Promise<boolean> {
  const inviter = normalizeEmail(inviterEmail);
  const invitee = normalizeEmail(inviteeEmail);

  return withGroupLock(groupId, async (query) => {
    const membership = await query`
      SELECT 1 FROM group_members
      WHERE group_id = ${groupId} AND user_email = ${inviter} AND status = 'active'
    `;
    if (membership.rows.length === 0) {
      return false;
    }
    await query`
      INSERT INTO group_members (group_id, user_email, role, status, invited_by)
      VALUES (${groupId}, ${invitee}, 'member', 'invited', ${inviter})
      ON CONFLICT (group_id, user_email) DO NOTHING
    `;
    return true;
  });
}

/**
 * Join a group you were invited to. If someone there already has your badge, you lose yours and
 * pick another, so the people already in the crew keep looking the same.
 */
export async function acceptInvite(userEmail: string, groupId: string): Promise<boolean> {
  const me = normalizeEmail(userEmail);
  return withGroupLock(groupId, async (query) => {
    const result = await query`
      UPDATE group_members SET status = 'active'
      WHERE group_id = ${groupId} AND user_email = ${me} AND status = 'invited'
      RETURNING group_id
    `;
    if (result.rows.length === 0) {
      return false;
    }
    await query`
      UPDATE profiles SET badge = NULL, updated_at = NOW()
      WHERE email = ${me} AND badge IN (
        SELECT p.badge FROM group_members m
        JOIN profiles p ON p.email = m.user_email
        WHERE m.group_id = ${groupId} AND m.status = 'active' AND m.user_email <> ${me} AND p.badge IS NOT NULL
      )
    `;
    return true;
  });
}

/** Rename a group. Any active member can, like inviting. Returns false if you aren't one. */
export async function renameGroup(userEmail: string, groupId: string, name: string): Promise<boolean> {
  const result = await sql`
    UPDATE groups SET name = ${name}
    WHERE id = ${groupId} AND EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = ${groupId} AND user_email = ${normalizeEmail(userEmail)} AND status = 'active'
    )
    RETURNING id
  `;
  return result.rows.length > 0;
}

/**
 * Remove a membership, then make sure the group still has an owner: if the last owner is gone,
 * the longest-standing active member becomes owner. A group with no active members left is
 * deleted, together with its pending invites. Must run inside withGroupLock.
 */
async function removeMembership(query: GroupQuery, groupId: string, email: string): Promise<void> {
  await query`
    DELETE FROM group_members WHERE group_id = ${groupId} AND user_email = ${email}
  `;
  await query`
    UPDATE group_members SET role = 'owner'
    WHERE group_id = ${groupId}
      AND user_email = (
        SELECT user_email FROM group_members
        WHERE group_id = ${groupId} AND status = 'active'
        ORDER BY created_at ASC, user_email ASC
        LIMIT 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM group_members WHERE group_id = ${groupId} AND role = 'owner' AND status = 'active'
      )
  `;
  await query`
    DELETE FROM groups g
    WHERE g.id = ${groupId}
      AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.status = 'active')
  `;
}

/**
 * Leave a group, or decline an invite. Ownership is handed over if needed.
 */
export async function leaveGroup(userEmail: string, groupId: string): Promise<void> {
  await withGroupLock(groupId, (query) => removeMembership(query, groupId, normalizeEmail(userEmail)));
}

/**
 * Remove a member (or a pending invite). Only active group owners can do this, and the
 * owner check holds until the removal is written. Removing yourself is treated as leaving.
 */
export async function removeMember(ownerEmail: string, groupId: string, memberEmail: string): Promise<boolean> {
  const owner = normalizeEmail(ownerEmail);
  const member = normalizeEmail(memberEmail);

  return withGroupLock(groupId, async (query) => {
    const result = await query`
      SELECT 1 FROM group_members
      WHERE group_id = ${groupId} AND user_email = ${owner} AND role = 'owner' AND status = 'active'
    `;
    if (member !== owner && result.rows.length === 0) {
      return false;
    }
    await removeMembership(query, groupId, member);
    return true;
  });
}
