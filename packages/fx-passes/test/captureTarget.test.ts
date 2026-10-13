import type { CaptureTarget } from "@frapx/tool-capture";
import { expect, it } from "vitest";
import type { PassesInstance } from "../src";

// An fx-passes instance must satisfy tool-capture's structural target.
type AssertAssignable<T extends CaptureTarget> = T;
export type PassesIsATarget = AssertAssignable<PassesInstance>;

it("is checked by the type checker", () => {
  expect(true).toBe(true);
});
