/**
 * Tests for the application generator.
 *
 * UNIT: name validation, duplicate detection, option defaults
 * COMPONENT: generator + tree integration (skeleton files)
 * E2E: full backend + frontend app generation on in-memory tree
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

async function createTree() {
  const { createTreeWithEmptyWorkspace } = await import("nx/src/devkit-testing-exports");
  return createTreeWithEmptyWorkspace();
}

describe("application generator", () => {
  // -----------------------------------------------------------------------
  // UNIT: validation
  // -----------------------------------------------------------------------

  describe("name validation", () => {
    it("rejects empty name", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");
      await assert.rejects(
        () => applicationGenerator(tree, { name: "", kind: "backend" }),
        /Name must not be empty/
      );
    });

    it("rejects whitespace-only name", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");
      await assert.rejects(
        () => applicationGenerator(tree, { name: "   ", kind: "backend" }),
        /Name must not be empty/
      );
    });

    it("rejects invalid kind", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");
      await assert.rejects(
        // @ts-expect-error testing invalid kind
        () => applicationGenerator(tree, { name: "my-app", kind: "mobile" }),
        /Unsupported application kind/
      );
    });
  });

  // -----------------------------------------------------------------------
  // COMPONENT: duplicate detection
  // -----------------------------------------------------------------------

  describe("duplicate detection", () => {
    it("rejects duplicate app name", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      // First generation succeeds
      await applicationGenerator(tree, { name: "test-app", kind: "backend", skipFormat: true });

      // Second generation should fail
      await assert.rejects(
        () => applicationGenerator(tree, { name: "test-app", kind: "backend", skipFormat: true }),
        /already exists/
      );
    });
  });

  // -----------------------------------------------------------------------
  // E2E: backend application generation
  // -----------------------------------------------------------------------

  describe("backend application", () => {
    it("creates project.json with correct structure", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "my-api", kind: "backend", skipFormat: true });

      const projectJson = JSON.parse(tree.read("apps/backend/my/my-api/project.json", "utf8")!);
      assert.equal(projectJson.name, "my-api");
      assert.equal(projectJson.projectType, "application");
      assert.ok(projectJson.tags.includes("platform:backend"));
      assert.ok(projectJson.tags.includes("type:backend-app"));
      assert.ok(projectJson.targets.build);
      assert.equal(projectJson.targets.build.executor, "@nx/js:tsc");
    });

    it("creates package.json", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "my-api", kind: "backend", skipFormat: true });

      const pkg = JSON.parse(tree.read("apps/backend/my/my-api/package.json", "utf8")!);
      assert.equal(pkg.name, "@app/my-api");
      assert.ok(pkg.dependencies.tslib);
    });

    it("creates tsconfig files", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "my-api", kind: "backend", skipFormat: true });

      assert.ok(tree.exists("apps/backend/my/my-api/tsconfig.json"));
      assert.ok(tree.exists("apps/backend/my/my-api/tsconfig.app.json"));
      assert.ok(tree.exists("apps/backend/my/my-api/tsconfig.spec.json"));
    });

    it("creates source files", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "my-api", kind: "backend", skipFormat: true });

      assert.ok(tree.exists("apps/backend/my/my-api/src/main.ts"));
      assert.ok(tree.exists("apps/backend/my/my-api/src/my-api.module.ts"));
      assert.ok(tree.exists("apps/backend/my/my-api/src/my-api.module.spec.ts"));

      const mainContent = tree.read("apps/backend/my/my-api/src/main.ts", "utf8")!;
      assert.ok(mainContent.includes("MyApiModule"));
      assert.ok(mainContent.includes("void bootstrap()"), "main.ts must use void bootstrap() to avoid floating promise");
    });

    it("main.ts has no unhandled-floating-promise lint errors", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "my-api", kind: "backend", skipFormat: true });

      const mainContent = tree.read("apps/backend/my/my-api/src/main.ts", "utf8")!;
      // Must use void keyword for async call
      assert.ok(/\bvoid\s+bootstrap/.test(mainContent), "bootstrap call must be void'd");
    });

    it("spec file imports vitest explicitly", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "my-api", kind: "backend", skipFormat: true });

      const specContent = tree.read("apps/backend/my/my-api/src/my-api.module.spec.ts", "utf8")!;
      assert.ok(specContent.includes('from "vitest"'), "spec must import from vitest, not use globals");
      assert.ok(specContent.includes("describe"), "must import describe");
      assert.ok(specContent.includes("it"), "must import it");
      assert.ok(specContent.includes("expect"), "must import expect");
    });

    it("eslint config has proper ignores and parserOptions", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "my-api", kind: "backend", skipFormat: true });

      const eslintContent = tree.read("apps/backend/my/my-api/eslint.config.cjs", "utf8")!;
      assert.ok(eslintContent.includes("ignores:"), "eslint must have ignores array");
      assert.ok(eslintContent.includes("tsconfig.*?.json"), "eslint must have tsconfig.*?.json project");
    });

    it("package.json has no unused Nest dependencies", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "my-api", kind: "backend", skipFormat: true });

      const pkg = JSON.parse(tree.read("apps/backend/my/my-api/package.json", "utf8")!);
      assert.ok(!pkg.dependencies["@nestjs/common"], "should not list @nestjs/common in deps (comes via workspace)");
      assert.ok(!pkg.dependencies["@nestjs/platform-express"], "should not list @nestjs/platform-express");
      assert.ok(!pkg.dependencies["reflect-metadata"], "should not list reflect-metadata");
      assert.ok(!pkg.dependencies["rxjs"], "should not list rxjs");
    });

    it("creates vitest config", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "my-api", kind: "backend", skipFormat: true });

      assert.ok(tree.exists("apps/backend/my/my-api/vitest.config.mts"));
    });

    it("accepts custom directory", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, {
        name: "my-api",
        kind: "backend",
        directory: "apps/custom/my-api",
        skipFormat: true,
      });

      assert.ok(tree.exists("apps/custom/my-api/project.json"));
    });

    it("accepts custom tags", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, {
        name: "my-api",
        kind: "backend",
        tags: "custom:tag,another:tag",
        skipFormat: true,
      });

      const projectJson = JSON.parse(tree.read("apps/backend/my/my-api/project.json", "utf8")!);
      assert.ok(projectJson.tags.includes("custom:tag"));
      assert.ok(projectJson.tags.includes("another:tag"));
    });

    it("generates multi-word app names correctly", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "Support Ticket API", kind: "backend", skipFormat: true });

      assert.ok(tree.exists("apps/backend/support/support-ticket-api/project.json"));
      const projectJson = JSON.parse(tree.read("apps/backend/support/support-ticket-api/project.json", "utf8")!);
      assert.equal(projectJson.name, "support-ticket-api");
    });
  });

  // -----------------------------------------------------------------------
  // E2E: frontend application generation
  // -----------------------------------------------------------------------

  describe("frontend application", () => {
    it("creates project.json with correct structure", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "my-dashboard", kind: "frontend", skipFormat: true });

      const projectJson = JSON.parse(tree.read("apps/frontend/my-dashboard/project.json", "utf8")!);
      assert.equal(projectJson.name, "my-dashboard");
      assert.equal(projectJson.projectType, "application");
      assert.ok(projectJson.tags.includes("platform:frontend"));
      assert.ok(projectJson.tags.includes("type:frontend-app"));
      assert.ok(projectJson.tags.includes("fsd:layer:app"));
    });

    it("creates package.json", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "my-dashboard", kind: "frontend", skipFormat: true });

      const pkg = JSON.parse(tree.read("apps/frontend/my-dashboard/package.json", "utf8")!);
      assert.equal(pkg.name, "@app/my-dashboard");
      assert.ok(pkg.dependencies.react);
    });

    it("creates index.html", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "my-dashboard", kind: "frontend", skipFormat: true });

      assert.ok(tree.exists("apps/frontend/my-dashboard/index.html"));
      const html = tree.read("apps/frontend/my-dashboard/index.html", "utf8")!;
      assert.ok(html.includes("My Dashboard"));
    });

    it("creates source files", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "my-dashboard", kind: "frontend", skipFormat: true });

      assert.ok(tree.exists("apps/frontend/my-dashboard/src/main.tsx"));
      assert.ok(tree.exists("apps/frontend/my-dashboard/src/app.tsx"));
      assert.ok(tree.exists("apps/frontend/my-dashboard/src/app.spec.tsx"));
    });

    it("creates vite config", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "my-dashboard", kind: "frontend", skipFormat: true });

      assert.ok(tree.exists("apps/frontend/my-dashboard/vite.config.mts"));
      assert.ok(tree.exists("apps/frontend/my-dashboard/vitest.config.mts"));
    });

    it("creates tsconfig files", async () => {
      const tree = await createTree();
      const { applicationGenerator } = await import("./generator.js");

      await applicationGenerator(tree, { name: "my-dashboard", kind: "frontend", skipFormat: true });

      assert.ok(tree.exists("apps/frontend/my-dashboard/tsconfig.json"));
      assert.ok(tree.exists("apps/frontend/my-dashboard/tsconfig.app.json"));
      assert.ok(tree.exists("apps/frontend/my-dashboard/tsconfig.spec.json"));

      const tsconfig = JSON.parse(tree.read("apps/frontend/my-dashboard/tsconfig.json", "utf8")!);
      assert.equal(tsconfig.compilerOptions.jsx, "react-jsx");
    });
  });
});
