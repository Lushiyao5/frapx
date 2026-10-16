# Changelog

## Unreleased

### Added

- Initial release: `<Particles />` and `useParticles()` React bindings for `@frapx/fx-particles`.
- Options are compared by value. Uniform-backed values, `color`, `palette`, `blend`, `clock` and `resolution` change in place; other changes, removing an in-place value, and a `rate` that outgrows the automatic pool recreate the instance.
- `uniformSources` prop / hook option: `UniformSource`s such as `keyframes()` bound in array order and rebound on a recreated instance.
- An imperative handle forwarding the instance's methods, including `captureFrame`, `reset` and `bindUniforms`.
