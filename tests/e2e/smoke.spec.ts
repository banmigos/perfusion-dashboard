import { test, expect } from "@playwright/test";

test("overview loads and nav links every view", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Overview" })).toBeAttached();
  await expect(
    page.getByRole("region", { name: "Next deadline" }),
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
  await page
    .getByRole("radio", { name: "Dark" })
    .first()
    .check({ force: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
