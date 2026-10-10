import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShaderBackground, type ShaderBackgroundHandle } from "../src";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const shaderMock = vi.hoisted(() => {
  const instance = {
    canvas: null,
    gl: null,
    status: "running",
    supported: true,
    ready: Promise.resolve(),
    start: vi.fn(),
    stop: vi.fn(),
    render: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    setTexture: vi.fn(() => Promise.resolve()),
    setTextures: vi.fn(() => Promise.resolve()),
    setUniform: vi.fn(),
    setUniforms: vi.fn(),
    setTime: vi.fn(),
    setClock: vi.fn(),
    setResolution: vi.fn()
  };

  return {
    instance,
    createShaderBackground: vi.fn(() => instance)
  };
});

vi.mock("@frapx/fx-canvas", () => ({
  createShaderBackground: shaderMock.createShaderBackground
}));

describe("ShaderBackground", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("creates and destroys a shader instance", async () => {
    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" />);
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);
    expect(shaderMock.createShaderBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        fragment: "void main() {}",
        target: expect.any(HTMLDivElement)
      })
    );

    await act(async () => {
      root.unmount();
    });

    expect(shaderMock.instance.destroy).toHaveBeenCalledTimes(1);
  });

  it("updates uniforms and textures on the existing instance", async () => {
    const uniforms = { intensity: 0.4 };
    const nextUniforms = { intensity: 0.8 };
    const textures = { image: "/image-a.webp" };
    const nextTextures = { image: "/image-b.webp" };

    await act(async () => {
      root.render(
        <ShaderBackground
          fragment="void main() {}"
          uniforms={uniforms}
          textures={textures}
        />
      );
    });

    await act(async () => {
      root.render(
        <ShaderBackground
          fragment="void main() {}"
          uniforms={nextUniforms}
          textures={nextTextures}
        />
      );
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);
    expect(shaderMock.instance.setUniforms).toHaveBeenCalledWith(nextUniforms);
    expect(shaderMock.instance.setTextures).toHaveBeenCalledWith(nextTextures);
  });

  it("passes feedback options to the core instance", async () => {
    await act(async () => {
      root.render(
        <ShaderBackground
          fragment="void main() {}"
          feedback={{ clearColor: [0, 0, 0, 0] }}
        />
      );
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        feedback: { clearColor: [0, 0, 0, 0] }
      })
    );
  });

  it("exposes an imperative handle", async () => {
    const ref = { current: null as ShaderBackgroundHandle | null };

    await act(async () => {
      root.render(<ShaderBackground ref={ref} fragment="void main() {}" />);
    });

    ref.current?.stop();
    ref.current?.setUniform("intensity", 1);

    expect(shaderMock.instance.stop).toHaveBeenCalledTimes(1);
    expect(shaderMock.instance.setUniform).toHaveBeenCalledWith("intensity", 1);
  });

  it("forwards respectReducedMotion and pauseWhenHidden to core without DOM leakage (B1 regression)", async () => {
    await act(async () => {
      root.render(
        <ShaderBackground
          fragment="void main() {}"
          respectReducedMotion
          pauseWhenHidden={false}
        />
      );
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        respectReducedMotion: true,
        pauseWhenHidden: false
      })
    );

    const div = container.firstElementChild!;
    expect(div.hasAttribute("respectReducedMotion")).toBe(false);
    expect(div.hasAttribute("respectreducedmotion")).toBe(false);
    expect(div.hasAttribute("pauseWhenHidden")).toBe(false);
    expect(div.hasAttribute("pausewhenhidden")).toBe(false);
  });

  it("exposes setTextures and setUniforms on the imperative handle (B2 regression)", async () => {
    const ref = { current: null as ShaderBackgroundHandle | null };

    await act(async () => {
      root.render(<ShaderBackground ref={ref} fragment="void main() {}" />);
    });

    const textures = { img: "/photo.webp" };
    const uniforms = { speed: 0.5 };

    ref.current?.setTextures(textures);
    ref.current?.setUniforms(uniforms);

    expect(shaderMock.instance.setTextures).toHaveBeenCalledWith(textures);
    expect(shaderMock.instance.setUniforms).toHaveBeenCalledWith(uniforms);
  });

  it("recreates the instance when a static option changes", async () => {
    await act(async () => {
      root.render(
        <ShaderBackground fragment="void main() {}" respectReducedMotion={false} />
      );
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <ShaderBackground fragment="void main() {}" respectReducedMotion={true} />
      );
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(2);
    expect(shaderMock.instance.destroy).toHaveBeenCalledTimes(1);
  });

  it("switches clock and resolution in place without recreating", async () => {
    await act(async () => {
      root.render(
        <ShaderBackground fragment="void main() {}" resolution={[640, 360]} />
      );
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: [640, 360] })
    );

    // A new array literal with the same values must not re-apply.
    await act(async () => {
      root.render(
        <ShaderBackground fragment="void main() {}" resolution={[640, 360]} />
      );
    });
    expect(shaderMock.instance.setResolution).not.toHaveBeenCalled();

    await act(async () => {
      root.render(
        <ShaderBackground
          fragment="void main() {}"
          clock="manual"
          resolution={[1920, 1080]}
        />
      );
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);
    expect(shaderMock.instance.setClock).toHaveBeenLastCalledWith("manual");
    expect(shaderMock.instance.setResolution).toHaveBeenLastCalledWith([1920, 1080]);

    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" />);
    });

    expect(shaderMock.instance.setClock).toHaveBeenLastCalledWith("realtime");
    expect(shaderMock.instance.setResolution).toHaveBeenLastCalledWith(null);
    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);
  });

  it("exposes clock and resolution controls on the imperative handle", async () => {
    const ref = { current: null as ShaderBackgroundHandle | null };

    await act(async () => {
      root.render(<ShaderBackground ref={ref} fragment="void main() {}" />);
    });

    ref.current?.setTime(1.5);
    ref.current?.setClock("manual");
    ref.current?.setResolution([800, 600]);

    expect(shaderMock.instance.setTime).toHaveBeenCalledWith(1.5);
    expect(shaderMock.instance.setClock).toHaveBeenCalledWith("manual");
    expect(shaderMock.instance.setResolution).toHaveBeenCalledWith([800, 600]);
  });
});
