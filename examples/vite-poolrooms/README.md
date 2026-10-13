# Poolrooms

A seamless 24-second loop through an endless grid of tiled pool halls, path
traced with `@frapx/glsl-sdf` and `@frapx/glsl-raymarch` and exported frame by
frame with `@frapx/tool-capture`.

```sh
pnpm --filter @frapx/example-vite-poolrooms dev
```

Needs WebGL2 with `EXT_color_buffer_float`. Folder export needs the File System
Access API (Chrome or Edge).

## How a frame is made

- The fx-canvas feedback buffer (`rgba16f`) holds the running mean of the
  current frame's samples. Sample 0 discards the history, so frames never
  bleed into each other.
- `captureSequence()` calls `onBeforeFrame`, which draws samples 0 to N − 2
  and waits for the GPU after each one; `captureFrame()` then draws sample
  N − 1, which adds grain and dither, and reads the frame.
- Each sample jitters within the pixel and within a 180° shutter, so the mean
  is anti-aliased and motion blurred.
- The scene only sees the frame number modulo the loop (720 frames at 30 fps),
  and the random numbers are seeded from it, so frame 720 is byte-identical to
  frame 0. Ranges split across several exports match a single export.

## Rendering the loop

At 3840 × 2160 with 64 samples, a frame takes about 11 s and its PNG is about
20 MB (the grain does not compress), so the full loop is about 2 h and 14 GB on
an M-series Mac. Keep the tab visible while exporting: background tabs throttle
the timers that pace the samples.

1. Choose 3840 × 2160, Path traced, 30 fps, 64 samples, frames 0–719.
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
