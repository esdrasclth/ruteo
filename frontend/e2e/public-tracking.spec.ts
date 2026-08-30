import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("el rastreo público expone un formulario navegable", async ({ page }) => {
  await page.goto("/track");
  await expect(
    page.getByRole("heading", { name: /por dónde viene tu paquete/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/número de guía/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /rastrear envío/i }),
  ).toBeDisabled();

  const accessibility = await new AxeBuilder({ page })
    .disableRules(["color-contrast"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
