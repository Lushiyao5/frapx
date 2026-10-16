# @frapx/tool-capture

Browser frame export for `@frapx/fx-canvas`, `@frapx/fx-passes` and `@frapx/fx-particles`: render a deterministic PNG sequence (8-bit, or 16-bit from a float buffer) and write it to a folder or a single ZIP. No dependencies.

It drives an instance through `setTime()` and `captureFrame()`, so frame `n` always shows the scene at `n / fps` seconds no matter how slow the GPU is. To render from the command line instead of a browser tab, see [`@frapx/tool-render`](../tool-render). In-browser video encoding (WebCodecs + a muxer) is planned for a later version.

## Install

```sh
pnpm add @frapx/fx-canvas @frapx/tool-capture
```

## Usage

```ts
import { createShaderBackground } from "@frapx/fx-canvas";
import { captureSequence, createZipSink, downloadBlob } from "@frapx/tool-capture";

const fx = createShaderBackground({
  target: ".stage",
  fragment,
  clock: "manual",
  resolution: [3840, 2160]
});

button.addEventListener("click", async () => {
  const zip = await captureSequence(fx, {
    sink: createZipSink(),
    fps: 30,
    frameCount: 90,
    onProgress: ({ completed, total }) => console.info(`${completed}/${total}`)
  });
  downloadBlob(zip, "frames.zip");
});
```

`captureSequence()` switches the instance to its manual clock for the export and restores the previous clock afterwards, so a live realtime background can be exported too; it then resumes from the time of the last exported frame. Pointer input, visibility and reduced motion never affect the frames.

### Writing to a folder

In Chromium-based browsers, write frames straight to a folder instead of holding them in memory. Call `pickDirectorySink()` from a click handler:

```ts
import { canPickDirectory, captureSequence, pickDirectorySink } from "@frapx/tool-capture";

if (canPickDirectory()) {
  const sink = await pickDirectorySink(); // rejects with AbortError if dismissed
  await captureSequence(fx, { sink, fps: 30, frameCount: 900 });
}
```

Use `createDirectorySink(handle)` when you already have a `FileSystemDirectoryHandle`.

### 16-bit PNG

`format: "png16"` reads the float feedback buffer instead of the 8-bit canvas, so smooth gradients keep more than 256 steps. The instance needs a float buffer, and should fail rather than fall back to 8 bits:

```ts
const fx = createShaderBackground({
  target: ".stage",
  fragment,
  clock: "manual",
  resolution: [3840, 2160],
  feedback: { format: "rgba16f", formatFallback: false }
});

await captureSequence(fx, { sink, fps: 30, frameCount: 90, format: "png16" });
```

The buffer is half float, so the precision near 1.0 is about 11 bits; near black it is finer. Values are clamped to 0–1 and stored as the shader wrote them, with no color conversion. Encoding is CPU work: a 4K frame took about 0.7 s and 4 MB, against 0.08 s and 1.8 MB for 8-bit (Apple Silicon, Chrome).

### Rendering from the command line

`registerRenderTarget()` lets [`@frapx/tool-render`](../tool-render) render the page headlessly with `frapx-render`, resuming interrupted renders and encoding with ffmpeg. It only sets a global, so it can stay in production builds:

```ts
import { registerRenderTarget } from "@frapx/tool-capture";

registerRenderTarget(fx, {
  fps: 30,
  duration: 24,
  prepare({ params }) {
    fx.setUniform("quality", Number(params.quality ?? 1));
  }
});
```

```sh
frapx-render dist --out frames --resolution 3840x2160 --set quality=2
```

`prepare({ params, fps, format, resolution })` runs before each render job. Pass a getter (`() => fx`) when the page replaces its instance. Registering again replaces the previous registration; the returned function removes it.

## API

### `captureSequence(target, options): Promise<TResult>`

Renders frames `startFrame` to `startFrame + frameCount - 1` and writes each one to `options.sink`, then resolves with the sink's `close()` result (the ZIP `Blob` for `createZipSink()`).

| Option | Default | |
| --- | --- | --- |
| `sink` | required | Where frames go. See [Sinks](#sinks). |
| `fps` | required | Frame `n` is drawn at `n / fps` seconds. |
| `frameCount` | required | Number of frames to write. |
| `startFrame` | `0` | First frame number. Frame numbers name the files and set the time, so for shaders that depend only on time, a range split across several runs matches a single run. Feedback history does not carry over between runs. |
| `format` | `"png"` | `"png"` (8-bit canvas) or `"png16"` (16-bit from the float buffer). |
| `fileName` | `frame_00000.png` | `(frame) => string`. Must be a plain file name for folder sinks. |
| `resetFeedback` | `true` | Clears feedback history before the first frame, so repeated exports start from the same state. |
| `signal` | | An `AbortSignal`. Aborting rejects with `signal.reason`. |
| `onBeforeFrame` | | `({ frame, time }) => void \| Promise<void>`. Runs after the time is set and before the frame is drawn, e.g. to set uniforms. |
| `onProgress` | | `({ frame, time, completed, total }) => void`. |

`u_delta` is `1 / fps` on every frame, including the first. When an export fails or is aborted, the sink's `abort()` runs and the promise rejects; frames already written to a folder stay there.

The target only needs `ready`, `canvas`, `clock`, `setClock()`, `setTime()`, `captureFrame()` and optionally `resetFeedback()` (the `CaptureTarget` type). `@frapx/fx-canvas`, `@frapx/fx-passes` and `@frapx/fx-particles` instances fit as is; this package depends on none of them. The export's `signal` is passed to `captureFrame()`, so an fx-passes frame accumulating many samples, or an fx-particles frame catching up on its simulation, stops part-way.

### Sinks

| Export | Result | |
| --- | --- | --- |
| `createZipSink({ date? })` | `Blob` | One uncompressed ZIP held in memory. PNGs are already compressed, so storing them costs nothing. Writes ZIP64 records past 4 GiB or 65,535 frames, but long 4K exports can exceed available memory; prefer a folder there. |
| `pickDirectorySink()` | `void` | Opens the folder picker (File System Access API, Chromium only). Rejects with `AbortError` when dismissed and `NotSupportedError` where unavailable. |
| `createDirectorySink(handle)` | `void` | Writes into a `FileSystemDirectoryHandle`, replacing files with the same name. |

`canPickDirectory()` reports whether the picker exists. Write your own sink by implementing `FrameSink<TResult>`: `write(name, blob)`, `close()` and an optional `abort(reason)`.

### Utilities

- `encodePng16(pixels, width, height): Promise<Blob>` encodes RGBA floats (top row first, as `captureFrame({ format: "rgba16f" })` returns them) as a 16-bit PNG, using the platform `CompressionStream`.
- `downloadBlob(blob, fileName)` saves a Blob through the browser's download flow.

## Example

`examples/vite-capture` exports a raymarched scene as 8-bit or 16-bit PNGs to a folder or a ZIP:

```sh
pnpm --filter @frapx/example-vite-capture dev
```
