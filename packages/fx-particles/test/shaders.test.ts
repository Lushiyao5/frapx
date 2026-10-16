import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/internal/config";
import { renderFragment, renderVertex, simulationVertex } from "../src/internal/shaders";

describe("shader codegen", () => {
  it("includes only the configured forces", () => {
    const bare = simulationVertex(resolveConfig({}));
    expect(bare).not.toContain("u_gravity");
    expect(bare).not.toContain("frapx_curl3d");
    expect(bare).not.toContain("u_drag");

    const full = simulationVertex(
      resolveConfig({ forces: { gravity: [0, -1, 0], drag: 1, curl: {}, pointer: {} } })
    );
    expect(full).toContain("acceleration += u_gravity;");
    expect(full).toContain("vec3 frapx_curl3d(vec3 p)");
    expect(full).toContain("velocity *= exp(-u_drag * u_dt);");
    expect(full).toContain("u_pointerStrength");
  });

  it("bakes the sprite shape, size curve and tumble", () => {
    const config = resolveConfig({ sprite: "ring", sizeOverLife: "fadeOut", tumble: true });
    expect(renderFragment(config)).toContain("0.62");
    expect(renderVertex(config)).toContain("1.0 - smoothstep(0.8, 1.0, life)");
    expect(renderVertex(config)).toContain("corner.x *= cos");
    expect(renderFragment(resolveConfig({ sprite: "/flake.png" }))).toContain("uniform sampler2D u_sprite;");
  });
});
