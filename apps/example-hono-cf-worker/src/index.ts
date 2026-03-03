import { Hono } from "hono";
import {
  configureExpoUp,
  createExpoUpServer,
  ExpoUpGithubStorageProvider,
  ExpoUpContextVariables,
} from "@expo-up/server";

type WorkerBindings = {
  GITHUB_AUTH_TOKEN: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  CODESIGNING_APP_PRIVATE_KEY: string;
  CODESIGNING_APP_KEY_ID: string;
};

type RootEnv = { Bindings: WorkerBindings };
type ExpoUpEnv = {
  Bindings: WorkerBindings;
  Variables: ExpoUpContextVariables;
};

const PROJECTS = {
  "example-expo-app": {
    owner: "glncy",
    repo: "example-expo-app-updates-storage",
  },
};
const EXPO_UP_BASE_PATH = "/api/expo-up";

const app = new Hono<RootEnv>();

app.get("/", (c) => c.text("Expo Up Hono Worker is Active"));

const expoUpApp = new Hono<ExpoUpEnv>();

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

expoUpApp.use("*", async (c, next) => {
  configureExpoUp(c, {
    storage: new ExpoUpGithubStorageProvider(c.env.GITHUB_AUTH_TOKEN),
    github: {
      clientId: c.env.GITHUB_CLIENT_ID,
      clientSecret: c.env.GITHUB_CLIENT_SECRET,
    },
    certificate: {
      privateKey: normalizePrivateKey(c.env.CODESIGNING_APP_PRIVATE_KEY),
      keyId: c.env.CODESIGNING_APP_KEY_ID,
    },
  });
  await next();
});

expoUpApp.route(
  "/",
  createExpoUpServer({
    projects: PROJECTS,
    basePath: EXPO_UP_BASE_PATH,
  }),
);

app.route(EXPO_UP_BASE_PATH, expoUpApp);

export default app;
