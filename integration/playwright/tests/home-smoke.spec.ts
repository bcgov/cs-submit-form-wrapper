import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("page exposes core accessibility landmarks and skip navigation", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.locator("main#main-content")).toBeVisible();
  const skipLink = page.locator('a[href="#main-content"]').first();
  await expect(skipLink).toBeAttached();
  await skipLink.focus();
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();
});

test("footer reports the application version", async ({ page }) => {
  await page.goto("/");

  const version = page.locator('[data-testid="app-version"]');
  await expect(version).toBeVisible();
  // Label plus semver with optional prerelease and build metadata, e.g.
  // "Version 2.0.0-beta.0+test.a1b2c3d". The label is loose so this holds in either locale.
  await expect(version).toHaveText(
    /^\S+\s\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
  );
});

test("home page has no critical a11y violations", async ({ page }) => {
  await page.goto("/");

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const severeViolations = accessibilityScanResults.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(severeViolations).toEqual([]);
});
