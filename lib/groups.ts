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

async function isActiveMember(userEmail: string, groupId: string): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM group_members
    WHERE group_id = ${groupId} AND user_email = ${normalizeEmail(userEmail)} AND status = 'active'
  `;
  return result.rows.length > 0;
}

/**
 * Invite someone to a group. Any active member can invite.
 * Returns false if the inviter is not an active member of the group.
 */
export async function inviteMember(inviterEmail: string, groupId: string, inviteeEmail: string): Promise<boolean> {
  if (!(await isActiveMember(inviterEmail, groupId))) {
    return false;
  }
  await sql`
    INSERT INTO group_members (group_id, user_email, role, status, invited_by)
    VALUES (${groupId}, ${normalizeEmail(inviteeEmail)}, 'member', 'invited', ${normalizeEmail(inviterEmail)})
    ON CONFLICT (group_id, user_email) DO NOTHING
  `;
  return true;
}

export async function acceptInvite(userEmail: string, groupId: string): Promise<boolean> {
  const result = await sql`
    UPDATE group_members SET status = 'active'
    WHERE group_id = ${groupId} AND user_email = ${normalizeEmail(userEmail)} AND status = 'invited'
    RETURNING group_id
  `;
  return result.rows.length > 0;
}

/**
 * Leave a group, or decline an invite. If the last owner leaves, the longest-standing
 * active member becomes owner. A group with no active members left is deleted,
 * together with its pending invites.
 */
export async function leaveGroup(userEmail: string, groupId: string): Promise<void> {
  await sql`
    DELETE FROM group_members WHERE group_id = ${groupId} AND user_email = ${normalizeEmail(userEmail)}
  `;
  await sql`
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
  await sql`
    DELETE FROM groups g
    WHERE g.id = ${groupId}
      AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.status = 'active')
  `;
}

/**
 * Remove another member (or a pending invite). Only group owners can do this.
 */
export async function removeMember(ownerEmail: string, groupId: string, memberEmail: string): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM group_members
    WHERE group_id = ${groupId} AND user_email = ${normalizeEmail(ownerEmail)} AND role = 'owner' AND status = 'active'
  `;
  if (result.rows.length === 0) {
    return false;
  }
  await sql`
    DELETE FROM group_members WHERE group_id = ${groupId} AND user_email = ${normalizeEmail(memberEmail)}
  `;
  return true;
}
