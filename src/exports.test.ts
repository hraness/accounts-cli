import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import * as accountsCli from "./index";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { readonly version: string };

describe("public API", () => {
  test("exports the account registry verbs, not the retired menu rows", () => {
    expect(typeof accountsCli.accountVerbs).toBe("function");
    expect(typeof accountsCli.accountStatus).toBe("function");
    expect("accountMenuItems" in accountsCli).toBe(false);
  });

  test("the version that dropped accountMenuItems is a new minor, not v0.2.0", () => {
    // v0.2.0 exported accountMenuItems; a build without it must not claim that version.
    const [major, minor] = manifest.version.split(".").map(Number);
    expect(major === 0 ? (minor ?? 0) >= 3 : (major ?? 0) >= 1).toBe(true);
  });
});
