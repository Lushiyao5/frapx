# Poolrooms

A seamless 24-second loop through an endless grid of tiled pool halls, path
traced with `@frapx/glsl-sdf` and `@frapx/glsl-raymarch`, accumulated with
`@frapx/fx-passes` and exported frame by frame with `@frapx/tool-capture`.

```sh
pnpm --filter @frapx/example-vite-poolrooms dev
```

Needs WebGL2 with `EXT_color_buffer_float`. Folder export needs the File System
Access API (Chrome or Edge).

## How a frame is made

- Two `@frapx/fx-passes` passes. `scene` path traces one sample in linear
  light and accumulates: the runtime sums the samples in 32-bit float and
  passes their mean on, so the mean never drifts darker as samples pile up
  (a running mean stored in half floats does, on GPUs that truncate on store).
  `display` then applies exposure, vignette and the tone curve once per frame,
  and adds grain and triangular dither so 8-bit exports do not band.
- `captureSequence()` sets the time to `frame / fps` and calls
  `captureFrame()`, which draws all the frame's samples, waiting for the GPU
  between batches so a slow 4K frame never trips the browser's GPU watchdog.
- Each sample jitters within the pixel and within a 180° shutter, so the mean
  is anti-aliased and motion blurred. The jitter, the shutter time and the
  first bounce's light and direction come from an Owen-scrambled Sobol
  sequence indexed by `u_sampleIndex`. It is scrambled per pixel, so low sample
  counts look like noise rather than the ghost copies a frame-wide sequence
  such as `u_jitter` gives.
- The scene derives the frame number from the frame time modulo the loop (720
  frames at 30 fps) and seeds its random numbers from it, so frame 720 is
  byte-identical to frame 0. Ranges split across several exports match a
  single export.

## Rendering the loop

At 3840 × 2160 with 192 samples, a frame takes about 34 s and its PNG is about
19 MB (the grain does not compress), so the full loop is about 7 h and 14 GB on
an M-series Mac. Viewed at 1080p, 192 samples is hard to tell from a
2048-sample reference. Keep the tab visible while exporting: background tabs
throttle the timers that pace the samples.

A paused frame refines to the Samples count. A smaller resolution looks
grainier than the 4K export at the same count, so preview at 3840 × 2160
(about 30 s per frame) to judge noise, and use the smaller ones for framing.

1. Choose 3840 × 2160, Path traced, 30 fps, 192 samples, frames 0–719.
2. Export to folder. To resume after stopping, set First to the frame shown and
   export again into the same folder.
3. Encode in that folder. ProRes 422 HQ master for editing:

   ```sh
   ffmpeg -framerate 30 -i frame_%05d.png \
     -vf "scale=out_color_matrix=bt709:out_range=tv" \
     -c:v prores_ks -profile:v 3 -vendor apl0 -pix_fmt yuv422p10le \
     -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
     poolrooms-4k30-prores.mov
   ```

   H.264 for review:

   ```sh
   ffmpeg -framerate 30 -i frame_%05d.png \
     -vf "scale=out_color_matrix=bt709:out_range=tv" \
     -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p \
     -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
     -movflags +faststart poolrooms-4k30.mp4
   ```

Play either with looping (`ffplay -loop 0 …`) to check the seam.
