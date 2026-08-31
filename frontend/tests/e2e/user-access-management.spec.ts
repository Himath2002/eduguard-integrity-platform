import { test, expect } from "@playwright/test";

test.describe("User and Access Management", () => {
  test("login page loads correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("sign in button stays disabled until form is filled", async ({ page }) => {
    await page.goto("/login");

    const signInButton = page.getByRole("button", { name: /sign in/i });
    await expect(signInButton).toBeDisabled();

    await page.getByLabel("Email").fill("student@test.com");
    await expect(signInButton).toBeDisabled();

    await page.getByLabel("Password").fill("Password123!");
    await expect(signInButton).toBeEnabled();
  });

  test("forgot password link is visible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /forgot password/i })).toBeVisible();
  });

  test("create account link is visible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
  });

  test("unauthorized protected route redirects to login", async ({ page }) => {
    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/login/);
  });
});