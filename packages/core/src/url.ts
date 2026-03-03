import { ParsedExpoUpUrl } from "./types";

export function parseExpoUpUpdatesUrl(
  rawUpdatesUrl: string,
  basePath = "/api/expo-up",
): ParsedExpoUpUrl {
  if (!rawUpdatesUrl) {
    return { serverUrl: "", projectId: "" };
  }

  try {
    const parsedUrl = new URL(rawUpdatesUrl);
    const trimmedPath = parsedUrl.pathname.replace(/\/+$/, "");
    const segments = trimmedPath.split("/").filter(Boolean);
    const manifestIndex = segments.lastIndexOf("manifest");
    if (manifestIndex <= 0) {
      return { serverUrl: "", projectId: "" };
    }

    const projectId = segments[manifestIndex - 1] ?? "";
    if (!projectId) {
      return { serverUrl: "", projectId: "" };
    }

    const inferredBasePath = `/${segments.slice(0, manifestIndex - 1).join("/")}`;
    const resolvedBasePath =
      inferredBasePath === "/" ? basePath : inferredBasePath;

    return {
      serverUrl: `${parsedUrl.origin}${resolvedBasePath}`,
      projectId,
    };
  } catch {
    return { serverUrl: "", projectId: "" };
  }
}

export function isSafeAssetPath(
  pathValue: string,
  runtimeBasePath: string,
): boolean {
  if (!pathValue || pathValue.includes("..")) {
    return false;
  }

  const normalizedPath = pathValue.replace(/\\/g, "/").replace(/^\/+/, "");
  const normalizedBase = runtimeBasePath.replace(/^\/+/, "");
  return normalizedPath.startsWith(`${normalizedBase}/`);
}
