import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { withUser } from "@/db/with-user";
import {
  acceptRequest,
  block,
  follow,
  like,
  report,
  saveProfile,
  searchPeople,
  shareWorkout,
  SocialError,
  unblock,
  unlike,
} from "@/modules/social/social";
import { emptyWorkout, exerciseFor } from "@/modules/workouts/start";
import { saveWorkoutSnapshot } from "@/modules/workouts/workouts";
import { myProgress, syncAwards } from "./awards";
import {
  createChallenge,
  ensureSeasonal,
  getChallenge,
  joinChallenge,
  listChallenges,
} from "./challenges";
import {
  createGroup,
  getGroup,
  joinByCode,
  joinGroup,
  leaveGroup,
  myGroups,
  updateGroup,
} from "./groups";
import { exerciseBoards, leaderboard } from "./leaderboards";
import { decide, openReports } from "./moderation";
import {
  listNotifications,
  markAllRead,
  saveNotificationSettings,
  unreadCount,
} from "./notifications";

describe.skipIf(!testDatabaseUrl)("community: leaderboards, challenges, groups, awards", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  // ana: public, on leaderboards. ben: private, on leaderboards. cyd: public, off.
  // dee: public, on, follows nobody. mod: a moderator.
  const ana = randomUUID();
  const ben = randomUUID();
  const cyd = randomUUID();
  const dee = randomUUID();
  const mod = randomUUID();
  let bench = "";
  const hour = 3600_000;

  beforeAll(async () => {
    t = await createTestDatabase("community");
    for (const u of [ana, ben, cyd, dee, mod]) await t.addUser(u);
    [{ id: bench }] = await t.sql`select id from exercises where slug = 'barbell-bench-press'`;
    await saveProfile(t.db, ana, { handle: "ana", visibility: "public" });
    await saveProfile(t.db, ben, { handle: "ben", visibility: "private" });
    await saveProfile(t.db, cyd, { handle: "cyd", visibility: "public" });
    await saveProfile(t.db, dee, { handle: "dee", visibility: "public" });
    await t.sql`update social_profiles set leaderboards = true where user_id in (${ana}, ${ben}, ${dee})`;
    process.env.REPTR_MODERATOR_IDS = mod;
  });
  afterAll(() => t?.close());

  /** A finished bench workout: `sets` × kg × reps, lasting `minutes`, finished at `at`. */
  async function workout(
    userId: string,
    { kg = 100, reps = 5, sets = 3, minutes = 45, at = new Date() } = {},
  ) {
    const w = emptyWorkout();
    w.name = "Bench";
    w.exercises.push(
      exerciseFor(
        { exerciseId: bench, name: "Barbell Bench Press", measurement: "weight_reps" },
        { sets },
      ),
    );
    w.startedAt = new Date(at.getTime() - minutes * 60_000).toISOString();
    w.exercises[0].sets = w.exercises[0].sets.map((s) => ({
      ...s,
      weightKg: kg,
      reps,
      completedAt: at.toISOString(),
    }));
    w.status = "completed";
    w.finishedAt = at.toISOString();
    await saveWorkoutSnapshot(t.db, userId, w);
    return w.id;
  }

  /** The Postgres error code a query fails with (42501: permission denied). */
  const pgCode = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: { code?: string; cause?: { code?: string } }) => e.cause?.code ?? e.code,
    );

  const board = (
    me: string,
    category: string,
    scope: "global" | "friends" | "group",
    groupId?: string,
  ) =>
    leaderboard(t.db, me, { category, period: "all", scope, groupId }).then((rows) =>
      rows.map((r) => [r.person.handle, r.rank, r.score]),
    );

  it("scores only what the database saved, and only plausible training", async () => {
    await workout(ana); // 3 × 100 × 5 = 1500 kg
    await workout(ana, { kg: 80, reps: 10, at: new Date(Date.now() - 2 * hour) }); // 2400 kg
    await workout(ben, { kg: 60, reps: 10, sets: 2 }); // 1200 kg
    await workout(cyd, { kg: 200, sets: 10 });
    await workout(dee, { kg: 50, reps: 10 }); // 1500 kg

    // Not counted: a 2-minute "workout", a 900 kg set, and a workout that reached the
    // server more than 7 days after it was finished.
    await workout(dee, { minutes: 2 });
    await workout(dee, { kg: 900, sets: 1 });
    const late = await workout(dee, { at: new Date(Date.now() - 20 * 24 * hour) });
    await t.sql`update workouts set created_at = finished_at + interval '10 days' where id = ${late}`;

    // dee sees public accounts on leaderboards: ana and dee (ben is private and not
    // followed by dee; cyd chose not to be on leaderboards).
    expect(await board(dee, "volume", "global")).toEqual([
      ["ana", 1, 3900],
      ["dee", 2, 1500],
    ]);
    expect(await board(dee, "workouts", "global")).toEqual([
      ["ana", 1, 2],
      ["dee", 2, 1],
    ]);
  });

  it("shows friends boards and private accounts only to followers", async () => {
    expect(await follow(t.db, ana, ben)).toBe("requested");
    await acceptRequest(t.db, ben, ana);
    expect(await board(ana, "volume", "friends")).toEqual([
      ["ana", 1, 3900],
      ["ben", 2, 1200],
    ]);
    // ben's private account appears on ana's global board now that she follows him.
    expect((await board(ana, "volume", "global")).map((r) => r[0])).toEqual(["ana", "dee", "ben"]);
    // ...but never on dee's.
    expect((await board(dee, "volume", "global")).map((r) => r[0])).not.toContain("ben");
  });

  it("has exercise boards by best estimated 1RM, and weekly streaks", async () => {
    const [benchBoard] = await exerciseBoards(t.db);
    expect(benchBoard.name).toBe("Barbell Bench Press");
    // ana: 100 × 5 → 116.7; 80 × 10 → 106.7. dee: 50 × 10 → 66.7.
    expect(await board(dee, benchBoard.category, "global")).toEqual([
      ["ana", 1, 116.7],
      ["dee", 2, 66.7],
    ]);
    expect(await board(ana, "streak", "friends")).toEqual([
      ["ana", 1, 1],
      ["ben", 1, 1],
    ]);
  });

  it("refuses unknown boards and raw scoring calls from signed-in people", async () => {
    await expect(board(ana, "made_up", "global")).rejects.toThrow();
    expect(
      await pgCode(
        withUser(t.db, ana, (tx) =>
          tx.execute(
            sql`select * from public.fitness_scores('volume', '-infinity', 'infinity', array[${dee}]::uuid[])`,
          ),
        ),
      ),
    ).toBe("42501");
    // Awards and notifications can only be written by the server.
    await expect(
      withUser(t.db, ana, (tx) =>
        tx.execute(
          sql`insert into public.user_badges (user_id, badge, earned_on) values (${ana}, 'workouts-1000', current_date)`,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      withUser(t.db, ana, (tx) =>
        tx.execute(sql`insert into public.notifications (user_id, kind) values (${dee}, 'follow')`),
      ),
    ).rejects.toThrow();
  });

  it("awards XP, levels and badges once, however often it runs", async () => {
    const first = await syncAwards(t.db, ana);
    // Two workouts: 50 + 2 × 3 sets + records (capped) each.
    expect(first.xp).toBeGreaterThanOrEqual(112);
    expect(first.level).toBe(1);
    await syncAwards(t.db, ana);
    const p = await myProgress(t.db, ana);
    expect(p.xp).toBe(first.xp);
    // First workout, and 3.9 t lifted crosses the first tonne.
    expect(p.badges.map((b) => b.badge).sort()).toEqual(["volume-1", "workouts-1"]);
    expect(p.streakWeeks).toBe(1);
    const n = await listNotifications(t.db, ana);
    expect(
      n.items
        .filter((i) => i.kind === "badge")
        .map((i) => i.text)
        .sort(),
    ).toEqual(["New badge: 1 t lifted", "New badge: First workout"]);

    // Crossing 250 XP is a level-up, noticed once.
    await workout(ana, { sets: 10, at: new Date(Date.now() - 3 * hour) });
    await workout(ana, { sets: 10, at: new Date(Date.now() - 4 * hour) });
    await syncAwards(t.db, ana);
    await syncAwards(t.db, ana);
    const after = await listNotifications(t.db, ana);
    expect(after.items.filter((i) => i.kind === "level_up").map((i) => i.text)).toEqual([
      "You reached level 2",
    ]);
  });

  it("runs friend challenges for followers, with standings and completion", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 24 * hour).toISOString().slice(0, 10);
    const id = await createChallenge(t.db, ana, {
      title: "Bench week",
      metric: "workouts",
      target: 2,
      visibility: "followers",
      startsOn: weekAgo,
      endsOn: today,
    });
    // ben follows nobody, so he can't see ana's friend challenge; dee doesn't follow ana.
    await expect(joinChallenge(t.db, dee, id)).rejects.toThrow(SocialError);
    await follow(t.db, dee, ana);
    await joinChallenge(t.db, dee, id);
    const view = await getChallenge(t.db, dee, id);
    expect(view?.standings.map((s) => [s.person.handle, s.rank, s.score])).toEqual([
      ["ana", 1, 4],
      ["dee", 2, 1],
    ]);
    await syncAwards(t.db, ana);
    expect((await getChallenge(t.db, ana, id))?.standings[0].completed).toBe(true);
    expect((await listNotifications(t.db, ana)).items.map((i) => i.kind)).toContain(
      "challenge_completed",
    );
    // A past end date is refused.
    await expect(
      createChallenge(t.db, ana, {
        title: "Too late",
        metric: "sets",
        visibility: "public",
        startsOn: "2020-01-01",
        endsOn: "2020-01-02",
      }),
    ).rejects.toThrow(/passed/);
  });

  it("creates one seasonal challenge per month, open to everyone", async () => {
    await ensureSeasonal(t.db);
    await ensureSeasonal(t.db);
    const { open } = await listChallenges(t.db, cyd);
    expect(open.filter((c) => c.seasonal)).toHaveLength(1);
  });

  it("keeps private groups to members, with admin-only changes and group boards", async () => {
    const gid = await createGroup(t.db, ana, { name: "Morning crew", visibility: "private" });
    expect(await getGroup(t.db, dee, gid)).toBeNull();
    await expect(joinGroup(t.db, dee, gid)).rejects.toThrow(/invite-only/);
    const code = (await getGroup(t.db, ana, gid))!.inviteCode!;
    expect(await joinByCode(t.db, dee, code)).toBe(gid);
    const asDee = await getGroup(t.db, dee, gid);
    expect(asDee?.inviteCode).toBeNull();
    expect(asDee?.people.map((p) => [p.handle, p.role])).toEqual([
      ["ana", "owner"],
      ["dee", "member"],
    ]);
    await expect(
      updateGroup(t.db, dee, gid, { name: "Taken over", visibility: "public" }),
    ).rejects.toThrow(SocialError);
    // Nobody can hand themselves a group through the Data API.
    await withUser(t.db, dee, (tx) =>
      tx.execute(sql`update public.groups set owner_id = ${dee} where id = ${gid}`),
    ).catch(() => {});
    const [{ owner_id }] = await t.sql`select owner_id from groups where id = ${gid}`;
    expect(owner_id).toBe(ana);
    expect(await board(dee, "volume", "group", gid)).toEqual([
      ["ana", 1, expect.any(Number)],
      ["dee", 2, 1500],
    ]);
    expect((await listNotifications(t.db, ana)).items.map((i) => i.text)).toContain(
      "@dee joined Morning crew",
    );
    await expect(leaveGroup(t.db, ana, gid)).rejects.toThrow(/owner/);
    await leaveGroup(t.db, dee, gid);
    expect(await myGroups(t.db, dee)).toEqual([]);
  });

  it("notifies once per like, respects mutes and blocks, and marks as read", async () => {
    const w = await workout(dee, { at: new Date(Date.now() - 5 * hour) });
    const post = await shareWorkout(t.db, dee, { workoutId: w, visibility: "public" });
    await like(t.db, ana, post);
    await unlike(t.db, ana, post);
    await like(t.db, ana, post);
    const likes = (await listNotifications(t.db, dee)).items.filter((i) => i.kind === "like");
    expect(likes.map((l) => l.text)).toEqual(["@ana liked your workout"]);
    expect(await unreadCount(t.db, dee)).toBeGreaterThan(0);
    await markAllRead(t.db, dee);
    expect(await unreadCount(t.db, dee)).toBe(0);

    await saveNotificationSettings(t.db, dee, { muted: ["like"], push: false });
    await like(t.db, cyd, post);
    expect(
      (await listNotifications(t.db, dee)).items.filter((i) => i.kind === "like"),
    ).toHaveLength(1);

    await block(t.db, dee, cyd);
    await follow(t.db, cyd, dee).catch(() => {});
    expect((await listNotifications(t.db, dee)).items.some((i) => i.text.includes("@cyd"))).toBe(
      false,
    );
    await unblock(t.db, dee, cyd);
  });

  it("lets moderators suspend or keep someone off the boards, and nobody else", async () => {
    const rid = await report(t.db, ana, { targetUserId: dee, reason: "cheating", details: "" });
    await expect(openReports(t.db, ana)).rejects.toThrow(/moderators/);
    expect((await openReports(t.db, mod)).map((r) => r.id)).toContain(rid);

    await decide(t.db, mod, { reportId: rid, action: "exclude_leaderboards" });
    expect((await board(ana, "volume", "global")).map((r) => r[0])).not.toContain("dee");
    // Still visible as a person.
    expect((await searchPeople(t.db, ana, "dee")).map((c) => c.handle)).toEqual(["dee"]);

    const second = await report(t.db, ana, { targetUserId: dee, reason: "spam" });
    await decide(t.db, mod, { reportId: second, action: "suspend", note: "Spam" });
    expect(await searchPeople(t.db, ana, "dee")).toEqual([]);
    expect((await openReports(t.db, mod)).map((r) => r.id)).not.toContain(second);
    const [{ n }] = await t.sql`select count(*)::int as n from moderation_log`;
    expect(n).toBe(2);
  });
});
