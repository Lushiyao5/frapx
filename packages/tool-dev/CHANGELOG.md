# Changelog

## Unreleased

### Added

- Added the initial `@frapx/tool-dev` package.
- `createErrorOverlay({ parent, position })`: an on-page overlay for shader compile errors that shows each located error with its source lines, for hot reloading with `setFragment()`. Renders in a shadow root with text nodes only.
- `examples/vite-hot-reload`: Vite HMR swapping a shader in place, with the overlay.
