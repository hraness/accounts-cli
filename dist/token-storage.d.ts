export type TokenStorageBackend = "keychain" | "encrypted-file" | "memory";
export type TokenStorage = Readonly<{
    backend: TokenStorageBackend;
    deleteRefreshToken: () => Promise<void>;
    loadRefreshToken: () => Promise<string | null>;
    saveRefreshToken: (token: string) => Promise<void>;
}>;
/** Why a keychain read or write failed. `null` from a read means no item, never one of these. */
export type KeychainErrorCode = "keychain-locked" | "keychain-denied" | "keychain-unavailable" | "keychain-write-failed";
/**
 * A keychain failure that is not "signed out". `message` is one sentence a
 * product can print as is; `next` is the one thing the person can do.
 */
export declare class KeychainError extends Error {
    readonly code: KeychainErrorCode;
    readonly next: string;
    /** The `security` exit status, when there was one. */
    readonly status: number | null;
    constructor(code: KeychainErrorCode, message: string, next: string, status: number | null);
}
/** Runs `/usr/bin/security` with arguments and optional stdin. Injected by tests. */
export type SecurityRunner = (args: readonly string[], stdin?: string) => Promise<Readonly<{
    status: number;
    stdout: string;
}>>;
export type KeychainTokenStorageOptions = Readonly<{
    /**
     * The product's display name. The item is labeled `{product} sign-in` and
     * carries a comment saying what it is, so Keychain Access shows more than a
     * bare service string. Defaults to the service name.
     */
    product?: string;
    /** Overrides the label. */
    label?: string;
    /** Overrides the comment. */
    comment?: string;
    /** Test seams. */
    runSecurity?: SecurityRunner;
    platform?: NodeJS.Platform;
}>;
/**
 * Refresh-token storage in the macOS login keychain through `security`. The
 * token never appears in a process argument list: writes go through
 * `security -i` on stdin with the value hex-encoded (`-X`).
 */
export declare function createKeychainTokenStorage(serviceName: string, accountName: string, options?: KeychainTokenStorageOptions): TokenStorage;
export declare function createEncryptedFileTokenStorage(filePath: string): TokenStorage;
export declare function createMemoryTokenStorage(): TokenStorage;
//# sourceMappingURL=token-storage.d.ts.map