/// <reference path="../../typescript-config/bun-test-shim.d.ts" />
import { describe, expect, it } from "bun:test";
import {
  createMetadataFingerprint,
  createSortedMetadataHash,
  getErrorMessageText,
  getErrorStatus,
  getExpoExportArgs,
  isEmptyRepositoryError,
  parseNumericBuilds,
  stableStringify,
} from "./release-utils";

describe("stableStringify", () => {
  it("normalizes object key order", () => {
    const a = { b: 2, a: 1, nested: { y: 2, x: 1 } };
    const b = { nested: { x: 1, y: 2 }, a: 1, b: 2 };

    expect(stableStringify(a)).toBe(stableStringify(b));
  });
});

describe("getExpoExportArgs", () => {
  it("returns ios args", () => {
    expect(getExpoExportArgs("ios")).toEqual([
      "expo",
      "export",
      "--platform",
      "ios",
      "--clear",
    ]);
  });

  it("returns android args", () => {
    expect(getExpoExportArgs("android")).toEqual([
      "expo",
      "export",
      "--platform",
      "android",
      "--clear",
    ]);
  });

  it("returns all-platform args", () => {
    expect(getExpoExportArgs("all")).toEqual([
      "expo",
      "export",
      "--platform",
      "ios",
      "--platform",
      "android",
      "--clear",
    ]);
  });
});

describe("parseNumericBuilds", () => {
  it("keeps numeric build names sorted descending", () => {
    expect(
      parseNumericBuilds([
        { name: "4" },
        { name: "abc" },
        { name: "12" },
        { name: "3" },
      ]),
    ).toEqual([12, 4, 3]);
  });
});

describe("release error helpers", () => {
  it("extracts numeric error status when present", () => {
    expect(getErrorStatus({ status: 404 })).toBe(404);
    expect(getErrorStatus({ status: "409" })).toBe(409);
    expect(getErrorStatus(new Error("boom"))).toBeUndefined();
  });

  it("extracts message text when present", () => {
    expect(getErrorMessageText({ message: "Git Repository is empty." })).toBe(
      "Git Repository is empty.",
    );
    expect(getErrorMessageText(new Error("hello"))).toBe("hello");
    expect(getErrorMessageText({})).toBe("");
  });

  it("detects empty repository errors from status or message", () => {
    expect(isEmptyRepositoryError({ status: 409 })).toBe(true);
    expect(
      isEmptyRepositoryError({
        message:
          "Git Repository is empty. - https://docs.github.com/rest/git/refs#get-a-reference",
      }),
    ).toBe(true);
    expect(
      isEmptyRepositoryError({
        message: "Repository is empty and has no refs",
      }),
    ).toBe(true);
    expect(isEmptyRepositoryError({ status: 404, message: "Not Found" })).toBe(
      false,
    );
  });
});

describe("createMetadataFingerprint", () => {
  it("is stable when non-fileMetadata fields change", () => {
    const first = {
      id: "a",
      createdAt: "2026-01-01T00:00:00.000Z",
      fileMetadata: {
        ios: {
          bundle: "_expo/static/js/ios/entry-a.hbc",
          assets: [{ hash: "h1", path: "assets/1.png", ext: "png" }],
        },
      },
    };
    const second = {
      id: "b",
      createdAt: "2026-02-01T00:00:00.000Z",
      fileMetadata: {
        ios: {
          bundle: "_expo/static/js/ios/entry-a.hbc",
          assets: [{ hash: "h1", path: "assets/1.png", ext: "png" }],
        },
      },
    };

    expect(createMetadataFingerprint(first)).toBe(
      createMetadataFingerprint(second),
    );
  });

  it("changes when bundle or assets change", () => {
    const base = {
      fileMetadata: {
        android: {
          bundle: "_expo/static/js/android/entry-a.hbc",
          assets: [{ hash: "h1", path: "assets/1.png", ext: "png" }],
        },
      },
    };
    const changedBundle = {
      fileMetadata: {
        android: {
          bundle: "_expo/static/js/android/entry-b.hbc",
          assets: [{ hash: "h1", path: "assets/1.png", ext: "png" }],
        },
      },
    };
    const changedAsset = {
      fileMetadata: {
        android: {
          bundle: "_expo/static/js/android/entry-a.hbc",
          assets: [{ hash: "h2", path: "assets/1.png", ext: "png" }],
        },
      },
    };

    expect(createMetadataFingerprint(base)).not.toBe(
      createMetadataFingerprint(changedBundle),
    );
    expect(createMetadataFingerprint(base)).not.toBe(
      createMetadataFingerprint(changedAsset),
    );
  });
});

describe("createSortedMetadataHash", () => {
  it("is stable for equivalent metadata with different ordering", () => {
    const first = {
      fileMetadata: {
        ios: {
          assets: [
            { ext: "png", path: "assets/2.png", hash: "h2" },
            { ext: "png", path: "assets/1.png", hash: "h1" },
          ],
          bundle: "_expo/static/js/ios/entry-a.hbc",
        },
      },
      id: "abc",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const second = {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "abc",
      fileMetadata: {
        ios: {
          bundle: "_expo/static/js/ios/entry-a.hbc",
          assets: [
            { hash: "h1", path: "assets/1.png", ext: "png" },
            { hash: "h2", path: "assets/2.png", ext: "png" },
          ],
        },
      },
    };

    expect(createSortedMetadataHash(first)).toBe(
      createSortedMetadataHash(second),
    );
  });

  it("changes when metadata content changes", () => {
    const first = {
      fileMetadata: {
        android: {
          bundle: "_expo/static/js/android/entry-a.hbc",
        },
      },
    };
    const second = {
      fileMetadata: {
        android: {
          bundle: "_expo/static/js/android/entry-b.hbc",
        },
      },
    };

    expect(createSortedMetadataHash(first)).not.toBe(
      createSortedMetadataHash(second),
    );
  });
});
