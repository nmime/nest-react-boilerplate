// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CommandContext } from "../../cli.js";
import type { RunResult } from "../../runtime/process.js";
import {
  buildUiRegistryAddCliArgs,
  buildUiRegistrySearchCliArgs,
  findExistingRegistryItem,
  parseUiRegistryAddArgs,
  parseUiRegistrySearchArgs,
  qualifyRegistryItems,
  runUiRegistryAddCommand,
  shadcnComponentDirectory,
  shadcnWorkspaceDirectory,
  validateRegistryDryRunOutput,
} from "./shadcn-add.js";

const workspaceRoot = "/workspace";

function context(argv: string[]): CommandContext {
  return { argv, packageRoot: "/workspace/packages/tooling", workspaceRoot };
}

function result(stdout = "", status = 0): RunResult {
  return { command: "shadcn", status, stderr: "", stdout };
}

describe("UI registry argument policy", () => {
  it("keeps the shadcn-specific command dry-run first", () => {
    const parsed = parseUiRegistryAddArgs(["accordion", "dialog"], "shadcn");

    assert.equal(parsed.apply, false);
    assert.equal(parsed.dryRun, true);
    assert.deepEqual(
      buildUiRegistryAddCliArgs({ ...parsed, workspaceRoot }),
      [
        "add",
        "accordion",
        "dialog",
        "--yes",
        "--cwd",
        `${workspaceRoot}/${shadcnWorkspaceDirectory}`,
        "--path",
        shadcnComponentDirectory,
        "--dry-run",
      ],
    );
  });

  it("qualifies only explicitly selected free source registries", () => {
    assert.deepEqual(qualifyRegistryItems("shadcn", ["button"]), ["button"]);
    assert.deepEqual(qualifyRegistryItems("magicui", ["ripple"]), ["@magicui/ripple"]);
    assert.deepEqual(qualifyRegistryItems("aceternity", ["spotlight"]), ["@aceternity/spotlight"]);
  });

  it("requires an explicit source and rejects URLs, namespaces, path overrides, and paid sources", () => {
    assert.match(parseUiRegistryAddArgs(["dialog"]).error ?? "", /explicit registry/);
    assert.match(parseUiRegistryAddArgs(["--source", "magicui-pro", "hero"]).error ?? "", /must be one of/);
    assert.match(parseUiRegistryAddArgs(["--source", "magicui", "https:\/\/example.test\/item"]).error ?? "", /Unsupported registry item/);
    assert.match(parseUiRegistryAddArgs(["--source", "magicui", "@magicui\/ripple"]).error ?? "", /Unsupported registry item/);
    assert.match(parseUiRegistryAddArgs(["--source", "magicui", "ripple", "--path"]).error ?? "", /Unsupported/);
  });

  it("allows reviewed Magic UI writes but keeps Aceternity preview non-persistent", () => {
    const magic = parseUiRegistryAddArgs(["--source", "magicui", "ripple", "--apply"]);
    assert.equal(magic.error, undefined);
    assert.equal(magic.apply, true);
    const aceternityPreview = parseUiRegistryAddArgs(["--source", "aceternity", "spotlight", "--view"]);
    assert.equal(aceternityPreview.error, undefined);
    assert.equal(aceternityPreview.apply, false);
    assert.equal(aceternityPreview.dryRun, true);
    assert.equal(aceternityPreview.view, true);
    const aceternityApplyError = parseUiRegistryAddArgs([
      "--source",
      "aceternity",
      "spotlight",
      "--apply",
    ]).error;
    assert.match(aceternityApplyError ?? "", /never applies or distributes Aceternity source/);
    assert.match(aceternityApplyError ?? "", /downstream product owner/);
    assert.match(parseUiRegistryAddArgs(["--source", "magicui", "ripple", "--overwrite"]).error ?? "", /requires --apply/);
  });

  it("builds a bounded registry search command", () => {
    const parsed = parseUiRegistrySearchArgs([
      "--source",
      "magicui",
      "--query",
      "text effect",
      "--type",
      "ui",
      "--limit",
      "12",
      "--offset",
      "2",
    ]);
    assert.deepEqual(
      buildUiRegistrySearchCliArgs({ ...parsed, workspaceRoot }),
      [
        "search",
        "@magicui",
        "--cwd",
        `${workspaceRoot}/${shadcnWorkspaceDirectory}`,
        "--limit",
        "12",
        "--offset",
        "2",
        "--query",
        "text effect",
        "--type",
        "ui",
      ],
    );
    assert.match(parseUiRegistrySearchArgs(["--source", "magicui", "--limit", "101"]).error ?? "", /between 1 and 100/);
  });
});

