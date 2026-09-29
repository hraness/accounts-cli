/** The account state a product reads from its own session. */
export type AccountState = Readonly<{
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
export type AccountSignOutResult = Readonly<{
    signedOut: true;
}>;
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
/** The `<product>.account/1` data for a state. */
export declare function accountStatus(state: AccountState, signInCommand: string): AccountStatus;
/**
 * `account status` (read) and `account signout` (operate). Neither is gated:
 * reading the state is harmless, and signing out only forgets the local
 * sign-in. Sign-in stays the product's own command because it opens a
 * browser flow the person approves.
 */
export declare function accountVerbs(options: AccountVerbOptions): readonly [AccountVerb<AccountStatus>, AccountVerb<AccountSignOutResult>];
//# sourceMappingURL=verbs.d.ts.map