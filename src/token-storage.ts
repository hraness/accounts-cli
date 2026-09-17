import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, hostname, platform, userInfo } from "node:os";
import { join } from "node:path";

export type TokenStorageBackend = "keychain" | "encrypted-file" | "memory";

export type TokenStorage = Readonly<{
  backend: TokenStorageBackend;
  deleteRefreshToken: () => Promise<void>;
  loadRefreshToken: () => Promise<string | null>;
  saveRefreshToken: (token: string) => Promise<void>;
}>;

export function createKeychainTokenStorage(
  serviceName: string,
  accountName: string,
): TokenStorage {
  return {
    backend: "keychain",
    deleteRefreshToken: async () => {
      await deleteKeychainEntry(serviceName, accountName);
    },
    loadRefreshToken: async () => {
      return await readKeychainEntry(serviceName, accountName);
    },
    saveRefreshToken: async (token: string) => {
      await writeKeychainEntry(serviceName, accountName, token);
    },
  };
}

export function createEncryptedFileTokenStorage(
  filePath: string,
): TokenStorage {
  return {
    backend: "encrypted-file",
    deleteRefreshToken: async () => {
      try {
        unlinkSync(filePath);
      } catch {
        // File may not exist; that is fine.
      }
    },
    loadRefreshToken: async () => {
      if (!existsSync(filePath)) return null;
      const encrypted = readFileSync(filePath);
      const key = deriveMachineKey();
      return decryptToken(encrypted, key);
    },
    saveRefreshToken: async (token: string) => {
      const directory = join(filePath, "..");
      mkdirSync(directory, { recursive: true });
      const key = deriveMachineKey();
      const encrypted = encryptToken(token, key);
      writeFileSync(filePath, encrypted, { mode: 0o600 });
    },
  };
}

export function createMemoryTokenStorage(): TokenStorage {
  let stored: string | null = null;
  return {
    backend: "memory",
    deleteRefreshToken: async () => {
      stored = null;
    },
    loadRefreshToken: async () => {
      return stored;
    },
    saveRefreshToken: async (token: string) => {
      stored = token;
    },
  };
}

// ---------------------------------------------------------------------------
// Keychain helpers (macOS `security` CLI; other platforms return null/throw)
// ---------------------------------------------------------------------------

async function readKeychainEntry(
  service: string,
  account: string,
): Promise<string | null> {
  if (platform() !== "darwin") return null;
  const { execFile } = await import("node:child_process");
  return new Promise(resolve => {
    execFile(
      "security",
      ["find-generic-password", "-s", service, "-a", account, "-w"],
      (error, stdout) => {
        if (error !== null) {
          resolve(null);
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

async function writeKeychainEntry(
  service: string,
  account: string,
  value: string,
): Promise<void> {
  if (platform() !== "darwin") {
    throw new Error("Keychain storage is only supported on macOS.");
  }
  const { execFile } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    execFile(
      "security",
      ["add-generic-password", "-s", service, "-a", account, "-w", value, "-U"],
      error => {
        if (error !== null) {
          reject(new Error("Failed to write to the keychain."));
          return;
        }
        resolve();
      },
    );
  });
}

async function deleteKeychainEntry(
  service: string,
  account: string,
): Promise<void> {
  if (platform() !== "darwin") return;
  const { execFile } = await import("node:child_process");
  return new Promise(resolve => {
    execFile(
      "security",
      ["delete-generic-password", "-s", service, "-a", account],
      () => resolve(),
    );
  });
}

// ---------------------------------------------------------------------------
// Encrypted file helpers (AES-256-GCM with a machine-bound key)
// ---------------------------------------------------------------------------

const ENCRYPTION_VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveMachineKey(): Buffer {
  const material = [
    hostname(),
    userInfo().username,
    platform(),
    homedir(),
  ].join("|");
  return createHash("sha256").update(material).digest();
}

function encryptToken(token: string, key: Buffer): Buffer {
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

function decryptToken(encrypted: Buffer, key: Buffer): string | null {
  if (encrypted.length < 1 + IV_LENGTH + TAG_LENGTH) return null;
  const version = encrypted[0];
  if (version !== ENCRYPTION_VERSION) return null;
  const iv = encrypted.subarray(1, 1 + IV_LENGTH);
  const tag = encrypted.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = encrypted.subarray(1 + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
