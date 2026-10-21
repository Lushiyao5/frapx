# Changelog

## Unreleased

### Added

- `--path <route>` (`RenderOptions.path`) opens a route of a directory source, such as `frapx-render dist --path /music`. It must start with a single `/` and may carry a query; with a URL source it is an error, since the route belongs in the URL. `frapx-render.json` records it, and `--resume` refuses a different route (manifests without it count as `/`).
- The directory server falls back to the root `index.html` for a missing route without a file extension, so single-page app routes render from `dist/`. Missing files with an extension are still 404.

### Documentation

- `localhost` vs `127.0.0.1` for URL sources served by `vite preview` or `vite dev`.

## 0.2.0 - 2026-10-20

### Added

- Renders at the `resolution` a page declares with `registerRenderTarget()` when `--resolution` is not given. `frapx-render.json` and the `--resume` check record the size actually used.
- Prints the render size when a render starts (`Size: …`); the `start` event carries it as `resolution`.

## 0.1.0 - 2026-10-14

### Added

- Added the initial `@frapx/tool-render` package and its `frapx-render` command: renders a page that calls `registerRenderTarget()` (`@frapx/tool-capture`) in headless Chrome and writes a PNG sequence to disk. Its only dependency is `playwright-core`.
- Sources: an http(s) URL, or a directory served on a local port.
- `--range`, `--fps`, `--resolution`, `--format png|png16` and `--set key=value` (passed to the page's `prepare()`).
- Resumable output: frames are written atomically next to a `frapx-render.json` of the render settings, and `--resume` renders only the missing frames when the settings match.
- Recovery: a crashed page or a lost WebGL context reopens the page and continues; three failures in a row without progress stop the render. A reload or navigation during the render stops it.
- Stops on a software WebGL renderer unless `--allow-software` is passed.
- `--encode prores|h264` encodes the range with the ffmpeg on `PATH`, tagged BT.709.
- `render()` exposes the same as a function, with progress events and an `AbortSignal`.
