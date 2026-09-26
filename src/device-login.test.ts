import { describe, expect, mock, test } from "bun:test";

mock.module("@hraness/suite-accounts/oidc-device-code", () => ({
  initiateSuiteOidcDeviceAuthorization: async () => ({
    poll: async () => ({ kind: "authorization_pending" }),
    response: {
      deviceCode: "device", expiresAtMs: Date.now() + 600_000, intervalMs: 5_000, userCode: "WDJB-MJHT",
      verificationUri: "https://accounts.example/device", verificationUriComplete: "https://accounts.example/device?code=WDJB-MJHT",
    },
  }),
  pollSuiteOidcDeviceToken: async () => ({ kind: "access_denied" }),
}));

const { initiateDeviceLogin } = await import("./device-login");
const endpoints = { deviceAuthorizationEndpoint: "https://accounts.example/da", deviceTokenEndpoint: "https://accounts.example/token" };

describe("openBrowser", () => {
  test("gets the complete page after onUserCode and never blocks polling", async () => {
    const order: string[] = [];
    let opened: string | undefined;
    const login = await initiateDeviceLogin(endpoints, { clientId: "cli" }, {
      onUserCode: () => order.push("code"),
      openBrowser: url => { order.push("open"); opened = url; return new Promise<void>(() => undefined); },
    });
    await Promise.resolve();
    expect(login.userCode).toBe("WDJB-MJHT");
    expect(order).toEqual(["code", "open"]);
    expect(opened).toBe("https://accounts.example/device?code=WDJB-MJHT");
  });

  test("a failing opener is ignored", async () => {
    const login = await initiateDeviceLogin(endpoints, { clientId: "cli" }, { openBrowser: () => { throw new Error("no browser"); } });
    expect(login.verificationUriComplete).toBe("https://accounts.example/device?code=WDJB-MJHT");
  });
});