describe("UI registry write confinement", () => {
  it("detects an existing canonical component before a write", () => {
    const expected = `${workspaceRoot}/libs/frontend/ui-web/lib/src/component/ripple.tsx`;
    assert.equal(findExistingRegistryItem(workspaceRoot, ["ripple"], (path) => path === expected), expected);
    assert.equal(findExistingRegistryItem(workspaceRoot, ["new-effect"], () => false), undefined);
  });

  it("accepts canonical component, token CSS, and frontend package targets", () => {
    assert.deepEqual(
      validateRegistryDryRunOutput(`
│ + ui-web/lib/src/component/ripple.tsx  create
├ ui-web/lib/src/component/orbiting-circles.tsx (create) 84 lines
│ ~ ui-web/lib/src/styles.css  update
│ ~ package.json  update
`),
      [],
    );
  });

  it("rejects app-local, generic components/ui, and unverifiable targets", () => {
    const unsafe = validateRegistryDryRunOutput(`│ + components/ui/spotlight.tsx  create\n`);
    assert.equal(unsafe.length, 1);
    assert.match(unsafe[0] ?? "", /only ui-web\/lib\/src\/component/);
    assert.match(
      validateRegistryDryRunOutput(`│ + ui-web/lib/src/component/../../outside.tsx  create\n`)[0] ?? "",
      /only ui-web\/lib\/src\/component/,
    );
    assert.match(validateRegistryDryRunOutput("No parseable paths")[0] ?? "", /unverifiable write set/);
  });

  it("requires explicit overwrite review for existing source and never allows deletes", () => {
    const update = `│ ~ ui-web/lib/src/component/ripple.tsx  update\n`;
    assert.match(validateRegistryDryRunOutput(update)[0] ?? "", /--apply --overwrite/);
    assert.deepEqual(validateRegistryDryRunOutput(update, true), []);
    assert.match(validateRegistryDryRunOutput(`│ - ui-web/lib/src/component/ripple.tsx  delete\n`, true)[0] ?? "", /may not delete/);
  });

  it("runs a source-visible dry-run preflight before applying", () => {
    const calls: Array<{ args: string[]; stdio: unknown }> = [];
    const status = runUiRegistryAddCommand(
      context(["--source", "magicui", "ripple", "--apply"]),
      (_command, args = [], options = {}) => {
        calls.push({ args, stdio: options.stdio });
        if (args.includes("--dry-run")) {
          return result("│ + ui-web/lib/src/component/ripple.tsx  create\n");
        }
        return result();
      },
      () => true,
      () => false,
    );

    assert.equal(status, 0);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.stdio, "pipe");
    assert.ok(calls[0]?.args.includes("--dry-run"));
    assert.ok(calls[0]?.args.includes("--view"));
    assert.equal(calls[1]?.stdio, "inherit");
    assert.equal(calls[1]?.args.includes("--dry-run"), false);
  });

  it("fails closed when a registry bypasses the canonical write path", () => {
    let calls = 0;
    const status = runUiRegistryAddCommand(
      context(["--source", "magicui", "ripple", "--apply"]),
      () => {
        calls += 1;
        return result("│ + components/ui/ripple.tsx  create\n");
      },
      () => true,
      () => false,
    );

    assert.equal(status, 1);
    assert.equal(calls, 1);
  });

  it("refuses a duplicate before running the CLI", () => {
    let called = false;
    const status = runUiRegistryAddCommand(
      context(["--source", "magicui", "ripple", "--apply"]),
      () => {
        called = true;
        return result();
      },
      () => true,
      (path) => path.endsWith("/ripple.tsx"),
    );
    assert.equal(status, 1);
    assert.equal(called, false);
  });
});
