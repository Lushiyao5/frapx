import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ShaderBackgroundInstance } from "@frapx/fx-canvas";
import { useShaderBackground } from "@frapx/react-canvas";
import type { BuiltinBaseId } from "../lib/builtinBase";
import { getBuiltinBase } from "../lib/builtinBase";
import type { ShaderStatus } from "@frapx/fx-canvas";
import checkerUrl from "../../assets/chekcerboard.png";
import { getMode } from "../shaders/modes/index";
import type { PreviewModeId } from "../shaders/modes/index";

export type { PreviewModeId };

export interface PreviewSettings {
  mode: PreviewModeId;
  modeParams: Record<string, number>;
  base: BuiltinBaseId | "uploaded" | "checker";
  uploadedBaseUrl: string | null;
  flowSpeed: number;
  flowStrength: number;
  tiling: number;
}

export interface UsePreviewResult {
  containerRef: (node: HTMLElement | null) => void;
  updateFlow: () => void;
  status: ShaderStatus;
  error: Error | null;
}

/** 1×1 neutral placeholder flow canvas (used before the real canvas is ready) */
function makePlaceholder(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d");
  if (ctx !== null) {
    ctx.fillStyle = "rgb(128,128,0)";
    ctx.fillRect(0, 0, 1, 1);
  }
  return c;
}

const PLACEHOLDER = makePlaceholder();

export function usePreview(
  paintCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  seamless: boolean,
  settings: PreviewSettings
): UsePreviewResult {
  const { mode, modeParams, base, uploadedBaseUrl, flowSpeed, flowStrength, tiling } = settings;

  // Keep latest values in refs so updateFlow is always stable
  const paintCanvasRefLatest = useRef(paintCanvasRef);
  paintCanvasRefLatest.current = paintCanvasRef;
  const seamlessRef = useRef(seamless);
  seamlessRef.current = seamless;

  const instanceRef = useRef<ShaderBackgroundInstance | null>(null);
  const dirtyRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  /** Actual GPU upload — called at most once per animation frame */
  const flushFlow = useCallback(() => {
    const inst = instanceRef.current;
    const canvas = paintCanvasRefLatest.current.current;
    if (inst === null || canvas === null) return;
    void inst.setTexture("flow", {
      source: canvas,
      wrap: seamlessRef.current ? "repeat" : "clamp",
      filter: "nearest",
      flipY: true
    });
  }, []); // stable — uses only refs

  /**
   * Mark the flow texture as needing an update. The actual GPU upload is
   * coalesced into one requestAnimationFrame callback so that many stamps
   * within the same frame only trigger a single setTexture call.
   */
  const updateFlow = useCallback(() => {
    dirtyRef.current = true;
    if (rafRef.current !== null) return; // already scheduled
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      flushFlow();
    });
  }, [flushFlow]); // stable — flushFlow itself is stable

  // Cancel any pending rAF on unmount
  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const uniforms = useMemo(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    (): Record<string, number> => ({ flowSpeed, flowStrength, tiling, ...modeParams }),
    [flowSpeed, flowStrength, tiling, modeParams]
  );

  // Load uploaded base image into an HTMLImageElement when URL changes
  const uploadedImgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (uploadedBaseUrl === null) {
      uploadedImgRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      uploadedImgRef.current = img;
      // Update base texture on the running instance
      const inst = instanceRef.current;
      if (inst !== null) {
        void inst.setTexture("base", {
          source: img,
          wrap: "repeat",
          filter: "linear"
        });
      }
    };
    img.src = uploadedBaseUrl;
  }, [uploadedBaseUrl]);

  // Load checkerboard PNG once on mount; store as state so React can react to it
  const [checkerImg, setCheckerImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => { setCheckerImg(img); };
    img.src = checkerUrl;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute base canvas/image for initial texture
  const baseSource = useMemo<HTMLCanvasElement | HTMLImageElement>(() => {
    if (base === "checker") return checkerImg ?? getBuiltinBase("water");
    if (base !== "uploaded") return getBuiltinBase(base);
    return uploadedImgRef.current ?? getBuiltinBase("water");
  }, [base, checkerImg]);

  const initialTextures = useMemo(
    () => ({
      flow: {
        source: PLACEHOLDER,
        wrap: "clamp" as const,
        filter: "nearest" as const,
        flipY: true
      },
      base: {
        source: baseSource,
        wrap: "repeat" as const,
        filter: "linear" as const
      }
    }),
    // Only recreate textures when base SOURCE identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseSource]
  );

  const { ref: containerRef, instance, status, error } = useShaderBackground(
    {
      fragment: getMode(mode).fragment,
      uniforms,
      textures: initialTextures,
      renderMode: "always",
      pauseWhenOffscreen: false,
      debug: true,
      onShaderReady: () => {
        // Push the real paint canvas as soon as the shader is ready
        updateFlow();
      }
    },
    // Recreate shader when seamless or mode changes
    [seamless, mode]
  );

  // Keep instanceRef in sync with React state
  useEffect(() => {
    instanceRef.current = instance;
    if (instance !== null) {
      updateFlow();
    }
  }, [instance, updateFlow]);

  // React to seamless toggle: update the texture wrap without shader recreation
  const prevSeamlessRef = useRef(seamless);
  useEffect(() => {
    if (prevSeamlessRef.current === seamless) return;
    prevSeamlessRef.current = seamless;
    updateFlow();
  }, [seamless, updateFlow]);

  // React to base source change (or instance becoming ready): update the base texture
  useEffect(() => {
    if (instance === null) return;
    void instance.setTexture("base", {
      source: baseSource,
      wrap: "repeat",
      filter: base === "checker" ? "nearest" : "linear"
    });
  }, [instance, base, baseSource]);

  return { containerRef, updateFlow, status, error };
}
