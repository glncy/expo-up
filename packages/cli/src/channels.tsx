import * as React from "react";
import { Text, Box } from "ink";
import Spinner from "ink-spinner";
import { Octokit } from "@octokit/rest";
import {
  getAutoConfig,
  getStoredChannel,
  resolveGithubToken,
} from "./auth";
import { INIT_CHANNEL, parseProjectDescriptor } from "../../core/src/index";
import { Badge, BrandHeader, CliCard, KV } from "./ui";

interface ListChannelsProps {
  debug?: boolean;
  token?: string;
}

export const ListChannels: React.FC<ListChannelsProps> = ({
  debug = false,
  token,
}) => {
  const [channels, setChannels] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [debugLogs, setDebugLogs] = React.useState<string[]>([]);

  React.useEffect(() => {
    const run = async () => {
      try {
        const appendDebug = (message: string): void =>
          setDebugLogs((prev) => [...prev, message]);
        const resolvedToken = resolveGithubToken(token);
        const { serverUrl, projectId } = getAutoConfig();

        if (!resolvedToken || !serverUrl || !projectId)
          throw new Error("Missing configuration. Are you logged in?");
        if (debug)
          appendDebug(
            `Resolved config: server=${serverUrl}, project=${projectId}`,
          );

        const projRes = await fetch(`${serverUrl}/projects/${projectId}`);
        if (!projRes.ok) throw new Error(`Project "${projectId}" not found.`);

        const { owner, repo } = parseProjectDescriptor(await projRes.json());

        const octokit = new Octokit({ auth: resolvedToken });
        const { data: branches } = await octokit.repos.listBranches({
          owner,
          repo,
        });

        const availableChannels = branches
          .map((branch) => branch.name)
          .filter((name) => name !== INIT_CHANNEL);
        setChannels(availableChannels);
        if (debug)
          appendDebug(
            `Fetched channels: ${availableChannels.join(", ") || "(none)"}`,
          );
        setLoading(false);
      } catch (e: any) {
        setError(e.message);
        if (debug) setDebugLogs((prev) => [...prev, `Failure: ${e.message}`]);
        setLoading(false);
      }
    };
    run();
  }, [debug, token]);

  const currentChannel = getStoredChannel();

  return (
    <Box flexDirection="column" padding={1}>
      <BrandHeader subtitle="Over-the-air updates" />
      <CliCard
        title="expo-up channels"
        subtitle="Available release channels from GitHub"
      >
        <KV keyName="Active" value={currentChannel} valueColor="green" />
      </CliCard>

      <CliCard title="Channels">
        {loading && (
          <Box>
            <Badge label="LOADING" tone="yellow" />
            <Text>
              <Spinner /> Fetching channels...
            </Text>
          </Box>
        )}
        {!loading &&
          !error &&
          channels.map((name) => (
            <Box key={name}>
              <Text color={name === currentChannel ? "green" : "white"}>
                {name === currentChannel ? "●" : "○"} {name}
              </Text>
              {name === currentChannel && (
                <Text color="green" dimColor>
                  {" "}
                  (active)
                </Text>
              )}
            </Box>
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
