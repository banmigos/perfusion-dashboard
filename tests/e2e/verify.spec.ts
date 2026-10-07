// tests/e2e/verify.spec.ts
import { test, expect } from "@playwright/test";

test("creating an unverified claim lists it on /verify, and verifying it removes it", async ({
  page,
}) => {
  // Unique per run so reruns never collide with rows left in the dev database.
  const unique = Date.now();
  const schoolName = `E2E Test School ${unique}`;
  const requirementLabel = `E2E requirement ${unique}`;

  await page.goto("/admin");
  await page.getByPlaceholder("School name").fill(schoolName);
  await page.getByRole("button", { name: "Add school" }).click();
  const schoolLink = page.getByRole("link", { name: schoolName, exact: true });
  await expect(schoolLink).toBeVisible();

  await schoolLink.click();
  await expect(page.getByRole("heading", { name: schoolName })).toBeVisible();

  await page.getByPlaceholder("Program name").fill("Test Perfusion Program");
  await page.getByRole("button", { name: "Add program" }).click();
  const programLink = page.getByRole("link", {
    name: "Test Perfusion Program",
  });
  await expect(programLink).toBeVisible();

  await programLink.click();
  await expect(
    page.getByRole("heading", { name: "Test Perfusion Program" }),
  ).toBeVisible();

  await page.getByPlaceholder("2026-27").fill("2026-27");
  await page.getByRole("button", { name: "Add cycle" }).click();
  const cycleLink = page.getByRole("link", { name: /2026-27/ });
  await expect(cycleLink).toBeVisible();

  await cycleLink.click();
  await expect(page.getByRole("heading", { name: "2026-27" })).toBeVisible();

  // Scope to the "Add a requirement" form: once a requirement exists, each
  // requirement's own edit form repeats the "Numeric value" placeholder.
  const addRequirementForm = page.locator("form").filter({
    has: page.getByPlaceholder("Label, e.g. Minimum overall GPA"),
  });
  await addRequirementForm
    .getByPlaceholder("Label, e.g. Minimum overall GPA")
    .fill(requirementLabel);
  await addRequirementForm.getByPlaceholder("Numeric value").fill("3.5");
  await addRequirementForm
    .getByRole("button", { name: "Add requirement" })
    .click();

  // The label is an input value (not text) inside the requirement's edit form,
  // so match the requirement <li> by that input rather than by text content.
  const requirementRow = page.locator("li").filter({
    has: page.locator(`input[name="label"][value="${requirementLabel}"]`),
  });
  await expect(requirementRow).toBeVisible();

  // The claim form lives in the requirement's own ClaimsPanel; scoping to the
  // row keeps it apart from the cycle-level ClaimsPanel above.
  const claimForm = requirementRow.locator("form").filter({
    has: page.getByRole("button", { name: "Save claim" }),
  });
  await claimForm.locator('input[name="fieldKey"]').fill("value_number");
  await claimForm.locator('select[name="state"]').selectOption("known");
  await claimForm
    .locator('input[name="sourceUrl"]')
    .fill("https://example.edu/e2e-test-source");
  await claimForm
    .locator('select[name="sourceType"]')
    .selectOption("program_site");
  await claimForm.getByRole("button", { name: "Save claim" }).click();

  // The saved claim renders in the requirement's claim list before we leave.
  await expect(requirementRow.getByText("value_number").first()).toBeVisible();
  await expect(
    requirementRow.getByRole("link", { name: "source" }),
  ).toBeVisible();

  await page.goto("/verify");
  const queueRow = page.locator("li").filter({ hasText: requirementLabel });
  await expect(queueRow).toBeVisible();
  await expect(queueRow).toContainText(schoolName);

  await queueRow.getByRole("button", { name: "mark verified" }).click();

  await expect(page.getByText(requirementLabel)).toHaveCount(0);
});
