import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "domain",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
