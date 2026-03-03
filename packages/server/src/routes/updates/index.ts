import { Hono } from "hono";
import { AppBindings } from "../../app-types";
import { ServerOptions } from "../../types";
import { registerAssetsRoute } from "./assets";
import { registerManifestRoute } from "./manifest";

export function registerUpdateRoutes(
  app: Hono<AppBindings>,
  options: ServerOptions,
): void {
  registerManifestRoute(app, options);
  registerAssetsRoute(app, options);
}
