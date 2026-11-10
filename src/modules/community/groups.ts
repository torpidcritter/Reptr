import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { groupMembers, groups } from "@/db/schema";
import type { Database } from "@/db/types";
import { withUser } from "@/db/with-user";
import { myProfile, refused, SocialError, type ProfileCard } from "@/modules/social/social";
import { notify } from "./notifications";

// Training groups. Public groups can be found and joined by anyone; private ones only
// with the invite code. Who can see and change what is enforced by RLS (schema/community.ts).

export const groupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Give the group a name of at least 3 characters.")
    .max(40, "Keep the name under 40 characters."),
  description: z.string().trim().max(280, "Keep the description under 280 characters.").default(""),
  visibility: z.enum(["public", "private"]),
});
export type GroupInput = z.input<typeof groupSchema>;

const MAX_OWNED = 20;

export type GroupSummary = {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  members: number;
  role: "owner" | "admin" | "member" | null;
};

async function needsProfile(db: Database, me: string) {
  if (!(await myProfile(db, me))) throw new SocialError("Set up your social profile first.");
}

export async function createGroup(db: Database, me: string, input: GroupInput) {
  const g = groupSchema.parse(input);
  await needsProfile(db, me);
  return withUser(db, me, async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(groups).where(eq(groups.ownerId, me));
    if (n >= MAX_OWNED) throw new SocialError(`You can own up to ${MAX_OWNED} groups.`);
    const [row] = await tx
      .insert(groups)
      .values({
        ownerId: me,
        name: g.name,
        description: g.description || null,
        visibility: g.visibility,
      })
      .returning({ id: groups.id });
    return row.id;
  });
}

export async function updateGroup(db: Database, me: string, id: string, input: GroupInput) {
  const g = groupSchema.parse(input);
  const rows = await withUser(db, me, (tx) =>
    tx
      .update(groups)
      .set({ name: g.name, description: g.description || null, visibility: g.visibility })
      .where(eq(groups.id, id))
      .returning({ id: groups.id }),
  );
  if (!rows.length) throw new SocialError("Only the group's admins can change it.");
}

export async function newInviteCode(db: Database, me: string, id: string) {
  const rows = await withUser(db, me, (tx) =>
    tx
      .update(groups)
      .set({ inviteCode: sql`substr(md5(gen_random_uuid()::text), 1, 12)` })
      .where(eq(groups.id, id))
      .returning({ code: groups.inviteCode }),
  );
  if (!rows.length) throw new SocialError("Only the group's admins can do that.");
  return rows[0].code;
}

export async function deleteGroup(db: Database, me: string, id: string) {
  const rows = await withUser(db, me, (tx) =>
    tx
      .delete(groups)
      .where(and(eq(groups.id, id), eq(groups.ownerId, me)))
      .returning({ id: groups.id }),
  );
  if (!rows.length) throw new SocialError("Only the group's owner can delete it.");
}

async function tellOwner(db: Database, groupId: string, joiner: string) {
  const [g] = await db
    .select({ ownerId: groups.ownerId, name: groups.name })
    .from(groups)
    .where(eq(groups.id, groupId));
  if (g) {
    await notify(db, g.ownerId, {
      kind: "group_joined",
      actorId: joiner,
      groupId,
      data: { name: g.name },
      dedupeKey: `group:${groupId}:${joiner}`,
    });
  }
}

/** Joins a public group. */
export async function joinGroup(db: Database, me: string, id: string) {
  await needsProfile(db, me);
  try {
    await withUser(db, me, (tx) =>
      tx.insert(groupMembers).values({ groupId: id, userId: me }).onConflictDoNothing(),
    );
  } catch (e) {
    if (refused(e)) throw new SocialError("That group is invite-only.");
    throw e;
  }
  await tellOwner(db, id, me);
}

/** Joins a private group with its invite code. Returns the group id. */
export async function joinByCode(db: Database, me: string, code: string) {
  await needsProfile(db, me);
  const clean = code.trim().slice(0, 40);
  const [row] = await withUser(db, me, (tx) =>
    tx.execute<{ id: string | null }>(sql`select public.group_join(${clean}) as id`),
  );
  if (!row?.id) throw new SocialError("That invite code doesn't work.");
  await tellOwner(db, row.id, me);
  return row.id;
}

export async function leaveGroup(db: Database, me: string, id: string) {
  const rows = await withUser(db, me, (tx) =>
    tx
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, me)))
      .returning({ id: groupMembers.userId }),
  );
  if (!rows.length) throw new SocialError("An owner can't leave their group. Delete it instead.");
}

export async function removeMember(db: Database, me: string, id: string, member: string) {
  const rows = await withUser(db, me, (tx) =>
    tx
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, member)))
      .returning({ id: groupMembers.userId }),
  );
  if (!rows.length) throw new SocialError("You can't remove that member.");
}

const summaryColumns = sql`g.id, g.name, g.description, g.visibility,
  (select count(*)::int from public.group_members m where m.group_id = g.id) as members,
  (select m.role from public.group_members m where m.group_id = g.id and m.user_id = (select auth.uid())) as role`;

/** Groups the person belongs to. */
export async function myGroups(db: Database, me: string) {
  return withUser(db, me, (tx) =>
    tx.execute<GroupSummary>(sql`
      select ${summaryColumns} from public.groups g
      where public.group_member(g.id, ${me})
      order by g.name`),
  );
}

/** Public groups the person isn't in, optionally matching a search. */
export async function discoverGroups(db: Database, me: string, query = "") {
  const q = query.trim().toLowerCase().slice(0, 40);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return withUser(db, me, (tx) =>
    tx.execute<GroupSummary>(sql`
      select ${summaryColumns} from public.groups g
      where g.visibility = 'public' and not public.group_member(g.id, ${me})
        and not public.social_blocked(${me}, g.owner_id)
        ${q ? sql`and lower(g.name) like ${like}` : sql``}
      order by members desc, g.name
      limit 20`),
  );
}

export type GroupDetail = GroupSummary & {
  inviteCode: string | null;
  ownerId: string;
  people: (ProfileCard & { role: "owner" | "admin" | "member" })[];
};

/** A group as the person may see it: members they can see, the code only for admins. */
export async function getGroup(db: Database, me: string, id: string) {
  return withUser(db, me, async (tx): Promise<GroupDetail | null> => {
    const [g] = await tx.execute<GroupSummary & { invite_code: string; owner_id: string }>(sql`
      select ${summaryColumns}, g.invite_code, g.owner_id from public.groups g where g.id = ${id}`);
    if (!g) return null;
    const people = await tx.execute<ProfileCard & { role: "owner" | "admin" | "member" }>(sql`
      select c.user_id as "userId", c.handle, c.display_name as "displayName", c.bio,
             c.avatar_path as "avatarPath", c.visibility, m.role
      from public.group_members m
      join public.profile_cards c on c.user_id = m.user_id
      where m.group_id = ${id}
      order by (m.role = 'owner') desc, (m.role = 'admin') desc, c.handle
      limit 500`);
    const admin = g.role === "owner" || g.role === "admin";
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      visibility: g.visibility,
      members: g.members,
      role: g.role,
      ownerId: g.owner_id,
      inviteCode: admin ? g.invite_code : null,
      people,
    };
  });
}
