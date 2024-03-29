# expo-up CLI

## Description

This is a CLI tool that helps you to upload and rollback your Expo Updates to custom servers using [expo-up-server](https://www.npmjs.com/package/expo-up-server). Set up your own custom server by following the instructions in the [expo-up-server](https://www.npmjs.com/package/expo-up-server) package.

## Features

- Upload and Rollback your Expo Updates to custom servers in a single command.

## Installation

For NPM users:

```bash
npm install -g expo-up
```

For Yarn users:

```bash
yarn global add expo-up
```

## Usage

First, if your Expo project is still using `app.json`, you need to migrate it to `app.config.[js|ts]`. 

Then, you need to add the following code to your `app.config.js`:

```js
const EXPO_UPDATES_KEY = process.env.EXPO_UPDATES_KEY || "";

module.exports = {
  expo: {
    // ...
    updates: {
      url: "http://<link-to-custom-server>/api/expo-up/manifest",
      enabled: true,
      fallbackToCacheTimeout: 30000,
      requestHeaders: {
        "x-expo-updates-key": EXPO_UPDATES_KEY,
      },
    },
    runtimeVersion: { policy: "appVersion" },
    // ...
  },
};
```

Replace `<link-to-custom-server>` with the link to your custom server.

Then, you need to set the `EXPO_UPDATES_KEY` environment variable in your `.env` file:

```bash
EXPO_UPDATES_KEY=<your-expo-updates-key>
```

Replace `<your-expo-updates-key>` with any random string. This key will be used to reference your Expo Updates in the custom server. Generate a random string using the following command:

```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

This is useful when you have multiple Environments (e.g. Development, Staging, Production) and you want to upload your Expo Updates to different servers.

After setting up, you can run the following command to upload your Expo Updates to the custom server:

```bash
expo-up release --platform [android|ios] --token <your-custom-server-auth-token>
```

Replace `[android|ios]` with the platform you want to upload the Expo Updates to. Replace `<your-custom-server-auth-token>` with the auth token of your custom server. Read about how to get your auth token for your custom server using the [expo-up-server](https://www.npmjs.com/package/expo-up-server) package. [Authorization Token](https://github.com/glncy/expo-up-server#authorization-token)

You can also run the following command to rollback your Expo Updates to the custom server:

```bash
# Rollback to the previous release
expo-up rollback --platform [android|ios] --token <your-custom-server-auth-token>
```

```bash
# Rollback to embedded release
expo-up rollback --platform [android|ios] --token <your-custom-server-auth-token> --embedded
```

## Multiple Environments

If you have multiple Environments (e.g. Development, Staging, Production), create one key for each Environment and set the `EXPO_UPDATES_KEY` environment variable in your `.env` file:

## Roadmap

- [ ] Unit Tests

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

If you have any questions, please feel free open an issue.
