// Account verbs for a desktop-foundation registry.
//
// These shapes mirror `Verb`, `ParsedArgs` and `VerbContext` from
// `@hraness/desktop-foundation/registry`; this package does not depend on it.
// A product spreads `accountVerbs(...)` into its `defineRegistry` verb list, so
// `<product> account status --json` and `<product> account signout` answer the
// same way in every product.

/** The account state a product reads from its own session. */
export type AccountState =
  | Readonly<{ kind: "signedIn"; account?: string }>
  | Readonly<{ kind: "signedOut" }>
  /** The stored sign-in was rejected and the person must sign in again. */
  | Readonly<{ kind: "expired" }>
  /** The keychain is locked, so the product can't read the sign-in. */
  | Readonly<{ kind: "locked" }>;

/** `data` of `<product>.account/1`. */
export type AccountStatus = Readonly<{
  state: AccountState["kind"];
  /** The signed-in account, when the product knows it. */
  account?: string;
  /** One sentence for people when the state needs attention. */
  detail?: string;
  /** The command that signs in, when the person needs to (signed out or expired). */
  signIn?: string;
}>;

/** `data` of `<product>.account-signout/1`. */
export type AccountSignOutResult = Readonly<{ signedOut: true }>;

/** The parsed arguments a registry passes to `input`. */
export type AccountVerbArgs = Readonly<{
  positionals: readonly string[];
  flags: Readonly<Record<string, string | true>>;
}>;

/** An account verb, structurally a desktop-foundation `Verb`. */
export type AccountVerb<O> = Readonly<{
  path: readonly string[];
  opClass: "read" | "operate";
  schema: string;
  summary: string;
  flags: readonly string[];
  input: (argv: AccountVerbArgs) => null;
  run: (input: null, context: unknown) => Promise<O>;
  text: (output: O) => string;
}>;

export type AccountVerbOptions = Readonly<{
  /** The registry's product name, such as `ghostget`. Schemas are `<product>.account/1` and `<product>.account-signout/1`. */
  product: string;
  /** The product name for people, such as `Ghostget`. Defaults to `product`. */
  displayName?: string;
  /** The command that signs in, such as `ghostget login`. */
  signInCommand: string;
  /** Reads the current state. A locked keychain is `locked`, never `signedOut`. */
  readState: () => Promise<AccountState>;
  /** Forgets the local sign-in, for example `CliSession.signOut`. Throws when it could not. */
  signOut: () => Promise<void>;
  /**
   * Builds the error for unexpected arguments. Pass
   * `(message) => new HranessError("usage", message)` from
   * `@hraness/desktop-foundation/registry` so the registry answers `usage`
   * (exit 2). Required: this package can't build a `HranessError` itself, and
   * any other error would reach the registry as `internal` (exit 1).
   */
  usageError: (message: string) => Error;
}>;

const PRODUCT = /^[a-z][a-z0-9-]{0,31}$/u;

function plain(text: string, limit: number): string {
  return Array.from(text.replace(/\p{Cc}+/gu, " ").trim()).slice(0, limit).join("");
}

function noArguments(verb: string, usageError: (message: string) => Error): (argv: AccountVerbArgs) => null {
  return (argv) => {
    if (argv.positionals.length > 0) throw usageError(`${verb} takes no arguments.`);
    return null;
  };
}

/** The `<product>.account/1` data for a state. */
export function accountStatus(state: AccountState, signInCommand: string): AccountStatus {
  switch (state.kind) {
    case "signedOut":
      return Object.freeze({ state: "signedOut", signIn: signInCommand });
    case "expired":
      return Object.freeze({ state: "expired", detail: "Your sign-in expired.", signIn: signInCommand });
    case "locked":
      return Object.freeze({ state: "locked", detail: "The keychain is locked. Unlock it to use your sign-in." });
    case "signedIn": {
      const account = state.account === undefined ? "" : plain(state.account, 80);
      return Object.freeze(account === "" ? { state: "signedIn" } : { state: "signedIn", account });
    }
  }
}

/**
 * `account status` (read) and `account signout` (operate). Neither is gated:
 * reading the state is harmless, and signing out only forgets the local
 * sign-in. Sign-in stays the product's own command because it opens a
 * browser flow the person approves.
 */
export function accountVerbs(
  options: AccountVerbOptions,
): readonly [AccountVerb<AccountStatus>, AccountVerb<AccountSignOutResult>] {
  if (!PRODUCT.test(options.product)) throw new TypeError("Invalid product name.");
  const name = plain(options.displayName ?? options.product, 48);
  const signIn = plain(options.signInCommand, 200);
  if (signIn === "") throw new TypeError("signInCommand is required.");
  if (typeof options.usageError !== "function") {
    throw new TypeError("usageError is required: pass (message) => new HranessError(\"usage\", message).");
  }
  const usageError = options.usageError;

  const status: AccountVerb<AccountStatus> = Object.freeze({
    path: Object.freeze(["account", "status"]),
    opClass: "read",
    schema: `${options.product}.account/1`,
    summary: `Show whether this device is signed in to ${name}`,
    flags: Object.freeze([]),
    input: noArguments("account status", usageError),
    run: async () => accountStatus(await options.readState(), signIn),
    text: (output: AccountStatus) => {
      switch (output.state) {
        case "signedIn":
          return output.account === undefined ? `Signed in to ${name}.` : `Signed in to ${name} as ${output.account}.`;
        case "signedOut":
          return `Signed out of ${name}.\nNext: ${signIn}`;
        case "expired":
          return `Your ${name} sign-in expired.\nNext: ${signIn}`;
        case "locked":
          return "The keychain is locked. Unlock it to use your sign-in.";
      }
    },
  });

  const signOut: AccountVerb<AccountSignOutResult> = Object.freeze({
    path: Object.freeze(["account", "signout"]),
    opClass: "operate",
    schema: `${options.product}.account-signout/1`,
    summary: `Forget the ${name} sign-in on this device`,
    flags: Object.freeze([]),
    input: noArguments("account signout", usageError),
    run: async () => {
      await options.signOut();
      return Object.freeze({ signedOut: true as const });
    },
    text: () => `Signed out of ${name} on this device.`,
  });

  return Object.freeze([status, signOut] as const);
}
