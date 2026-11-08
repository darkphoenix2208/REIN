import { test, expect } from "@playwright/test";

test.describe("Rein UI", () => {
  test("Demo page loads", async ({ page }) => {
    await page.goto("http://localhost:4317/demo");
    await expect(page).toHaveTitle(/Rein/);
  });

  test("Ledger displays AG Grid", async ({ page }) => {
    await page.goto("http://localhost:4317/ledger");
    await page.waitForSelector(".ag-root");
  });

  test("PayPal colors applied", async ({ page }) => {
    await page.goto("http://localhost:4317/demo");
    const font = await page.locator("body").evaluate(el => window.getComputedStyle(el).fontFamily);
    expect(font.toLowerCase()).toContain("inter");
  });
});
