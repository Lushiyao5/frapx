export type PreviewModeId = "advect" | "normalLit" | "water" | "particles" | "composite";

export interface ControlDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface PreviewMode {
  id: PreviewModeId;
  label: string;
  fragment: string;
  controls: ControlDef[];
  defaults: Record<string, number>;
}
