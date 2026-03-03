/// <reference path="../../typescript-config/bun-test-shim.d.ts" />
import { describe, expect, it } from "bun:test";
import { maskToken, parsePlatform } from "./cli-utils";

describe("parsePlatform", () => {
  it("accepts supported platforms", () => {
    expect(parsePlatform("ios")).toBe("ios");
    expect(parsePlatform("android")).toBe("android");
    expect(parsePlatform("all")).toBe("all");
  });

  it("throws on unsupported values", () => {
    expect(() => parsePlatform("web")).toThrow('Invalid platform "web"');
  });
});

describe("maskToken", () => {
  it("masks long tokens", () => {
    expect(maskToken("abcd1234wxyz7890")).toBe("abcd...7890");
  });

  it("keeps short tokens unchanged", () => {
    expect(maskToken("short")).toBe("short");
  });
});
