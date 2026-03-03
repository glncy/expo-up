export interface BuildAssetMetadata {
  path: string;
  hash?: string;
  ext?: string;
}

export interface PlatformMetadata {
  bundle: string;
  assets: BuildAssetMetadata[];
}

export interface MetadataFile {
  id?: string;
  fileMetadata: Record<string, PlatformMetadata | undefined>;
}

export function parseMetadata(raw: string): MetadataFile {
  const parsed = JSON.parse(raw) as Partial<MetadataFile>;
  if (!parsed.fileMetadata || typeof parsed.fileMetadata !== "object") {
    throw new Error("Invalid metadata.json: missing fileMetadata.");
  }

  return parsed as MetadataFile;
}

export function sanitizeBuildIds(values: string[]): number[] {
  return values
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);
}
