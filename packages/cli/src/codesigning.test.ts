/// <reference path="../../typescript-config/bun-test-shim.d.ts" />
import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  configureCodesigning,
  generateCodesigning,
  resolveProjectRoot,
} from "./codesigning";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "expo-up-codesigning-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeExpoProject(projectRoot: string): void {
  writeJson(path.join(projectRoot, "app.json"), { expo: { name: "app" } });
  writeJson(path.join(projectRoot, "package.json"), {
    name: "test-app",
    private: true,
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveProjectRoot", () => {
  it("returns cwd when app.json exists in cwd", () => {
    const root = makeTempDir();
    writeExpoProject(root);

    expect(resolveProjectRoot(root)).toBe(root);
  });

  it("throws when app.json does not exist in cwd", () => {
    const root = makeTempDir();

    expect(() => resolveProjectRoot(root)).toThrow(
      "Could not find Expo app config (app.json/app.config.*). Run this command inside your Expo app or pass --project-root.",
    );
  });

  it("accepts app.config.ts as project config", () => {
    const root = makeTempDir();
    fs.writeFileSync(
      path.join(root, "app.config.ts"),
      "export default { expo: { name: 'app' } };\n",
    );

    expect(resolveProjectRoot(root)).toBe(root);
  });
});

describe("generateCodesigning", () => {
  it("generates keys/cert into separate dirs and updates gitignore", () => {
    const projectRoot = makeTempDir();
    writeExpoProject(projectRoot);

    const result = generateCodesigning({
      projectRoot,
      organization: "Acme Inc",
      validityYears: 10,
      expoUpdatesRunner: () => {
        fs.mkdirSync(path.join(projectRoot, "codesigning-keys"), {
          recursive: true,
        });
        fs.mkdirSync(path.join(projectRoot, "certs"), { recursive: true });
        fs.writeFileSync(
          path.join(projectRoot, "codesigning-keys/private-key.pem"),
          "private",
        );
        fs.writeFileSync(
          path.join(projectRoot, "codesigning-keys/public-key.pem"),
          "public",
        );
        fs.writeFileSync(
          path.join(projectRoot, "certs/certificate.pem"),
          "cert",
        );
      },
    });

    expect(result.projectRoot).toBe(projectRoot);
    expect(fs.existsSync(result.privateKeyPath)).toBe(true);
    expect(fs.existsSync(result.publicKeyPath)).toBe(true);
    expect(fs.existsSync(result.certificatePath)).toBe(true);

    const gitignore = fs.readFileSync(
      path.join(projectRoot, ".gitignore"),
      "utf-8",
    );
    expect(gitignore).toContain("codesigning-keys/");
  });

  it("throws when directories exist and force is not enabled", () => {
    const projectRoot = makeTempDir();
    writeExpoProject(projectRoot);
    fs.mkdirSync(path.join(projectRoot, "codesigning-keys"), {
      recursive: true,
    });

    expect(() =>
      generateCodesigning({
        projectRoot,
        organization: "Acme Inc",
        validityYears: 10,
      }),
    ).toThrow("already exists");
  });
});

describe("configureCodesigning", () => {
  it("writes codeSigningCertificate and codeSigningMetadata", () => {
    const projectRoot = makeTempDir();
    writeExpoProject(projectRoot);

    const certDir = path.join(projectRoot, "certs");
    const keyDir = path.join(projectRoot, "codesigning-keys");
    fs.mkdirSync(certDir, { recursive: true });
    fs.mkdirSync(keyDir, { recursive: true });
    fs.writeFileSync(path.join(certDir, "certificate.pem"), "cert");
    fs.writeFileSync(path.join(keyDir, "private-key.pem"), "priv");
    fs.writeFileSync(path.join(keyDir, "public-key.pem"), "pub");

    const result = configureCodesigning({
      projectRoot,
      certificateInputDirectory: "certs",
      keyInputDirectory: "codesigning-keys",
      keyId: "main",
    });

    expect(result.keyId).toBe("main");

    const appJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "app.json"), "utf-8"),
    ) as {
      expo: {
        updates: {
          codeSigningCertificate: string;
          codeSigningMetadata: { keyid: string; alg: string };
        };
      };
    };

    expect(appJson.expo.updates.codeSigningCertificate).toBe(
      "./certs/certificate.pem",
    );
    expect(appJson.expo.updates.codeSigningMetadata).toEqual({
      keyid: "main",
      alg: "rsa-v1_5-sha256",
    });
  });
});
