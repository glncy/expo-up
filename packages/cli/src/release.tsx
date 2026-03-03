import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { Octokit } from "@octokit/core";
import { getConfig } from "@expo/config";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { spawnSync } from "node:child_process";
import { getAutoConfig, getStoredToken } from "./auth";
import { INIT_CHANNEL, parseProjectDescriptor } from "../../core/src/index";
import { Badge, BrandHeader, CliCard, KV } from "./ui";
import { PlatformOption } from "./cli-utils";
import {
  createSortedMetadataHash,
  getErrorMessageText,
  getErrorStatus,
  getExpoExportArgs,
  isEmptyRepositoryError,
  parseNumericBuilds,
} from "./release-utils";

interface ReleaseProps {
  channel?: string;
  platform: PlatformOption;
  debug?: boolean;
}

interface GitRefResponse {
  object: { sha: string };
}

interface GitTreeResponse {
  sha: string;
}

interface GitCommitResponse {
  sha: string;
}

interface ContentFileResponse {
  content: string;
}

interface RepositoryResponse {
  default_branch: string;
}

type ReleaseStatus = "idle" | "exporting" | "uploading" | "success" | "error";

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export const Release: React.FC<ReleaseProps> = ({
  channel = "main",
  platform,
  debug = false,
}) => {
  const [status, setStatus] = useState<ReleaseStatus>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const appendLog = (message: string): void =>
      setLogs((prev) => [...prev, message]);
    const appendDebug = (message: string): void =>
      setDebugLogs((prev) => [...prev, message]);

    const runExpoExport = (): void => {
      const args = getExpoExportArgs(platform);
      const result = spawnSync("npx", args, {
        env: { ...process.env, NODE_ENV: "production" },
        encoding: "utf-8",
      });

      if (debug) {
        appendDebug(`$ npx ${args.join(" ")}`);
        const stdoutLines = (result.stdout ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        const stderrLines = (result.stderr ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        stdoutLines.forEach((line) => appendDebug(`[expo:stdout] ${line}`));
        stderrLines.forEach((line) => appendDebug(`[expo:stderr] ${line}`));
      }

      if (result.status !== 0) {
        throw new Error(
          `Expo export failed with exit code ${result.status ?? 1}.`,
        );
      }
    };

    const run = async () => {
      try {
        const config = getAutoConfig();
        const token = getStoredToken();
        if (!token) throw new Error('Not logged in. Run "login" first.');
        if (!config.serverUrl || !config.projectId || !config.runtimeVersion) {
          throw new Error(
            "Missing Expo updates configuration. Check Expo config updates.url and version.",
          );
        }

        const projectRes = await fetch(
          `${config.serverUrl}/projects/${config.projectId}`,
        );
        if (!projectRes.ok)
          throw new Error(`Project "${config.projectId}" not found on server.`);
        const { owner, repo } = parseProjectDescriptor(await projectRes.json());

        const octokit = new Octokit({ auth: token });

        setStatus("exporting");
        appendLog(
          `${pc.blue("ℹ")} Exporting project with Metro (${platform})...`,
        );
        if (debug)
          appendDebug(
            `Resolved config: server=${config.serverUrl}, project=${config.projectId}, runtime=${config.runtimeVersion}`,
          );

        const distDir = path.join(process.cwd(), "dist");
        if (fs.existsSync(distDir)) {
          fs.rmSync(distDir, { recursive: true, force: true });
          if (debug) appendDebug(`Deleted existing dist directory: ${distDir}`);
        }

        runExpoExport();

        const metadataPath = path.join(distDir, "metadata.json");
        if (!fs.existsSync(metadataPath)) {
          throw new Error(
            "Export completed but dist/metadata.json is missing.",
          );
        }

        const metadata = readJsonFile<unknown>(metadataPath);
        const sortedMetadataHash = createSortedMetadataHash(metadata);
        if (debug) appendDebug(`Local sorted metadata hash: ${sortedMetadataHash}`);

        const appConfig = getConfig(process.cwd());
        fs.writeFileSync(
          path.join(distDir, "expoConfig.json"),
          JSON.stringify(appConfig.exp ?? {}, null, 2),
        );

        const getRefSha = async (refName: string): Promise<string | null> => {
          try {
            const { data: refData } = (await octokit.request(
              "GET /repos/{owner}/{repo}/git/ref/{ref}",
              {
                owner,
                repo,
                ref: `heads/${refName}`,
              },
            )) as { data: GitRefResponse };
            return refData.object.sha;
          } catch (error) {
            if (
              getErrorStatus(error) === 404 ||
              isEmptyRepositoryError(error)
            ) {
              return null;
            }
            throw error;
          }
        };

        const createInitBranch = async (): Promise<string> => {
          appendLog(
            `${pc.yellow("ℹ")} Repository is empty. Initializing ${pc.bold(INIT_CHANNEL)}...`,
          );

          const initFileContent = `expo-up init\ncreatedAt=${new Date().toISOString()}\n`;
          const { data: repoData } = (await octokit.request(
            "GET /repos/{owner}/{repo}",
            {
              owner,
              repo,
            },
          )) as { data: RepositoryResponse };
          const defaultBranch = repoData.default_branch || "main";

          await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
            owner,
            repo,
            path: "INIT",
            message: `chore: initialize ${INIT_CHANNEL} branch [cli]`,
            content: Buffer.from(initFileContent, "utf-8").toString("base64"),
            branch: defaultBranch,
          });

          const { data: defaultRef } = (await octokit.request(
            "GET /repos/{owner}/{repo}/git/ref/{ref}",
            {
              owner,
              repo,
              ref: `heads/${defaultBranch}`,
            },
          )) as { data: GitRefResponse };
          const initSha = defaultRef.object.sha;

          if (defaultBranch !== INIT_CHANNEL) {
            try {
              await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
                owner,
                repo,
                ref: `refs/heads/${INIT_CHANNEL}`,
                sha: initSha,
              });
            } catch (error) {
              if (getErrorStatus(error) !== 422) throw error;
            }

            // Make __INIT__ the repository default branch for new repositories.
            await octokit.request("PATCH /repos/{owner}/{repo}", {
              owner,
              repo,
              default_branch: INIT_CHANNEL,
            });

            // Best effort: remove the temporary bootstrap branch (usually "main").
            try {
              await octokit.request(
                "DELETE /repos/{owner}/{repo}/git/refs/{ref}",
                {
                  owner,
                  repo,
                  ref: `heads/${defaultBranch}`,
                },
              );
            } catch (error) {
              // Ignore if branch is protected or already removed.
              if (debug) {
                appendDebug(
                  `Could not delete bootstrap branch ${defaultBranch}: ${getErrorMessageText(error)}`,
                );
              }
            }
          }

          if (debug) {
            appendDebug(
              `Initialized repository with default branch ${INIT_CHANNEL}, commit SHA: ${initSha}`,
            );
          }
          return initSha;
        };

        let parentSha = await getRefSha(channel);
        if (parentSha && debug) {
          appendDebug(`Found existing channel ref SHA: ${parentSha}`);
        }

        if (!parentSha) {
          appendLog(
            `${pc.yellow("ℹ")} Creating channel ${pc.cyan(channel)} from ${pc.bold(INIT_CHANNEL)}...`,
          );

          let initSha: string | null = null;
          initSha = await getRefSha(INIT_CHANNEL);

          if (!initSha) {
            initSha = await createInitBranch();
          }

          if (channel === INIT_CHANNEL) {
            parentSha = initSha;
          } else {
            try {
              const { data: newRef } = (await octokit.request(
                "POST /repos/{owner}/{repo}/git/refs",
                {
                  owner,
                  repo,
                  ref: `refs/heads/${channel}`,
                  sha: initSha,
                },
              )) as { data: GitRefResponse };
              parentSha = newRef.object.sha;
            } catch (error) {
              if (getErrorStatus(error) !== 422) throw error;
              parentSha = await getRefSha(channel);
              if (!parentSha) throw error;
            }
            if (debug) {
              appendDebug(`Created channel ${channel} with SHA ${parentSha}`);
            }
          }
        }

        if (!parentSha) {
          throw new Error(
            `Unable to resolve channel reference for "${channel}".`,
          );
        }

        let nextBuild = 1;
        try {
          const { data: contents } = (await octokit.request(
            "GET /repos/{owner}/{repo}/contents/{path}",
            {
              owner,
              repo,
              path: config.runtimeVersion,
              ref: channel,
            },
          )) as { data: Array<{ name: string }> };

          const builds = Array.isArray(contents)
            ? parseNumericBuilds(contents)
            : [];
          if (debug)
            appendDebug(
              `Detected build folders: ${builds.join(", ") || "(none)"}`,
            );
          if (builds.length > 0) {
            const latestBuild = builds[0];
            nextBuild = latestBuild + 1;
            if (debug)
              appendDebug(
                `Latest build=${latestBuild}, next build=${nextBuild}`,
              );

            try {
              const { data: latestMeta } = (await octokit.request(
                "GET /repos/{owner}/{repo}/contents/{path}",
                {
                  owner,
                  repo,
                  path: `${config.runtimeVersion}/${latestBuild}/metadata.json`,
                  ref: channel,
                },
              )) as { data: ContentFileResponse };

              const remoteMetadata = JSON.parse(
                Buffer.from(latestMeta.content, "base64").toString(),
              ) as unknown;
              const remoteSortedMetadataHash =
                createSortedMetadataHash(remoteMetadata);
              if (debug) {
                appendDebug(
                  `Remote sorted metadata hash: ${remoteSortedMetadataHash}`,
                );
              }
              if (remoteSortedMetadataHash === sortedMetadataHash) {
                appendLog(pc.yellow("⚠ No changes detected. Build skipped."));
                setStatus("success");
                return;
              }
            } catch {
              // If latest build metadata is unreadable we continue with release.
            }
          }
        } catch {
          // Runtime root path may not exist yet on new channels. Proceed with build #1.
        }

        setStatus("uploading");
        appendLog(
          `${pc.blue("ℹ")} Uploading build ${pc.bold(nextBuild)} to ${pc.cyan(channel)}...`,
        );

        const treeItems: Array<{ local: string; remote: string }> = [];
        const walk = (dir: string, base = ""): void => {
          for (const fileName of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, fileName);
            const relativePath = base ? path.join(base, fileName) : fileName;
            if (fs.statSync(fullPath).isDirectory()) {
              walk(fullPath, relativePath);
              continue;
            }
            treeItems.push({
              local: fullPath,
              remote: `${config.runtimeVersion}/${nextBuild}/${relativePath.replaceAll(path.sep, "/")}`,
            });
          }
        };
        walk(distDir);
        if (debug)
          appendDebug(`Prepared ${treeItems.length} files for commit tree.`);

        const newTree: Array<{
          path: string;
          mode: "100644";
          type: "blob";
          sha: string;
        }> = [];
        for (const item of treeItems) {
          const content = fs.readFileSync(item.local);
          const { data: blob } = (await octokit.request(
            "POST /repos/{owner}/{repo}/git/blobs",
            {
              owner,
              repo,
              content: content.toString("base64"),
              encoding: "base64",
            },
          )) as { data: { sha: string } };
          newTree.push({
            path: item.remote,
            mode: "100644",
            type: "blob",
            sha: blob.sha,
          });
        }

        const { data: tree } = (await octokit.request(
          "POST /repos/{owner}/{repo}/git/trees",
          {
            owner,
            repo,
            base_tree: parentSha,
            tree: newTree,
          },
        )) as { data: GitTreeResponse };
        if (debug) appendDebug(`Created git tree: ${tree.sha}`);

        const { data: commit } = (await octokit.request(
          "POST /repos/{owner}/{repo}/git/commits",
          {
            owner,
            repo,
            message: `release: build ${nextBuild} for ${config.runtimeVersion} [cli]`,
            tree: tree.sha,
            parents: [parentSha],
          },
        )) as { data: GitCommitResponse };
        if (debug) appendDebug(`Created commit: ${commit.sha}`);

        await octokit.request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
          owner,
          repo,
          ref: `heads/${channel}`,
          sha: commit.sha,
        });

        appendLog(pc.green("✔ Release successful!"));
        setStatus("success");
      } catch (runError) {
        setError(toErrorMessage(runError));
        if (debug) appendDebug(`Failure: ${toErrorMessage(runError)}`);
        setStatus("error");
      }
    };

    run();
  }, [channel, platform]);

  return (
    <Box flexDirection="column" padding={1}>
      <BrandHeader subtitle="Over-the-air updates" />
      <CliCard title="expo-up release" subtitle="Build and publish OTA update">
        <KV keyName="Channel" value={channel} valueColor="cyan" />
        <KV keyName="Platform" value={platform} valueColor="blue" />
      </CliCard>

      <CliCard title="Progress">
        {logs.length === 0 ? (
          <Text color="gray">Waiting to start...</Text>
        ) : null}
        {logs.map((log, index) => (
          <Text key={index}>{`• ${log}`}</Text>
        ))}
        {status !== "success" && status !== "error" && (
          <Box marginTop={1}>
            <Badge label={status.toUpperCase()} tone="yellow" />
            <Text>
              <Spinner type="dots" /> Working...
            </Text>
          </Box>
        )}
        {error ? (
          <Box marginTop={1}>
            <Badge label="FAILED" tone="red" />
            <Text color="red">{error}</Text>
          </Box>
        ) : null}
        {status === "success" ? (
          <Box marginTop={1}>
            <Badge label="SUCCESS" tone="green" />
            <Text color="green">Release completed.</Text>
          </Box>
        ) : null}
      </CliCard>
      {debug && (
        <CliCard title="Debug Logs" subtitle="Verbose diagnostics">
          {debugLogs.length === 0 ? (
            <Text color="gray">No debug logs yet.</Text>
          ) : null}
          {debugLogs.map((log, index) => (
            <Text key={index} color="gray">
              {log}
            </Text>
          ))}
        </CliCard>
      )}
    </Box>
  );
};
