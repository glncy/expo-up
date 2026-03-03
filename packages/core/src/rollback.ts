import { EMBEDDED_ROLLBACK_TARGET } from "./constants";

export interface RollbackResolutionInput {
  latestBuildId: number;
  loadRollbackTarget: (buildId: number) => Promise<string | null>;
  maxDepth?: number;
}

export interface RollbackResolutionResult {
  buildId: number;
  target: string | null;
  isEmbedded: boolean;
}

export async function resolveRollbackTarget(
  input: RollbackResolutionInput,
): Promise<RollbackResolutionResult> {
  const visited = new Set<number>();
  const maxDepth = input.maxDepth ?? 25;

  let depth = 0;
  let currentBuildId = input.latestBuildId;

  while (depth < maxDepth) {
    if (visited.has(currentBuildId)) {
      throw new Error("Rollback chain cycle detected.");
    }
    visited.add(currentBuildId);

    const rollbackTarget = await input.loadRollbackTarget(currentBuildId);
    if (!rollbackTarget) {
      return { buildId: currentBuildId, target: null, isEmbedded: false };
    }

    const trimmedTarget = rollbackTarget.trim();
    if (!trimmedTarget) {
      return { buildId: currentBuildId, target: null, isEmbedded: false };
    }

    if (trimmedTarget === EMBEDDED_ROLLBACK_TARGET) {
      return {
        buildId: currentBuildId,
        target: EMBEDDED_ROLLBACK_TARGET,
        isEmbedded: true,
      };
    }

    const nextBuildId = Number.parseInt(trimmedTarget, 10);
    if (!Number.isFinite(nextBuildId)) {
      return {
        buildId: currentBuildId,
        target: trimmedTarget,
        isEmbedded: false,
      };
    }

    currentBuildId = nextBuildId;
    depth += 1;
  }

  throw new Error(`Rollback chain exceeded max depth (${maxDepth}).`);
}
