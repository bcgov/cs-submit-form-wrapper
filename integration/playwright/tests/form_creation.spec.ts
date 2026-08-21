import { test, expect } from "../fixtures/form_title";
import type { Page } from "@playwright/test";
import { login } from "../support/soba_login";
import dictionaries from "../../../frontend/dictionaries/en.json";

let sharedPage: Page;
let form_name: string;

test.describe.serial("Landing page tests", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    sharedPage = await context.newPage();
  });

  test.afterAll(async () => {
    //Logout after tests — logout lives inside the user dropdown, so open it first
    await sharedPage.click('[data-testid="user-dropdown"]');
    await sharedPage.click('[data-testid="logout-button"]');
    await sharedPage.context().close();
  });

  test("Validate form designing page", async ({ title }) => {
    await sharedPage.goto("/");
    await expect(
      sharedPage.locator('[data-testid="login-button"]'),
    ).toBeVisible();
    await login(sharedPage);
    await sharedPage.waitForTimeout(1000); // waits 1 second
    const workspaceModal = sharedPage
      .locator(".bcds-react-aria-Modal")
      .filter({ hasText: "Default Workspace Setup" });
    if ((await workspaceModal.count()) > 0) {
      // Modal exists
      await expect(workspaceModal).toBeVisible();
      // Modal tests
      await sharedPage
        .getByTestId("workspace-name")
        .locator("input")
        .fill("Test Workspace");
      await sharedPage.getByTestId("workspace-your-org").click();
      // Check all ministries available in dropdown
      const availableMinistries: string[] = [];
      const allMinistries = Object.entries(dictionaries.ministries);
      for (const [code, name] of allMinistries) {
        const optionElement = sharedPage.getByRole("option", {
          name: new RegExp(name),
        });
        if ((await optionElement.count()) > 0) {
          availableMinistries.push(`${code}: ${name}`);
        }
      }
      // Select Health (HLTH) if available
      await sharedPage
        .getByRole("option", { name: "Health (HLTH)", exact: true })
        .click(); // Click on the option to select
      await sharedPage.getByTestId("workspace-use-case").click();

      // Check all use cases available in dropdown
      const availableUseCases: string[] = [];
      const allUseCases = Object.entries(dictionaries.useCases);

      for (const [key, name] of allUseCases) {
        const optionElement = sharedPage.getByRole("option", {
          name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        });
        if ((await optionElement.count()) > 0) {
          availableUseCases.push(`${key}: ${name}`);
        }
      }
      // Select Collection use case if available
      const collectionUseCase = dictionaries.useCases["collection"];
      if (collectionUseCase) {
        const collectionOption = sharedPage.getByRole("option", {
          name: new RegExp(
            collectionUseCase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          ),
        });
        if ((await collectionOption.count()) > 0) {
          await collectionOption.click();
        }
      }
      // Scroll to and check the disclaimer checkbox
      await sharedPage.getByTestId("workspace-disclaimer-switch").click();
      await expect(
        sharedPage.getByTestId("workspace-disclaimer-switch").locator("input"),
      ).toBeChecked();
      await sharedPage.getByTestId("workspace-save").click();
      sharedPage.locator('[data-testid="forms-nav"]').click();
      await sharedPage.click('[data-testid="create-form-button"]');
      await sharedPage.locator("#formName").fill(title);
      await sharedPage.locator('input[type="text"]').fill(title);
      form_name = title;
    } else {
      // Continue with normal flow
      //Form creation
      await sharedPage.click('[data-testid="create-form-button"]');
      await sharedPage.locator("#formName").fill(title);
      await sharedPage.locator('input[type="text"]').fill(title);
      form_name = title;
      await sharedPage.getByTestId("workspace-select").click();
      await sharedPage.waitForTimeout(1000);
      await sharedPage
        .getByText("Test Workspace (team)", { exact: true })
        .click();
      const submitterAudience = sharedPage.getByRole("button", {
        name: "Protected (IDIR - MFA)",
        exact: true,
      });
      if (await submitterAudience.isVisible()) {
        await submitterAudience.click();
      }
    }
  });
  test("Checks form creation with basic components", async () => {
    const txt_box = sharedPage.locator("text=Text Field"); // component from builder palette
    const target = sharedPage.locator(".builder-components.drag-container");
    await txt_box.dragTo(target);
    await expect(
      sharedPage.locator("button.btn.btn-outline-primary", {
        hasText: "Save",
      }),
    ).toBeEnabled();
    await sharedPage.click('button[ref="saveButton"]');
    await sharedPage.waitForTimeout(1000); // waits 1 second
    const text_area = sharedPage.locator(
      'span[data-group="basic"][data-key="textarea"][data-type="textarea"]',
    );
    await text_area.dragTo(target);
    await sharedPage.click('button[ref="saveButton"]');
    await sharedPage.waitForTimeout(1000); // waits 1 second
    const number = sharedPage.locator(
      'span[data-group="basic"][data-key="number"][data-type="number"]',
    );
    await number.dragTo(target);
    await sharedPage.click('button[ref="saveButton"]');
    await sharedPage.waitForTimeout(1000); // waits 1 second
    const password = sharedPage.locator(
      'span[data-group="basic"][data-key="password"][data-type="password"]',
    );
    await password.dragTo(target);
    await sharedPage.click('button[ref="saveButton"]');
    await sharedPage.waitForTimeout(1000); // waits 1 second
    const checkbox = sharedPage.locator(
      'span[data-group="basic"][data-key="checkbox"][data-type="checkbox"]',
    );
    await checkbox.dragTo(target);
    await sharedPage.click('button[ref="saveButton"]');
    await sharedPage.waitForTimeout(1000); // waits 1 second
    const selectboxes = sharedPage.locator(
      'span[data-group="basic"][data-key="selectboxes"][data-type="selectboxes"]',
    );
    await selectboxes.dragTo(target);
    await sharedPage.locator('a[href="#data"]').click();
    await sharedPage.locator('input[name="data[values][0][value]"]').fill("1");
    await sharedPage.click('button[ref="saveButton"]');
    await sharedPage.waitForTimeout(1000); // waits 1 second
    const select = sharedPage.locator(
      'span[data-group="basic"][data-key="select"][data-type="select"]',
    );
    await select.dragTo(target);
    await sharedPage.click('button[ref="saveButton"]');
    await sharedPage.waitForTimeout(1000); // waits 1 second
    const radio = sharedPage.locator(
      'span[data-group="basic"][data-key="radio"][data-type="radio"]',
    );
    await radio.dragTo(target);
    await sharedPage.locator('a[href="#data"]').click();
    await sharedPage.locator('input[name="data[values][0][value]"]').fill("1");
    await sharedPage.click('button[ref="saveButton"]');
    await sharedPage.waitForTimeout(1000); // waits 1 second
    const button = sharedPage.locator(
      'span[data-group="basic"][data-key="button"][data-type="button"]',
    );
    await button.dragTo(target);
    await sharedPage.click('button[ref="saveButton"]');
    await sharedPage.waitForTimeout(1000); // waits 1 second
    await sharedPage.locator('label[for="disclaimer-checkbox"]').click();
    await expect(
      sharedPage.locator("button.btn.btn-outline-primary", { hasText: "Save" }),
    ).toBeEnabled();
    await sharedPage
      .locator("button.btn.btn-outline-primary", { hasText: "Save" })
      .click();
    await sharedPage.waitForTimeout(1000);
  });
  //form validation by searching the form
  test("search form", async () => {
    await sharedPage.click('[data-testid="forms-nav"]');
    await sharedPage
      .locator('[data-testid="search-forms-text"]')
      .fill(form_name);
    await sharedPage.waitForTimeout(1000); // waits 1 second
    await sharedPage.getByText(form_name).click();
    console.log("Form name is: " + form_name);
    await sharedPage.waitForTimeout(2000);
    //Validate form is created by checking form name
    await expect(sharedPage.getByPlaceholder("Enter form name")).toHaveValue(
      form_name,
    );
  });
});
