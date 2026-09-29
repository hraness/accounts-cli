// Account verbs for a desktop-foundation registry.
//
// These shapes mirror `Verb`, `ParsedArgs` and `VerbContext` from
// `@hraness/desktop-foundation/registry`; this package does not depend on it.
// A product spreads `accountVerbs(...)` into its `defineRegistry` verb list, so
// `<product> account status --json` and `<product> account signout` answer the
// same way in every product.
const PRODUCT = /^[a-z][a-z0-9-]{0,31}$/u;
function plain(text, limit) {
    return Array.from(text.replace(/\p{Cc}+/gu, " ").trim()).slice(0, limit).join("");
}
function noArguments(verb, usageError) {
    return (argv) => {
        if (argv.positionals.length > 0)
            throw usageError(`${verb} takes no arguments.`);
        return null;
    };
}
/** The `<product>.account/1` data for a state. */
export function accountStatus(state, signInCommand) {
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
export function accountVerbs(options) {
    if (!PRODUCT.test(options.product))
        throw new TypeError("Invalid product name.");
    const name = plain(options.displayName ?? options.product, 48);
    const signIn = plain(options.signInCommand, 200);
    if (signIn === "")
        throw new TypeError("signInCommand is required.");
    if (typeof options.usageError !== "function") {
        throw new TypeError("usageError is required: pass (message) => new HranessError(\"usage\", message).");
    }
    const usageError = options.usageError;
    const status = Object.freeze({
        path: Object.freeze(["account", "status"]),
        opClass: "read",
        schema: `${options.product}.account/1`,
        summary: `Show whether this device is signed in to ${name}`,
        flags: Object.freeze([]),
        input: noArguments("account status", usageError),
        run: async () => accountStatus(await options.readState(), signIn),
        text: (output) => {
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
    const signOut = Object.freeze({
        path: Object.freeze(["account", "signout"]),
        opClass: "operate",
        schema: `${options.product}.account-signout/1`,
        summary: `Forget the ${name} sign-in on this device`,
        flags: Object.freeze([]),
        input: noArguments("account signout", usageError),
        run: async () => {
            await options.signOut();
            return Object.freeze({ signedOut: true });
        },
        text: () => `Signed out of ${name} on this device.`,
    });
    return Object.freeze([status, signOut]);
}
//# sourceMappingURL=verbs.js.map