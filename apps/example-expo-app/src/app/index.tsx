import * as Device from "expo-device";
import * as Updates from "expo-updates";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";

import { AnimatedIcon } from "@/components/animated-icon";
import { HintRow } from "@/components/hint-row";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { WebBadge } from "@/components/web-badge";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";

const ACTIVE_CHANNEL_PARAM_KEY = "expo-up-active-channel";

function getDevMenuHint() {
  if (Platform.OS === "web") {
    return <ThemedText type="small">use browser devtools</ThemedText>;
  }
  if (Device.isDevice) {
    return (
      <ThemedText type="small">
        shake device or press <ThemedText type="code">m</ThemedText> in terminal
      </ThemedText>
    );
  }
  const shortcut = Platform.OS === "android" ? "cmd+m (or ctrl+m)" : "cmd+d";
  return (
    <ThemedText type="small">
      press <ThemedText type="code">{shortcut}</ThemedText>
    </ThemedText>
  );
}

export default function HomeScreen() {
  const [targetChannel, setTargetChannel] = useState("");
  const [isFetchingUpdate, setIsFetchingUpdate] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [updateChannel, setUpdateChannel] = useState("main");
  const [updateBuildNumber, setUpdateBuildNumber] = useState("N/A");

  function getBuildNumberFromManifest(manifest: unknown): string {
    if (
      !manifest ||
      typeof manifest !== "object" ||
      !("launchAsset" in manifest)
    ) {
      return "N/A";
    }

    const launchAsset = (manifest as { launchAsset?: { url?: string } })
      .launchAsset;
    if (!launchAsset?.url) return "N/A";

    const extractBuildFromPath = (rawPath: string): string => {
      const decoded = decodeURIComponent(rawPath);
      const segments = decoded.split("/").filter(Boolean);
      if (segments.length === 0) return "N/A";

      const expoSegmentIndex = segments.indexOf("_expo");
      if (expoSegmentIndex > 0) {
        const candidate = segments[expoSegmentIndex - 1];
        if (/^\d+$/.test(candidate)) return candidate;
      }

      for (let index = segments.length - 1; index >= 0; index -= 1) {
        if (/^\d+$/.test(segments[index])) return segments[index];
      }

      return "N/A";
    };

    try {
      const parsedUrl = new URL(launchAsset.url);
      const assetPath =
        parsedUrl.searchParams.get("path") ?? parsedUrl.pathname;
      if (!assetPath) return "N/A";
      return extractBuildFromPath(assetPath);
    } catch {
      return extractBuildFromPath(launchAsset.url);
    }
  }

  function appendLog(message: string, data?: unknown): void {
    const line =
      data === undefined
        ? `>>> ${message}`
        : `>>> ${message}\n>>> ${JSON.stringify(data, null, 2)}`;
    setLogs((prev) => [...prev.slice(-13), line]);
  }

  useEffect(() => {
    let mounted = true;

    const initializeUpdateDetails = async (): Promise<void> => {
      const currentManifest = (Updates as unknown as { manifest?: unknown })
        .manifest;
      const currentBuildNumber = getBuildNumberFromManifest(currentManifest);
      if (mounted && currentBuildNumber !== "N/A") {
        setUpdateBuildNumber(currentBuildNumber);
      }

      try {
        const extraParams = await Updates.getExtraParamsAsync();
        const persistedChannel = extraParams[ACTIVE_CHANNEL_PARAM_KEY];
        if (mounted && persistedChannel) {
          setUpdateChannel(persistedChannel);
        }
      } catch {
        // Ignore persistence read failures and keep default channel label.
      }
    };

    void initializeUpdateDetails();

    return () => {
      mounted = false;
    };
  }, []);

  async function onFetchUpdateAsync() {
    setIsFetchingUpdate(true);
    setStatusMessage("Checking for updates...");
    appendLog("Checking for updates");
    try {
      const update = await Updates.checkForUpdateAsync();
      appendLog("checkForUpdateAsync result", update);
      setUpdateBuildNumber(getBuildNumberFromManifest(update.manifest));
      setUpdateChannel((currentChannel) => targetChannel || currentChannel);

      if (update.isAvailable) {
        setStatusMessage("Update available. Downloading...");
        appendLog("Downloading update");
        const fetchResult = await Updates.fetchUpdateAsync();
        appendLog("fetchUpdateAsync result", fetchResult);
        setStatusMessage("Update downloaded. Reloading app...");
        appendLog("Reloading app");
        await Updates.reloadAsync();
      } else {
        setStatusMessage("No update available. You are on the latest version.");
        appendLog("No update available");
        appendLog("Skipping reload because app is already up-to-date");
      }
    } catch (error) {
      setStatusMessage(`Update failed: ${String(error)}`);
      appendLog("Update failed", {
        error: String(error),
      });
    } finally {
      setIsFetchingUpdate(false);
    }
  }

  async function channelSurfAsync(selectedChannel: string) {
    setStatusMessage(`Switching to channel: ${selectedChannel || "main"}...`);
    setUpdateChannel(selectedChannel || "main");
    appendLog("Switching channel", {
      channel: selectedChannel || "main",
    });
    try {
      if (!selectedChannel || selectedChannel.toLowerCase() === "main") {
        // RESET TO ORIGINAL
        await Updates.setUpdateRequestHeadersOverride(null);
        await Updates.setExtraParamAsync(ACTIVE_CHANNEL_PARAM_KEY, null);
        appendLog("Cleared update header override (main)");
      } else {
        // Set the updates channel override
        const headersOverride = {
          "expo-channel-name": selectedChannel,
        };
        await Updates.setUpdateRequestHeadersOverride(headersOverride);
        await Updates.setExtraParamAsync(
          ACTIVE_CHANNEL_PARAM_KEY,
          selectedChannel,
        );
        appendLog("Applied update header override", headersOverride);
      }

      // Check if an update is available on this specific channel
      const { isAvailable, ...rest } = await Updates.checkForUpdateAsync();
      appendLog("checkForUpdateAsync result", { isAvailable, ...rest });
      if ("manifest" in rest) {
        setUpdateBuildNumber(
          getBuildNumberFromManifest((rest as { manifest?: unknown }).manifest),
        );
      }

      if (isAvailable) {
        setStatusMessage("Update found on selected channel. Downloading...");
        // Fetch and install the update
        appendLog("Downloading update from channel");
        const fetchResult = await Updates.fetchUpdateAsync();
        appendLog("fetchUpdateAsync result", fetchResult);
        setStatusMessage("Update downloaded from channel. Reloading app...");
        appendLog("Reloading app");
        await Updates.reloadAsync({
          reloadScreenOptions: {
            backgroundColor: "#F8FAFC",
            spinner: {
              enabled: true,
              size: "large",
            },
            fade: true,
          },
        });
      } else {
        setStatusMessage("No new update on selected channel.");
        appendLog("No new update found on selected channel");
        appendLog("Skipping reload because no update was fetched");
      }
    } catch (error) {
      setStatusMessage(`Channel surf failed: ${String(error)}.`);
      appendLog("Channel surf failed", {
        error: String(error),
      });
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={styles.screenContent}
          showsVerticalScrollIndicator={false}
        >
          <ThemedView style={styles.heroSection}>
            <AnimatedIcon />
            <ThemedText type="title" style={styles.title}>
              Welcome to&nbsp;Expo (Build 15 Update)
            </ThemedText>
          </ThemedView>

          <ThemedText type="code" style={styles.code}>
            get started
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.actionCard}>
            <ThemedText type="small">Update Details</ThemedText>
            <View style={styles.detailRow}>
              <ThemedText type="small">Endpoint:</ThemedText>
              <ThemedText type="small" style={styles.detailValue}>
                {Constants.expoConfig?.updates?.url ?? "Not set"}
              </ThemedText>
            </View>
            <View style={styles.detailRow}>
              <ThemedText type="small">Channel:</ThemedText>
              <ThemedText type="small" style={styles.detailValue}>
                {updateChannel}
              </ThemedText>
            </View>
            <View style={styles.detailRow}>
              <ThemedText type="small">Build number:</ThemedText>
              <ThemedText type="small" style={styles.detailValue}>
                {updateBuildNumber}
              </ThemedText>
            </View>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.actionCard}>
            <View style={styles.actionHeader}>
              <ThemedText type="small">Update</ThemedText>
              <Pressable
                disabled={isFetchingUpdate}
                onPress={onFetchUpdateAsync}
                style={[
                  styles.actionButton,
                  isFetchingUpdate ? styles.actionButtonDisabled : null,
                ]}
              >
                {isFetchingUpdate ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <ThemedText type="code" style={styles.actionButtonText}>
                    Fetch update
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.actionCard}>
            <ThemedText type="small">Channel Surf</ThemedText>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Surf Channel..."
                placeholderTextColor="#94a3b8"
                value={targetChannel}
                onChangeText={setTargetChannel}
                autoCapitalize="none"
              />
              <Pressable
                style={styles.surfButton}
                onPress={() => channelSurfAsync(targetChannel)}
              >
                <ThemedText type="code" style={{ color: "#ffffff" }}>
                  SURF
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>

          {statusMessage ? (
            <ThemedText type="small" style={styles.statusText}>
              {statusMessage}
            </ThemedText>
          ) : null}

          {logs.length > 0 ? (
            <ThemedView type="backgroundElement" style={styles.logCard}>
              <ScrollView nestedScrollEnabled style={styles.logScroll}>
                {logs.map((line, index) => (
                  <ThemedText
                    key={`${line}-${index}`}
                    type="small"
                    style={styles.logText}
                  >
                    {line}
                  </ThemedText>
                ))}
              </ScrollView>
            </ThemedView>
          ) : null}

          <ThemedView type="backgroundElement" style={styles.stepContainer}>
            <HintRow
              title="Try editing"
              hint={<ThemedText type="code">src/app/index.tsx</ThemedText>}
            />
            <HintRow title="Dev tools" hint={getDevMenuHint()} />

            <HintRow
              title="Fresh start"
              hint={<ThemedText type="code">npm run reset-project</ThemedText>}
            />
          </ThemedView>

          {Platform.OS === "web" && <WebBadge />}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    flexDirection: "row",
  },
  safeArea: {
    flex: 1,
  },
  screenScroll: {
    flex: 1,
  },
  screenContent: {
    paddingHorizontal: Spacing.four,
    alignItems: "center",
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    paddingTop: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    textAlign: "center",
  },
  code: {
    textTransform: "uppercase",
  },
  actionCard: {
    gap: Spacing.two,
    alignSelf: "stretch",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
  },
  actionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  detailRow: {
    gap: Spacing.one,
    marginTop: Spacing.half,
  },
  detailValue: {
    opacity: 0.85,
  },
  actionButton: {
    minWidth: 132,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#22d3ee",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    color: "#ffffff",
  },
  statusText: {
    alignSelf: "stretch",
    textAlign: "left",
    opacity: 0.85,
  },
  logCard: {
    alignSelf: "stretch",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
    height: 220,
  },
  logScroll: {
    flex: 1,
  },
  logText: {
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    opacity: 0.9,
    marginBottom: Spacing.one,
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: "stretch",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  inputContainer: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.two,
    alignItems: "center",
  },
  input: {
    flex: 1,
    height: 40,
    backgroundColor: "#1e293b",
    borderRadius: 8,
    paddingHorizontal: 12,
    color: "white",
    fontSize: 14,
  },
  surfButton: {
    backgroundColor: "#22d3ee",
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});
