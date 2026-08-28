// tests/e2e/personal.spec.ts
import { test, expect } from "@playwright/test";

test("save a program, generate its checklist, complete a task, see it reflected on the dashboard", async ({
  page,
}) => {
  await page.goto("/programs/midwestern-university/perfusion-ms");

  // Reset to a clean starting state in case a prior run left this program saved.
  const unsaveButton = page.getByRole("button", { name: "Unsave" });
  if (await unsaveButton.isVisible().catch(() => false)) {
    await unsaveButton.click();
    await expect(page.getByRole("button", { name: "Save program" })).toBeVisible();
  }

  await page.getByRole("button", { name: "Save program" }).click();
  await expect(page.getByRole("button", { name: "Unsave" })).toBeVisible();

  await page.getByRole("button", { name: "Generate checklist" }).click();
  await expect(
    page.getByRole("button", { name: "Checklist generated" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "View on My Applications" }).click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(
    page.getByRole("link", { name: /Midwestern University/ }),
  ).toBeVisible();
  await expect(page.getByText("Minimum overall GPA")).toBeVisible();
  await expect(page.getByText("GRE required")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("Minimum overall GPA")).toBeVisible();
  await expect(page.getByText("GRE required")).toBeVisible();

  await page.goto("/my");
  const gpaRow = page.locator('li:has-text("Minimum overall GPA")').last();
  await gpaRow.getByRole("combobox").selectOption("done");
  await expect(gpaRow.getByRole("combobox")).toHaveValue("done");

  await page.goto("/");
  await expect(page.getByText("Minimum overall GPA")).toHaveCount(0);
  await expect(page.getByText("GRE required")).toBeVisible();
});
