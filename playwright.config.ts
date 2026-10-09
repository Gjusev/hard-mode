import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results",
  projects: [
    { name: "unit", testMatch: /tests[\\/]unit[\\/].*\.test\.ts/ },
    { name: "e2e", testMatch: /tests[\\/]e2e[\\/].*\.test\.ts/ },
  ],
});
