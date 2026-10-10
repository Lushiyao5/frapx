# @frapx/react-canvas

[![npm version](https://img.shields.io/npm/v/@frapx/react-canvas.svg)](https://www.npmjs.com/package/@frapx/react-canvas)

React bindings for `@frapx/fx-canvas`.

This package is a thin lifecycle adapter. It does not replace the core render
loop with React state, and it does not ship CSS.

## Install

```sh
pnpm add @frapx/fx-canvas @frapx/react-canvas react
```

## Component

```tsx
import { ShaderBackground } from "@frapx/react-canvas";
import { glsl } from "@frapx/fx-canvas";

const fragment = glsl`
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  gl_FragColor = vec4(uv, 0.5 + 0.5 * sin(u_time), 1.0);
}
`;

export function HeroBackground() {
  return <ShaderBackground fragment={fragment} className="hero-bg" />;
}
```

The component renders a wrapper `div` and mounts the shader canvas into it.
The wrapper defaults to `position: relative` and `overflow: hidden`; layout,
height, and visual styling are controlled by your app.

Core shader options pass through as props, including `feedback`:

```tsx
<ShaderBackground fragment={feedbackFragment} feedback />;
```

Initialization options such as `fragment`, `vertex`, `feedback`, `renderMode`,
`dpr`, and canvas settings recreate the underlying shader instance when they
change. Runtime `uniforms` and `textures` update the existing instance.

## Hook

```tsx
import { useMemo } from "react";
import { useShaderBackground } from "@frapx/react-canvas";

export function ShaderPanel({ intensity }: { intensity: number }) {
  const uniforms = useMemo(() => ({ intensity }), [intensity]);
  const { ref, instance, error } = useShaderBackground(
    {
      fragment,
      uniforms,
      feedback: true
    },
    [fragment, true]
  );

  return <div ref={ref} />;
}
```

Pass recreation dependencies as the second argument. `uniforms` and `textures`
are updated on the existing instance with `setUniforms()` and `setTextures()`;
shader source and other initialization options, including `feedback`, should be
included in the recreation dependency array when they change.

## Imperative Handle

```tsx
import { useRef } from "react";
import {
  ShaderBackground,
  type ShaderBackgroundHandle
} from "@frapx/react-canvas";

const ref = useRef<ShaderBackgroundHandle>(null);

<ShaderBackground ref={ref} fragment={fragment} />;

ref.current?.stop();
ref.current?.start();
ref.current?.setUniform("intensity", 1);
```

The handle forwards commands to the latest shader instance, so it remains useful
when React recreates the underlying runtime.

### Deterministic rendering

`clock` and `resolution` are passed like other options, but changing them
switches the existing instance in place (`setClock` / `setResolution`) instead
of recreating it. `resolution` is compared by value, so an inline array literal
is fine. The handle also exposes `setTime`, `setClock` and `setResolution`:

```tsx
<ShaderBackground
  ref={ref}
  fragment={fragment}
  clock="manual"
  resolution={[1920, 1080]}
/>;

ref.current?.setTime(2);
ref.current?.render();
```

See the `@frapx/fx-canvas` README ("Deterministic Rendering") for the
semantics.

## Notes

- React 18 and newer are supported.
- The package is safe to import during SSR; WebGL work starts only after mount.
- React StrictMode double mounting is handled by destroying the previous runtime
  in effect cleanup.
- Keep `uniforms` and `textures` stable with `useMemo` when they are derived
  from React state.
- `onShaderReady` and `onShaderError` are used instead of core `onReady` and
  `onError` to avoid DOM prop naming conflicts.
