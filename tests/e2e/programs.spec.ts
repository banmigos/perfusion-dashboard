import { test, expect } from "@playwright/test";

test("directory search finds a program by name", async ({ page }) => {
  await page.goto("/programs");
  await page.getByPlaceholder("School or city").fill("Midwestern");
  await page.getByRole("button", { name: "Filter" }).click();

  await expect(
    page.getByRole("link", { name: /Midwestern University/ }),
  ).toBeVisible();
});

test("credential filter narrows results", async ({ page }) => {
  await page.goto("/programs?credential=MS");

  const cells = page.locator('td[data-col="credential"]');
  await expect(cells.first()).toBeVisible();
  // Every visible result row's credential cell should read "MS".
  for (const cell of await cells.all()) {
    await expect(cell).toContainText("MS");
  }
});

test("detail page shows a known fact with source, and a non-known fact distinctly", async ({
  page,
}) => {
  await page.goto("/programs");
  await page.getByRole("link", { name: /Midwestern University/ }).click();

  await expect(
    page.getByRole("heading", { name: /Midwestern University/ }),
  ).toBeVisible();

  // Credential is known (from the legacy import) and renders with a source badge.
  // Playwright's extended CSS engine supports :has-text() and adjacent-sibling
  // selectors, so this finds the <dd> that follows the "Credential" <dt>.
  const credentialValue = page.locator('dt:has-text("Credential") + dd');
  await expect(credentialValue.getByRole("link")).toBeVisible();

  // GPA is state=unknown post-legacy-import (D8) and must render distinctly,
  // never as a blank or as a fabricated value. Target the specific
  // "Minimum overall GPA" requirement row (not just any "unknown" text
  // anywhere on the page) so this actually proves the fix for the
  // fact-state collapse bug rather than passing on a coincidental match.
  const gpaRow = page.locator("li", { hasText: "Minimum overall GPA" });
  await expect(gpaRow).toBeVisible();
  await expect(gpaRow.getByText("unknown", { exact: false })).toBeVisible();
  // And it must not be rendered as blank/not-researched (a dash) or carry
  // a source link the way a known fact does.
  await expect(gpaRow.getByText("—", { exact: true })).toHaveCount(0);
  await expect(gpaRow.getByRole("link")).toHaveCount(0);
});

test("programs default to a table with the research columns", async ({
  page,
}) => {
  await page.goto("/programs");

  for (const name of [
    "School",
    "Location",
    "Credential",
    "Length",
    "Deadline",
    "GPA",
    "Tuition",
  ]) {
    await expect(page.getByRole("columnheader", { name })).toBeVisible();
  }
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
});

test("map renders from the map view toggle", async ({ page }) => {
  await page.goto("/programs");
  await page.getByRole("link", { name: "Map" }).click();
  await expect(page).toHaveURL(/view=map/);

  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible();
});
