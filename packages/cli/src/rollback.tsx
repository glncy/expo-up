import * as React from "react";
import { Text, Box, Static } from "ink";
import Spinner from "ink-spinner";
import { Octokit } from "@octokit/rest";
import pc from "picocolors";
import { getAutoConfig, resolveGithubToken } from "./auth";
import {
  EMBEDDED_ROLLBACK_TARGET,
  parseProjectDescriptor,
  resolveRollbackTarget,
} from "../../core/src/index";
import { Badge, BrandHeader, CliCard, KV } from "./ui";
import { parseBuildFolders, resolveRollbackSelection } from "./rollback-utils";

interface RollbackProps {
  channel: string;
  to?: string;
  embedded?: boolean;
  debug?: boolean;
  token?: string;
}

export const Rollback: React.FC<RollbackProps> = ({
  channel,
  to,
  embedded,
  debug = false,
  token,
}) => {
  const [logs, setLogs] = React.useState<string[]>([]);
  const [debugLogs, setDebugLogs] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<
    "idle" | "running" | "success" | "error" | "skipped"
  >("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [target, setTarget] = React.useState<string>("");

  React.useEffect(() => {
    const run = async () => {
      try {
        const appendLog = (message: string): void =>
          setLogs((prev) => [...prev, message]);
        const appendDebug = (message: string): void =>
          setDebugLogs((prev) => [...prev, message]);
        const resolvedToken = resolveGithubToken(token);
        const { serverUrl, projectId, runtimeVersion } = getAutoConfig();

        if (!resolvedToken || !serverUrl || !projectId || !runtimeVersion)
          throw new Error(
            'Missing configuration. Use "login", --token, or EXPO_UP_CLI_GITHUB_TOKEN.',
          );
        if (debug)
          appendDebug(
            `Resolved config: server=${serverUrl}, project=${projectId}, runtime=${runtimeVersion}`,
          );

        const octokit = new Octokit({ auth: resolvedToken });
        setStatus("running");

        const projRes = await fetch(`${serverUrl}/projects/${projectId}`);
        if (!projRes.ok) throw new Error(`Project "${projectId}" not found.`);
        const { owner, repo } = parseProjectDescriptor(await projRes.json());

        const { data: contents } = await octokit.repos.getContent({
          owner,
          repo,
          path: runtimeVersion,
          ref: channel,
        });
        if (!Array.isArray(contents)) throw new Error("No builds found.");

        const builds = parseBuildFolders(
          contents as Array<{ type?: string; name?: string }>,
        );
        const latestFolder = builds[0];
        if (debug)
          appendDebug(
            `Detected build folders: ${builds.join(", ") || "(none)"}`,
          );

        // 1. Resolve Target
        const resolvedLiveBuild = await resolveRollbackTarget({
          latestBuildId: latestFolder,
          loadRollbackTarget: async (buildId) => {
            try {
              const { data: file } = (await octokit.repos.getContent({
                owner,
                repo,
                path: `${runtimeVersion}/${buildId}/rollback`,
                ref: channel,
              })) as { data: { content: string } };
              return Buffer.from(file.content, "base64").toString();
            } catch {
              return null;
            }
          },
        });
        const liveBuildId = resolvedLiveBuild.buildId;
        if (debug) appendDebug(`Resolved live build id: ${liveBuildId}`);

        const { targetValue, usedFallbackToEmbedded } =
          resolveRollbackSelection({
            embedded,
            to,
            builds,
            liveBuildId,
            embeddedTarget: EMBEDDED_ROLLBACK_TARGET,
          });

        if (usedFallbackToEmbedded) {
          appendLog(
            `${pc.yellow("ℹ")} No previous build found. Falling back to ${EMBEDDED_ROLLBACK_TARGET}.`,
          );
        }

        setTarget(targetValue);
        if (debug) appendDebug(`Selected rollback target: ${targetValue}`);

        // 2. Check Duplicate
        try {
          const { data: lastFile } = (await octokit.repos.getContent({
            owner,
            repo,
            path: `${runtimeVersion}/${latestFolder}/rollback`,
            ref: channel,
          })) as any;
          if (
            Buffer.from(lastFile.content, "base64").toString().trim() ===
            targetValue
          ) {
            setStatus("skipped");
            appendLog(
              `${pc.yellow("⚠")} Already rolled back to ${targetValue}.`,
            );
            return;
          }
        } catch (e) {}

        const nextBuildFolder = latestFolder + 1;

        // 3. Commit
        const { data: targetRef } = await octokit.git.getRef({
          owner,
          repo,
          ref: `heads/${channel}`,
        });
        const { data: blob } = await octokit.git.createBlob({
          owner,
          repo,
          content: targetValue,
          encoding: "utf-8",
        });
        const { data: baseCommit } = await octokit.git.getCommit({
          owner,
          repo,
          commit_sha: targetRef.object.sha,
        });
        const { data: tree } = await octokit.git.createTree({
          owner,
          repo,
          base_tree: baseCommit.tree.sha,
          tree: [
            {
              path: `${runtimeVersion}/${nextBuildFolder}/rollback`,
              mode: "100644",
              type: "blob",
              sha: blob.sha,
            },
          ],
        });
        const { data: commit } = await octokit.git.createCommit({
          owner,
          repo,
          message: `rollback: to ${targetValue} on ${channel}`,
          tree: tree.sha,
          parents: [targetRef.object.sha],
        });
        await octokit.git.updateRef({
          owner,
          repo,
          ref: `heads/${channel}`,
          sha: commit.sha,
        });
        if (debug) appendDebug(`Created rollback commit: ${commit.sha}`);

        setStatus("success");
        appendLog(
          `${pc.green("✨")} Successfully rolled back to ${targetValue}!`,
        );
      } catch (e: any) {
        setStatus("error");
        setError(e.message);
        if (debug) setDebugLogs((prev) => [...prev, `Failure: ${e.message}`]);
      }
    };
    run();
  }, [channel, debug, embedded, to, token]);

  return (
    <Box flexDirection="column" padding={1}>
      <BrandHeader subtitle="Over-the-air updates" />
      <CliCard
        title="expo-up rollback"
        subtitle="Move channel to a previous build or embedded"
      >
        <KV keyName="Channel" value={channel} valueColor="cyan" />
        <KV
          keyName="Target"
          value={embedded ? EMBEDDED_ROLLBACK_TARGET : (to ?? "auto")}
          valueColor="yellow"
        />
      </CliCard>

      <CliCard title="Progress">
        <Static items={logs}>
          {(log, i) => <Text key={i}>{`• ${log}`}</Text>}
        </Static>
        {status === "running" && (
          <Box marginTop={1}>
            <Badge label="RUNNING" tone="yellow" />
            <Text>
              <Spinner /> Applying rollback...
            </Text>
          </Box>
        )}
        {status === "success" && (
          <Box marginTop={1}>
            <Badge label="SUCCESS" tone="green" />
            <Text color="green">Rollback complete.</Text>
          </Box>
        )}
        {status === "skipped" && (
          <Box marginTop={1} flexDirection="column">
            <Box>
              <Badge label="SKIPPED" tone="yellow" />
              <Text color="yellow">Already at target.</Text>
            </Box>
            <Text dimColor>
              The live version on {pc.cyan(channel)} is already{" "}
              {pc.white(
                target === EMBEDDED_ROLLBACK_TARGET
                  ? "the Native Build"
                  : "Build " + target,
              )}
              .
            </Text>
          </Box>
        )}
        {status === "error" && (
          <Box marginTop={1}>
            <Badge label="FAILED" tone="red" />
            <Text color="red">{error}</Text>
          </Box>
        )}
      </CliCard>

      {debug && (
        <CliCard title="Debug Logs" subtitle="Verbose diagnostics">
          {debugLogs.length === 0 ? (
            <Text color="gray">No debug logs yet.</Text>
          ) : null}
          {debugLogs.map((log, i) => (
            <Text key={i} color="gray">
              {log}
            </Text>
          ))}
        </CliCard>
      )}
    </Box>
  );
};
