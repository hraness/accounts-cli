import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, hostname, platform, userInfo } from "node:os";
import { join } from "node:path";
export function createKeychainTokenStorage(serviceName, accountName) {
    return {
        backend: "keychain",
        deleteRefreshToken: async () => {
            await deleteKeychainEntry(serviceName, accountName);
        },
        loadRefreshToken: async () => {
            return await readKeychainEntry(serviceName, accountName);
        },
        saveRefreshToken: async (token) => {
            await writeKeychainEntry(serviceName, accountName, token);
        },
    };
}
export function createEncryptedFileTokenStorage(filePath) {
    return {
        backend: "encrypted-file",
        deleteRefreshToken: async () => {
            try {
                unlinkSync(filePath);
            }
            catch {
                // File may not exist; that is fine.
            }
        },
        loadRefreshToken: async () => {
            if (!existsSync(filePath))
                return null;
            const encrypted = readFileSync(filePath);
            const key = deriveMachineKey();
            return decryptToken(encrypted, key);
        },
        saveRefreshToken: async (token) => {
            const directory = join(filePath, "..");
            mkdirSync(directory, { recursive: true });
            const key = deriveMachineKey();
            const encrypted = encryptToken(token, key);
            writeFileSync(filePath, encrypted, { mode: 0o600 });
        },
    };
}
export function createMemoryTokenStorage() {
    let stored = null;
    return {
        backend: "memory",
        deleteRefreshToken: async () => {
            stored = null;
        },
        loadRefreshToken: async () => {
            return stored;
        },
        saveRefreshToken: async (token) => {
            stored = token;
        },
    };
}
// ---------------------------------------------------------------------------
// Keychain helpers (macOS `security` CLI; other platforms return null/throw)
// ---------------------------------------------------------------------------
async function readKeychainEntry(service, account) {
    if (platform() !== "darwin")
        return null;
    const { execFile } = await import("node:child_process");
    return new Promise(resolve => {
        execFile("security", ["find-generic-password", "-s", service, "-a", account, "-w"], (error, stdout) => {
            if (error !== null) {
                resolve(null);
                return;
            }
            resolve(stdout.trim());
        });
    });
}
async function writeKeychainEntry(service, account, value) {
    if (platform() !== "darwin") {
        throw new Error("Keychain storage is only supported on macOS.");
    }
    const { execFile } = await import("node:child_process");
    return new Promise((resolve, reject) => {
        execFile("security", ["add-generic-password", "-s", service, "-a", account, "-w", value, "-U"], error => {
            if (error !== null) {
                reject(new Error("Failed to write to the keychain."));
                return;
            }
            resolve();
        });
    });
}
async function deleteKeychainEntry(service, account) {
    if (platform() !== "darwin")
        return;
    const { execFile } = await import("node:child_process");
    return new Promise(resolve => {
        execFile("security", ["delete-generic-password", "-s", service, "-a", account], () => resolve());
    });
}
// ---------------------------------------------------------------------------
// Encrypted file helpers (AES-256-GCM with a machine-bound key)
// ---------------------------------------------------------------------------
const ENCRYPTION_VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
function deriveMachineKey() {
    const material = [
        hostname(),
        userInfo().username,
        platform(),
        homedir(),
    ].join("|");
    return createHash("sha256").update(material).digest();
}
function encryptToken(token, key) {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([
        Buffer.from([ENCRYPTION_VERSION]),
        iv,
        tag,
        ciphertext,
    ]);
}
function decryptToken(encrypted, key) {
    if (encrypted.length < 1 + IV_LENGTH + TAG_LENGTH)
        return null;
    const version = encrypted[0];
    if (version !== ENCRYPTION_VERSION)
        return null;
    const iv = encrypted.subarray(1, 1 + IV_LENGTH);
    const tag = encrypted.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
    const ciphertext = encrypted.subarray(1 + IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    try {
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=token-storage.js.map