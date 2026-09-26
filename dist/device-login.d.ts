export type DeviceLoginResult = Readonly<{
    kind: "token";
    accessToken: string;
    refreshToken: string;
}> | Readonly<{
    kind: "access_denied";
}> | Readonly<{
    kind: "expired_token";
}> | Readonly<{
    kind: "error";
    error: string;
    errorDescription: string | null;
}>;
export type DeviceLoginHandlers = Readonly<{
    /** Receives the code and the page to open (the complete URL, with the code, when the server gives one). */
    onUserCode?: (userCode: string, verificationUri: string) => void;
    /**
     * Called once with the same page after `onUserCode`, so a product can open
     * the browser itself (desktop-foundation or its own opener). This package
     * never opens a browser, and it doesn't wait for the opener. A rejection is
     * ignored; the printed link still works.
     */
    openBrowser?: (url: string) => void | Promise<void>;
    onPending?: () => void;
    onSlowDown?: (intervalMs: number) => void;
}>;
export declare function initiateDeviceLogin(configuration: Readonly<{
    deviceAuthorizationEndpoint: string;
    deviceTokenEndpoint: string;
}>, request: Readonly<{
    clientId: string;
    scopes?: readonly string[];
}>, handlers?: DeviceLoginHandlers): Promise<{
    deviceCode: string;
    expiresAtMs: number;
    intervalMs: number;
    poll: () => Promise<DeviceLoginResult>;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string | null;
}>;
export declare function pollForDeviceToken(tokenEndpoint: string, request: Readonly<{
    clientId: string;
    deviceCode: string;
}>, options?: Readonly<{
    intervalMs?: number;
    timeoutMs?: number;
}>): Promise<DeviceLoginResult>;
//# sourceMappingURL=device-login.d.ts.map