import { test, expect } from "@playwright/test";

test("overview loads and nav links every view", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Overview" })).toBeAttached();
  await expect(
    page.getByRole("region", { name: "Next deadline", exact: true }),
  ).toBeVisible();

  const nav = page.getByRole("navigation");
  for (const [name, href] of <const>[
    ["Overview", "/"],
    ["Programs", "/programs"],
    ["Timeline", "/timeline"],
    ["Requirements", "/requirements"],
    ["Checklists", "/my"],
    ["Needs verification", "/verify"],
    ["Admin", "/admin"],
  ]) {
    await expect(nav.getByRole("link", { name })).toHaveAttribute("href", href);
  }
});

test("theme switch persists a dark choice across reloads", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  const dark = page
    .getByText("Dark", { exact: true })
    .filter({ visible: true });
  // Retry until the switch has hydrated and reacts to the click.
  await expect(async () => {
    await dark.click();
    await expect(html).toHaveAttribute("data-theme", "dark", { timeout: 500 });
  }).toPass();

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
});
