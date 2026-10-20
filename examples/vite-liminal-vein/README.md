# LIMINAL VEIN

A seamless 16-second loop through a quiet, breathing tunnel of ribs that bends
aside once per loop, lit only by a few glowing rings and the rare vein, drawn
with `@frapx/glsl-sdf` and `@frapx/glsl-raymarch` on `@frapx/fx-passes`. The same page plays in real time
and renders the loop frame by frame with `@frapx/tool-render`.

```sh
pnpm --filter @frapx/example-vite-liminal-vein dev
```

Needs WebGL2 with `EXT_color_buffer_float`.

## How a frame is made

- `scene` marches one ray in linear light and accumulates. The walls take
  their light only from the glowing rings, so what the rings do not reach
  stays dark.
- Once per frame, on the mean of the samples: bloom as plain
  `@frapx/fx-passes` passes (halvings down to 1/64 and back up, in
  `src/bloom.glsl.ts`), then `display` adds it and applies the vignette, an
  ACES tone curve and dither. Bright rings roll off to white with a cyan halo,
  and keep their brightness under motion blur.
- Playing draws one sample per frame. A frame that holds still (reduced
  motion, or `?frame=N`) refines to 32 samples. Each sample moves `u_time`
  within a 180° shutter and the ray within the pixel (`u_jitter`), so the mean
  is motion blurred and anti-aliased.
- Everything that varies along the tunnel, the bend included, repeats every
  loop distance, so the camera wraps from the end of the loop to its start
  without a jump. `accumulation.loop` wraps the time itself, so frame 960
  renders identically to frame 0, to the bit.
- The light follows a rhythm, `pulse` (a beat every 4 s that flares and fades)
  and `energy` (swelling through the middle of the loop), bound with
  `bindUniforms()` from `src/rhythm.ts`. It is a fixed curve for now; music
  would replace that source with values from its analysis.

`?frame=N` holds frame N of the 60 fps loop at full quality, to check a frame
without rendering it.

## Rendering the loop

```sh
pnpm --filter @frapx/example-vite-liminal-vein build
pnpm --filter @frapx/tool-render build
node packages/tool-render/dist/cli.js examples/vite-liminal-vein/dist \
  --out renders/liminal-vein --format png16 --encode prores --encode h264
```

The page renders 960 frames (16 s at 60 fps) at 1920 × 1080 with 32 samples
by default, about 0.8 s per frame (about 13 min for the loop, encoding
included) on an M4 Max.

- `--resolution 3840x2160` renders another size (4K takes about 1.5 s per
  frame, about 24 min for the loop, on an M4 Max); `--fps 30` another rate (the
  loop stays 16 s).
- `--set spp=64` changes the samples per frame, `--set shutter=0` turns motion
  blur off.
- Dither is on for 8-bit PNG and off for `--format png16`; `--set dither=0|1`
  overrides it.
- Interrupted? Run the same command with `--resume`.
