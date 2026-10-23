import { db } from '@vercel/postgres';
import { sql } from './db';
import { Group, GroupMember } from './types';

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
    await client.sql`SELECT pg_advisory_xact_lock(hashtextextended(${groupId}, 0))`;
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

export async function acceptInvite(userEmail: string, groupId: string): Promise<boolean> {
  return withGroupLock(groupId, async (query) => {
    const result = await query`
      UPDATE group_members SET status = 'active'
      WHERE group_id = ${groupId} AND user_email = ${normalizeEmail(userEmail)} AND status = 'invited'
      RETURNING group_id
    `;
    return result.rows.length > 0;
  });
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
