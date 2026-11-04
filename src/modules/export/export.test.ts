import { describe, expect, it } from "vitest";
import { toCsv } from "./export";

describe("toCsv", () => {
  it("quotes only what needs quoting", () => {
    expect(
      toCsv([
        { a: "plain", b: 1, c: null },
        { a: 'say "hi", ok', b: 2.5, c: new Date("2026-11-04T00:00:00Z") },
      ]),
    ).toBe('a,b,c\r\nplain,1,\r\n"say ""hi"", ok",2.5,2026-11-04T00:00:00.000Z\r\n');
    expect(toCsv([])).toBe("");
  });
});
