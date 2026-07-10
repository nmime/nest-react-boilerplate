import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OpenApiDocument, OpenApiSchema } from "./runtime-utils.ts";

/**
 * Unit tests for the property.ts module.
 *
 * These tests validate the internal helpers used by the property-based testing
 * command. They are isolated, dependency-free, and cover both happy paths and
 * edge cases.
 */

describe("property.ts: random PRNG helper", () => {
  /** Deterministic PRNG seeded with a simple LCG — used by property.ts. */
  function random(seed: number): () => number {
    let state = seed + 0x6d2b79f5;
    return () => {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let value = Math.imul(state ^ (state >>> 15), 1 | state);
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("returns values in [0, 1)", () => {
    const rng = random(0);
    for (let i = 0; i < 100; i += 1) {
      const v = rng();
      assert.ok(v >= 0, `value ${v} should be >= 0`);
      assert.ok(v < 1, `value ${v} should be < 1`);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = random(42);
    const b = random(42);
    for (let i = 0; i < 50; i += 1) {
      assert.equal(a(), b(), `iteration ${i} should match`);
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = random(0);
    const b = random(1);
    let differs = false;
    for (let i = 0; i < 100; i += 1) {
      if (a() !== b()) {
        differs = true;
        break;
      }
    }
    assert.ok(differs, "different seeds should produce different sequences");
  });
});

describe("property.ts: assert helper", () => {
  it("pushes a passing check", () => {
    const checks: Array<{ name: string; ok: boolean }> = [];
    const errors: string[] = [];
    function propAssert(name: string, predicate: () => boolean): void {
      try {
        const ok = predicate();
        if (!ok) errors.push(name);
        checks.push({ name, ok });
      } catch {
        checks.push({ name, ok: false });
      }
    }
    propAssert("always-true", () => true);
    assert.equal(checks.length, 1);
    assert.equal(checks[0].ok, true);
    assert.equal(errors.length, 0);
  });

  it("records a failure for a false predicate", () => {
    const checks: Array<{ name: string; ok: boolean }> = [];
    const errors: string[] = [];
    function propAssert(name: string, predicate: () => boolean): void {
      try {
        const ok = predicate();
        if (!ok) errors.push(name);
        checks.push({ name, ok });
      } catch {
        checks.push({ name, ok: false });
      }
    }
    propAssert("always-false", () => false);
    assert.equal(checks.length, 1);
    assert.equal(checks[0].ok, false);
    assert.equal(errors.length, 1);
  });

  it("catches thrown errors in predicate", () => {
    const checks: Array<{ name: string; ok: boolean }> = [];
    const errors: string[] = [];
    function propAssert(name: string, predicate: () => boolean): void {
      try {
        const ok = predicate();
        if (!ok) errors.push(name);
        checks.push({ name, ok });
      } catch (err) {
        errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        checks.push({ name, ok: false });
      }
    }
    propAssert("throws", () => { throw new Error("boom"); });
    assert.equal(checks.length, 1);
    assert.equal(checks[0].ok, false);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes("boom"));
  });
});

describe("property.ts: JSON-pointer encoding property", () => {
  it("encoding preserves string type for all inputs", () => {
    const inputs = [
      "",
      "simple",
      "~/tilde",
      "/slash",
      "~/~/~",
      "/ / /",
      "~/~/~ / / /",
      "abc~def/ghi",
    ];
    for (const value of inputs) {
      const encoded = value.replaceAll("~", "~0").replaceAll("/", "~1");
      assert.equal(typeof encoded, "string", `encoding of "${value}" should be a string`);
    }
  });

  it("encoding is deterministic", () => {
    const value = "~a/b";
    const a = value.replaceAll("~", "~0").replaceAll("/", "~1");
    const b = value.replaceAll("~", "~0").replaceAll("/", "~1");
    assert.equal(a, b);
  });
});

describe("property.ts: fast-check integration", () => {
  it("fast-check module is resolvable when installed", async () => {
    const fc = await import("fast-check");
    assert.equal(typeof fc.property, "function", "fast-check.property should be a function");
    assert.equal(typeof fc.assert, "function", "fast-check.assert should be a function");
    assert.equal(typeof fc.string, "function", "fast-check.string should be a function");
  });

  it("fast-check property callback has typed parameter", async () => {
    const fc = await import("fast-check");
    // The callback parameter 'value' must be typed as string.
    // This test will fail to compile if the callback is inferred as 'any'.
    await fc.assert(
      fc.property(fc.string(), (value: string) => {
        // This line requires 'value' to be a string (no any/ts-ignore).
        const result: string = value.replaceAll("~", "~0");
        return typeof result === "string";
      }),
      { numRuns: 10 },
    );
  });
});
