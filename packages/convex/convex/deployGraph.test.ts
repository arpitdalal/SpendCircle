// @vitest-environment node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const convexDir = join(import.meta.dirname, ".");

/** All `.ts` modules in the deploy graph (excludes `*.test.ts` and `_generated/`). */
function collectDeployGraphModules(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "_generated") {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectDeployGraphModules(full));
      continue;
    }
    if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      results.push(full);
    }
  }
  return results;
}

/** Import specifiers that reach test-only helpers outside the functions dir. */
const forbiddenTestHelperImport = /from\s+["']\.\.\/test\//;

describe("deploy graph", () => {
  it("non-test convex modules must not import from packages/convex/test/", () => {
    const violations: string[] = [];
    for (const file of collectDeployGraphModules(convexDir)) {
      const content = readFileSync(file, "utf8");
      if (forbiddenTestHelperImport.test(content)) {
        violations.push(relative(convexDir, file));
      }
    }
    expect(violations).toEqual([]);
  });
});
