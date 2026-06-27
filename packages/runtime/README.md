# @frapx/runtime

Shared WebGL runtime host for `@frapx` packages.

This package provides the core WebGL lifecycle engine (canvas setup, context management, animation loop, a11y gates) shared between `@frapx/shader` and future frapx packages. It is a low-level building block and its API may change between minor versions while `@frapx/runtime` remains at `0.x`.

If you are building a WebGL experience, you most likely want [`@frapx/shader`](https://www.npmjs.com/package/@frapx/shader) instead.

## License

MIT
