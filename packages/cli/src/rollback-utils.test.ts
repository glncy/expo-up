/// <reference path="../../typescript-config/bun-test-shim.d.ts" />
import { describe, expect, it } from "bun:test";
import { parseBuildFolders, resolveRollbackSelection } from "./rollback-utils";

describe("parseBuildFolders", () => {
  it("keeps only numeric dir names sorted desc", () => {
    const result = parseBuildFolders([
      { type: "file", name: "metadata.json" },
      { type: "dir", name: "12" },
      { type: "dir", name: "abc" },
      { type: "dir", name: "4" },
    ]);

    expect(result).toEqual([12, 4]);
  });
});

describe("resolveRollbackSelection", () => {
  it("returns embedded when explicit embedded flag is set", () => {
    const result = resolveRollbackSelection({
      embedded: true,
      builds: [8, 7, 6],
      liveBuildId: 8,
      embeddedTarget: "EMBEDDED",
    });

    expect(result.targetValue).toBe("EMBEDDED");
    expect(result.usedFallbackToEmbedded).toBe(false);
  });

  it("returns explicit numeric --to target", () => {
    const result = resolveRollbackSelection({
      to: "5",
      builds: [8, 7, 6],
      liveBuildId: 8,
      embeddedTarget: "EMBEDDED",
    });

    expect(result.targetValue).toBe("5");
  });

  it("falls back to previous build when available", () => {
    const result = resolveRollbackSelection({
      builds: [8, 7, 6],
      liveBuildId: 8,
      embeddedTarget: "EMBEDDED",
    });

    expect(result.targetValue).toBe("7");
    expect(result.usedFallbackToEmbedded).toBe(false);
  });

  it("falls back to embedded when no previous build exists", () => {
    const result = resolveRollbackSelection({
      builds: [8],
      liveBuildId: 8,
      embeddedTarget: "EMBEDDED",
    });

    expect(result.targetValue).toBe("EMBEDDED");
    expect(result.usedFallbackToEmbedded).toBe(true);
  });

  it("throws for non-numeric --to values", () => {
    expect(() =>
      resolveRollbackSelection({
        to: "latest",
        builds: [8, 7],
        liveBuildId: 8,
        embeddedTarget: "EMBEDDED",
      }),
    ).toThrow('Invalid rollback target "latest"');
  });
});
