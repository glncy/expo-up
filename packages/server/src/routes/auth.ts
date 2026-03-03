import { Hono } from "hono";
import { AppBindings } from "../app-types";
import { getErrorMessage } from "../lib/errors";
import { buildLogContext, getErrorReporter, getLogger } from "../lib/logger";
import { ServerOptions } from "../types";

export function registerGithubAuthRoute(
  app: Hono<AppBindings>,
  options: ServerOptions,
): void {
  app.get("/auth/github", async (c) => {
    const logger = getLogger(c, options);
    const reporter = getErrorReporter(c, options);
    const github = c.get("github") ?? options.github;
    if (!github?.clientId || !github.clientSecret) {
      logger.error?.(
        "OAuth config missing",
        buildLogContext(c, options, { status: 500 }),
      );
      return c.text("OAuth not configured", 500);
    }

    const code = c.req.query("code");
    const callback = c.req.query("callback") ?? c.req.query("state") ?? "";

    if (!code) {
      const requestUrl = new URL(c.req.url);
      const redirectUri = `${requestUrl.origin}${c.req.path}`;
      const params = new URLSearchParams({
        client_id: github.clientId,
        scope: "repo,read:user",
        redirect_uri: redirectUri,
        state: callback,
      });

      logger.info?.(
        "Redirecting to GitHub OAuth",
        buildLogContext(c, options, { callbackPresent: Boolean(callback) }),
      );

      return c.redirect(
        `https://github.com/login/oauth/authorize?${params.toString()}`,
      );
    }

    try {
      const tokenRes = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: github.clientId,
            client_secret: github.clientSecret,
            code,
          }),
        },
      );
      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
        error_description?: string;
      };

      if (tokenData.error || !tokenData.access_token) {
        throw new Error(
          tokenData.error_description ??
            tokenData.error ??
            "OAuth token exchange failed.",
        );
      }

      if (callback) {
        const callbackUrl = new URL(callback);
        if (
          callbackUrl.protocol === "http:" ||
          callbackUrl.protocol === "https:"
        ) {
          callbackUrl.searchParams.set("token", tokenData.access_token);
          logger.info?.(
            "OAuth callback redirect complete",
            buildLogContext(c, options, { callbackHost: callbackUrl.host }),
          );
          return c.redirect(callbackUrl.toString());
        }
      }

      logger.warn?.(
        "OAuth token returned in plain-text response",
        buildLogContext(c, options),
      );
      return c.text(`Token: ${tokenData.access_token}`);
    } catch (error) {
      const context = buildLogContext(c, options, {
        status: 500,
        error: getErrorMessage(error),
      });
      logger.error?.("OAuth flow failed", context);
      reporter?.captureException(error, context);
      return c.text(`Auth failed: ${getErrorMessage(error)}`, 500);
    }
  });
}
