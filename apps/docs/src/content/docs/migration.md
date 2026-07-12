---
title: Migrating from old package names
description: Mapping from the pre-2026-07-12 package names to the current category-prefixed names.
---

On 2026-07-12, all five frapx packages were renamed to a category-prefixed
scheme so the package name tells you what kind of package it is. **No public
JS API changed** — `createShaderBackground`, `ShaderBackground`,
`useShaderBackground`, and every other export are exactly the same. Only the
npm package name and import path changed.

| Old name | New name |
| --- | --- |
| `@frapx/runtime` | `@frapx/core` |
| `@frapx/shader` | `@frapx/fx-canvas` |
| `@frapx/shader-react` | `@frapx/react-canvas` |
| `@frapx/shader-noise` | `@frapx/glsl-noise` |
| `@frapx/shader-flowmap` | `@frapx/glsl-flowmap` |

## Updating

```sh
pnpm remove @frapx/shader @frapx/shader-react @frapx/shader-noise @frapx/shader-flowmap
pnpm add @frapx/fx-canvas @frapx/react-canvas @frapx/glsl-noise @frapx/glsl-flowmap
```

Then update imports — a simple find-and-replace, since every export keeps
its name:

```diff
-import { createShaderBackground, glsl } from "@frapx/shader";
+import { createShaderBackground, glsl } from "@frapx/fx-canvas";

-import { ShaderBackground } from "@frapx/shader-react";
+import { ShaderBackground } from "@frapx/react-canvas";

-import { fbm3d } from "@frapx/shader-noise";
+import { fbm3d } from "@frapx/glsl-noise";

-import { flowDecode, flowDistort } from "@frapx/shader-flowmap";
+import { flowDecode, flowDistort } from "@frapx/glsl-flowmap";
```

`@frapx/runtime` → `@frapx/core` is a transitive dependency of
`@frapx/fx-canvas`; if you don't import it directly, updating `@frapx/shader`
to `@frapx/fx-canvas` handles it automatically.

## Old packages

The old npm packages are marked deprecated (pointing here) and will not
receive further updates. They are not unpublished — existing installs keep
working — but new features and fixes only land under the new names.
