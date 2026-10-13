import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForGpu } from "../src/internal/capture";
import type { GLContext } from "../src/types";

const TIMEOUT_EXPIRED = 37147;
const CONDITION_SATISFIED = 37148;

afterEach(() => {
  vi.useRealTimers();
});

describe("waitForGpu", () => {
  it("resolves immediately on WebGL1", async () => {
    await expect(waitForGpu({} as GLContext)).resolves.toBeUndefined();
  });

  it("polls a fence until the GPU has caught up, then deletes it", async () => {
    vi.useFakeTimers();
    const sync = { id: "sync" };
    const results = [TIMEOUT_EXPIRED, TIMEOUT_EXPIRED, CONDITION_SATISFIED];
    const gl = {
      SYNC_GPU_COMMANDS_COMPLETE: 37143,
      TIMEOUT_EXPIRED,
      createVertexArray: vi.fn(),
      fenceSync: vi.fn(() => sync),
      flush: vi.fn(),
      clientWaitSync: vi.fn(() => results.shift()),
      deleteSync: vi.fn()
    } as unknown as GLContext & Record<string, ReturnType<typeof vi.fn>>;

    let done = false;
    void waitForGpu(gl).then(() => {
      done = true;
    });
    expect(gl.flush).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(4);

    expect(done).toBe(true);
    expect(gl.clientWaitSync).toHaveBeenCalledTimes(3);
    expect(gl.deleteSync).toHaveBeenCalledWith(sync);
  });
});
