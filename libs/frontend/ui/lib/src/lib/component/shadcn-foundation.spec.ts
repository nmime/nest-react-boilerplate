import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = process.cwd();

describe("shadcn/ui frontend foundation", () => {
  it("maps shadcn semantic tokens onto existing theme variables", () => {
    const styles = readFileSync(join(packageRoot, "src/styles.css"), "utf8");

    for (const token of [
      "--color-background: var(--background);",
      "--color-card: var(--card);",
      "--color-popover: var(--popover);",
      "--color-primary-foreground: var(--primary-foreground);",
      "--color-muted-foreground: var(--muted-foreground);",
      "--color-destructive: var(--destructive);",
      "--color-border: var(--border);",
      "--color-input: var(--input);",
      "--color-ring: var(--ring);",
      "--radius-md: var(--xr-radius-md);",
    ]) {
      expect(styles).toContain(token);
    }

    expect(styles).toContain(':root[data-theme="light"]');
    expect(styles).toContain(':root[data-theme="dark"]');
    expect(styles).toContain("--background: var(--xr-color-background);");
    expect(styles).toContain("--primary: var(--xr-color-primary);");
    expect(styles).toContain("--sidebar-ring: var(--xr-color-primary);");
  });

  it("keeps the shadcn registry pointed at the public UI package", () => {
    const componentsJson = JSON.parse(
      readFileSync(join(packageRoot, "../../../../components.json"), "utf8"),
    ) as {
      aliases: Record<string, string>;
      tailwind: { css: string; cssVariables: boolean };
    };

    expect(componentsJson.tailwind).toMatchObject({
      css: "libs/frontend/ui/lib/src/styles.css",
      cssVariables: true,
    });
    expect(componentsJson.aliases.ui).toBe("@app/frontend/ui");
    expect(componentsJson.aliases.utils).toBe("@app/frontend/ui");
  });
});
