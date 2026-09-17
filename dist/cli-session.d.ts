import type { TokenStorage } from "./token-storage.js";
export type CliSessionOptions = Readonly<{
    clientId: string;
    storage: TokenStorage;
    tokenEndpoint: string;
}>;
export type CliSession = Readonly<{
    deleteRefreshToken: () => Promise<void>;
    getAccessToken: () => Promise<string | null>;
    loadRefreshToken: () => Promise<string | null>;
    saveRefreshToken: (token: string) => Promise<void>;
    signOut: () => Promise<void>;
}>;
export declare function createCliSession(options: CliSessionOptions): CliSession;
//# sourceMappingURL=cli-session.d.ts.map