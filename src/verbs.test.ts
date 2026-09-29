import { describe, expect, test } from "bun:test";
import { HranessError, defineRegistry, runCli } from "@hraness/desktop-foundation/registry";

import { accountStatus, accountVerbs, type AccountState } from "./verbs";

function capture() {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdout: { write: (text: string) => { stdout += text; } },
      stderr: { write: (text: string) => { stderr += text; } },
      env: { HRANESS_AUDIENCE: "human" },
    },
    out: () => stdout,
    err: () => stderr,
  };
}

function registry(state: AccountState, signOut: () => Promise<void> = async () => {}) {
  return defineRegistry("ghostget", [
    ...accountVerbs({
      product: "ghostget",
      displayName: "Ghostget",
      signInCommand: "ghostget login",
      readState: async () => state,
      signOut,
      usageError: (message) => new HranessError("usage", message),
    }),
  ]);
}

describe("accountStatus", () => {
  test("signed out and expired name the sign-in command", () => {
    expect(accountStatus({ kind: "signedOut" }, "ghostget login")).toEqual({ state: "signedOut", signIn: "ghostget login" });
    expect(accountStatus({ kind: "expired" }, "ghostget login")).toEqual({ state: "expired", detail: "Your sign-in expired.", signIn: "ghostget login" });
  });
  test("a locked keychain is a state of its own, never signed out", () => {
    expect(accountStatus({ kind: "locked" }, "ghostget login")).toEqual({ state: "locked", detail: "The keychain is locked. Unlock it to use your sign-in." });
  });
  test("signed in carries the account without control characters", () => {
    expect(accountStatus({ kind: "signedIn", account: "ben@example.com" }, "x")).toEqual({ state: "signedIn", account: "ben@example.com" });
    expect(accountStatus({ kind: "signedIn", account: "a\u001b[31mb" }, "x")).toEqual({ state: "signedIn", account: "a [31mb" });
    expect(accountStatus({ kind: "signedIn", account: "\u0007" }, "x")).toEqual({ state: "signedIn" });
    expect(accountStatus({ kind: "signedIn" }, "x")).toEqual({ state: "signedIn" });
  });
});

describe("accountVerbs in a desktop-foundation registry", () => {
  test("commands --json lists account status as read and signout as operate", async () => {
    const c = capture();
    expect(await runCli(registry({ kind: "signedOut" }), ["commands", "--json"], c.io)).toBe(0);
    const verbs = (JSON.parse(c.out()) as { data: { verbs: { path: string[]; opClass: string; schema: string }[] } }).data.verbs;
    expect(verbs.map(verb => [verb.path.join(" "), verb.opClass, verb.schema])).toEqual([
      ["account status", "read", "ghostget.account/1"],
      ["account signout", "operate", "ghostget.account-signout/1"],
    ]);
  });

  test("account status --json prints one envelope", async () => {
    const c = capture();
    expect(await runCli(registry({ kind: "expired" }), ["account", "status", "--json"], c.io)).toBe(0);
    const envelope = JSON.parse(c.out()) as { ok: boolean; schema: string; data: unknown };
    expect(envelope.ok).toBe(true);
    expect(envelope.schema).toBe("ghostget.account/1");
    expect(envelope.data).toEqual({ state: "expired", detail: "Your sign-in expired.", signIn: "ghostget login" });
  });

  test("people get one sentence and the next step", async () => {
    const c = capture();
    expect(await runCli(registry({ kind: "signedIn", account: "ben@example.com" }), ["account", "status"], c.io)).toBe(0);
    expect(c.out()).toBe("Signed in to Ghostget as ben@example.com.\n");
    const d = capture();
    await runCli(registry({ kind: "signedOut" }), ["account", "status"], d.io);
    expect(d.out()).toBe("Signed out of Ghostget.\nNext: ghostget login\n");
  });

  test("account signout forgets the sign-in once", async () => {
    let calls = 0;
    const c = capture();
    expect(await runCli(registry({ kind: "signedIn" }, async () => { calls += 1; }), ["account", "signout", "--json"], c.io)).toBe(0);
    expect(calls).toBe(1);
    expect((JSON.parse(c.out()) as { data: unknown }).data).toEqual({ signedOut: true });
  });

  test("a failed sign-out is an error, never a reported sign-out", async () => {
    const c = capture();
    const code = await runCli(registry({ kind: "signedIn" }, async () => { throw new Error("keychain locked"); }), ["account", "signout", "--json"], c.io);
    expect(code).not.toBe(0);
    expect((JSON.parse(c.out()) as { ok: boolean }).ok).toBe(false);
  });

  test("extra arguments are a usage error", async () => {
    const c = capture();
    expect(await runCli(registry({ kind: "signedOut" }), ["account", "status", "extra", "--json"], c.io)).toBe(2);
    expect((JSON.parse(c.out()) as { error: { code: string } }).error.code).toBe("usage");
  });

  test("extra arguments to signout are a usage error too, and nothing is signed out", async () => {
    const c = capture();
    let signedOut = false;
    const code = await runCli(registry({ kind: "signedIn" }, async () => { signedOut = true; }), ["account", "signout", "extra", "--json"], c.io);
    expect(code).toBe(2);
    expect((JSON.parse(c.out()) as { error: { code: string } }).error.code).toBe("usage");
    expect(signedOut).toBe(false);
  });

  test("invalid options are refused", () => {
    const base = {
      signInCommand: "x login",
      readState: async () => ({ kind: "signedOut" as const }),
      signOut: async () => {},
      usageError: (message: string) => new HranessError("usage", message),
    };
    expect(() => accountVerbs({ ...base, product: "Ghostget" })).toThrow(TypeError);
    expect(() => accountVerbs({ ...base, product: "ghostget", signInCommand: "" })).toThrow(TypeError);
  });

  test("usageError is required, so extra arguments can never surface as internal (exit 1)", () => {
    const { usageError: _omitted, ...withoutUsageError } = {
      product: "ghostget",
      signInCommand: "ghostget login",
      readState: async () => ({ kind: "signedOut" as const }),
      signOut: async () => {},
      usageError: (message: string) => new HranessError("usage", message),
    };
    void _omitted;
    // @ts-expect-error usageError is a required option.
    expect(() => accountVerbs(withoutUsageError)).toThrow(/usageError is required/u);
  });
});
