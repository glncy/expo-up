/// <reference types="node" />
/// <reference path="../../typescript-config/bun-test-shim.d.ts" />
import { describe, expect, it } from "bun:test";
import { parseMetadata, sanitizeBuildIds } from "./lib/metadata";
import { BinaryMultipartBuilder } from "./lib/multipart";

describe("parseMetadata", () => {
  it("parses valid metadata payload", () => {
    const metadata = parseMetadata(
      JSON.stringify({
        id: "abc",
        fileMetadata: {
          ios: {
            bundle: "ios-index.bundle",
            assets: [{ path: "assets/a.png", ext: "png" }],
          },
        },
      }),
    );

    expect(metadata.id).toBe("abc");
    expect(metadata.fileMetadata.ios?.bundle).toBe("ios-index.bundle");
  });

  it("throws when fileMetadata is missing", () => {
    expect(() => parseMetadata(JSON.stringify({ id: "abc" }))).toThrow(
      "Invalid metadata.json",
    );
  });
});

describe("sanitizeBuildIds", () => {
  it("keeps numeric ids and sorts descending", () => {
    expect(sanitizeBuildIds(["10", "abc", "2", "30"])).toEqual([30, 10, 2]);
  });
});

describe("BinaryMultipartBuilder", () => {
  it("builds multipart body with expected part names", () => {
    const builder = new BinaryMultipartBuilder();
    builder.addPart("manifest", { id: "1" }, { "expo-signature": "sig=:abc:" });
    builder.addPart("extensions", { assetRequestHeaders: {} });

    const built = builder.build();
    const bodyText = new TextDecoder().decode(built.body);

    expect(built.contentType).toContain("multipart/mixed; boundary=");
    expect(bodyText).toContain('name="manifest"');
    expect(bodyText).toContain('name="extensions"');
    expect(bodyText).toContain("expo-signature: sig=:abc:");
  });
});
