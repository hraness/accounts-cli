export type TokenStorageBackend = "keychain" | "encrypted-file" | "memory";
export type TokenStorage = Readonly<{
    backend: TokenStorageBackend;
    deleteRefreshToken: () => Promise<void>;
    loadRefreshToken: () => Promise<string | null>;
    saveRefreshToken: (token: string) => Promise<void>;
}>;
export declare function createKeychainTokenStorage(serviceName: string, accountName: string): TokenStorage;
export declare function createEncryptedFileTokenStorage(filePath: string): TokenStorage;
export declare function createMemoryTokenStorage(): TokenStorage;
//# sourceMappingURL=token-storage.d.ts.map