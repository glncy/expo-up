import { Context } from "hono";
import { AppBindings } from "../app-types";

export function getProtocolVersion(c: Context<AppBindings>): number {
  return Number.parseInt(c.req.header("expo-protocol-version") ?? "0", 10);
}

export function getProjectBaseUrl(
  c: Context<AppBindings>,
  basePath: string,
  projectId: string,
): string {
  const requestUrl = new URL(c.req.raw.url);
  const normalizedBasePath = basePath.startsWith("/")
    ? basePath
    : `/${basePath}`;
  return `${requestUrl.origin}${normalizedBasePath}/${projectId}`;
}
