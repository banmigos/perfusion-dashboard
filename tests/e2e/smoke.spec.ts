import { test, expect } from "@playwright/test";

test("dashboard loads and nav contains all five links", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(nav.getByRole("link", { name: "Programs" })).toHaveAttribute(
    "href",
    "/programs",
  );
  await expect(
    nav.getByRole("link", { name: "My Applications" }),
  ).toHaveAttribute("href", "/my");
  await expect(
    nav.getByRole("link", { name: "Needs Verification" }),
  ).toHaveAttribute("href", "/verify");
  await expect(nav.getByRole("link", { name: "Admin" })).toHaveAttribute(
    "href",
    "/admin",
  );
});
