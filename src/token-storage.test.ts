import { describe, expect, test } from "bun:test";

import {
  createEncryptedFileTokenStorage,
  createMemoryTokenStorage,
} from "./token-storage";

describe("memory token storage", () => {
  test("saves and loads a refresh token", async () => {
    const storage = createMemoryTokenStorage();
    await storage.saveRefreshToken("test-token-123");
    expect(await storage.loadRefreshToken()).toBe("test-token-123");
  });

  test("deletes a refresh token", async () => {
    const storage = createMemoryTokenStorage();
    await storage.saveRefreshToken("test-token-123");
    await storage.deleteRefreshToken();
    expect(await storage.loadRefreshToken()).toBeNull();
  });

  test("returns null when empty", async () => {
    const storage = createMemoryTokenStorage();
    expect(await storage.loadRefreshToken()).toBeNull();
  });
});

describe("encrypted file token storage", () => {
  const testFile = "/tmp/accounts-cli-test-token.bin";

  test("saves and loads a refresh token", async () => {
    const storage = createEncryptedFileTokenStorage(testFile);
    await storage.saveRefreshToken("test-token-456");
    expect(await storage.loadRefreshToken()).toBe("test-token-456");
    await storage.deleteRefreshToken();
  });

  test("returns null when file does not exist", async () => {
    const storage = createEncryptedFileTokenStorage("/tmp/nonexistent-token.bin");
    expect(await storage.loadRefreshToken()).toBeNull();
  });

  test("deletes a refresh token", async () => {
    const storage = createEncryptedFileTokenStorage(testFile);
    await storage.saveRefreshToken("test-token-789");
    await storage.deleteRefreshToken();
    expect(await storage.loadRefreshToken()).toBeNull();
  });
});
