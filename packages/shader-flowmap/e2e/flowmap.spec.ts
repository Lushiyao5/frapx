import { expect, test } from "@playwright/test";

type FlowmapWindow = typeof window & {
  __frapxFlowmap?: { status: string };
  __frapxFlowmapSample?: { frames: number; pixel: number[] | null };
};

test("renders the WebGL2 flowmap shader", async ({ page }) => {
  await page.goto("/");

  await expect
    .poll(() =>
      page.evaluate(() => (window as FlowmapWindow).__frapxFlowmap?.status)
    )
    .toMatch(/^(ready|running)$/);

  await expect
    .poll(() =>
      page.evaluate(() => (window as FlowmapWindow).__frapxFlowmapSample?.frames ?? 0)
    )
    .toBeGreaterThan(0);

  const sample = await page.evaluate(
    () => (window as FlowmapWindow).__frapxFlowmapSample?.pixel
  );
  expect(sample).not.toBeNull();
  expect(sample!.some((value) => value > 0)).toBe(true);
});

test("keeps the Painter's neutral byte value static across time", async ({ page }) => {
  await page.goto("/");

  await expect
    .poll(() =>
      page.evaluate(() => (window as FlowmapWindow).__frapxFlowmapSample?.frames ?? 0)
    )
    .toBeGreaterThan(2);

  const before = await page.evaluate(
    () => (window as FlowmapWindow).__frapxFlowmapSample?.pixel
  );
  await page.waitForTimeout(750);
  const after = await page.evaluate(
    () => (window as FlowmapWindow).__frapxFlowmapSample?.pixel
  );

  expect(before).not.toBeNull();
  expect(after).toEqual(before);
});
