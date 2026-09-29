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
{ "dependencies": { "@hraness/accounts-cli": "github:hraness/accounts-cli#v0.3.0" } }
```

The built `dist/` is committed, so installing from GitHub needs no build step.
This release depends on `@hraness/suite-accounts` v0.9.13.

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
  renderDeviceLogin,
  renderDeviceLoginResult,
} from "@hraness/accounts-cli";

const login = await initiateDeviceLogin(
  { deviceAuthorizationEndpoint, deviceTokenEndpoint },
  { clientId, scopes: ["openid", "profile", "email", "offline_access"] },
  {
    onUserCode: (code, url) => process.stderr.write(renderDeviceLogin({
      product: "My CLI", url, code, complete: url.includes(code),
    })),
  },
);

const result = await pollForDeviceToken(
  deviceTokenEndpoint,
  { clientId, deviceCode: login.deviceCode },
  { intervalMs: login.intervalMs },
);

const session = createCliSession({
  clientId,
  storage: createKeychainTokenStorage("my-cli", "default", { product: "My CLI" }),
  tokenEndpoint,
});
if (result.kind === "token") await session.saveRefreshToken(result.refreshToken);
process.stderr.write(renderDeviceLoginResult(result, { product: "My CLI", loginCommand: "my-cli login", next: "my-cli status" }));

const accessToken = await session.getAccessToken(); // null when signed out
```

While it waits, `renderDeviceLogin` prints:

```text
→ Sign in to My CLI: https://accounts.hraness.com/device?code=WDJB-MJHT
  Check the code in your browser matches: WDJB-MJHT
  Waiting for approval… (Ctrl-C to cancel)
```

`renderDeviceLoginResult` then prints one line and one next step:
`✓ Signed in to My CLI.` / `Next: my-cli status`, or, for example,
`✗ Sign-in was declined in the browser.` / `→ my-cli login`. Both fall back to
ASCII (`->`, `OK`, `FAIL`) when `TERM=dumb`, the locale is not UTF-8, or
`HRANESS_ASCII=1`, and strip control characters from server text. Pass an
`openBrowser(url)` handler to `initiateDeviceLogin` to open the page yourself;
this package never opens a browser.

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
stored, when the token endpoint answers with an error status, or when the
response lacks an access token or a positive `expires_in`. A network failure or
a non-JSON response throws. `signOut()` clears the cached token and deletes the
stored refresh token; it does not revoke the token with Accounts, so say
"signed out on this device" (`renderSignedOut(product)`).

## Token storage

| Function | Where the refresh token lives |
| --- | --- |
| `createKeychainTokenStorage(service, account, { product })` | The macOS login keychain, through `/usr/bin/security`. The item is labeled `{product} sign-in` with a comment that says what it is and that deleting it signs out on this Mac. The token never appears in a process argument list: it goes to `security -i` on stdin, hex-encoded. On other platforms saving throws `Keychain storage is only supported on macOS.`, and reading returns `null`. |
| `createEncryptedFileTokenStorage(path)` | A file written with mode `0600` and encrypted with AES-256-GCM. The key is derived from the host name, user name, platform, and home directory, which are not secret, so the file permissions are the main protection. |
| `createMemoryTokenStorage()` | Memory only, for tests and single-run tools. |

Reading from the keychain returns `null` only when there is no item. A locked
keychain, a denied access prompt, or any other `security` failure throws a
`KeychainError` with a `code` (`keychain-locked`, `keychain-denied`,
`keychain-unavailable`, or `keychain-write-failed` for saves), a one-sentence
`message`, and one `next` step such as `Unlock your login keychain, then try
again.` Deleting throws the same way when the item stays in place, so
`signOut()` never reports a sign-out that didn't happen.
`renderKeychainError(error)` prints both lines. Products should show
it rather than treat the person as signed out.

## Account verbs

`accountVerbs(options)` returns two verbs for a desktop-foundation registry,
so every product answers `account status` and `account signout` the same way:

```ts
import { HranessError, defineRegistry } from "@hraness/desktop-foundation/registry";
import { accountVerbs } from "@hraness/accounts-cli";

const registry = defineRegistry("ghostget", [
  ...productVerbs,
  ...accountVerbs({
    product: "ghostget",
    displayName: "Ghostget",
    signInCommand: "ghostget login",
    readState: async () => ({ kind: "signedIn", account: "ben@example.com" }),
    signOut: () => session.signOut(),
    usageError: (message) => new HranessError("usage", message),
  }),
]);
```

`account status` is a read verb. With `--json` it prints a
`<product>.account/1` envelope whose `data` is `{ state, account?, detail?,
signIn? }`: `state` is `signedIn`, `signedOut`, `expired` or `locked`, and
`signIn` holds the sign-in command when the person needs it. A locked keychain
is `locked`, not signed out. `account signout` is an operate verb that calls
your `signOut` and prints `{ "signedOut": true }` under
`<product>.account-signout/1`; if `signOut` throws, the command fails and
reports no sign-out. Sign-in stays the product's own command, because the
person approves it in the browser. `accountStatus(state, signInCommand)`
returns the same `data` for products that build their own status verb.

`usageError` is required. This package doesn't depend on desktop-foundation,
so it can't build the registry's `HranessError` itself; pass
`(message) => new HranessError("usage", message)` so extra arguments answer
`usage` (exit 2) rather than `internal` (exit 1). The verbs match the
registry's `Verb` shape. Menu rows (`accountMenuItems`) are gone with the menu bar companions.

## Development

```sh
bun install --frozen-lockfile
bun run check
```

`bun run check` runs lint, typecheck, tests, and the build.
