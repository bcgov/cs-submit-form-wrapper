import { defineConfig } from "@playwright/test";
import * as dotenv from "dotenv";
import path from "path"; // <-- import dotenv

// Load .env reliably
dotenv.config({ path: path.resolve(__dirname, ".env") });
const depEnv = process.env.DEP_ENV || "dev"; // fallback to dev if undefined

function getExpectedURL(depEnv?: string): string {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }

  // PR environments (numeric) — host-based routes (soba-pr-N), not path-based (/pr-N)
  if (/^\d+$/.test(process.env.DEP_ENV || "")) {
    const prNumber = Number(depEnv);
    const slot = prNumber % 20;
    return `https://soba-pr-slot-${slot}.apps.silver.devops.gov.bc.ca`;
  }

  switch (depEnv) {
    case "dev":
      return "https://soba-dev.apps.silver.devops.gov.bc.ca";
    case "test":
      return "https://soba-test.apps.silver.devops.gov.bc.ca";
    default:
      throw new Error(`Invalid DEP_ENV: ${depEnv}`);
  }
}

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,

  use: {
    baseURL: getExpectedURL(depEnv),
    headless: true,
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    ignoreHTTPSErrors: true,
  },

  reporter: [["html", { open: "never" }]],
  outputDir: "test-results",

  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
