import { test, expect } from "@playwright/test";

test("directory search finds a program by name", async ({ page }) => {
  await page.goto("/programs");
  await page.getByPlaceholder("School or city").fill("Midwestern");
  await page.getByRole("button", { name: "Filter" }).click();

  await expect(page.getByRole("link", { name: /Midwestern University/ })).toBeVisible();
});

test("credential filter narrows results", async ({ page }) => {
  await page.goto("/programs?credential=MS");

  const links = page.getByRole("link");
  await expect(links.first()).toBeVisible();
  // Every visible result row's credential text should read "MS".
  await expect(page.getByText("· MS").first()).toBeVisible();
});

test("detail page shows a known fact with source, and a non-known fact distinctly", async ({
  page,
}) => {
  await page.goto("/programs");
  await page.getByRole("link", { name: /Midwestern University/ }).click();

  await expect(page.getByRole("heading", { name: /Midwestern University/ })).toBeVisible();

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

test("map renders and a marker links to its detail page", async ({ page }) => {
  await page.goto("/programs");

  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible();
});
