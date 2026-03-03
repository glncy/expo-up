import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getConfig } from "@expo/config";

interface GenerateCodesigningOptions {
  organization: string;
  validityYears: number;
  projectRoot?: string;
  keyOutputDirectory?: string;
  certificateOutputDirectory?: string;
  force?: boolean;
  expoUpdatesRunner?: (args: string[], cwd: string) => void;
}

interface ConfigureCodesigningOptions {
  projectRoot?: string;
  certificateInputDirectory?: string;
  keyInputDirectory?: string;
  keyId: string;
  alg?: string;
}

interface ExpoAppJson {
  expo?: {
    updates?: {
      codeSigningCertificate?: string;
      codeSigningMetadata?: {
        keyid?: string;
        alg?: string;
      };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const EXPO_CONFIG_FILENAMES = [
  "app.json",
  "app.config.js",
  "app.config.ts",
  "app.config.mjs",
  "app.config.cjs",
  "app.config.json",
];

function hasExpoProjectConfig(projectRoot: string): boolean {
  return EXPO_CONFIG_FILENAMES.some((filename) =>
    fs.existsSync(path.join(projectRoot, filename)),
  );
}

function runExpoUpdates(args: string[], cwd: string): void {
  const result = spawnSync(
    "npx",
    ["expo-updates", "codesigning:generate", ...args],
    {
      cwd,
      encoding: "utf-8",
    },
  );

  if (result.error) {
    throw new Error(`Failed to run expo-updates: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `expo-updates codesigning:generate failed${details ? `: ${details}` : ""}`,
    );
  }
}

function ensureGitignoreContains(projectRoot: string, pattern: string): void {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${pattern}\n`);
    return;
  }

  const content = fs.readFileSync(gitignorePath, "utf-8");
  if (content.includes(pattern)) return;

  const prefix = content.endsWith("\n") ? "" : "\n";
  fs.appendFileSync(
    gitignorePath,
    `${prefix}# expo-up code signing\n${pattern}\n`,
  );
}

export function resolveProjectRoot(cwd: string = process.cwd()): string {
  const absoluteCwd = path.resolve(cwd);
  if (hasExpoProjectConfig(absoluteCwd)) return absoluteCwd;

  throw new Error(
    "Could not find Expo app config (app.json/app.config.*). Run this command inside your Expo app or pass --project-root.",
  );
}

function readAppJson(projectRoot: string): ExpoAppJson {
  if (!hasExpoProjectConfig(projectRoot)) {
    throw new Error(
      `Expo app config not found in ${projectRoot}. Expected app.json or app.config.*`,
    );
  }

  const { exp } = getConfig(projectRoot, {
    skipSDKVersionRequirement: true,
  });
  return { expo: exp as unknown as ExpoAppJson["expo"] };
}

function writeAppJson(projectRoot: string, data: ExpoAppJson): void {
  const appJsonPath = path.join(projectRoot, "app.json");
  fs.writeFileSync(appJsonPath, JSON.stringify(data, null, 2) + "\n");
}

function toProjectRelativeFile(
  projectRoot: string,
  absolutePath: string,
): string {
  const relativePath = path
    .relative(projectRoot, absolutePath)
    .split(path.sep)
    .join("/");
  return `./${relativePath}`;
}

export function generateCodesigning(options: GenerateCodesigningOptions): {
  projectRoot: string;
  keyOutputDir: string;
  certificateOutputDir: string;
  privateKeyPath: string;
  publicKeyPath: string;
  certificatePath: string;
} {
  const projectRoot = options.projectRoot
    ? path.resolve(options.projectRoot)
    : resolveProjectRoot(process.cwd());
  const keyOutputDir = path.resolve(
    projectRoot,
    options.keyOutputDirectory ?? "codesigning-keys",
  );
  const certificateOutputDir = path.resolve(
    projectRoot,
    options.certificateOutputDirectory ?? "certs",
  );
  const run = options.expoUpdatesRunner ?? runExpoUpdates;

  if (!options.organization?.trim()) {
    throw new Error("organization is required.");
  }

  if (options.validityYears <= 0 || !Number.isFinite(options.validityYears)) {
    throw new Error("validityYears must be a positive number.");
  }

  if (
    !options.force &&
    (fs.existsSync(keyOutputDir) || fs.existsSync(certificateOutputDir))
  ) {
    throw new Error(
      "Key/certificate output directory already exists. Use --force to overwrite.",
    );
  }

  if (options.force) {
    if (fs.existsSync(keyOutputDir)) {
      fs.rmSync(keyOutputDir, { recursive: true, force: true });
    }
    if (fs.existsSync(certificateOutputDir)) {
      fs.rmSync(certificateOutputDir, { recursive: true, force: true });
    }
  }

  const privateKeyPath = path.join(keyOutputDir, "private-key.pem");
  const publicKeyPath = path.join(keyOutputDir, "public-key.pem");
  const certificatePath = path.join(certificateOutputDir, "certificate.pem");
  run(
    [
      "--key-output-directory",
      path.relative(projectRoot, keyOutputDir),
      "--certificate-output-directory",
      path.relative(projectRoot, certificateOutputDir),
      "--certificate-validity-duration-years",
      `${Math.floor(options.validityYears)}`,
      "--certificate-common-name",
      options.organization,
    ],
    projectRoot,
  );

  ensureGitignoreContains(projectRoot, "codesigning-keys/");

  return {
    projectRoot,
    keyOutputDir,
    certificateOutputDir,
    privateKeyPath,
    publicKeyPath,
    certificatePath,
  };
}

export function configureCodesigning(options: ConfigureCodesigningOptions): {
  projectRoot: string;
  certificatePath: string;
  keyId: string;
  alg: string;
} {
  const projectRoot = options.projectRoot
    ? path.resolve(options.projectRoot)
    : resolveProjectRoot(process.cwd());

  const certificateDir = path.resolve(
    projectRoot,
    options.certificateInputDirectory ?? "certs",
  );
  const keyDir = path.resolve(
    projectRoot,
    options.keyInputDirectory ?? "codesigning-keys",
  );
  const certificatePath = path.join(certificateDir, "certificate.pem");
  const privateKeyPath = path.join(keyDir, "private-key.pem");
  const publicKeyPath = path.join(keyDir, "public-key.pem");

  if (!fs.existsSync(certificatePath)) {
    throw new Error(`Certificate not found at ${certificatePath}`);
  }

  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    throw new Error(
      `Expected keys at ${keyDir} (private-key.pem and public-key.pem)`,
    );
  }

  if (!options.keyId?.trim()) {
    throw new Error("keyId is required.");
  }

  const alg = options.alg ?? "rsa-v1_5-sha256";
  const appJson = readAppJson(projectRoot);
  if (!appJson.expo) appJson.expo = {};
  if (!appJson.expo.updates) appJson.expo.updates = {};

  appJson.expo.updates.codeSigningCertificate = toProjectRelativeFile(
    projectRoot,
    certificatePath,
  );
  appJson.expo.updates.codeSigningMetadata = {
    keyid: options.keyId,
    alg,
  };

  writeAppJson(projectRoot, appJson);

  return {
    projectRoot,
    certificatePath,
    keyId: options.keyId,
    alg,
  };
}
