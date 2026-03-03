export interface RollbackSelectionInput {
  embedded?: boolean;
  to?: string;
  builds: number[];
  liveBuildId: number;
  embeddedTarget: string;
}

export interface RollbackSelectionResult {
  targetValue: string;
  usedFallbackToEmbedded: boolean;
}

export function parseBuildFolders(
  items: Array<{ type?: string; name?: string }>,
): number[] {
  return items
    .filter((item) => item.type === "dir" && typeof item.name === "string")
    .map((item) => Number.parseInt(item.name as string, 10))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);
}

export function resolveRollbackSelection(
  input: RollbackSelectionInput,
): RollbackSelectionResult {
  const { embedded, to, builds, liveBuildId, embeddedTarget } = input;

  if (embedded) {
    return { targetValue: embeddedTarget, usedFallbackToEmbedded: false };
  }

  if (to) {
    const numericTarget = Number.parseInt(to, 10);
    if (!Number.isFinite(numericTarget)) {
      throw new Error(
        `Invalid rollback target "${to}". Use a numeric build ID or --embedded.`,
      );
    }

    return { targetValue: `${numericTarget}`, usedFallbackToEmbedded: false };
  }

  const liveIndex = builds.indexOf(liveBuildId);
  if (liveIndex === -1 || liveIndex === builds.length - 1) {
    return { targetValue: embeddedTarget, usedFallbackToEmbedded: true };
  }

  return {
    targetValue: `${builds[liveIndex + 1]}`,
    usedFallbackToEmbedded: false,
  };
}
