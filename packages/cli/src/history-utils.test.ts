/// <reference path="../../typescript-config/bun-test-shim.d.ts" />
import { describe, expect, it } from "bun:test";
import { parseDeleteBuildIds } from "./history-utils";

describe("parseDeleteBuildIds", () => {
  it("returns empty array when values are missing", () => {
    expect(parseDeleteBuildIds(undefined)).toEqual([]);
  });

  it("parses comma and space separated values", () => {
    expect(parseDeleteBuildIds(["10,8", "7"])).toEqual([10, 8, 7]);
  });

  it("deduplicates and sorts descending", () => {
    expect(parseDeleteBuildIds(["7", "10", "7"])).toEqual([10, 7]);
  });

  it("throws on invalid value", () => {
    expect(() => parseDeleteBuildIds(["latest"])).toThrow(
      'Invalid build id "latest"',
    );
  });
});
