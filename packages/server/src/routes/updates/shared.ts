import { Context } from "hono";
import { DEFAULT_CHANNEL } from "../../../../core/src/index";
import { AppBindings } from "../../app-types";

export function resolveManifestChannel(c: Context<AppBindings>): string {
  return c.req.header("expo-channel-name") ?? DEFAULT_CHANNEL;
}
