#!/usr/bin/env node
import * as React from "react";
import { render } from "ink";
import { program } from "commander";
import pc from "picocolors";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  login,
  logout,
  getStoredToken,
  writeConfig,
  getStoredChannel,
  getAutoConfig,
} from "./auth";
import { Release } from "./release";
import { Rollback } from "./rollback";
import { History } from "./history";
import { ListChannels } from "./channels";
import { DEFAULT_CHANNEL } from "../../core/src/index";
import { maskToken, parsePlatform } from "./cli-utils";
import { configureCodesigning, generateCodesigning } from "./codesigning";

function withCommandErrorBoundary<TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<void> | void,
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      await action(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(pc.red(`Error: ${message}`));
      process.exit(1);
    }
  };
}

async function askQuestion(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

program
  .name("expo-up")
  .description("Beautiful & Fast Revamp for Expo Workflows")
  .version("0.1.0")
  .option("-d, --debug", "Enable verbose debug logging", false);

// --- CHANNEL COMMANDS ---
program
  .command("set-channel <name>")
  .description("Set your active channel (e.g., main, staging)")
  .action((name: string) => {
    writeConfig({ channel: name });
    console.log(`${pc.green("✔")} Active channel set to: ${pc.cyan(name)}`);
  });

program
  .command("list-channels")
  .description("List available channels in your storage repository")
  .action(() => {
    const debug = program.opts().debug;
    render(<ListChannels debug={debug} />);
  });

// --- AUTH COMMANDS ---
program
  .command("login")
  .description("Authenticate with GitHub")
  .action(
    withCommandErrorBoundary(async () => {
      await login();
      process.exit(0);
    }),
  );

program
  .command("logout")
  .description("Clear local session")
  .action(() => {
    logout();
    process.exit(0);
  });

program
  .command("whoami")
  .description("Check currently logged in session and project info")
  .action(() => {
    const token = getStoredToken();
    const { serverUrl, projectId } = getAutoConfig();
    const channel = getStoredChannel();

    console.log(
      `${pc.blue("ℹ")} ${pc.bold("Project ID:")} ${projectId || pc.red("Not found in Expo config")}`,
    );
    console.log(
      `${pc.blue("ℹ")} ${pc.bold("Channel:")}    ${pc.cyan(channel)}`,
    );
    console.log(
      `${pc.blue("ℹ")} ${pc.bold("Server:")}     ${serverUrl || pc.red("Not set")}`,
    );

    if (token) {
      console.log(
        `${pc.green("✔")} ${pc.bold("Status:")}     Logged in (${pc.dim(maskToken(token))})`,
      );
    } else {
      console.log(`${pc.yellow("⚠")} ${pc.bold("Status:")}     Not logged in.`);
    }
    process.exit(0);
  });

// --- CORE COMMANDS ---
program
  .command("release")
  .description("Bundle and upload an update")
  .option("-p, --platform <platform>", "ios, android, or all", "all")
  .option("-c, --channel <channel>", "Override active channel")
  .action((options) => {
    const channel = options.channel || getStoredChannel() || DEFAULT_CHANNEL;
    const platform = parsePlatform(options.platform);
    const debug = program.opts().debug;
    render(<Release channel={channel} platform={platform} debug={debug} />);
  });

program
  .command("rollback")
  .description("Rollback to a previous build")
  .option("-c, --channel <channel>", "Override active channel")
  .option("-t, --to <build>", "Specific build ID")
  .option("-e, --embedded", "Rollback to native build")
  .action((options) => {
    const channel = options.channel || getStoredChannel() || DEFAULT_CHANNEL;
    const debug = program.opts().debug;
    render(
      <Rollback
        channel={channel}
        to={options.to}
        embedded={options.embedded}
        debug={debug}
      />,
    );
  });

program
  .command("history")
  .description("View build history for a channel")
  .option("-c, --channel <channel>", "Override active channel")
  .option(
    "--delete <buildIds...>",
    "Delete one or more build IDs (CI-friendly, supports comma or space-separated values)",
  )
  .option("--yes", "Skip confirmation prompt for delete actions", false)
  .option(
    "--no-interactive-delete",
    "Disable interactive multi-select delete mode for build history",
  )
  .action((options) => {
    const channel = options.channel || getStoredChannel() || DEFAULT_CHANNEL;
    const debug = program.opts().debug;
    render(
      <History
        channel={channel}
        debug={debug}
        deleteBuildIds={options.delete}
        interactiveDelete={options.interactiveDelete}
        yes={options.yes}
      />,
    );
  });

program
  .command("codesigning:generate")
  .description(
    "Generate code signing keys/certificate and configure Expo config",
  )
  .option(
    "-o, --organization <organization>",
    "Organization name for certificate issuer (O)",
  )
  .option(
    "--certificate-validity-duration-years <years>",
    "Certificate validity in years",
    (value) => Number.parseInt(value, 10),
  )
  .option(
    "--key-id <id>",
    "Key ID to write into Expo config (default: main)",
    "main",
  )
  .option(
    "-p, --project-root <path>",
    "Expo app root containing app.json or app.config.* (defaults to auto-detect)",
  )
  .option(
    "--key-output-directory <path>",
    "Directory for private/public key output (default: codesigning-keys)",
    "codesigning-keys",
  )
  .option(
    "--certificate-output-directory <path>",
    "Directory for certificate output (default: certs)",
    "certs",
  )
  .option("--force", "Overwrite existing codesigning-keys directory", false)
  .action(
    withCommandErrorBoundary(async (options: Record<string, unknown>) => {
      const isInteractive = Boolean(
        process.stdin.isTTY && process.stdout.isTTY,
      );
      let organization =
        typeof options.organization === "string" ? options.organization : "";
      let validityYears: number = Number.isFinite(
        options.certificateValidityDurationYears,
      )
        ? (options.certificateValidityDurationYears as number)
        : Number.NaN;
      let keyId = typeof options.keyId === "string" ? options.keyId : "main";

      if (!organization) {
        if (!isInteractive) {
          throw new Error("Missing --organization in non-interactive mode.");
        }
        organization = await askQuestion("Organization name: ");
      }

      if (!Number.isFinite(validityYears)) {
        if (!isInteractive) {
          throw new Error(
            "Missing --certificate-validity-duration-years in non-interactive mode.",
          );
        }
        const value = await askQuestion(
          "Certificate validity in years (e.g. 10): ",
        );
        validityYears = Number.parseInt(value, 10);
      }

      if (isInteractive) {
        const promptKeyId = await askQuestion("Key ID (default: main): ");
        if (promptKeyId.trim()) keyId = promptKeyId.trim();
      }
      if (!keyId.trim()) keyId = "main";

      const generated = generateCodesigning({
        organization,
        validityYears,
        projectRoot:
          typeof options.projectRoot === "string"
            ? options.projectRoot
            : undefined,
        keyOutputDirectory:
          typeof options.keyOutputDirectory === "string"
            ? options.keyOutputDirectory
            : "codesigning-keys",
        certificateOutputDirectory:
          typeof options.certificateOutputDirectory === "string"
            ? options.certificateOutputDirectory
            : "certs",
        force: Boolean(options.force),
      });
      const configured = configureCodesigning({
        projectRoot: generated.projectRoot,
        certificateInputDirectory:
          typeof options.certificateOutputDirectory === "string"
            ? options.certificateOutputDirectory
            : "certs",
        keyInputDirectory:
          typeof options.keyOutputDirectory === "string"
            ? options.keyOutputDirectory
            : "codesigning-keys",
        keyId,
      });

      console.log(`${pc.green("✔")} Code signing keys generated`);
      console.log(
        `${pc.blue("ℹ")} ${pc.bold("Project:")} ${pc.cyan(generated.projectRoot)}`,
      );
      console.log(
        `${pc.blue("ℹ")} ${pc.bold("Keys:")}    ${generated.keyOutputDir}`,
      );
      console.log(
        `${pc.blue("ℹ")} ${pc.bold("Cert:")}    ${generated.certificateOutputDir}`,
      );
      console.log(`${pc.green("✔")} Expo config configured`);
      console.log(
        `${pc.blue("ℹ")} ${pc.bold("Key ID:")}  ${pc.cyan(configured.keyId)}`,
      );
      console.log("");
      console.log(pc.bold("Server setup (private key):"));
      console.log(
        `1) Set env var with private key PEM content from ${generated.privateKeyPath}`,
      );
      console.log(`2) Set env var for key id: ${configured.keyId}`);
      console.log("3) In your server configureExpoUp(...) set:");
      console.log(
        "   certificate: { privateKey: c.env.MY_APP_PRIVATE_KEY, keyId: c.env.MY_APP_KEY_ID }",
      );
      process.exit(0);
    }),
  );

program
  .command("codesigning:configure")
  .description(
    "Configure Expo config codeSigning fields from existing cert/key",
  )
  .option(
    "-p, --project-root <path>",
    "Expo app root containing app.json or app.config.* (defaults to auto-detect)",
  )
  .option(
    "--certificate-input-directory <path>",
    "Directory containing certificate.pem (default: certs)",
    "certs",
  )
  .option(
    "--key-input-directory <path>",
    "Directory containing private-key.pem/public-key.pem (default: codesigning-keys)",
    "codesigning-keys",
  )
  .option("--key-id <id>", "Key ID for Expo config codeSigningMetadata")
  .action(
    withCommandErrorBoundary(async (options: Record<string, unknown>) => {
      const isInteractive = Boolean(
        process.stdin.isTTY && process.stdout.isTTY,
      );
      let keyId = typeof options.keyId === "string" ? options.keyId : "";
      if (isInteractive) {
        keyId = await askQuestion("Key ID (default: main): ");
      }
      if (!keyId.trim()) keyId = "main";

      const result = configureCodesigning({
        projectRoot:
          typeof options.projectRoot === "string"
            ? options.projectRoot
            : undefined,
        certificateInputDirectory:
          typeof options.certificateInputDirectory === "string"
            ? options.certificateInputDirectory
            : "certs",
        keyInputDirectory:
          typeof options.keyInputDirectory === "string"
            ? options.keyInputDirectory
            : "codesigning-keys",
        keyId,
      });

      console.log(`${pc.green("✔")} Expo config configured for code signing`);
      console.log(
        `${pc.blue("ℹ")} ${pc.bold("Project:")} ${pc.cyan(result.projectRoot)}`,
      );
      console.log(
        `${pc.blue("ℹ")} ${pc.bold("Certificate:")} ${result.certificatePath}`,
      );
      console.log(
        `${pc.blue("ℹ")} ${pc.bold("Key ID:")}      ${pc.cyan(result.keyId)}`,
      );
      process.exit(0);
    }),
  );

program.parse();
