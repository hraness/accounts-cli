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
/**
 * Shapes mirror `StatusItemV2` and `ActionItemV2` from
 * `@hraness/desktop-foundation`; this package does not depend on it.
 */
export type AccountMenuStatusRow = Readonly<{
    kind: "status";
    symbol: "status.signedOut" | "status.locked";
    label: string;
    detail?: string;
}>;
export type AccountMenuActionRow = Readonly<{
    kind: "action";
    id: string;
    label: string;
    symbol: "action.signIn" | "action.signOut";
    subtitle?: string;
    role?: "primary";
    opens?: "browser";
}>;
export type AccountMenuState = Readonly<{
    kind: "signedIn";
    account?: string;
}> | Readonly<{
    kind: "signedOut";
}>
/** The stored sign-in was rejected and the person must sign in again. */
 | Readonly<{
    kind: "expired";
}>
/** The keychain is locked, so the product can't read the sign-in. */
 | Readonly<{
    kind: "locked";
}>;
export type AccountMenuOptions = Readonly<{
    /** Action ID for Sign in. Default `account.signIn`. */
    signInId?: string;
    /** Action ID for Sign out. Default `account.signOut`. */
    signOutId?: string;
}>;
/**
 * Standard account rows for a menu kit v2 snapshot.
 *
 * - Signed out or expired: a top-section status row and the menu's primary
 *   `Sign in` action (opens the browser). Put both in the top section.
 * - Locked keychain: a `status.locked` row and no action.
 * - Signed in: one `Sign out` action, with the account as its subtitle, for the
 *   controls section.
 */
export declare function accountMenuItems(state: AccountMenuState, options?: AccountMenuOptions): readonly (AccountMenuStatusRow | AccountMenuActionRow)[];
export {};
//# sourceMappingURL=render.d.ts.map