import { expect, test, type Page } from "@playwright/test";
import type { ShaderBackgroundInstance } from "../src";

type Win = typeof window & { __frapxShader?: ShaderBackgroundInstance };

const glowShader = `precision mediump float;
uniform float u_glow;
void main() { gl_FragColor = vec4(u_glow, 0.0, 0.0, 1.0); }
`;

// Draws and reads the centre pixel's red channel in the same task.
const redAt = (page: Page, time: number) =>
  page.evaluate((seconds) => {
    const fx = (window as Win).__frapxShader!;
    fx.setTime(seconds);
    fx.render();
    const scratch = document.createElement("canvas");
    scratch.width = fx.canvas!.width;
    scratch.height = fx.canvas!.height;
    const context = scratch.getContext("2d")!;
    context.drawImage(fx.canvas!, 0, 0);
    return context.getImageData(16, 9, 1, 1).data[0]!;
  }, time);

test("bound keyframes follow setTime() and override setUniform() until removed", async ({ page }) => {
  await page.goto("/?clock=manual&res=32x18");
  await page.evaluate(async (fragment) => {
    const fx = (window as Win).__frapxShader!;
    await fx.ready;
    fx.setFragment(fragment);
    fx.setUniform("glow", 0.9);
  }, glowShader);

  // keyframes() is unit-tested in core; any { get(time) } source works here.
  await page.evaluate(() => {
    const fx = (window as Win).__frapxShader!;
    (window as unknown as { __unbind(): void }).__unbind = fx.bindUniforms({
      get: (time) => ({ glow: Math.min(Math.max(time, 0), 1) })
    });
  });

  expect(await redAt(page, 0)).toBe(0);
  expect(Math.abs((await redAt(page, 0.5)) - 128)).toBeLessThanOrEqual(1);
  expect(await redAt(page, 2)).toBe(255);

  await page.evaluate(() => (window as unknown as { __unbind(): void }).__unbind());
  expect(Math.abs((await redAt(page, 0.5)) - 230)).toBeLessThanOrEqual(1);
});
