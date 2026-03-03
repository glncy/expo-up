/// <reference types="node" />
/// <reference path="../../../typescript-config/bun-test-shim.d.ts" />
import { describe, expect, it } from "bun:test";
import { ExpoUpGithubStorageProvider } from "./github";

type RequestCall = { route: string; params: Record<string, unknown> };

function createProviderWithMockedOctokit(
  requestImpl: (
    route: string,
    params: Record<string, unknown>,
  ) => Promise<unknown>,
) {
  const provider = new ExpoUpGithubStorageProvider("token-123");
  (
    provider as unknown as { octokit: { request: typeof requestImpl } }
  ).octokit = {
    request: requestImpl,
  };
  return provider;
}

describe("ExpoUpGithubStorageProvider", () => {
  it("upload creates file when target does not exist", async () => {
    const calls: RequestCall[] = [];
    const provider = createProviderWithMockedOctokit(async (route, params) => {
      calls.push({ route, params });

      if (route === "GET /repos/{owner}/{repo}/contents/{path}") {
        const error = new Error("not found") as Error & { status: number };
        error.status = 404;
        throw error;
      }

      if (route === "PUT /repos/{owner}/{repo}/contents/{path}") {
        return { data: { content: { path: "runtime/1/file.txt" } } };
      }

      throw new Error(`Unexpected route: ${route}`);
    });

    const uploadedPath = await provider.upload(
      "hello",
      "owner/repo/runtime/1/file.txt",
      "main",
    );

    expect(uploadedPath).toBe("runtime/1/file.txt");
    expect(calls.length).toBe(2);
    expect(calls[1]?.params.sha).toBe(undefined);
  });

  it("upload updates file when existing sha is found", async () => {
    const provider = createProviderWithMockedOctokit(async (route) => {
      if (route === "GET /repos/{owner}/{repo}/contents/{path}") {
        return { data: { sha: "abc123" } };
      }
      if (route === "PUT /repos/{owner}/{repo}/contents/{path}") {
        return { data: { content: { path: "runtime/2/file.txt" } } };
      }
      throw new Error(`Unexpected route: ${route}`);
    });

    const uploadedPath = await provider.upload(
      Buffer.from("data"),
      "owner/repo/runtime/2/file.txt",
      "main",
    );
    expect(uploadedPath).toBe("runtime/2/file.txt");
  });

  it("download returns binary buffer from fetch response", async () => {
    const provider = new ExpoUpGithubStorageProvider("token-abc");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      } as Response;
    }) as typeof fetch;

    try {
      const buffer = await provider.download(
        "owner/repo/runtime/3/file.bin",
        "main",
      );
      expect(Array.from(buffer.values())).toEqual([1, 2, 3, 4]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("list returns [] on 404 and names on success", async () => {
    let mode: "404" | "ok" = "404";
    const provider = createProviderWithMockedOctokit(async () => {
      if (mode === "404") {
        const error = new Error("not found") as Error & { status: number };
        error.status = 404;
        throw error;
      }

      return { data: [{ name: "10" }, { name: "11" }, { name: undefined }] };
    });

    expect(await provider.list("owner/repo/runtime", "main")).toEqual([]);
    mode = "ok";
    expect(await provider.list("owner/repo/runtime", "main")).toEqual([
      "10",
      "11",
    ]);
  });

  it("delete removes a file using looked-up sha", async () => {
    const calls: string[] = [];
    const provider = createProviderWithMockedOctokit(async (route) => {
      calls.push(route);
      if (route === "GET /repos/{owner}/{repo}/contents/{path}") {
        return { data: { sha: "sha-to-delete" } };
      }
      if (route === "DELETE /repos/{owner}/{repo}/contents/{path}") {
        return { data: {} };
      }
      throw new Error(`Unexpected route: ${route}`);
    });

    await provider.delete("owner/repo/runtime/4/file.txt", "staging");
    expect(calls).toEqual([
      "GET /repos/{owner}/{repo}/contents/{path}",
      "DELETE /repos/{owner}/{repo}/contents/{path}",
    ]);
  });

  it("throws for invalid storage path", async () => {
    const provider = new ExpoUpGithubStorageProvider("token-abc");
    await expect(provider.list("invalid-path", "main")).rejects.toThrow(
      "Invalid storage path",
    );
  });
});
