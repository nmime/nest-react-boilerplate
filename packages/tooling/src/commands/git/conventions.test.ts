// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { run } from "../../runtime/process.ts";
import { defaultGitConventionsConfig } from "./conventions-config.ts";
import {
  type CommitMetadata,
  type CommitStats,
  normalizeRange,
  runGitConventions,
  validateBranchName,
  validateCommit,
} from "./conventions.ts";

const validCommit: CommitMetadata = {
  hash: "abc1234",
  authorName: "nmime",
  authorEmail: "66474195+nmime@users.noreply.github.com",
  committerName: "nmime",
  committerEmail: "66474195+nmime@users.noreply.github.com",
  parents: ["parent"],
  message: "feat(auth): add passkey login",
};

function stats(files: Array<[path: string, insertions: number]>): CommitStats {
  return { files: files.map(([path, insertions]) => ({ path, insertions, deletions: 0 })) };
}

function sourceFiles(count: number, insertionsEach: number): CommitStats {
  return stats(Array.from({ length: count }, (_, index) => [`libs/backend/lib-${index}/src/index.ts`, insertionsEach]));
}

describe("git conventions", () => {
  it("audits all of HEAD when a force-push before SHA is unavailable", () => {
    const before = "a".repeat(40);
    assert.equal(normalizeRange(`${before}..HEAD`, () => false), "HEAD");
    assert.equal(normalizeRange(`${before}..HEAD`, () => true), `${before}..HEAD`);
    assert.equal(normalizeRange("origin/main..HEAD", () => false), "origin/main..HEAD");
  });

  it("accepts protected, typed, and Dependabot branches", () => {
    assert.deepEqual(validateBranchName("main"), []);
    assert.deepEqual(validateBranchName("feat/passkey-login"), []);
    assert.deepEqual(validateBranchName("hotfix/session-rotation"), []);
    assert.deepEqual(validateBranchName("dependabot/npm_and_yarn/nx-23"), []);
  });

  it("rejects agent prefixes and untyped branch names", () => {
    assert.notDeepEqual(validateBranchName("codex/passkey-login"), []);
    assert.notDeepEqual(validateBranchName("Claude/passkey-login"), []);
    assert.notDeepEqual(validateBranchName("feature/passkey-login"), []);
  });

  it("accepts owner, human contributor, and trusted bot Conventional Commits", () => {
    assert.deepEqual(validateCommit(validCommit), []);
    assert.deepEqual(
      validateCommit({ ...validCommit, message: "feat(api)!: remove legacy sessions" }),
      [],
    );
    assert.deepEqual(
      validateCommit({
        ...validCommit,
        authorName: "Ada Lovelace",
        authorEmail: "ada@example.com",
        committerName: "Grace Hopper",
        committerEmail: "grace@example.com",
        message: "fix(api): preserve contributor attribution\n\nCo-authored-by: Alan Turing <alan@example.com>",
      }),
      [],
    );
    assert.deepEqual(
      validateCommit({
        ...validCommit,
        authorName: "dependabot[bot]",
        authorEmail: "49699333+dependabot[bot]@users.noreply.github.com",
        committerName: "GitHub",
        committerEmail: "noreply@github.com",
        message: "chore(deps): update workspace dependencies",
      }),
      [],
    );
  });

  it("rejects commits above the configured file and insertion caps", () => {
    const failures = validateCommit({
      ...validCommit,
      message: "feat(backend): build shared service platform\n\nEvery backend common library at once.",
      stats: sourceFiles(120, 200),
    });

    assert.equal(failures.length, 2);
    assert.match(failures.join("\n"), /120 files/u);
    assert.match(failures.join("\n"), /24000 insertions/u);
  });

  it("keeps generated output out of the size caps and honours the bulk marker", () => {
    const generated = stats([
      ["libs/common/api-contracts/lib/src/generated/user-app-api.ts", 25223],
      ["libs/common/api-contracts/lib/src/index.ts", 4],
    ]);

    assert.deepEqual(
      validateCommit({
        ...validCommit,
        message: "feat(common): define cross-runtime contracts\n\nRegenerated from the auth contract.",
        stats: generated,
      }),
      [],
    );
    assert.deepEqual(
      validateCommit({
        ...validCommit,
        message: "refactor(repo): rename the session token type [bulk]\n\nMechanical rename across the workspace.",
        stats: sourceFiles(300, 40),
      }),
      [],
    );
  });

  it("requires a body once a commit passes the explanation threshold", () => {
    const large = { ...validCommit, stats: sourceFiles(25, 20) };

    assert.match(validateCommit(large).join("\n"), /must explain itself in a body/u);
    assert.deepEqual(
      validateCommit({ ...large, message: `${validCommit.message}\n\nPasskeys replace the SMS second factor.` }),
      [],
    );
    assert.deepEqual(validateCommit({ ...validCommit, stats: sourceFiles(2, 20) }), []);
  });

  it("caps the subject length", () => {
    const subject = `feat(auth): ${"a".repeat(80)}`;

    assert.match(validateCommit({ ...validCommit, message: subject }).join("\n"), /subject is \d+ characters/u);
  });

  it("rejects unexplained author/committer divergence", () => {
    const replayed = {
      ...validCommit,
      authorName: "Kim Sergey",
      authorEmail: "149961164+segega-k@users.noreply.github.com",
    };

    assert.match(validateCommit(replayed).join("\n"), /author .* differs from committer/u);
    // Same account, different local git user.name — what .mailmap exists to normalise.
    assert.deepEqual(validateCommit({ ...validCommit, committerName: "NMI" }), []);
    assert.deepEqual(
      validateCommit({
        ...replayed,
        message: `${validCommit.message}\n\nCo-authored-by: Kim Sergey <149961164+segega-k@users.noreply.github.com>`,
      }),
      [],
    );
  });

  it("flags a divergent identity whose dates never moved when the product opts in", () => {
    const config = defaultGitConventionsConfig();
    config.identity.flagIdenticalDatesOnDivergence = true;
    const replayed: CommitMetadata = {
      ...validCommit,
      authorName: "Kim Sergey",
      authorEmail: "149961164+segega-k@users.noreply.github.com",
      authorDate: "2026-08-09T09:00:00+05:00",
      committerDate: "2026-08-09T09:00:00+05:00",
      message: `${validCommit.message}\n\nCo-authored-by: Kim Sergey <149961164+segega-k@users.noreply.github.com>`,
    };

    assert.match(validateCommit(replayed, config).join("\n"), /author and committer dates are identical/u);
    assert.deepEqual(
      validateCommit({ ...replayed, committerDate: "2026-08-09T09:00:04+05:00" }, config),
      [],
    );
    assert.deepEqual(validateCommit(replayed), []);
  });

  it("rejects generated output shipped without the source that produced it", () => {
    const generatedOnly = {
      ...validCommit,
      message: "feat(common): define cross-runtime contracts",
      stats: stats([["libs/common/api-contracts/lib/src/generated/user-app-api.ts", 25223]]),
    };

    assert.match(validateCommit(generatedOnly).join("\n"), /generated .* without any source change/u);
    assert.deepEqual(
      validateCommit({ ...generatedOnly, message: "chore(api): refresh generated clients [regenerate]" }),
      [],
    );
  });

  it("reports diff-shape and per-commit buildability failures for a real range", () => {
    const root = mkdtempSync(join(tmpdir(), "nrb-git-conventions-"));
    const log = console.log;
    const printed: string[] = [];
    try {
      const git = (args: string[]): void => {
        const result = run("git", args, { cwd: root });
        if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
      };
      const write = (path: string, content: string): void => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), content);
      };

      git(["init", "--initial-branch=main"]);
      git(["config", "user.email", "owner@example.com"]);
      git(["config", "user.name", "owner"]);
      write("package.json", "{}");
      git(["add", "."]);
      git(["commit", "-m", "chore(repository): establish workspace foundation"]);
      const base = run("git", ["rev-parse", "HEAD"], { cwd: root }).stdout.trim();

      git(["checkout", "-b", "feat/replayed-history"]);
      write("pnpm-lock.yaml", ["importers:", "", "  .:", "    dependencies: {}", "", "  libs/backend:", "    dependencies: {}", ""].join("\n"));
      write("tsconfig.base.json", "{}");
      for (let index = 0; index < 30; index += 1) {
        write(`libs/backend/lib-${index}/src/index.ts`, "export const value = 1;\n");
      }
      git(["add", "."]);
      git(["commit", "-m", "feat(backend): build shared service platform"]);

      console.log = (message: string) => void printed.push(message);
      const status = runGitConventions({
        argv: ["--branch", "feat/replayed-history", "--range", `${base}..HEAD`],
        workspaceRoot: root,
      });
      console.log = log;

      assert.equal(status, 1);
      const report = JSON.parse(printed.join("\n")) as { commitCount: number; failures: string[] };
      assert.equal(report.commitCount, 1);
      assert.match(report.failures.join("\n"), /must explain itself in a body/u);
      assert.match(report.failures.join("\n"), /libs\/backend\/package\.json is missing/u);
    } finally {
      console.log = log;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects assistant attribution, merges, malformed subjects, and assistant trailers", () => {
    const failures = validateCommit({
      ...validCommit,
      authorName: "Claude Agent",
      authorEmail: "agent@claude.example",
      parents: ["left", "right"],
      message: "Add passkey login\n\nCo-authored-by: Codex <agent@openai.example>",
    });

    assert.equal(failures.length, 4);
  });
});
