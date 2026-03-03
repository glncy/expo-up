import { Octokit } from "@octokit/core";
import { StorageProvider } from "../types";

function splitRepoPath(inputPath: string): {
  owner: string;
  repo: string;
  relativePath: string;
} {
  const parts = inputPath.split("/").filter(Boolean);
  if (parts.length < 3) {
    throw new Error(
      `Invalid storage path "${inputPath}". Expected "<owner>/<repo>/<path...>"`,
    );
  }

  const [owner, repo, ...rest] = parts;
  return { owner, repo, relativePath: rest.join("/") };
}

function toBase64Content(file: Buffer | Blob | string): Promise<string> {
  if (typeof file === "string") {
    return Promise.resolve(Buffer.from(file, "utf-8").toString("base64"));
  }

  if (file instanceof Buffer) {
    return Promise.resolve(file.toString("base64"));
  }

  if (file instanceof Blob) {
    return file
      .arrayBuffer()
      .then((arrayBuffer: ArrayBuffer) =>
        Buffer.from(arrayBuffer).toString("base64"),
      );
  }

  throw new Error("Unsupported file type for upload.");
}

export class ExpoUpGithubStorageProvider implements StorageProvider {
  private readonly octokit: Octokit;
  private readonly auth: string;

  constructor(auth: string) {
    this.auth = auth;
    this.octokit = new Octokit({ auth });
  }

  async upload(
    file: Buffer | Blob | string,
    targetPath: string,
    branch: string,
  ): Promise<string> {
    const { owner, repo, relativePath } = splitRepoPath(targetPath);
    const content = await toBase64Content(file);

    let sha: string | undefined;
    try {
      const { data: existing } = (await this.octokit.request(
        "GET /repos/{owner}/{repo}/contents/{path}",
        {
          owner,
          repo,
          path: relativePath,
          ref: branch,
        },
      )) as { data: { sha?: string } };
      sha = existing.sha;
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number((error as { status: unknown }).status)
          : undefined;
      if (status !== 404) throw error;
    }

    const { data } = (await this.octokit.request(
      "PUT /repos/{owner}/{repo}/contents/{path}",
      {
        owner,
        repo,
        path: relativePath,
        branch,
        message: `chore(storage): upload ${relativePath}`,
        content,
        sha,
      },
    )) as { data: { content?: { path?: string } } };

    return data.content?.path ?? relativePath;
  }

  /**
   * Uses fetch + arrayBuffer to preserve binary integrity (large Hermes bundles).
   */
  async download(inputPath: string, branch: string): Promise<Buffer> {
    const { owner, repo, relativePath } = splitRepoPath(inputPath);
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${relativePath}?ref=${encodeURIComponent(branch)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `token ${this.auth}`,
        Accept: "application/vnd.github.v3.raw",
        "User-Agent": "expo-up-server",
      },
    });

    if (!response.ok) {
      throw new Error(
        `GitHub download failed: ${response.status} ${response.statusText}`,
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async delete(inputPath: string, branch: string): Promise<void> {
    const { owner, repo, relativePath } = splitRepoPath(inputPath);

    const { data: existing } = (await this.octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner,
        repo,
        path: relativePath,
        ref: branch,
      },
    )) as { data: { sha: string } };

    await this.octokit.request("DELETE /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: relativePath,
      branch,
      sha: existing.sha,
      message: `chore(storage): delete ${relativePath}`,
    });
  }

  async list(inputPath: string, branch: string): Promise<string[]> {
    const { owner, repo, relativePath } = splitRepoPath(inputPath);

    try {
      const { data } = (await this.octokit.request(
        "GET /repos/{owner}/{repo}/contents/{path}",
        {
          owner,
          repo,
          path: relativePath,
          ref: branch,
        },
      )) as { data: Array<{ name?: string }> | { name?: string } };

      if (!Array.isArray(data)) {
        return data.name ? [data.name] : [];
      }

      return data
        .map((item) => item.name)
        .filter((name): name is string => Boolean(name));
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number((error as { status: unknown }).status)
          : undefined;
      if (status === 404) {
        return [];
      }
      throw error;
    }
  }
}
