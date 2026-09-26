import {
  initiateSuiteOidcDeviceAuthorization,
  pollSuiteOidcDeviceToken,
  type SuiteOidcDevicePollOutcome,
} from "@hraness/suite-accounts/oidc-device-code";

export type DeviceLoginResult =
  | Readonly<{ kind: "token"; accessToken: string; refreshToken: string }>
  | Readonly<{ kind: "access_denied" }>
  | Readonly<{ kind: "expired_token" }>
  | Readonly<{ kind: "error"; error: string; errorDescription: string | null }>;

export type DeviceLoginHandlers = Readonly<{
  /** Receives the code and the page to open (the complete URL, with the code, when the server gives one). */
  onUserCode?: (userCode: string, verificationUri: string) => void;
  /**
   * Called once with the same page after `onUserCode`, so a product can open
   * the browser itself (desktop-foundation or its own opener). This package
   * never opens a browser. A rejection is ignored; the printed link still works.
   */
  openBrowser?: (url: string) => void | Promise<void>;
  onPending?: () => void;
  onSlowDown?: (intervalMs: number) => void;
}>;

export async function initiateDeviceLogin(
  configuration: Readonly<{
    deviceAuthorizationEndpoint: string;
    deviceTokenEndpoint: string;
  }>,
  request: Readonly<{
    clientId: string;
    scopes?: readonly string[];
  }>,
  handlers: DeviceLoginHandlers = {},
): Promise<{
  deviceCode: string;
  expiresAtMs: number;
  intervalMs: number;
  poll: () => Promise<DeviceLoginResult>;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string | null;
}> {
  const { poll, response } = await initiateSuiteOidcDeviceAuthorization(
    configuration,
    request,
  );

  const page = response.verificationUriComplete ?? response.verificationUri;
  if (handlers.onUserCode !== undefined) {
    handlers.onUserCode(response.userCode, page);
  }
  if (handlers.openBrowser !== undefined) {
    try {
      await handlers.openBrowser(page);
    } catch {
      // The printed link still works.
    }
  }

  return {
    deviceCode: response.deviceCode,
    expiresAtMs: response.expiresAtMs,
    intervalMs: response.intervalMs,
    poll: async () => {
      const outcome = await poll();
      return mapPollOutcome(outcome);
    },
    userCode: response.userCode,
    verificationUri: response.verificationUri,
    verificationUriComplete: response.verificationUriComplete,
  };
}

export async function pollForDeviceToken(
  tokenEndpoint: string,
  request: Readonly<{
    clientId: string;
    deviceCode: string;
  }>,
  options: Readonly<{
    intervalMs?: number;
    timeoutMs?: number;
  }> = {},
): Promise<DeviceLoginResult> {
  const intervalMs = options.intervalMs ?? 5_000;
  const timeoutMs = options.timeoutMs ?? 600_000;
  const deadline = Date.now() + timeoutMs;
  let currentInterval = intervalMs;

  while (Date.now() < deadline) {
    const outcome = await pollSuiteOidcDeviceToken(tokenEndpoint, request);
    switch (outcome.kind) {
      case "token": {
        const mapped = mapPollOutcome(outcome);
        if (mapped.kind === "token") return mapped;
        return mapped;
      }
      case "access_denied":
        return { kind: "access_denied" };
      case "expired_token":
        return { kind: "expired_token" };
      case "error":
        return {
          kind: "error",
          error: outcome.error,
          errorDescription: outcome.errorDescription,
        };
      case "authorization_pending":
        await sleep(currentInterval);
        continue;
      case "slow_down":
        currentInterval = outcome.intervalMs;
        await sleep(currentInterval);
        continue;
    }
  }

  return {
    kind: "error",
    error: "timeout",
    errorDescription: "The device authorization timed out.",
  };
}

function mapPollOutcome(
  outcome: SuiteOidcDevicePollOutcome,
): DeviceLoginResult {
  switch (outcome.kind) {
    case "token":
      if (outcome.refreshToken === null) {
        return {
          kind: "error",
          error: "invalid_response",
          errorDescription: "The token response did not include a refresh token.",
        };
      }
      return {
        kind: "token",
        accessToken: outcome.accessToken,
        refreshToken: outcome.refreshToken,
      };
    case "authorization_pending":
      return { kind: "error", error: "authorization_pending", errorDescription: null };
    case "slow_down":
      return { kind: "error", error: "slow_down", errorDescription: null };
    case "access_denied":
      return { kind: "access_denied" };
    case "expired_token":
      return { kind: "expired_token" };
    case "error":
      return { kind: "error", error: outcome.error, errorDescription: outcome.errorDescription };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
