import { ProjectDescriptor } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseProjectDescriptor(value: unknown): ProjectDescriptor {
  if (!isRecord(value)) {
    throw new Error("Invalid project payload: expected object.");
  }

  const owner = value.owner;
  const repo = value.repo;

  if (!isNonEmptyString(owner) || !isNonEmptyString(repo)) {
    throw new Error(
      "Invalid project payload: owner and repo are required strings.",
    );
  }

  return { owner, repo };
}
