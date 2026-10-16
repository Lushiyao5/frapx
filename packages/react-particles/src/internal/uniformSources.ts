import type { UniformSource } from "@frapx/fx-particles";
import { useRef } from "react";

type Bindable = {
  bindUniforms(source: UniformSource): () => void;
};

/** The sources bound to one instance, with the functions that remove them. */
export type BoundSources = {
  sources: readonly UniformSource[];
  removers: Array<() => void>;
};

const EMPTY: readonly UniformSource[] = [];

/** Binds `sources` in order, so a later one wins for the same uniform. */
export const bindSources = (
  target: Bindable,
  sources: readonly UniformSource[]
): BoundSources => ({
  sources,
  removers: sources.map((source) => target.bindUniforms(source))
});

export const unbindSources = (bound: BoundSources | null): void => {
  if (!bound) return;
  for (const remove of bound.removers) remove();
};

/**
 * Returns the previous array while it holds the same sources in the same order,
 * so an inline array literal does not rebind every render. `undefined` and an
 * empty array both become one shared empty array.
 */
export const useStableSources = (
  sources: readonly UniformSource[] | undefined
): readonly UniformSource[] => {
  const ref = useRef<readonly UniformSource[]>(EMPTY);
  const next = sources && sources.length > 0 ? sources : EMPTY;
  const previous = ref.current;
  if (
    next !== previous &&
    (next.length !== previous.length || next.some((source, index) => source !== previous[index]))
  ) {
    ref.current = next;
  }
  return ref.current;
};
