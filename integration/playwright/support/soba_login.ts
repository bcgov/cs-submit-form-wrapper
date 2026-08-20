import { expect, type Page } from "@playwright/test";
import { authenticator } from "@otplib/preset-default";
export function formsettings() {
  if (!process.env.KEYCLOAK_USERNAME || !process.env.KEYCLOAK_PASSWORD) {
    throw new Error("Missing env variables");
  }

  return {
    depEnv: process.env.DEP_ENV,
    username: process.env.KEYCLOAK_USERNAME,
    password: process.env.KEYCLOAK_PASSWORD,
    mfaCode: process.env.MFA_CODE,
  };
}

export async function login(page: Page) {
  const { username, password, mfaCode } = formsettings();
  await page.goto("/");
  await page.click('[data-testid="login-button"]');
  //Verify login option
  await expect(page.locator("#social-azureidir")).toBeVisible();
  await expect(page.locator("#social-bceidbusiness")).toBeVisible();
  await page.locator("#social-azureidir").click();
  await page.fill('input[type="email"]', username);
  await page.click('input[type="submit"]');
  await page.fill('input[name="passwd"]', password);
  await page.click('input[type="submit"]');
  authenticator.options = {
    //encoding: "base32" as any,
    step: 30,
    window: 2, // allows ±30s tolerance
  };
  const token = authenticator.generate(process.env.MFA_CODE!);
  console.log("Generated OTP:", token);
  await page.fill('input[name="otc"]', token);
  await page.click('input[type="submit"]');
  await page.locator("#idSIButton9").click();
  //Visibility of the user dropdown confirms successful login (logout now lives inside it)
  await expect(page.locator('[data-testid="user-dropdown"]')).toBeVisible();
}
