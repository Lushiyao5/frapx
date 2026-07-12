import { expect, test } from "@playwright/test";

type FlowmapWindow = typeof window & {
  __frapxFlowmap?: { status: string };
  __frapxFlowmapSample?: {
    frames: number;
    centerPixel: number[] | null;
    flowPixel: number[] | null;
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitReady(page: import("@playwright/test").Page) {
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
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("renders the WebGL2 flowmap shader (7-arg overload)", async ({ page }) => {
  await page.goto("/");
  await waitReady(page);

  const sample = await page.evaluate(
    () => (window as FlowmapWindow).__frapxFlowmapSample
  );
  expect(sample).not.toBeNull();
  expect(sample!.centerPixel!.some((v) => v > 0)).toBe(true);
});

test("keeps the Painter's neutral byte value static across time", async ({ page }) => {
  await page.goto("/");

  await expect
    .poll(() =>
      page.evaluate(() => (window as FlowmapWindow).__frapxFlowmapSample?.frames ?? 0)
    )
    .toBeGreaterThan(2);

  const before = await page.evaluate(
    () => (window as FlowmapWindow).__frapxFlowmapSample?.centerPixel
  );
  await page.waitForTimeout(750);
  const after = await page.evaluate(
    () => (window as FlowmapWindow).__frapxFlowmapSample?.centerPixel
  );

  expect(before).not.toBeNull();
  expect(after).toEqual(before);
});

test("flow region pixel is non-black (output health check)", async ({ page }) => {
  await page.goto("/");
  await waitReady(page);

  const flowPixel = await page.evaluate(
    () => (window as FlowmapWindow).__frapxFlowmapSample?.flowPixel
  );
  expect(flowPixel).not.toBeNull();
  // Non-black confirms the shader is producing visible output in the flow area.
  // UNSIGNED_BYTE readPixels cannot distinguish NaN from black, so this is a
  // health proxy: non-black + animating (next test) together signal correctness.
  expect(flowPixel!.some((v) => v > 0)).toBe(true);
});

test("flow region pixel animates over time (advection is active)", async ({ page }) => {
  await page.goto("/");

  await expect
    .poll(() =>
      page.evaluate(() => (window as FlowmapWindow).__frapxFlowmapSample?.frames ?? 0)
    )
    .toBeGreaterThan(2);

  const before = await page.evaluate(
    () => (window as FlowmapWindow).__frapxFlowmapSample?.flowPixel
  );
  await page.waitForTimeout(500);
  const after = await page.evaluate(
    () => (window as FlowmapWindow).__frapxFlowmapSample?.flowPixel
  );

  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  // At least one component must differ — confirms three-phase advection is running.
  const changed = before!.some((v, i) => v !== after![i]);
  expect(changed).toBe(true);
});

test("six-argument overload compiles and renders without error", async ({ page }) => {
  await page.goto("/?variant=6arg");

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
    () => (window as FlowmapWindow).__frapxFlowmapSample
  );
  expect(sample!.centerPixel!.some((v) => v > 0)).toBe(true);
});
