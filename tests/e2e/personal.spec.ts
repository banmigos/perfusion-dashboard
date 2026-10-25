// tests/e2e/personal.spec.ts
import { test, expect } from "@playwright/test";

test("track a program, generate its checklist, move its status, complete a task, see it on the overview", async ({
  page,
}) => {
  await page.goto("/programs/midwestern-university/perfusion-ms");

  // Reset to a clean starting state in case a prior run left this tracked.
  const stopTracking = page.getByRole("button", { name: "Stop tracking" });
  if (await stopTracking.isVisible().catch(() => false)) {
    await stopTracking.click();
    await page
      .getByRole("button", { name: "Stop tracking and delete" })
      .click();
    await expect(
      page.getByRole("button", { name: "Track program" }),
    ).toBeVisible();
  }

  await page.getByRole("button", { name: "Track program" }).click();
  await expect(
    page.getByRole("button", { name: "Stop tracking" }),
  ).toBeVisible();

  // Status persists across a reload.
  const status = page.getByRole("combobox", {
    name: "Application status for Midwestern University",
  });
  await expect(status).toHaveValue("not_started");
  await status.selectOption("in_progress");
  await expect(status).toHaveValue("in_progress");
  await page.reload();
  await expect(
    page.getByRole("combobox", {
      name: "Application status for Midwestern University",
    }),
  ).toHaveValue("in_progress");

  await page.getByRole("button", { name: "Generate checklist" }).click();
  await expect(page.getByText("Confirm GPA requirement")).toBeVisible();

  // A manual task with a kind lands under its group heading.
  await page.getByLabel("New task").fill("Request letter from preceptor");
  await page.getByLabel("Kind").selectOption("letters");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Request letter from preceptor")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Letters of recommendation" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "All checklists" }).click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(
    page.getByRole("link", { name: /Midwestern University/ }),
  ).toBeVisible();
  await expect(page.getByText("Confirm GPA requirement")).toBeVisible();
  await expect(
    page.getByText("Confirm whether the GRE is required"),
  ).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("Confirm GPA requirement")).toBeVisible();

  await page.goto("/my");
  const gpaRow = page.locator('li:has-text("Confirm GPA requirement")').last();
  await gpaRow.getByRole("combobox").selectOption("done");
  await expect(gpaRow.getByRole("combobox")).toHaveValue("done");

  await page.goto("/");
  await expect(page.getByText("Confirm GPA requirement")).toHaveCount(0);
  await expect(
    page.getByText("Confirm whether the GRE is required"),
  ).toBeVisible();

  // The requirements tracker counts the letter as pending.
  await page.goto("/requirements");
  await expect(
    page.getByRole("region", { name: "Letters of recommendation" }),
  ).toContainText("Request letter from preceptor");
});
