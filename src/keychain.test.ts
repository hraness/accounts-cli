import { describe, expect, test } from "bun:test";

import { KeychainError, createKeychainTokenStorage, type SecurityRunner } from "./token-storage";

type Call = Readonly<{ args: readonly string[]; stdin: string | undefined }>;

// A fake `security` so no test touches a real keychain.
function fake(statuses: Readonly<Record<string, number>> = {}, stdout = ""): { calls: Call[]; run: SecurityRunner } {
  const calls: Call[] = [];
  return {
    calls,
    run: async (args, stdin) => {
      calls.push({ args, stdin });
      const verb = args[0] === "-i" ? (stdin ?? "").split(" ")[0]! : args[0]!;
      return { status: statuses[verb] ?? 0, stdout };
    },
  };
}

const TOKEN = "rt_Z3JlYXQtc2VjcmV0-with.dots_and~tildes";

describe("keychain writes keep the token out of argv", () => {
  test("the token travels hex-encoded on stdin to security -i, with a label and comment", async () => {
    const security = fake();
    const storage = createKeychainTokenStorage("ghostget", "default", { product: "Ghostget", runSecurity: security.run, platform: "darwin" });
    await storage.saveRefreshToken(TOKEN);
    expect(security.calls).toHaveLength(1);
    const [call] = security.calls;
    expect(call!.args).toEqual(["-i"]);
    expect(call!.args.join(" ")).not.toContain(TOKEN);
    const hex = Buffer.from(TOKEN, "utf8").toString("hex");
    expect(call!.stdin).toBe(
      `add-generic-password -U -s "ghostget" -a "default" -l "Ghostget sign-in" -j "Hraness Accounts refresh token for Ghostget. Delete it to sign out on this Mac." -X ${hex}\n`,
    );
    expect(call!.stdin).not.toContain(TOKEN);
  });

  test("names that could break the stdin command are refused up front", () => {
    for (const bad of ['a"b', "a\\b", "a\nb", ""]) {
      expect(() => createKeychainTokenStorage(bad, "default", { platform: "darwin" })).toThrow(TypeError);
      expect(() => createKeychainTokenStorage("svc", "default", { product: bad, platform: "darwin" })).toThrow(TypeError);
    }
  });

  test("a failed write is a typed error with one next step", async () => {
    for (const [status, code] of [[36, "keychain-locked"], [51, "keychain-denied"], [128, "keychain-denied"], [1, "keychain-write-failed"]] as const) {
      const storage = createKeychainTokenStorage("svc", "acct", { runSecurity: fake({ "add-generic-password": status }).run, platform: "darwin" });
      const error = await storage.saveRefreshToken(TOKEN).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(KeychainError);
      expect((error as KeychainError).code).toBe(code);
      expect((error as KeychainError).status).toBe(status);
      expect((error as KeychainError).message).not.toContain(TOKEN);
    }
  });
});

describe("keychain reads", () => {
  test("a stored token comes back without the trailing newline", async () => {
    const security = fake({}, `${TOKEN}\n`);
    const storage = createKeychainTokenStorage("svc", "acct", { runSecurity: security.run, platform: "darwin" });
    expect(await storage.loadRefreshToken()).toBe(TOKEN);
    expect(security.calls[0]!.args).toEqual(["find-generic-password", "-s", "svc", "-a", "acct", "-w"]);
  });

  test("only a missing item reads as signed out", async () => {
    const missing = createKeychainTokenStorage("svc", "acct", { runSecurity: fake({ "find-generic-password": 44 }).run, platform: "darwin" });
    expect(await missing.loadRefreshToken()).toBeNull();
    const locked = createKeychainTokenStorage("svc", "acct", { runSecurity: fake({ "find-generic-password": 36 }).run, platform: "darwin" });
    const error = await locked.loadRefreshToken().catch((caught: unknown) => caught) as KeychainError;
    expect(error.code).toBe("keychain-locked");
    expect(error.message).toBe("Your login keychain is locked.");
    expect(error.next).toBe("Unlock your login keychain, then try again.");
    const denied = createKeychainTokenStorage("svc", "acct", { runSecurity: fake({ "find-generic-password": 51 }).run, platform: "darwin" });
    expect((await denied.loadRefreshToken().catch((caught: unknown) => caught) as KeychainError).code).toBe("keychain-denied");
    const broken = createKeychainTokenStorage("svc", "acct", { runSecurity: fake({ "find-generic-password": -1 }).run, platform: "darwin" });
    expect((await broken.loadRefreshToken().catch((caught: unknown) => caught) as KeychainError).code).toBe("keychain-unavailable");
  });

  test("other platforms read null, refuse writes and never run security", async () => {
    const security = fake();
    const storage = createKeychainTokenStorage("svc", "acct", { runSecurity: security.run, platform: "linux" });
    expect(await storage.loadRefreshToken()).toBeNull();
    await storage.deleteRefreshToken();
    await expect(storage.saveRefreshToken(TOKEN)).rejects.toThrow("Keychain storage is only supported on macOS.");
    expect(security.calls).toHaveLength(0);
  });

  test("delete names the item without any secret; a missing item is already signed out", async () => {
    const security = fake({ "delete-generic-password": 44 });
    await createKeychainTokenStorage("svc", "acct", { runSecurity: security.run, platform: "darwin" }).deleteRefreshToken();
    expect(security.calls[0]!.args).toEqual(["delete-generic-password", "-s", "svc", "-a", "acct"]);
  });

  test("a delete that left the token in place throws instead of reporting sign-out", async () => {
    for (const [status, code] of [[36, "keychain-locked"], [51, "keychain-denied"], [128, "keychain-denied"], [2, "keychain-unavailable"]] as const) {
      const storage = createKeychainTokenStorage("svc", "acct", { runSecurity: fake({ "delete-generic-password": status }).run, platform: "darwin" });
      const error = await storage.deleteRefreshToken().catch((caught: unknown) => caught);
      expect((error as KeychainError).code).toBe(code);
    }
  });
});
