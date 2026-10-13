// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// Deployed at https://kramhash.github.io/frapx/ (GitHub Pages project site).
// The flowmap-painter demo app is built separately and copied into
// dist/playground/ by .github/workflows/pages.yml, so it lives at
// https://kramhash.github.io/frapx/playground/ under this same base.
export default defineConfig({
  site: "https://kramhash.github.io",
  base: "/frapx",
  integrations: [
    starlight({
      title: "frapx",
      description:
        "Web graphics utilities for building lightweight visual effects on the web.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/kramhash/frapx",
        },
      ],
      sidebar: [
        { label: "Getting Started", slug: "getting-started" },
        {
          label: "Packages",
          items: [
            { label: "@frapx/fx-canvas", slug: "packages/fx-canvas" },
            { label: "@frapx/fx-passes", slug: "packages/fx-passes" },
            { label: "@frapx/react-canvas", slug: "packages/react-canvas" },
            { label: "@frapx/glsl-noise", slug: "packages/glsl-noise" },
            { label: "@frapx/glsl-flowmap", slug: "packages/glsl-flowmap" },
            { label: "@frapx/glsl-sdf", slug: "packages/glsl-sdf" },
            { label: "@frapx/glsl-raymarch", slug: "packages/glsl-raymarch" },
            { label: "@frapx/tool-capture", slug: "packages/tool-capture" },
            { label: "@frapx/core", slug: "packages/core" },
          ],
        },
        { label: "Live Demo", slug: "live-demo" },
        { label: "Migrating from old package names", slug: "migration" },
      ],
    }),
  ],
});
