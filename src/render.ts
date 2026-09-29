import type { DeviceLoginResult } from "./device-login.js";
import { KeychainError } from "./token-storage.js";

type Env = Readonly<Record<string, string | undefined>>;

export type RenderOptions = Readonly<{
  /** Environment used to pick ASCII fallbacks. Defaults to `process.env`. */
  env?: Env;
}>;

export type DeviceLoginPrompt = Readonly<{
  /** The product's display name, such as `Ghostget`. */
  product: string;
  /** The page to open: the complete URL when the server gave one, else the plain verification URL. */
  url: string;
  /** The user code. */
  code: string;
  /** Whether `url` already carries the code (`verificationUriComplete`). */
  complete: boolean;
}>;

export type DeviceLoginOutcomeOptions = RenderOptions & Readonly<{
  product: string;
  /** The command that starts sign-in again, such as `ghostget login`. */
  loginCommand: string;
  /** Who is signed in, when the product knows (an email or handle). */
  account?: string;
  /** One command to run next after a successful sign-in, such as `ghostget status`. */
  next?: string;
}>;

const ASCII: Readonly<Record<string, string>> = Object.freeze({ "✓": "OK", "✗": "FAIL", "→": "->", "…": "...", "·": "-" });

function asciiOnly(env: Env): boolean {
  if (env.HRANESS_ASCII === "1" || env.TERM === "dumb") return true;
  // The first nonempty of LC_ALL, LC_CTYPE, LANG is the effective character locale.
  const locale = [env.LC_ALL, env.LC_CTYPE, env.LANG].find(value => (value ?? "") !== "") ?? "";
  return !/utf-?8/iu.test(locale);
}

function symbols(text: string, options: RenderOptions): string {
  return asciiOnly(options.env ?? process.env) ? Array.from(text, character => ASCII[character] ?? character).join("") : text;
}

/** Drop control and formatting characters and cap the length of foreign text. */
function plain(value: string, max: number): string {
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
export function renderDeviceLogin(prompt: DeviceLoginPrompt, options: RenderOptions = {}): string {
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
export function renderDeviceLoginResult(result: DeviceLoginResult, options: DeviceLoginOutcomeOptions): string {
  const product = plain(options.product, 48);
  const retry = `→ ${plain(options.loginCommand, 120)}`;
  let text: string;
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
    case "error": {
      if (result.error === "timeout") {
        text = `✗ Sign-in timed out waiting for approval in the browser.\n${retry}`;
        break;
      }
      const reason = [result.errorDescription, result.error]
        .map(value => value === null ? "" : plain(value, 160).replace(/\.$/u, ""))
        .find(value => value !== "");
      text = `✗ Couldn't sign in to ${product}${reason === undefined ? "" : `: ${reason}`}.\n${retry}`;
      break;
    }
  }
  return symbols(`${text}\n`, options);
}

/** `✓ Signed out of Ghostget on this device.` Sign-out forgets the local token and does not revoke it. */
export function renderSignedOut(product: string, options: RenderOptions = {}): string {
  return symbols(`✓ Signed out of ${plain(product, 48)} on this device.\n`, options);
}

/** Two lines for a keychain failure: what happened, then the one thing to do. */
export function renderKeychainError(error: KeychainError, options: RenderOptions = {}): string {
  return symbols(`✗ ${error.message}\n→ ${error.next}\n`, options);
}
