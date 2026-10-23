# Changelog

## 0.2.0 - 2026-10-23

### Added

- `timeSource` prop. It switches in place like `clock`, and the instance calls the latest function through a stable wrapper, so an inline arrow function neither recreates the instance nor restarts `u_delta`.

## 0.1.0 - 2026-10-16

### Added

- Initial release: `<Particles />` and `useParticles()` React bindings for `@frapx/fx-particles`.
- Options are compared by value. Uniform-backed values, `color`, `palette`, `blend`, `clock` and `resolution` change in place; other changes, removing an in-place value, and a `rate` that outgrows the automatic pool recreate the instance.
- `uniformSources` prop / hook option: `UniformSource`s such as `keyframes()` bound in array order and rebound on a recreated instance.
- An imperative handle forwarding the instance's methods, including `captureFrame`, `reset` and `bindUniforms`.
