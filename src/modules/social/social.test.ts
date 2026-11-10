import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, testDatabaseUrl } from "@/db/test/test-db";
import { correctWorkout } from "@/modules/workouts/corrections";
import { emptyWorkout, exerciseFor } from "@/modules/workouts/start";
import { saveWorkoutSnapshot } from "@/modules/workouts/workouts";
import { reports } from "@/db/schema";
import { withUser } from "@/db/with-user";
import "./hooks";
import {
  acceptRequest,
  addComment,
  block,
  connections,
  deleteComment,
  feed,
  follow,
  getPost,
  incomingRequests,
  leaveSocial,
  like,
  postsBy,
  profileByHandle,
  removeFollower,
  report,
  saveProfile,
  searchPeople,
  shareWorkout,
  SocialError,
  suggestions,
  unblock,
  unfollow,
} from "./social";

describe.skipIf(!testDatabaseUrl)("social foundation", () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  // ana: public. ben: private. cy: public. dee: no social profile at all.
  const ana = randomUUID();
  const ben = randomUUID();
  const cy = randomUUID();
  const dee = randomUUID();
  let bench = "";

  beforeAll(async () => {
    t = await createTestDatabase("social");
    for (const u of [ana, ben, cy, dee]) await t.addUser(u);
    await t.sql`update profiles set display_name = 'Ana Lima', date_of_birth = '1990-01-01' where user_id = ${ana}`;
    [{ id: bench }] = await t.sql`select id from exercises where slug = 'barbell-bench-press'`;
  });
  afterAll(() => t?.close());

  async function finishedWorkout(userId: string, kg = 80) {
    const w = emptyWorkout();
    w.name = "Push day";
    w.exercises.push(
      exerciseFor(
        { exerciseId: bench, name: "Barbell Bench Press", measurement: "weight_reps" },
        { sets: 1 },
      ),
    );
    const at = new Date();
    w.startedAt = new Date(at.getTime() - 3600_000).toISOString();
    w.exercises[0].sets[0] = {
      ...w.exercises[0].sets[0],
      weightKg: kg,
      reps: 5,
      completedAt: at.toISOString(),
    };
    w.status = "completed";
    w.finishedAt = at.toISOString();
    await saveWorkoutSnapshot(t.db, userId, w);
    return w;
  }

  it("keeps everyone invisible until they set up a profile", async () => {
    expect(await searchPeople(t.db, ana, "ana")).toEqual([]);
    await saveProfile(t.db, ana, { handle: "Ana_Lifts", visibility: "public", bio: "Lifting" });
    await saveProfile(t.db, ben, { handle: "ben", visibility: "private" });
    await saveProfile(t.db, cy, { handle: "cyd", visibility: "public" });
    const found = await searchPeople(t.db, cy, "ana");
    expect(found.map((c) => c.handle)).toEqual(["ana_lifts"]);
    // The card never carries private profile fields.
    expect(Object.keys(found[0]).sort()).toEqual(
      ["avatarPath", "bio", "displayName", "handle", "userId", "visibility"].sort(),
    );
    expect(await searchPeople(t.db, cy, "lima")).toHaveLength(1);
  });

  it("refuses taken, reserved and malformed handles", async () => {
    await expect(
      saveProfile(t.db, dee, { handle: "ANA_LIFTS", visibility: "public" }),
    ).rejects.toThrow(SocialError);
    await expect(saveProfile(t.db, dee, { handle: "admin", visibility: "public" })).rejects.toThrow(
      /reserved/,
    );
    await expect(saveProfile(t.db, dee, { handle: "a b", visibility: "public" })).rejects.toThrow();
  });

  it("follows public accounts directly and asks private ones", async () => {
    expect(await follow(t.db, cy, ana)).toBe("following");
    expect(await follow(t.db, ana, ben)).toBe("requested");
    expect((await incomingRequests(t.db, ben)).map((r) => r.handle)).toEqual(["ana_lifts"]);
    const before = await profileByHandle(t.db, ana, "ben");
    expect(before?.relationship).toMatchObject({
      following: false,
      requested: true,
      canSee: false,
    });
    await acceptRequest(t.db, ben, ana);
    const after = await profileByHandle(t.db, ana, "ben");
    expect(after?.relationship).toMatchObject({ following: true, requested: false, canSee: true });
    expect(after?.counts).toEqual({ followers: 1, following: 0 });
  });

  it("can't accept a request that was never made", async () => {
    await expect(acceptRequest(t.db, ben, cy)).rejects.toThrow(/withdrawn/);
  });

  it("shows a private account's followers only to its followers", async () => {
    expect((await connections(t.db, ana, ben, "followers")).map((c) => c.handle)).toEqual([
      "ana_lifts",
    ]);
    expect(await connections(t.db, cy, ben, "followers")).toEqual([]);
  });

  it("builds the shared summary from the saved workout, not from the device", async () => {
    const w = await finishedWorkout(ana, 100);
    const id = await shareWorkout(t.db, ana, { workoutId: w.id, visibility: "followers" });
    const post = await getPost(t.db, ana, id);
    expect(post?.post.summary).toMatchObject({
      name: "Push day",
      workingSets: 1,
      volumeKg: 500,
      exercises: [{ name: "Barbell Bench Press", sets: 1, best: { weightKg: 100, reps: 5 } }],
    });
    expect(post?.post.summary.records.length).toBeGreaterThan(0);
    // Nobody can share someone else's workout.
    await expect(shareWorkout(t.db, cy, { workoutId: w.id, visibility: "public" })).rejects.toThrow(
      /finished workouts/,
    );
  });

  it("shows followers-only posts to followers and nobody else", async () => {
    const [mine] = (await feed(t.db, ana)).posts;
    expect(mine.author.handle).toBe("ana_lifts");
    // cy follows ana; ben doesn't (ana follows ben, not the other way round).
    expect((await feed(t.db, cy)).posts.map((p) => p.id)).toEqual([mine.id]);
    expect(await getPost(t.db, cy, mine.id)).not.toBeNull();
    expect((await feed(t.db, ben)).posts.map((p) => p.id)).not.toContain(mine.id);
    expect(await getPost(t.db, ben, mine.id)).toBeNull();
    expect((await postsBy(t.db, dee, ana)).posts).toEqual([]);
  });

  it("keeps a private account's public posts for followers only", async () => {
    const w = await finishedWorkout(ben, 60);
    const id = await shareWorkout(t.db, ben, { workoutId: w.id, visibility: "public" });
    expect(await getPost(t.db, ana, id)).not.toBeNull();
    expect(await getPost(t.db, cy, id)).toBeNull();
    const own = await finishedWorkout(ben, 61);
    const hidden = await shareWorkout(t.db, ben, { workoutId: own.id, visibility: "only_me" });
    expect(await getPost(t.db, ana, hidden)).toBeNull();
    expect(await getPost(t.db, ben, hidden)).not.toBeNull();
  });

  it("lets people like and comment on posts they can see, with one level of replies", async () => {
    const [post] = (await postsBy(t.db, cy, ana)).posts;
    await like(t.db, cy, post.id);
    await like(t.db, cy, post.id);
    const c1 = await addComment(t.db, cy, { postId: post.id, body: "Strong!" });
    const r1 = await addComment(t.db, ana, { postId: post.id, parentId: c1, body: "Thanks" });
    await expect(
      addComment(t.db, cy, { postId: post.id, parentId: r1, body: "Nested" }),
    ).rejects.toThrow(/same post|comment/);
    const view = await getPost(t.db, ana, post.id);
    expect(view?.post).toMatchObject({ likes: 1, comments: 2 });
    // ben can't see ana's followers-only post, so can't like or comment on it.
    const benPosts = await postsBy(t.db, ben, ana);
    expect(benPosts.posts).toEqual([]);
    await expect(like(t.db, ben, post.id)).rejects.toThrow(SocialError);
    await expect(addComment(t.db, ben, { postId: post.id, body: "Hi" })).rejects.toThrow(
      SocialError,
    );
    // The post's author can remove any comment on it; others only their own.
    await deleteComment(t.db, cy, r1);
    expect((await getPost(t.db, ana, post.id))?.comments).toHaveLength(2);
    await deleteComment(t.db, ana, c1);
    expect((await getPost(t.db, ana, post.id))?.comments).toHaveLength(0);
  });

  it("suggests people your follows follow, only from lists you may see", async () => {
    await saveProfile(t.db, dee, { handle: "dee", visibility: "public" });
    await follow(t.db, ana, dee); // ana (public) follows dee
    // cy follows ana, so dee is a suggestion for cy.
    expect((await suggestions(t.db, cy)).map((s) => s.handle)).toEqual(["dee"]);
    await follow(t.db, cy, dee);
    expect(await suggestions(t.db, cy)).toEqual([]);
  });

  it("updates a shared workout's numbers when the workout is corrected", async () => {
    const w = await finishedWorkout(cy, 50);
    const id = await shareWorkout(t.db, cy, { workoutId: w.id, visibility: "public" });
    const fixed = structuredClone(w);
    fixed.exercises[0].sets[0].weightKg = 55;
    await correctWorkout(t.db, cy, fixed);
    expect((await getPost(t.db, cy, id))?.post.summary.volumeKg).toBe(275);
  });

  it("blocking hides both people from each other and ends their follows", async () => {
    await block(t.db, ana, cy);
    expect(await profileByHandle(t.db, cy, "ana_lifts")).toBeNull();
    expect(await profileByHandle(t.db, ana, "cyd")).toBeNull();
    expect(await searchPeople(t.db, cy, "ana")).toEqual([]);
    expect((await postsBy(t.db, cy, ana)).posts).toEqual([]);
    await expect(follow(t.db, cy, ana)).rejects.toThrow(SocialError);
    const [{ n }] = await t.sql`select count(*)::int as n from follows
      where (follower_id = ${cy} and followee_id = ${ana}) or (follower_id = ${ana} and followee_id = ${cy})`;
    expect(n).toBe(0);
    await unblock(t.db, ana, cy);
    expect(await profileByHandle(t.db, cy, "ana_lifts")).not.toBeNull();
  });

  it("keeps a copy of what was reported, visible only to the reporter", async () => {
    const [post] = (await postsBy(t.db, ana, ben)).posts;
    const id = await report(t.db, ana, {
      targetUserId: ben,
      postId: post.id,
      reason: "spam",
      details: "Test",
    });
    const [r] = await t.sql`select snapshot from reports where id = ${id}`;
    expect(r.snapshot.summary.name).toBe("Push day");
    expect(r.snapshot.profile.handle).toBe("ben");
    const benSees = await withUser(t.db, ben, (tx) => tx.select().from(reports));
    expect(benSees).toEqual([]);
    await expect(report(t.db, ana, { targetUserId: ana, reason: "spam" })).rejects.toThrow(
      SocialError,
    );
  });

  it("lets you remove a follower and unfollow", async () => {
    await removeFollower(t.db, ben, ana);
    expect((await profileByHandle(t.db, ana, "ben"))?.relationship.following).toBe(false);
    await unfollow(t.db, ana, dee);
    expect((await profileByHandle(t.db, ana, "dee"))?.relationship.following).toBe(false);
  });

  it("accepts pending requests when an account goes public", async () => {
    expect(await follow(t.db, cy, ben)).toBe("requested");
    await saveProfile(t.db, ben, { handle: "ben", visibility: "public" });
    expect((await profileByHandle(t.db, cy, "ben"))?.relationship.following).toBe(true);
  });

  it("deletes posts and follows when someone leaves", async () => {
    await leaveSocial(t.db, ben);
    const [{ n }] = await t.sql`select count(*)::int as n from posts where author_id = ${ben}`;
    expect(n).toBe(0);
    expect(await profileByHandle(t.db, cy, "ben")).toBeNull();
  });
});
