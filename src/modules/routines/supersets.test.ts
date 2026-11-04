import { describe, expect, it } from "vitest";
import { toSupersetGroups } from "./supersets";

const link = (...flags: boolean[]) => flags.map((linkNext) => ({ linkNext }));

describe("superset groups", () => {
  it("leaves unlinked exercises alone", () => {
    expect(toSupersetGroups(link(false, false))).toEqual([null, null]);
  });

  it("groups linked runs and numbers them in order", () => {
    expect(toSupersetGroups(link(true, false, false, true, true, false))).toEqual([
      1,
      1,
      null,
      2,
      2,
      2,
    ]);
  });

  it("ignores a link on the last exercise", () => {
    expect(toSupersetGroups(link(false, true))).toEqual([null, null]);
  });
});
