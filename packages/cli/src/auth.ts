import fs from "fs";
import path from "path";
import open from "open";
import pc from "picocolors";
import http from "http";
import { getConfig } from "@expo/config";
import { z } from "zod";
import { DEFAULT_CHANNEL, parseExpoUpUpdatesUrl } from "../../core/src/index";

const EXPO_UP_CONFIG_RELATIVE_PATH = path.join(".expo", "expo-up.json");

const StoredConfigSchema = z.object({
  github_token: z.string().min(1).optional(),
  channel: z.string().min(1).optional(),
});

type StoredConfig = z.infer<typeof StoredConfigSchema>;

interface AutoConfig {
  serverUrl: string;
  projectId: string;
  runtimeVersion: string;
}

function getConfigPath() {
  const dotExpoDir = path.join(process.cwd(), ".expo");
  if (!fs.existsSync(dotExpoDir)) fs.mkdirSync(dotExpoDir, { recursive: true });
  return path.join(dotExpoDir, "expo-up.json");
}

function readConfig(): StoredConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const parsed = StoredConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function ensureConfigIgnored(configPathRelativeToCwd: string): void {
  const gitignorePath = path.join(process.cwd(), ".gitignore");
  if (!fs.existsSync(gitignorePath)) return;

  const content = fs.readFileSync(gitignorePath, "utf-8");
  if (content.includes(configPathRelativeToCwd)) return;

  const needsTrailingNewline = content.length > 0 && !content.endsWith("\n");
  const prefix = needsTrailingNewline ? "\n" : "";
  const block = `${prefix}# expo-up secrets\n${configPathRelativeToCwd}\n`;
  fs.appendFileSync(gitignorePath, block);
}

/**
 * Get values automatically using @expo/config
 */
export function getAutoConfig(): AutoConfig {
  try {
    const { exp } = getConfig(process.cwd());
    const { serverUrl, projectId } = parseExpoUpUpdatesUrl(
      exp.updates?.url ?? "",
    );

    return {
      serverUrl,
      projectId,
      runtimeVersion: exp.version ?? "",
    };
  } catch {
    return { serverUrl: "", projectId: "", runtimeVersion: "" };
  }
}

export function writeConfig(data: Partial<StoredConfig>): void {
  const configPath = getConfigPath();
  const current = readConfig();
  const merged = { ...current, ...data };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
  ensureConfigIgnored(EXPO_UP_CONFIG_RELATIVE_PATH);
}

export async function login() {
  const { serverUrl } = getAutoConfig();
  if (!serverUrl) throw new Error(`Server URL not found in expo config.`);

  return new Promise((resolve, reject) => {
    const localServer = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const token = url.searchParams.get("token");
      if (token) {
        writeConfig({ github_token: token });
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white;"><h1 style="color: #22d3ee;">🚀 expo-up</h1><p>Login successful! You can close this tab and return to your terminal.</p></body></html>`,
        );
        console.log(
          `\n${pc.green("✔")} Successfully authenticated! Token saved.`,
        );
        localServer.close();
        resolve(token);
      } else {
        res.writeHead(400);
        res.end("Token missing");
      }
    });

    localServer.listen(4321, async () => {
      const callbackUrl = encodeURIComponent("http://localhost:4321");
      const authUrl = `${serverUrl}/auth/github?callback=${callbackUrl}`;
      console.log(
        `\n${pc.cyan("🚀")} Opening browser for GitHub Authentication...`,
      );
      await open(authUrl);
    });
    localServer.on("error", (err) =>
      reject(new Error(`Local server failed: ${err.message}`)),
    );
  });
}

export function getStoredToken() {
  return readConfig().github_token;
}
export function getStoredChannel() {
  return readConfig().channel || DEFAULT_CHANNEL;
}

export function logout() {
  const config = readConfig();
  delete config.github_token;
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
  console.log(`${pc.green("✔")} Logged out.`);
}
