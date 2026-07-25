import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllowedSecretScanValue, secretValueEntropy } from "./secret-scan-policy.ts";

describe("native secret scan policy", () => {
  it("allows runtime-composed values without allowing static credentials", () => {
    assert.equal(isAllowedSecretScanValue("${encodeURIComponent(password)}@127.0.0.1"), true);
    assert.equal(isAllowedSecretScanValue("actual-static-credential@127.0.0.1"), false);
  });

  it("allows generated HTTP toast variants without globally allowing the same value", () => {
    const variant = ["DELETE", "409", "last-auth-method-unlink-forbidden"].join("_");

    assert.equal(
      isAllowedSecretScanValue(variant, "apps/backend/auth/auth-app-api/contracts/toast/auth-app-api.toast-rules.generated.json"),
      true,
    );
    assert.equal(isAllowedSecretScanValue(variant, "src/runtime-config.json"), false);
  });

  it("does not allow token-shaped values in generated toast rules", () => {
    assert.equal(
      isAllowedSecretScanValue(
        ["ghp", "0123456789abcdefghijklmnopqrstuvwxyz", "ABCD"].join("_"),
        "apps/backend/auth/auth-app-api/contracts/toast/auth-app-api.toast-rules.generated.json",
      ),
      false,
    );
  });

  it("calculates entropy for the native high-entropy rule", () => {
    assert.equal(secretValueEntropy("aaaaaaaa"), 0);
    assert.ok(secretValueEntropy("abcdefghijklmnopqrstuvwxyz0123456789") > 4.4);
  });
});
