import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const repositoryRoot = new URL("../", import.meta.url);
const readme = readFileSync(new URL("README.md", repositoryRoot), "utf8");
const manifest = JSON.parse(readFileSync(new URL("package.json", repositoryRoot), "utf8")) as {
  readonly version: string;
  readonly dependencies: Readonly<Record<string, string>>;
};

describe("README facts", () => {
  test("pins the current release tag in the install snippet", () => {
    expect(readme).toContain(`github:hraness/accounts-cli#v${manifest.version}`);
    for (const match of readme.matchAll(/github:hraness\/accounts-cli#v(\d+\.\d+\.\d+)/gu)) {
      expect(match[1], "README pins a tag that is not the package version").toBe(manifest.version);
    }
  });

  test("names the suite-accounts release this package depends on", () => {
    const dependency = manifest.dependencies["@hraness/suite-accounts"];
    const tag = /#(v\d+\.\d+\.\d+)$/u.exec(dependency ?? "")?.[1];
    expect(tag, "package.json must pin @hraness/suite-accounts to a release tag").toBeDefined();
    expect(readme).toContain(`\`@hraness/suite-accounts\` ${tag}`);
    for (const match of readme.matchAll(/`@hraness\/suite-accounts` (v\d+\.\d+\.\d+)/gu)) {
      expect(match[1], "README names a suite-accounts release the package does not use").toBe(tag);
    }
  });
});
