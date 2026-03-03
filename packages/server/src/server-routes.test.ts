/// <reference types="node" />
/// <reference path="../../typescript-config/bun-test-shim.d.ts" />
import { describe, expect, it } from "bun:test";
import { configureExpoUp, createExpoUpServer } from "./index";
import { StorageProvider } from "./types";

class FakeStorage implements StorageProvider {
  constructor(
    private readonly files: Record<string, Buffer>,
    private readonly lists: Record<string, string[]>,
  ) {}

  async upload(): Promise<string> {
    return "";
  }

  async download(path: string): Promise<Buffer> {
    const file = this.files[path];
    if (!file) {
      throw new Error("Not found");
    }
    return file;
  }

  async delete(): Promise<void> {}

  async list(path: string): Promise<string[]> {
    return this.lists[path] ?? [];
  }
}

function makeServer(storage: StorageProvider) {
  const app = createExpoUpServer({
    storage,
    basePath: "/api/expo-up",
    projects: {
      demo: {
        owner: "owner",
        repo: "repo",
      },
    },
  });

  app.use("*", async (c, next) => {
    configureExpoUp(c, { storage });
    await next();
  });

  return app;
}

describe("server routes", () => {
  it("returns project config", async () => {
    const app = makeServer(new FakeStorage({}, {}));
    const response = await app.request("http://localhost/projects/demo");

    expect(response.status).toBe(200);
    const body = (await response.json()) as { owner: string; repo: string };
    expect(body.owner).toBe("owner");
    expect(body.repo).toBe("repo");
  });

  it("returns 404 when builds are missing", async () => {
    const storage = new FakeStorage({}, { "owner/repo/1.0.0": [] });
    const app = makeServer(storage);

    const response = await app.request("http://localhost/demo/manifest", {
      headers: {
        "expo-runtime-version": "1.0.0",
        "expo-platform": "ios",
      },
    });

    expect(response.status).toBe(404);
  });

  it("returns embedded rollback multipart manifest", async () => {
    const storage = new FakeStorage(
      {
        "owner/repo/1.0.0/9/rollback": Buffer.from("EMBEDDED"),
      },
      {
        "owner/repo/1.0.0": ["9"],
      },
    );
    const app = makeServer(storage);

    const response = await app.request("http://localhost/demo/manifest", {
      headers: {
        "expo-runtime-version": "1.0.0",
        "expo-platform": "ios",
        "expo-protocol-version": "1",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("expo-update-id")).toBeTruthy();
    const body = await response.text();
    expect(body).toContain("rollBackToEmbedded");
  });

  it("returns 400 for unsafe asset paths", async () => {
    const app = makeServer(new FakeStorage({}, {}));
    const response = await app.request(
      "http://localhost/demo/assets?path=../../etc/passwd",
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when asset file does not exist", async () => {
    const app = makeServer(new FakeStorage({}, {}));
    const response = await app.request(
      "http://localhost/demo/assets?path=owner/repo/1.0.0/assets/main.js",
    );

    expect(response.status).toBe(404);
  });
});
