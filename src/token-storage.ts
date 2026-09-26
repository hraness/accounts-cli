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

/** Why a keychain read or write failed. `null` from a read means no item, never one of these. */
export type KeychainErrorCode =
  | "keychain-locked"
  | "keychain-denied"
  | "keychain-unavailable"
  | "keychain-write-failed";

/**
 * A keychain failure that is not "signed out". `message` is one sentence a
 * product can print as is; `next` is the one thing the person can do.
 */
export class KeychainError extends Error {
  readonly code: KeychainErrorCode;
  readonly next: string;
  /** The `security` exit status, when there was one. */
  readonly status: number | null;
  constructor(code: KeychainErrorCode, message: string, next: string, status: number | null) {
    super(message);
    this.name = "KeychainError";
    this.code = code;
    this.next = next;
    this.status = status;
  }
}

/** Runs `/usr/bin/security` with arguments and optional stdin. Injected by tests. */
export type SecurityRunner = (
  args: readonly string[],
  stdin?: string,
) => Promise<Readonly<{ status: number; stdout: string }>>;

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

// security(1) exit statuses are the low byte of the OSStatus.
const ITEM_NOT_FOUND = 44; // errSecItemNotFound (-25300)
const INTERACTION_NOT_ALLOWED = 36; // errSecInteractionNotAllowed (-25308): locked, no UI
const AUTH_FAILED = 51; // errSecAuthFailed (-25293): wrong password or denied
const USER_CANCELED = 128; // userCanceledErr (-128)

/**
 * Refresh-token storage in the macOS login keychain through `security`. The
 * token never appears in a process argument list: writes go through
 * `security -i` on stdin with the value hex-encoded (`-X`).
 */
export function createKeychainTokenStorage(
  serviceName: string,
  accountName: string,
  options: KeychainTokenStorageOptions = {},
): TokenStorage {
  const product = options.product ?? serviceName;
  const label = options.label ?? `${product} sign-in`;
  const comment = options.comment
    ?? `Hraness Accounts refresh token for ${product}. Delete it to sign out on this Mac.`;
  for (const value of [serviceName, accountName, product, label, comment]) {
    if (!keychainText(value)) throw new TypeError("Keychain names must be 1 to 255 characters with no quotes, backslashes or control characters.");
  }
  const run = options.runSecurity ?? runSecurity;
  const onMac = (options.platform ?? platform()) === "darwin";
  return {
    backend: "keychain",
    deleteRefreshToken: async () => {
      if (!onMac) return;
      await run(["delete-generic-password", "-s", serviceName, "-a", accountName]);
    },
    loadRefreshToken: async () => {
      if (!onMac) return null;
      const result = await run(["find-generic-password", "-s", serviceName, "-a", accountName, "-w"]);
      if (result.status === 0) return result.stdout.replace(/\r?\n$/u, "");
      if (result.status === ITEM_NOT_FOUND) return null;
      throw readError(result.status);
    },
    saveRefreshToken: async (token: string) => {
      if (!onMac) throw new Error("Keychain storage is only supported on macOS.");
      if (token.length === 0) throw new TypeError("The refresh token is empty.");
      const hex = Buffer.from(token, "utf8").toString("hex");
      const command = ["add-generic-password", "-U", "-s", quote(serviceName), "-a", quote(accountName),
        "-l", quote(label), "-j", quote(comment), "-X", hex].join(" ");
      const result = await run(["-i"], `${command}\n`);
      if (result.status !== 0) throw writeError(result.status);
    },
  };
}

function keychainText(value: string): boolean {
  return value.length > 0 && value.length <= 255 && !/["\\\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value);
}

function quote(value: string): string {
  return `"${value}"`;
}

function readError(status: number): KeychainError {
  if (status === INTERACTION_NOT_ALLOWED) {
    return new KeychainError("keychain-locked", "Your login keychain is locked.", "Unlock your login keychain, then try again.", status);
  }
  if (status === AUTH_FAILED || status === USER_CANCELED) {
    return new KeychainError("keychain-denied", "Keychain access to your sign-in was denied.", "Try again and choose Allow when macOS asks.", status);
  }
  return new KeychainError("keychain-unavailable", "Couldn't read your sign-in from the keychain.", "Open Keychain Access and check that your login keychain is available, then try again.", status);
}

function writeError(status: number): KeychainError {
  if (status === INTERACTION_NOT_ALLOWED) {
    return new KeychainError("keychain-locked", "Your login keychain is locked, so the sign-in wasn't saved.", "Unlock your login keychain, then sign in again.", status);
  }
  if (status === AUTH_FAILED || status === USER_CANCELED) {
    return new KeychainError("keychain-denied", "Keychain access was denied, so the sign-in wasn't saved.", "Sign in again and choose Allow when macOS asks.", status);
  }
  return new KeychainError("keychain-write-failed", "Couldn't save the sign-in to your keychain.", "Sign in again. If it keeps failing, check your login keychain in Keychain Access.", status);
}

const runSecurity: SecurityRunner = async (args, stdin) => {
  const { spawn } = await import("node:child_process");
  return await new Promise(resolve => {
    let stdout = "";
    let settled = false;
    const finish = (status: number) => {
      if (settled) return;
      settled = true;
      resolve({ status, stdout });
    };
    const child = spawn("/usr/bin/security", [...args], { stdio: ["pipe", "pipe", "ignore"] });
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.on("error", () => finish(-1));
    child.on("close", code => finish(code ?? -1));
    child.stdin.on("error", () => { /* reported through the exit status */ });
    child.stdin.end(stdin ?? "");
  });
};

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
