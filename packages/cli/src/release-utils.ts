import crypto from "node:crypto";
import { PlatformOption } from "./cli-utils";

interface ContentDirectoryItem {
  name: string;
}

interface MetadataAssetEntry {
  hash?: string;
  path?: string;
  ext?: string;
}

interface MetadataPlatformEntry {
  bundle?: string;
  assets?: MetadataAssetEntry[];
}

interface ExportMetadata {
  fileMetadata?: Record<string, MetadataPlatformEntry>;
}

function stableDeepSort(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return [...value]
      .map((item) => stableDeepSort(item))
      .sort((left, right) =>
        stableStringify(left).localeCompare(stableStringify(right)),
      );
  }

  const objectValue = value as Record<string, unknown>;
  return Object.keys(objectValue)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = stableDeepSort(objectValue[key]);
      return acc;
    }, {});
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue).sort();
  return `{${keys.map((key) => `"${key}":${stableStringify(objectValue[key])}`).join(",")}}`;
}

export function getExpoExportArgs(platform: PlatformOption): string[] {
  if (platform === "ios")
    return ["expo", "export", "--platform", "ios", "--clear"];
  if (platform === "android")
    return ["expo", "export", "--platform", "android", "--clear"];
  return [
    "expo",
    "export",
    "--platform",
    "ios",
    "--platform",
    "android",
    "--clear",
  ];
}

export function parseNumericBuilds(items: ContentDirectoryItem[]): number[] {
  return items
    .map((item) => Number.parseInt(item.name, 10))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);
}

export function createMetadataFingerprint(metadata: unknown): string {
  const typed = metadata as ExportMetadata;
  const fileMetadata = typed.fileMetadata ?? {};
  const normalized = Object.keys(fileMetadata)
    .sort()
    .reduce<Record<string, { bundle: string; assets: MetadataAssetEntry[] }>>(
      (acc, platform) => {
        const entry = fileMetadata[platform] ?? {};
        const assets = (entry.assets ?? [])
          .map((asset) => ({
            hash: asset.hash ?? "",
            path: asset.path ?? "",
            ext: asset.ext ?? "",
          }))
          .sort((left, right) => {
            const leftKey = `${left.hash}:${left.path}:${left.ext}`;
            const rightKey = `${right.hash}:${right.path}:${right.ext}`;
            return leftKey.localeCompare(rightKey);
          });

        acc[platform] = {
          bundle: entry.bundle ?? "",
          assets,
        };
        return acc;
      },
      {},
    );

  return crypto
    .createHash("sha256")
    .update(stableStringify(normalized))
    .digest("hex");
}

export function createSortedMetadataHash(metadata: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(stableDeepSort(metadata)))
    .digest("hex");
}

export function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    return Number((error as { status: unknown }).status);
  }
  return undefined;
}

export function getErrorMessageText(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message ?? "");
  }
  return "";
}

export function isEmptyRepositoryError(error: unknown): boolean {
  const status = getErrorStatus(error);
  const message = getErrorMessageText(error).toLowerCase();
  return (
    status === 409 ||
    message.includes("git repository is empty") ||
    message.includes("repository is empty")
  );
}
