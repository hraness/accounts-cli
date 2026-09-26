const ASCII = Object.freeze({ "✓": "OK", "✗": "FAIL", "→": "->", "…": "...", "·": "-" });
function asciiOnly(env) {
    if (env.HRANESS_ASCII === "1" || env.TERM === "dumb")
        return true;
    // The first nonempty of LC_ALL, LC_CTYPE, LANG is the effective character locale.
    const locale = [env.LC_ALL, env.LC_CTYPE, env.LANG].find(value => (value ?? "") !== "") ?? "";
    return !/utf-?8/iu.test(locale);
}
function symbols(text, options) {
    return asciiOnly(options.env ?? process.env) ? Array.from(text, character => ASCII[character] ?? character).join("") : text;
}
/** Drop control and formatting characters and cap the length of foreign text. */
function plain(value, max) {
    const visible = Array.from(value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/gu, " ").trim());
    return visible.length <= max ? visible.join("") : `${visible.slice(0, max - 1).join("")}…`;
}
/**
 * The three stderr lines a CLI prints while it waits for browser approval:
 *
 * ```text
 * → Sign in to Ghostget: https://accounts.hraness.com/device?code=WDJB-MJHT
 *   Check the code in your browser matches: WDJB-MJHT
 *   Waiting for approval… (Ctrl-C to cancel)
 * ```
 */
export function renderDeviceLogin(prompt, options = {}) {
    const product = plain(prompt.product, 48);
    const code = plain(prompt.code, 32);
    const url = plain(prompt.url, 2048);
    return symbols([
        `→ Sign in to ${product}: ${url}`,
        prompt.complete ? `  Check the code in your browser matches: ${code}` : `  Enter this code there: ${code}`,
        "  Waiting for approval… (Ctrl-C to cancel)",
    ].join("\n") + "\n", options);
}
/**
 * One result line for a finished device login, plus one next step:
 * `✓ Signed in to Ghostget as ben@example.com.` / `Next: ghostget status`, or
 * `✗ Sign-in was declined in the browser.` / `→ ghostget login`.
 */
export function renderDeviceLoginResult(result, options) {
    const product = plain(options.product, 48);
    const retry = `→ ${plain(options.loginCommand, 120)}`;
    let text;
    switch (result.kind) {
        case "token": {
            const who = options.account === undefined ? "" : ` as ${plain(options.account, 80)}`;
            text = `✓ Signed in to ${product}${who}.` + (options.next === undefined ? "" : `\nNext: ${plain(options.next, 120)}`);
            break;
        }
        case "access_denied":
            text = `✗ Sign-in was declined in the browser.\n${retry}`;
            break;
        case "expired_token":
            text = `✗ The sign-in code expired before it was approved.\n${retry}`;
            break;
        case "error":
            text = result.error === "timeout"
                ? `✗ Sign-in timed out waiting for approval in the browser.\n${retry}`
                : `✗ Couldn't sign in to ${product}: ${plain(result.errorDescription ?? result.error, 160).replace(/\.$/u, "")}.\n${retry}`;
            break;
    }
    return symbols(`${text}\n`, options);
}
/** `✓ Signed out of Ghostget on this device.` Sign-out forgets the local token and does not revoke it. */
export function renderSignedOut(product, options = {}) {
    return symbols(`✓ Signed out of ${plain(product, 48)} on this device.\n`, options);
}
/** Two lines for a keychain failure: what happened, then the one thing to do. */
export function renderKeychainError(error, options = {}) {
    return symbols(`✗ ${error.message}\n→ ${error.next}\n`, options);
}
const MENU_ACTION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
/**
 * Standard account rows for a menu kit v2 snapshot.
 *
 * - Signed out or expired: a top-section status row and the menu's primary
 *   `Sign in` action (opens the browser). Put both in the top section.
 * - Locked keychain: a `status.locked` row and no action.
 * - Signed in: one `Sign out` action, with the account as its subtitle, for the
 *   controls section.
 */
export function accountMenuItems(state, options = {}) {
    const signInId = options.signInId ?? "account.signIn";
    const signOutId = options.signOutId ?? "account.signOut";
    for (const id of [signInId, signOutId]) {
        if (!MENU_ACTION_ID.test(id) || id.startsWith("foundation."))
            throw new TypeError("Invalid account menu action ID.");
    }
    const signIn = (label) => Object.freeze({
        kind: "action", id: signInId, label, symbol: "action.signIn", role: "primary", opens: "browser",
    });
    switch (state.kind) {
        case "signedOut":
            return Object.freeze([Object.freeze({ kind: "status", symbol: "status.signedOut", label: "Signed out" }), signIn("Sign in")]);
        case "expired":
            return Object.freeze([
                Object.freeze({ kind: "status", symbol: "status.signedOut", label: "Signed out", detail: "Your sign-in expired" }),
                signIn("Sign in again"),
            ]);
        case "locked":
            return Object.freeze([Object.freeze({ kind: "status", symbol: "status.locked", label: "Keychain is locked", detail: "Unlock it to use your sign-in" })]);
        case "signedIn": {
            const subtitle = state.account === undefined ? undefined : plain(state.account, 80);
            return Object.freeze([Object.freeze({
                    kind: "action", id: signOutId, label: "Sign out", symbol: "action.signOut",
                    ...(subtitle === undefined || subtitle === "" ? {} : { subtitle }),
                })]);
        }
    }
}
//# sourceMappingURL=render.js.map