// Speaks the registerRenderTarget() protocol by hand. Each frame is a 1x1 PNG.
// window.onFrame(frame) may return "hang" to stop answering.
const png = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0)
);
globalThis.__frapxRender = {
  version: 1,
  describe: () => ({ fps: 10, duration: 1 }),
  async render(job) {
    for (let frame = job.startFrame; frame < job.startFrame + job.frameCount; frame++) {
      if ((await window.onFrame?.(frame)) === "hang") return new Promise(() => {});
      const name = `frame_${String(frame).padStart(5, "0")}.png`;
      const response = await fetch(`${job.endpoint}/frame/${name}`, { method: "POST", body: new Blob([png]) });
      if (!response.ok) throw new Error(await response.text());
    }
    return { width: 1, height: 1 };
  },
  abort() {}
};
