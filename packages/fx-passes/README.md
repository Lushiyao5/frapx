# @frapx/fx-passes

WebGL2 multipass shader runtime for video work. It chains Shadertoy-style buffers with float outputs, and accumulates samples deterministically for anti-aliasing and motion blur. It shares its host with [`@frapx/fx-canvas`](../fx-canvas), so the clock, fixed resolution, `captureFrame()` and the lifecycle behave the same way, and [`@frapx/tool-capture`](../tool-capture) exports it as is.

Use `@frapx/fx-canvas` for website backgrounds. Use this package when one pass is not enough or a frame needs many samples.

```sh
pnpm add @frapx/fx-passes
```

```ts
import { createPasses } from "@frapx/fx-passes";

const fx = createPasses({
  target: "#stage",
  resolution: [3840, 2160],
  clock: "manual",
  accumulation: { samples: 64, shutter: 0.5, fps: 60 },
  passes: [
    { name: "scene", fragment: sceneFragment, accumulate: true, format: "rgba32f" },
    { name: "bloom", fragment: bloomFragment, inputs: ["scene"], scale: 0.5 },
    { name: "final", fragment: finalFragment, inputs: ["scene", "bloom"] }
  ]
});

fx.setTime(2);
const pixels = await fx.captureFrame({ format: "rgba16f" });
```

## Passes

Passes are drawn in order every frame. The last pass is shown on the canvas and captured.

- `inputs` lists the passes a pass samples. Each one is a `sampler2D` named `u_<name>`, and its size in pixels is `u_<name>Size`.
- A pass listed **earlier** gives its output from this frame. The pass itself, or a pass listed **later**, gives its output from the **previous** frame, like Shadertoy buffers. Such a pass keeps two buffers automatically, and `resetFeedback()` clears them.
- `format` sets the output storage: `"rgba8"`, `"rgba16f"` (the default) or `"rgba32f"`.
- `scale` sizes the output relative to the canvas, and `u_resolution` is the pass' own size.
- `filter` and `wrap` set how readers sample the output.

Pass names must be GLSL identifiers and may not shadow built-in uniforms. User uniforms (`uniforms`, `setUniform`) and textures (`textures`, `setTexture`) go to every pass that declares them.

## Accumulation

A pass with `accumulate: true` is drawn `accumulation.samples` times per frame. The runtime sums the samples in 32-bit float and passes their mean on to later passes, so the pass' shader only outputs one sample's color. Later passes, such as tone mapping or bloom, run once on the mean.

| Uniform | In accumulating passes |
| --- | --- |
| `u_time` | The sample's moment within the open shutter, `[time, time + shutter / fps)` |
| `u_frameTime` | The frame's time |
| `u_jitter` | Sub-pixel offset in pixels, each component in [-0.5, 0.5); add it to `gl_FragCoord.xy` |
| `u_sampleIndex` / `u_sampleCount` | The sample's index, and the samples in the frame |

Because `u_time` moves within the shutter, a shader that depends only on time gets motion blur without changes. Samples follow a low-discrepancy (R3) sequence, so the same frame always gives the same pixels. Sample 0 has no jitter and opens the shutter, so one sample is the plain frame. Outside accumulating passes, `u_time` equals `u_frameTime`, `u_jitter` is zero and `u_sampleCount` is 1.

- **Preview.** While the frame's inputs (time, uniforms, textures, size) stay the same, each draw adds one sample until `samples` is reached, and a change starts over. A running realtime loop therefore shows one sample per frame. A stopped or manual-clock instance keeps refining the still frame on animation frames by itself. Progress is in `samplesDrawn` and `onSample`.
- **Capture.** `captureFrame()` always draws every sample of the frame from scratch, waiting for the GPU between batches so long frames never trip the browser's GPU watchdog. Then it runs the remaining passes and reads the last one. A capture's `signal` is checked between samples. Uniform, accumulation and feedback changes made while it draws apply to the next frame.

Accumulating passes must come first in the list. They may only read passes listed after them, which gives those passes' previous-frame output.

## Hot reloading

`setFragment(name, source)` swaps one pass' fragment shader. The pass keeps its buffers, format and inputs, and the time, uniforms and textures carry over; the frame's samples start over. Like `@frapx/fx-canvas`, a compile error is returned (and passed to `onError`) rather than thrown, with the located lines in `error.lines`, and the previous shader keeps drawing. A swap during `captureFrame()` applies from the next frame. Changing the pass list, formats or inputs needs a new instance.

## Requirements

WebGL2 with `EXT_color_buffer_float`. Without it, `status` is `"unsupported"` and `ready` rejects with `UnsupportedError`. Shaders may be GLSL ES 1.00 or 3.00, chosen per pass. Samples are summed with additive blending when `EXT_float_blend` is available, and with an extra pass otherwise.

## License

MIT
