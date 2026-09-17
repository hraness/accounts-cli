export function createCliSession(options) {
    const { clientId, storage, tokenEndpoint } = options;
    let accessToken = null;
    let accessTokenExpiresAt = 0;
    return {
        deleteRefreshToken: async () => {
            accessToken = null;
            accessTokenExpiresAt = 0;
            await storage.deleteRefreshToken();
        },
        getAccessToken: async () => {
            if (accessToken !== null && Date.now() < accessTokenExpiresAt) {
                return accessToken;
            }
            const refreshToken = await storage.loadRefreshToken();
            if (refreshToken === null)
                return null;
            const refreshed = await refreshAccessToken(tokenEndpoint, clientId, refreshToken);
            if (refreshed === null)
                return null;
            accessToken = refreshed.accessToken;
            accessTokenExpiresAt = refreshed.expiresAtMs;
            if (refreshed.refreshToken !== null) {
                await storage.saveRefreshToken(refreshed.refreshToken);
            }
            return accessToken;
        },
        loadRefreshToken: async () => {
            return await storage.loadRefreshToken();
        },
        saveRefreshToken: async (token) => {
            await storage.saveRefreshToken(token);
        },
        signOut: async () => {
            accessToken = null;
            accessTokenExpiresAt = 0;
            await storage.deleteRefreshToken();
        },
    };
}
async function refreshAccessToken(tokenEndpoint, clientId, refreshToken) {
    const body = new URLSearchParams();
    body.set("client_id", clientId);
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", refreshToken);
    body.set("scope", "openid profile email offline_access");
    const response = await fetch(tokenEndpoint, {
        body: body.toString(),
        headers: {
            "accept": "application/json",
            "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
    });
    if (!response.ok)
        return null;
    const data = await response.json();
    if (typeof data !== "object" || data === null)
        return null;
    const accessToken = Reflect.get(data, "access_token");
    const expiresIn = Reflect.get(data, "expires_in");
    const newRefreshToken = Reflect.get(data, "refresh_token");
    if (typeof accessToken !== "string"
        || typeof expiresIn !== "number"
        || expiresIn <= 0) {
        return null;
    }
    return {
        accessToken,
        expiresAtMs: Date.now() + expiresIn * 1_000,
        refreshToken: typeof newRefreshToken === "string" ? newRefreshToken : null,
    };
}
//# sourceMappingURL=cli-session.js.map