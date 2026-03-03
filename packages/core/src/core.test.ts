/// <reference path="../../typescript-config/bun-test-shim.d.ts" />
import { describe, expect, it } from "bun:test";
import {
  parseExpoUpUpdatesUrl,
  isSafeAssetPath,
  resolveRollbackTarget,
} from "./index";

describe("parseExpoUpUpdatesUrl", () => {
  it("parses a valid expo-up updates url", () => {
    const parsed = parseExpoUpUpdatesUrl(
      "https://example.com/api/expo-up/my-app/manifest",
    );
    expect(parsed.serverUrl).toBe("https://example.com/api/expo-up");
    expect(parsed.projectId).toBe("my-app");
  });

  it("returns empty values for invalid urls", () => {
    const parsed = parseExpoUpUpdatesUrl("https://example.com/updates");
    expect(parsed.serverUrl).toBe("");
    expect(parsed.projectId).toBe("");
  });

  it("supports custom base path from updates url", () => {
    const parsed = parseExpoUpUpdatesUrl(
      "https://example.com/mobile-update/my-app/manifest",
    );
    expect(parsed.serverUrl).toBe("https://example.com/mobile-update");
    expect(parsed.projectId).toBe("my-app");
  });

  it("supports trailing slash in updates url", () => {
    const parsed = parseExpoUpUpdatesUrl(
      "https://example.com/expo-up/my-app/manifest/",
    );
    expect(parsed.serverUrl).toBe("https://example.com/expo-up");
    expect(parsed.projectId).toBe("my-app");
  });
});

describe("isSafeAssetPath", () => {
  it("allows asset path under repo scope", () => {
    expect(
      isSafeAssetPath("owner/repo/1/assets/index.bundle", "owner/repo"),
    ).toBe(true);
  });

  it("blocks traversal attempts", () => {
    expect(isSafeAssetPath("owner/repo/../../etc/passwd", "owner/repo")).toBe(
      false,
    );
  });
});

describe("resolveRollbackTarget", () => {
  it("resolves nested rollback chains", async () => {
    const result = await resolveRollbackTarget({
      latestBuildId: 8,
      loadRollbackTarget: async (buildId) => {
        if (buildId === 8) return "6";
        if (buildId === 6) return "4";
        return null;
      },
    });

    expect(result.buildId).toBe(4);
    expect(result.isEmbedded).toBe(false);
  });

  it("throws on cycle detection", async () => {
    await expect(
      resolveRollbackTarget({
        latestBuildId: 9,
        loadRollbackTarget: async (buildId) => (buildId === 9 ? "7" : "9"),
      }),
    ).rejects.toThrow("Rollback chain cycle detected.");
  });
});
