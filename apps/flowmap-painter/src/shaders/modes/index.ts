export type { ControlDef, PreviewMode, PreviewModeId } from "./types";

import { advectMode } from "./advect";
import { normalLitMode } from "./normalLit";
import { waterMode } from "./water";
import { particlesMode } from "./particles";
import { compositeMode } from "./composite";
import type { PreviewMode, PreviewModeId } from "./types";

export const PREVIEW_MODES: PreviewMode[] = [
  advectMode,
  normalLitMode,
  waterMode,
  particlesMode,
  compositeMode
];

export function getMode(id: PreviewModeId): PreviewMode {
  const mode = PREVIEW_MODES.find(m => m.id === id);
  if (mode === undefined) throw new Error(`Unknown preview mode: ${id}`);
  return mode;
}
