export type PlatformOption = "ios" | "android" | "all";

export function parsePlatform(platform: string): PlatformOption {
  if (platform === "ios" || platform === "android" || platform === "all") {
    return platform;
  }

  throw new Error(
    `Invalid platform "${platform}". Use "ios", "android", or "all".`,
  );
}

export function maskToken(token: string): string {
  if (token.length <= 8) {
    return token;
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
