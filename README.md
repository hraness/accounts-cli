# @hraness/accounts-cli

Sign a command-line tool in to Hraness Accounts and keep its refresh token
between runs.

The package uses the OAuth 2.0 device authorization grant: your CLI prints a
link and a code, the user approves the sign-in in a browser, and the CLI
receives an access token and a refresh token. A session object then stores the
refresh token and exchanges it for fresh access tokens when the old one
expires.

## Install

The package is not on npm. Pin a release tag:

```json
{ "dependencies": { "@hraness/accounts-cli": "github:hraness/accounts-cli#v0.1.3" } }
```

The built `dist/` is committed, so installing from GitHub needs no build step.
Version 0.1.3 depends on `@hraness/suite-accounts` v0.9.13.

## Sign in

Accounts assigns each product a client ID and the device authorization,
device token, and token endpoints. `@hraness/suite-accounts` exposes the
endpoints in its provider configuration.

```ts
import {
  createCliSession,
  createKeychainTokenStorage,
  initiateDeviceLogin,
  pollForDeviceToken,
} from "@hraness/accounts-cli";

const login = await initiateDeviceLogin(
  { deviceAuthorizationEndpoint, deviceTokenEndpoint },
  { clientId, scopes: ["openid", "profile", "email", "offline_access"] },
  { onUserCode: (code, url) => console.error(`Open ${url} and enter ${code}`) },
);

const result = await pollForDeviceToken(
  deviceTokenEndpoint,
  { clientId, deviceCode: login.deviceCode },
  { intervalMs: login.intervalMs },
);

const session = createCliSession({
  clientId,
  storage: createKeychainTokenStorage("my-cli", "default"),
  tokenEndpoint,
});
if (result.kind === "token") await session.saveRefreshToken(result.refreshToken);

const accessToken = await session.getAccessToken(); // null when signed out
```

`initiateDeviceLogin` returns the user code, the verification URL, the device
code, the polling interval, and a `poll()` function that makes one token
request. `pollForDeviceToken` keeps polling until the user approves or denies
the request, the code expires, or its timeout passes. It polls every five
seconds for up to ten minutes by default, and a `slow_down` answer switches to
the interval the server asks for. It returns one of:

| `kind` | Meaning |
| --- | --- |
| `token` | Signed in. Carries `accessToken` and `refreshToken`. |
| `access_denied` | The user declined. |
| `expired_token` | The device code expired before approval. |
| `error` | Any other failure, with `error` and `errorDescription`. A timeout reports `error: "timeout"`; a token response without a refresh token reports `invalid_response`. |

## Keep the session

`createCliSession` keeps the access token in memory and the refresh token in the
storage you choose. `getAccessToken()` returns the cached access token until it
expires, then refreshes it with the stored refresh token and saves any new
refresh token the server returns. It returns `null` when no refresh token is
stored or the refresh fails. `signOut()` clears the cached token and deletes the
stored refresh token; it does not revoke the token with Accounts.

## Token storage

| Function | Where the refresh token lives |
| --- | --- |
| `createKeychainTokenStorage(service, account)` | The macOS login keychain, through the `security` command. On other platforms saving throws `Keychain storage is only supported on macOS.`, and reading returns `null`. |
| `createEncryptedFileTokenStorage(path)` | A file written with mode `0600` and encrypted with AES-256-GCM. The key is derived from the host name, user name, platform, and home directory, which are not secret, so the file permissions are the main protection. |
| `createMemoryTokenStorage()` | Memory only, for tests and single-run tools. |

## Development

```sh
bun install --frozen-lockfile
bun run check
```

`bun run check` runs lint, typecheck, tests, and the build.
