import { createShaderBackground } from "@frapx/fx-canvas";
import type { ShaderBackgroundInstance } from "@frapx/fx-canvas";
import { createErrorOverlay } from "@frapx/tool-dev";
import type { ErrorOverlay } from "@frapx/tool-dev";
import { fragment } from "./scene.glsl";
import "./styles.css";

declare global {
  interface Window {
    // Read by verification scripts.
    __frapxHot?: { readonly fx: ShaderBackgroundInstance; readonly overlay: ErrorOverlay };
  }
}

const timeOutput = document.querySelector<HTMLOutputElement>("[data-time]")!;

const fx = createShaderBackground({
  target: "[data-stage]",
  fragment,
  onAfterRender({ time }) {
    timeOutput.value = time.toFixed(2);
  }
});

// Development only: the overlay and the hot swap are dropped from builds.
if (import.meta.hot) {
  const overlay = createErrorOverlay();
  // A shader that fails on the first load has nothing to fall back to.
  fx.ready.catch((error: unknown) => overlay.show(error));

  import.meta.hot.accept("./scene.glsl", (module) => {
    const next: unknown = module?.["fragment"];
    if (typeof next !== "string") return;
    // The first shader never compiled, so there is no instance to swap into.
    if (fx.status === "error") {
      import.meta.hot!.invalidate();
      return;
    }
    const error = fx.setFragment(next);
    if (error) overlay.show(error);
    else overlay.clear();
  });

  window.__frapxHot = { fx, overlay };
}
