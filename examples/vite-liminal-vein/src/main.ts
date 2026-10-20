import { createPasses } from "@frapx/fx-passes";
import type { PassesInstance } from "@frapx/fx-passes";
import { registerRenderTarget } from "@frapx/tool-capture";
import { BLOOM, bloomPasses } from "./bloom.glsl";
import { loopRhythm } from "./rhythm";
import { LOOP_SECONDS, display, scene } from "./scene.glsl";
import "./styles.css";

declare global {
  interface Window {
    // Read by verification scripts.
    __liminalVein?: PassesInstance;
  }
}

/** Frame rate of the exported loop, and of `?frame=N`. */
const FPS = 60;
/** Samples a still frame refines to, and the export's default. */
const SAMPLES = 32;
/** Open shutter as a fraction of the frame interval: 180°. */
const SHUTTER = 0.5;
/** Export size unless `frapx-render --resolution` overrides it. */
const EXPORT_RESOLUTION: [number, number] = [1920, 1080];

const stage = document.querySelector<HTMLElement>("[data-stage]")!;
const title = document.querySelector<HTMLElement>("[data-title]")!;
const errorMessage = document.querySelector<HTMLElement>("[data-error]")!;

// ?frame=N holds frame N of the 60 fps loop and refines it, to check a frame
// without rendering it.
const params = new URLSearchParams(window.location.search);
const stillFrame = params.has("frame") ? Number(params.get("frame")) : null;
const holdsFrame = stillFrame !== null && Number.isInteger(stillFrame) && stillFrame >= 0;

// Set once frapx-render prepares the page, which then always renders at full quality.
let exporting = false;

const prefersLightweightRender = (): boolean =>
  window.matchMedia("(pointer: coarse)").matches ||
  Math.min(window.innerWidth, window.innerHeight) < 700;

const quality = () => (exporting || holdsFrame || !prefersLightweightRender() ? 1 : 0);

// While playing, every frame draws one sample. A frame that holds still
// (reduced motion, ?frame=N) refines to SAMPLES by itself.
const fx = createPasses({
  target: stage,
  clock: holdsFrame ? "manual" : "realtime",
  accumulation: { samples: SAMPLES, shutter: SHUTTER, fps: FPS },
  passes: [
    { name: "scene", fragment: scene, accumulate: true, format: "rgba32f", filter: "nearest" },
    ...bloomPasses("scene"),
    { name: "display", fragment: display, inputs: ["scene", BLOOM], filter: "nearest" }
  ],
  uniforms: {
    quality: quality(),
    dither: 1
  },
  dpr: () => Math.min(window.devicePixelRatio, prefersLightweightRender() ? 1 : 1.5),
  maxDpr: 1.5,
  respectReducedMotion: true,
  onResize: ({ instance }) => instance.setUniform("quality", quality()),
  onReady: () => {
    stage.classList.add("is-ready");
    window.setTimeout(() => title.classList.add("is-hidden"), 4000);
  },
  onError: (error) => {
    stage.classList.add("is-unsupported");
    errorMessage.hidden = false;
    console.error(error);
  }
});

// The light follows a fixed rhythm per loop; music would bind its own source here.
fx.bindUniforms(loopRhythm);

if (holdsFrame) {
  void fx.ready.then(() => {
    fx.setTime(stillFrame / FPS);
    fx.render();
  });
}

// `frapx-render` (@frapx/tool-render) renders this page headless, at
// EXPORT_RESOLUTION unless --resolution says otherwise: --set spp=N sets the
// samples per frame (default 32), --set shutter=F the open shutter as a
// fraction of the frame (default 0.5), and --set dither=0|1 the dither
// (default on for 8-bit PNG, off for --format png16).
registerRenderTarget(fx, {
  fps: FPS,
  duration: LOOP_SECONDS,
  resolution: EXPORT_RESOLUTION,
  prepare({ params: job, fps, format }) {
    const samples = Number(job.spp ?? SAMPLES);
    if (!Number.isInteger(samples) || samples < 1) {
      throw new RangeError(`spp must be a positive integer, got "${job.spp}"`);
    }
    const shutter = job.shutter === undefined ? SHUTTER : Number(job.shutter);
    if (!Number.isFinite(shutter) || shutter < 0 || shutter > 1) {
      throw new RangeError(`shutter must be between 0 and 1, got "${job.shutter}"`);
    }
    const dither = job.dither ?? (format === "png" ? "1" : "0");
    if (dither !== "0" && dither !== "1") {
      throw new RangeError(`dither must be 0 or 1, got "${dither}"`);
    }
    exporting = true;
    fx.setUniforms({ quality: 1, dither: Number(dither) });
    fx.setAccumulation({ samples, shutter, fps });
  }
});

window.__liminalVein = fx;
