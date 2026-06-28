// @ts-nocheck
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  discoverImageFiles,
  parseWebpOptions,
  runWebpCommand,
} from "./webp.ts";

describe("images webp tooling", () => {
  it("discovers png/jpg/jpeg inputs with default and custom ignores", async () => {
    const workspaceRoot = await createWorkspace();

    try {
      await writeFixture(workspaceRoot, "apps/frontend/assets/hero.png");
      await writeFixture(workspaceRoot, "apps/frontend/assets/nested/photo.JPG");
      await writeFixture(workspaceRoot, "apps/frontend/assets/favicon.png");
      await writeFixture(workspaceRoot, "apps/frontend/assets/skip/ignored.jpeg");
      await writeFixture(workspaceRoot, "apps/frontend/assets/readme.txt");

      const options = parseWebpOptions([
        "--input",
        "apps/frontend/assets",
        "--ignore",
        "**/skip/**",
      ]).options;

      const files = await discoverImageFiles({ workspaceRoot, options });

      assert.deepEqual(
        files.map((file) => file.replace(`${workspaceRoot}/`, "")),
        ["apps/frontend/assets/hero.png", "apps/frontend/assets/nested/photo.JPG"],
      );
    } finally {
      await removeWorkspace(workspaceRoot);
    }
  });

  it("keeps originals by default and writes webp side-by-side", async () => {
    const workspaceRoot = await createWorkspace();
    const source = join(workspaceRoot, "apps/frontend/assets/hero.png");
    const output = join(workspaceRoot, "apps/frontend/assets/hero.webp");

    try {
      await mkdir(join(workspaceRoot, "apps/frontend/assets"), { recursive: true });
      await writeFile(source, await createPng());

      const exitCode = await runWebpCommand({
        workspaceRoot,
        argv: [
          "--input",
          "apps/frontend/assets",
          "--quality",
          "75",
          "--no-skip-larger",
        ],
      });

      assert.equal(exitCode, 0);
      assert.equal(existsSync(source), true);
      assert.equal(existsSync(output), true);
    } finally {
      await removeWorkspace(workspaceRoot);
    }
  });

  it("requires explicit replace mode before deleting originals", async () => {
    const workspaceRoot = await createWorkspace();
    const source = join(workspaceRoot, "apps/frontend/assets/delete-me.jpg");
    const output = join(workspaceRoot, "apps/frontend/assets/delete-me.webp");

    try {
      await mkdir(join(workspaceRoot, "apps/frontend/assets"), { recursive: true });
      await writeFile(source, await createJpeg());

      const exitCode = await runWebpCommand({
        workspaceRoot,
        argv: [
          "--input",
          "apps/frontend/assets",
          "--replace",
          "--no-skip-larger",
        ],
      });

      assert.equal(exitCode, 0);
      assert.equal(existsSync(source), false);
      assert.equal(existsSync(output), true);
    } finally {
      await removeWorkspace(workspaceRoot);
    }
  });
});

async function createWorkspace(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "webp-tooling-test-"));
}

async function removeWorkspace(workspaceRoot: string): Promise<void> {
  await rm(workspaceRoot, { force: true, recursive: true });
}

async function writeFixture(workspaceRoot: string, relativePath: string): Promise<void> {
  const filePath = join(workspaceRoot, relativePath);
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, "fixture");
}

async function createPng(): Promise<Buffer> {
  return await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function createJpeg(): Promise<Buffer> {
  return await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: { r: 0, g: 0, b: 255 },
    },
  })
    .jpeg()
    .toBuffer();
}
