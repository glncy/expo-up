/// <reference path="../../typescript-config/bun-test-shim.d.ts" />
import { describe, expect, it } from "bun:test";
import { parseDeleteBuildIds, shouldAutoExitHistory } from "./history-utils";

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

describe("shouldAutoExitHistory", () => {
  it("does not auto-exit in interactive mode", () => {
    expect(
      shouldAutoExitHistory({
        interactiveMode: true,
        status: "idle",
        hasPendingDeleteConfirmation: false,
      }),
    ).toBe(false);
  });

  it("does not auto-exit while work is still running", () => {
    expect(
      shouldAutoExitHistory({
        interactiveMode: false,
        status: "loading",
        hasPendingDeleteConfirmation: false,
      }),
    ).toBe(false);

    expect(
      shouldAutoExitHistory({
        interactiveMode: false,
        status: "deleting",
        hasPendingDeleteConfirmation: false,
      }),
    ).toBe(false);
  });

  it("does not auto-exit while waiting for delete confirmation", () => {
    expect(
      shouldAutoExitHistory({
        interactiveMode: false,
        status: "idle",
        hasPendingDeleteConfirmation: true,
      }),
    ).toBe(false);
  });

  it("auto-exits after non-interactive list or terminal states", () => {
    expect(
      shouldAutoExitHistory({
        interactiveMode: false,
        status: "idle",
        hasPendingDeleteConfirmation: false,
      }),
    ).toBe(true);

    expect(
      shouldAutoExitHistory({
        interactiveMode: false,
        status: "success",
        hasPendingDeleteConfirmation: false,
      }),
    ).toBe(true);

    expect(
      shouldAutoExitHistory({
        interactiveMode: false,
        status: "error",
        hasPendingDeleteConfirmation: false,
      }),
    ).toBe(true);
  });
});
