import * as React from "react";
import { Text, Box, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { Octokit } from "@octokit/rest";
import { getAutoConfig, resolveGithubToken } from "./auth";
import {
  EMBEDDED_ROLLBACK_TARGET,
  parseProjectDescriptor,
} from "../../core/src/index";
import { Badge, BrandHeader, CliCard, KV } from "./ui";
import { parseDeleteBuildIds, shouldAutoExitHistory } from "./history-utils";

interface HistoryProps {
  channel: string;
  debug?: boolean;
  deleteBuildIds?: string[];
  interactiveDelete?: boolean;
  yes?: boolean;
  token?: string;
}

type BuildItem = {
  id: number;
  type: "ROLLBACK" | "RELEASE";
  label: string;
  isLive: boolean;
};

type HistoryStatus = "loading" | "idle" | "deleting" | "success" | "error";

type HistoryContext = {
  octokit: Octokit;
  owner: string;
  repo: string;
  runtimeVersion: string;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export const History: React.FC<HistoryProps> = ({
  channel,
  debug = false,
  deleteBuildIds,
  interactiveDelete = true,
  yes = false,
  token,
}) => {
  const { exit } = useApp();
  const [items, setItems] = React.useState<BuildItem[]>([]);
  const [status, setStatus] = React.useState<HistoryStatus>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [debugLogs, setDebugLogs] = React.useState<string[]>([]);
  const [cursor, setCursor] = React.useState(0);
  const [selectedBuilds, setSelectedBuilds] = React.useState<Set<number>>(
    new Set(),
  );
  const [logs, setLogs] = React.useState<string[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = React.useState<
    number[] | null
  >(null);

  const ctxRef = React.useRef<HistoryContext | null>(null);
  const autoDeleteTriggeredRef = React.useRef(false);
  const didExitRef = React.useRef(false);

  const parsedAutoDeleteIds = React.useMemo(() => {
    try {
      return parseDeleteBuildIds(deleteBuildIds);
    } catch (parseError) {
      setError(toErrorMessage(parseError));
      setStatus("error");
      return [];
    }
  }, [deleteBuildIds]);

  const interactiveMode =
    interactiveDelete &&
    parsedAutoDeleteIds.length === 0 &&
    Boolean(process.stdin.isTTY) &&
    process.env.CI !== "true";

  const appendDebug = React.useCallback((message: string) => {
    setDebugLogs((prev) => [...prev, message]);
  }, []);

  const appendLog = React.useCallback((message: string) => {
    setLogs((prev) => [...prev, message]);
  }, []);

  const loadHistory = React.useCallback(async () => {
    try {
      setStatus("loading");
      setError(null);
      setLogs([]);
      setPendingDeleteIds(null);
      setSelectedBuilds(new Set());
      setCursor(0);

      const resolvedToken = resolveGithubToken(token);
      const { serverUrl, projectId, runtimeVersion } = getAutoConfig();

      if (!resolvedToken || !serverUrl || !projectId || !runtimeVersion) {
        throw new Error(
          'Missing configuration. Use "login", --token, or EXPO_UP_CLI_GITHUB_TOKEN.',
        );
      }
      if (debug) {
        appendDebug(
          `Resolved config: server=${serverUrl}, project=${projectId}, runtime=${runtimeVersion}, channel=${channel}`,
        );
      }

      const octokit = new Octokit({ auth: resolvedToken });

      const projRes = await fetch(`${serverUrl}/projects/${projectId}`);
      if (!projRes.ok) throw new Error(`Project "${projectId}" not found.`);

      const { owner, repo } = parseProjectDescriptor(await projRes.json());
      ctxRef.current = { octokit, owner, repo, runtimeVersion };

      const { data: contents } = await octokit.repos.getContent({
        owner,
        repo,
        path: runtimeVersion,
        ref: channel,
      });

      if (!Array.isArray(contents)) {
        setItems([]);
        setStatus("idle");
        return;
      }

      const buildFolders = contents
        .filter((f) => f.type === "dir")
        .map((f) => parseInt(f.name))
        .filter((n) => !isNaN(n))
        .sort((a, b) => b - a);

      if (debug) {
        appendDebug(`Detected builds: ${buildFolders.join(", ") || "(none)"}`);
      }

      const historyItems = await Promise.all(
        buildFolders.map(async (id) => {
          try {
            const buildPath = `${runtimeVersion}/${id}`;
            const { data: buildContents } = await octokit.repos.getContent({
              owner,
              repo,
              path: buildPath,
              ref: channel,
            });

            if (!Array.isArray(buildContents)) {
              return {
                id,
                type: "RELEASE" as const,
                label: "Standard Release",
              };
            }

            const hasRollbackFile = buildContents.some(
              (entry) => entry.type === "file" && entry.name === "rollback",
            );

            if (!hasRollbackFile) {
              return {
                id,
                type: "RELEASE" as const,
                label: "Standard Release",
              };
            }

            const { data: rbFile } = (await octokit.repos.getContent({
              owner,
              repo,
              path: `${buildPath}/rollback`,
              ref: channel,
            })) as any;

            const target = Buffer.from(rbFile.content, "base64")
              .toString()
              .trim();
            const label =
              target === EMBEDDED_ROLLBACK_TARGET
                ? "Rollback to EMBEDDED"
                : `Rollback to ${target}`;

            return { id, type: "ROLLBACK" as const, label };
          } catch {
            return { id, type: "RELEASE" as const, label: "Standard Release" };
          }
        }),
      );

      setItems(
        historyItems.map((item, index) => ({ ...item, isLive: index === 0 })),
      );
      setStatus("idle");
    } catch (caughtError) {
      const message = toErrorMessage(caughtError);
      setError(message);
      setStatus("error");
      if (debug) appendDebug(`Failure: ${message}`);
    }
  }, [appendDebug, channel, debug, token]);

  const deleteBuilds = React.useCallback(
    async (buildIds: number[]) => {
      const context = ctxRef.current;
      if (!context) {
        throw new Error("History context is not initialized.");
      }

      const { octokit, owner, repo, runtimeVersion } = context;
      setStatus("deleting");
      setError(null);
      setLogs([]);

      appendLog(`Preparing to delete builds: ${buildIds.join(", ")}`);

      const { data: targetRef } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${channel}`,
      });

      const { data: baseCommit } = await octokit.git.getCommit({
        owner,
        repo,
        commit_sha: targetRef.object.sha,
      });

      const { data: fullTree } = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: baseCommit.tree.sha,
        recursive: "1",
      });

      const deletionEntries = buildIds.flatMap((buildId) => {
        const prefix = `${runtimeVersion}/${buildId}/`;
        const matchingFiles = fullTree.tree
          .filter(
            (entry) => entry.type === "blob" && entry.path?.startsWith(prefix),
          )
          .map((entry) => entry.path)
          .filter((path): path is string => Boolean(path));

        if (matchingFiles.length === 0) {
          appendLog(`Build ${buildId}: no files found, skipping.`);
          return [];
        }

        appendLog(
          `Build ${buildId}: deleting ${matchingFiles.length} file(s).`,
        );
        return matchingFiles.map((path) => ({
          path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: null,
        }));
      });

      if (deletionEntries.length === 0) {
        appendLog("No matching files to delete.");
        setStatus("success");
        return;
      }

      const { data: tree } = await octokit.git.createTree({
        owner,
        repo,
        base_tree: baseCommit.tree.sha,
        tree: deletionEntries,
      });

      const { data: commit } = await octokit.git.createCommit({
        owner,
        repo,
        message: `cleanup: delete build(s) ${buildIds.join(", ")} on ${channel} [cli]`,
        tree: tree.sha,
        parents: [targetRef.object.sha],
      });

      await octokit.git.updateRef({
        owner,
        repo,
        ref: `heads/${channel}`,
        sha: commit.sha,
      });

      appendLog(`Delete commit created: ${commit.sha}`);
      setStatus("success");
      await loadHistory();
    },
    [appendLog, channel, loadHistory],
  );

  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  React.useEffect(() => {
    if (didExitRef.current) {
      return;
    }

    if (
      !shouldAutoExitHistory({
        interactiveMode,
        status,
        hasPendingDeleteConfirmation: Boolean(pendingDeleteIds),
      })
    ) {
      return;
    }

    didExitRef.current = true;
    process.exitCode = error ? 1 : 0;
    exit();
  }, [error, exit, interactiveMode, pendingDeleteIds, status]);

  React.useEffect(() => {
    if (
      status !== "idle" ||
      parsedAutoDeleteIds.length === 0 ||
      autoDeleteTriggeredRef.current
    ) {
      return;
    }

    autoDeleteTriggeredRef.current = true;
    if (yes) {
      deleteBuilds(parsedAutoDeleteIds).catch((caughtError) => {
        const message = toErrorMessage(caughtError);
        setError(message);
        setStatus("error");
        if (debug) appendDebug(`Delete failure: ${message}`);
      });
      return;
    }

    if (interactiveMode) {
      setPendingDeleteIds(parsedAutoDeleteIds);
      return;
    }

    setError(
      'Delete confirmation required. Re-run with "--yes" for non-interactive delete.',
    );
    setStatus("error");
  }, [
    appendDebug,
    debug,
    deleteBuilds,
    interactiveMode,
    parsedAutoDeleteIds,
    status,
    yes,
  ]);

  useInput((input, key) => {
    if (!interactiveMode || status !== "idle" || items.length === 0) return;
    if (pendingDeleteIds) {
      const normalized = input.toLowerCase();

      if (normalized === "y") {
        const confirmed = [...pendingDeleteIds];
        setPendingDeleteIds(null);
        deleteBuilds(confirmed).catch((caughtError) => {
          const message = toErrorMessage(caughtError);
          setError(message);
          setStatus("error");
          if (debug) appendDebug(`Delete failure: ${message}`);
        });
        return;
      }

      if (normalized === "n" || key.return || key.escape) {
        setPendingDeleteIds(null);
        appendLog("Delete cancelled.");
        return;
      }
      return;
    }

    if (key.upArrow || input === "k" || input === "w") {
      setCursor((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
      return;
    }

    if (key.downArrow || input === "j" || input === "s") {
      setCursor((prev) => (prev >= items.length - 1 ? 0 : prev + 1));
      return;
    }

    if (input === " ") {
      const buildId = items[cursor]?.id;
      if (!buildId) return;
      setSelectedBuilds((prev) => {
        const next = new Set(prev);
        if (next.has(buildId)) next.delete(buildId);
        else next.add(buildId);
        return next;
      });
      return;
    }

    if (key.return) {
      const selected = Array.from(selectedBuilds.values()).sort(
        (a, b) => b - a,
      );
      if (selected.length === 0) return;
      setPendingDeleteIds(selected);
      return;
    }

    if (input === "r") {
      loadHistory();
    }
  });

  const selectionCount = selectedBuilds.size;
  const terminalRows = process.stdout.rows ?? 24;
  const maxVisibleItems = Math.max(6, terminalRows - 18);
  const visibleStart = interactiveMode
    ? Math.max(
        0,
        Math.min(
          cursor - Math.floor(maxVisibleItems / 2),
          Math.max(0, items.length - maxVisibleItems),
        ),
      )
    : 0;
  const visibleEnd = Math.min(items.length, visibleStart + maxVisibleItems);
  const visibleItems = items.slice(visibleStart, visibleEnd);
  const hiddenAbove = visibleStart;
  const hiddenBelow = Math.max(0, items.length - visibleEnd);

  return (
    <Box flexDirection="column" padding={1}>
      <BrandHeader subtitle="Over-the-air updates" />
      <CliCard title="expo-up history" subtitle="Release and rollback timeline">
        <KV keyName="Channel" value={channel} valueColor="cyan" />
        {parsedAutoDeleteIds.length > 0 ? (
          <KV
            keyName="Delete IDs"
            value={parsedAutoDeleteIds.join(", ")}
            valueColor="yellow"
          />
        ) : null}
      </CliCard>

      <CliCard title="Builds">
        {status === "loading" && (
          <Box>
            <Badge label="LOADING" tone="yellow" />
            <Text>
              <Spinner /> Fetching history...
            </Text>
          </Box>
        )}

        {status === "deleting" && (
          <Box>
            <Badge label="DELETING" tone="yellow" />
            <Text>
              <Spinner /> Deleting selected builds...
            </Text>
          </Box>
        )}

        {status === "success" && logs.length > 0 && (
          <Box marginBottom={1}>
            <Badge label="SUCCESS" tone="green" />
            <Text color="green">Delete operation completed.</Text>
          </Box>
        )}

        {status !== "loading" && !error && items.length === 0 && (
          <Text color="gray">No builds found on this channel.</Text>
        )}

        {hiddenAbove > 0 && (
          <Text color="gray">... {hiddenAbove} build(s) above</Text>
        )}

        {visibleItems.map((item, idx) => {
          const itemIndex = visibleStart + idx;
          const isCursor = interactiveMode && cursor === itemIndex;
          const isSelected = selectedBuilds.has(item.id);
          const selector = interactiveMode
            ? `${isCursor ? ">" : " "} [${isSelected ? "x" : " "}]`
            : item.isLive
              ? "●"
              : "○";

          return (
            <Box key={item.id}>
              <Text
                color={isCursor ? "cyan" : item.isLive ? "green" : "white"}
                bold={item.isLive || isCursor}
              >
                {selector} Build {item.id.toString().padEnd(3)}
              </Text>
              <Text color="gray">{"  ->  "}</Text>
              <Text color={item.type === "ROLLBACK" ? "yellow" : "blue"}>
                {item.label}
              </Text>
              {item.isLive && (
                <Text color="green" bold>
                  {" "}
                  (LIVE)
                </Text>
              )}
            </Box>
          );
        })}

        {hiddenBelow > 0 && (
          <Text color="gray">... {hiddenBelow} build(s) below</Text>
        )}

        {interactiveMode && status === "idle" && items.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">
              Interactive delete: ↑/↓ (or w/s, j/k) move, space select, enter
              delete, r refresh
            </Text>
            <Text color="yellow">Selected: {selectionCount}</Text>
          </Box>
        )}
        {pendingDeleteIds && (
          <Box marginTop={1} flexDirection="column">
            <Text color="yellow">
              Confirm delete builds [{pendingDeleteIds.join(", ")}]? [y/N]
            </Text>
            <Text color="gray">Press y to confirm, n/enter/esc to cancel.</Text>
          </Box>
        )}
        {!interactiveMode &&
          parsedAutoDeleteIds.length === 0 &&
          status === "idle" && (
            <Box marginTop={1} flexDirection="column">
              <Text color="gray">
                Interactive mode disabled (non-TTY or CI environment).
              </Text>
              <Text color="gray">
                Use --delete 18 17 13 for CI-safe cleanup.
              </Text>
            </Box>
          )}

        {logs.map((line, index) => (
          <Text key={`${line}-${index}`} color="gray">{`• ${line}`}</Text>
        ))}

        {error && (
          <Box>
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
          {debugLogs.map((line, i) => (
            <Text key={i} color="gray">
              {line}
            </Text>
          ))}
        </CliCard>
      )}
    </Box>
  );
};
