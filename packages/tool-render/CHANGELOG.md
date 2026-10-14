# Changelog

## Unreleased

### Added

- Added the initial `@frapx/tool-render` package and its `frapx-render` command: renders a page that calls `registerRenderTarget()` (`@frapx/tool-capture`) in headless Chrome and writes a PNG sequence to disk. Its only dependency is `playwright-core`.
- Sources: an http(s) URL, or a directory served on a local port.
- `--range`, `--fps`, `--resolution`, `--format png|png16` and `--set key=value` (passed to the page's `prepare()`).
- Resumable output: frames are written atomically next to a `frapx-render.json` of the render settings, and `--resume` renders only the missing frames when the settings match.
- Recovery: a crashed page or a lost WebGL context reopens the page and continues; three failures in a row without progress stop the render. A reload or navigation during the render stops it.
- Stops on a software WebGL renderer unless `--allow-software` is passed.
- `--encode prores|h264` encodes the range with the ffmpeg on `PATH`, tagged BT.709.
- `render()` exposes the same as a function, with progress events and an `AbortSignal`.
