import { describe, expect, test } from "bun:test";

import { accountMenuItems, renderDeviceLogin, renderDeviceLoginResult, renderKeychainError, renderSignedOut } from "./render";
import { KeychainError } from "./token-storage";

const utf8 = { env: { LANG: "en_US.UTF-8" } };
const ascii = { env: { LANG: "en_US.UTF-8", TERM: "dumb" } };
const login = { product: "Ghostget", loginCommand: "ghostget login", ...utf8 };

describe("renderDeviceLogin", () => {
  test("a complete link asks the person to check the code", () => {
    expect(renderDeviceLogin({ product: "Ghostget", url: "https://accounts.hraness.com/device?code=WDJB-MJHT", code: "WDJB-MJHT", complete: true }, utf8)).toBe([
      "→ Sign in to Ghostget: https://accounts.hraness.com/device?code=WDJB-MJHT",
      "  Check the code in your browser matches: WDJB-MJHT",
      "  Waiting for approval… (Ctrl-C to cancel)",
    ].join("\n") + "\n");
  });

  test("a plain link asks the person to enter the code", () => {
    expect(renderDeviceLogin({ product: "Ghostget", url: "https://accounts.hraness.com/device", code: "WDJB-MJHT", complete: false }, utf8))
      .toContain("  Enter this code there: WDJB-MJHT\n");
  });

  test("plain terminals get ASCII; NO_COLOR changes nothing because nothing is colored", () => {
    const prompt = { product: "Ghostget", url: "https://a.example/d", code: "AB-CD", complete: true };
    expect(renderDeviceLogin(prompt, ascii)).toBe("-> Sign in to Ghostget: https://a.example/d\n  Check the code in your browser matches: AB-CD\n  Waiting for approval... (Ctrl-C to cancel)\n");
    expect(renderDeviceLogin(prompt, { env: { LANG: "en_US.UTF-8", NO_COLOR: "1" } })).toBe(renderDeviceLogin(prompt, utf8));
    expect(renderDeviceLogin(prompt, { env: { LC_ALL: "C", LANG: "en_US.UTF-8" } })).toBe(renderDeviceLogin(prompt, ascii));
    expect(renderDeviceLogin(prompt, utf8)).not.toContain("\u001b[");
  });

  test("foreign text cannot inject terminal control sequences", () => {
    const text = renderDeviceLogin({ product: "Ghost\u001b[31mget", url: "https://a.example/\u0007d", code: "AB\nCD", complete: true }, utf8);
    expect(Array.from(text).some(character => character !== "\n" && /\p{Cc}/u.test(character))).toBe(false);
    expect(text.split("\n")).toHaveLength(4);
  });
});

describe("renderDeviceLoginResult", () => {
  test("success names the account and one next step", () => {
    expect(renderDeviceLoginResult({ kind: "token", accessToken: "a", refreshToken: "r" }, { ...login, account: "ben@example.com", next: "ghostget status" }))
      .toBe("✓ Signed in to Ghostget as ben@example.com.\nNext: ghostget status\n");
    expect(renderDeviceLoginResult({ kind: "token", accessToken: "a", refreshToken: "r" }, login)).toBe("✓ Signed in to Ghostget.\n");
  });

  test("every failure says what happened and how to retry", () => {
    expect(renderDeviceLoginResult({ kind: "access_denied" }, login)).toBe("✗ Sign-in was declined in the browser.\n→ ghostget login\n");
    expect(renderDeviceLoginResult({ kind: "expired_token" }, login)).toBe("✗ The sign-in code expired before it was approved.\n→ ghostget login\n");
    expect(renderDeviceLoginResult({ kind: "error", error: "timeout", errorDescription: "The device authorization timed out." }, login))
      .toBe("✗ Sign-in timed out waiting for approval in the browser.\n→ ghostget login\n");
    expect(renderDeviceLoginResult({ kind: "error", error: "server_error", errorDescription: "Accounts is down." }, login))
      .toBe("✗ Couldn't sign in to Ghostget: Accounts is down.\n→ ghostget login\n");
    expect(renderDeviceLoginResult({ kind: "error", error: "invalid_response", errorDescription: null }, { ...login, ...ascii }))
      .toBe("FAIL Couldn't sign in to Ghostget: invalid_response.\n-> ghostget login\n");
  });
});

describe("other human lines", () => {
  test("sign-out says it is local", () => {
    expect(renderSignedOut("Ghostget", utf8)).toBe("✓ Signed out of Ghostget on this device.\n");
  });
  test("keychain errors read as two lines", () => {
    const error = new KeychainError("keychain-locked", "Your login keychain is locked.", "Unlock your login keychain, then try again.", 36);
    expect(renderKeychainError(error, utf8)).toBe("✗ Your login keychain is locked.\n→ Unlock your login keychain, then try again.\n");
  });
});

describe("accountMenuItems", () => {
  test("signed out: a status row and the primary Sign in action", () => {
    expect(accountMenuItems({ kind: "signedOut" })).toEqual([
      { kind: "status", symbol: "status.signedOut", label: "Signed out" },
      { kind: "action", id: "account.signIn", label: "Sign in", symbol: "action.signIn", role: "primary", opens: "browser" },
    ]);
  });
  test("expired sign-in asks to sign in again", () => {
    expect(accountMenuItems({ kind: "expired" }, { signInId: "login" })).toEqual([
      { kind: "status", symbol: "status.signedOut", label: "Signed out", detail: "Your sign-in expired" },
      { kind: "action", id: "login", label: "Sign in again", symbol: "action.signIn", role: "primary", opens: "browser" },
    ]);
  });
  test("a locked keychain is a status, not a sign-out", () => {
    expect(accountMenuItems({ kind: "locked" })).toEqual([
      { kind: "status", symbol: "status.locked", label: "Keychain is locked", detail: "Unlock it to use your sign-in" },
    ]);
  });
  test("signed in: Sign out with the account as subtitle", () => {
    expect(accountMenuItems({ kind: "signedIn", account: "ben@example.com" })).toEqual([
      { kind: "action", id: "account.signOut", label: "Sign out", symbol: "action.signOut", subtitle: "ben@example.com" },
    ]);
    expect(accountMenuItems({ kind: "signedIn" })).toEqual([{ kind: "action", id: "account.signOut", label: "Sign out", symbol: "action.signOut" }]);
  });
  test("reserved or malformed IDs are refused", () => {
    for (const id of ["foundation.login", "", "a b"]) expect(() => accountMenuItems({ kind: "signedOut" }, { signInId: id })).toThrow(TypeError);
  });
});
