import { describe, expect, it } from "vitest";
import { orphanedFiles } from "./storage-rules";

const now = new Date("2026-11-10T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe("orphanedFiles", () => {
  it("finds old files with no database row", () => {
    const files = [
      { path: "u/a.jpg", createdAt: ago(120) },
      { path: "u/b.jpg", createdAt: ago(120) },
    ];
    expect(orphanedFiles(files, ["u/a.jpg"], now)).toEqual(["u/b.jpg"]);
  });

  it("leaves recent uploads alone, their row may still be on its way", () => {
    expect(orphanedFiles([{ path: "u/new.jpg", createdAt: ago(5) }], [], now)).toEqual([]);
  });

  it("leaves files with an unknown age alone", () => {
    expect(orphanedFiles([{ path: "u/x.jpg", createdAt: null }], [], now)).toEqual([]);
  });
});
