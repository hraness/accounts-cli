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
/**
 * The three stderr lines a CLI prints while it waits for browser approval:
 *
 * ```text
 * → Sign in to Ghostget: https://accounts.hraness.com/device?code=WDJB-MJHT
 *   Check the code in your browser matches: WDJB-MJHT
 *   Waiting for approval… (Ctrl-C to cancel)
 * ```
 */
export declare function renderDeviceLogin(prompt: DeviceLoginPrompt, options?: RenderOptions): string;
/**
 * One result line for a finished device login, plus one next step:
 * `✓ Signed in to Ghostget as ben@example.com.` / `Next: ghostget status`, or
 * `✗ Sign-in was declined in the browser.` / `→ ghostget login`.
 */
export declare function renderDeviceLoginResult(result: DeviceLoginResult, options: DeviceLoginOutcomeOptions): string;
/** `✓ Signed out of Ghostget on this device.` Sign-out forgets the local token and does not revoke it. */
export declare function renderSignedOut(product: string, options?: RenderOptions): string;
/** Two lines for a keychain failure: what happened, then the one thing to do. */
export declare function renderKeychainError(error: KeychainError, options?: RenderOptions): string;
export {};
//# sourceMappingURL=render.d.ts.map