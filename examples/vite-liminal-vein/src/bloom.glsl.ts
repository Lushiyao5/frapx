import { glsl } from "@frapx/fx-passes";
import type { PassOptions } from "@frapx/fx-passes";

/** Name of the pass that holds the finished bloom, at half resolution. */
export const BLOOM = "bloom";
/** Halvings below the scene: the widest level is 1/64 of the canvas. */
const LEVELS = 6;
/** Linear light above this starts to bloom, so only the glowing parts spread. */
const THRESHOLD = 1.0;

const downName = (level: number) => `bloomDown${level}`;
const upName = (level: number) => (level === 0 ? BLOOM : `bloomUp${level}`);

// Half resolution from the scene: the exact 2x2 mean of the float buffer
// (read texel by texel, since rgba32f may not filter), keeping only the light
// above the threshold with a soft knee.
const prefilter = (source: string) => glsl`#version 300 es
precision highp float;

out vec4 fragColor;

uniform sampler2D u_${source};
uniform vec2 u_${source}Size;

const float THRESHOLD = ${THRESHOLD.toFixed(2)};
const float KNEE = 0.5;

vec3 texel(ivec2 p) {
  return texelFetch(u_${source}, clamp(p, ivec2(0), ivec2(u_${source}Size) - 1), 0).rgb;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 2;
  vec3 color = 0.25 * (
    texel(p) + texel(p + ivec2(1, 0)) + texel(p + ivec2(0, 1)) + texel(p + ivec2(1, 1))
  );
  float brightness = max(color.r, max(color.g, color.b));
  float soft = clamp(brightness - THRESHOLD + KNEE, 0.0, 2.0 * KNEE);
  soft = soft * soft / (4.0 * KNEE + 1e-5);
  float kept = max(soft, brightness - THRESHOLD) / max(brightness, 1e-5);
  fragColor = vec4(color * kept, 1.0);
}
`;

// Half the size of the level above: four bilinear taps, a 4x4 box.
const downsample = (source: string) => glsl`#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_${source};
uniform vec2 u_${source}Size;

void main() {
  vec2 texelSize = 1.0 / u_${source}Size;
  vec3 color = texture(u_${source}, v_uv + texelSize * vec2(-1.0, -1.0)).rgb
    + texture(u_${source}, v_uv + texelSize * vec2(1.0, -1.0)).rgb
    + texture(u_${source}, v_uv + texelSize * vec2(-1.0, 1.0)).rgb
    + texture(u_${source}, v_uv + texelSize * vec2(1.0, 1.0)).rgb;
  fragColor = vec4(0.25 * color, 1.0);
}
`;

// This level's downsample plus the wider level below, spread by a 3x3 tent,
// so every level adds a wider halo around the same light.
const upsample = (same: string, lower: string) => glsl`#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_${same};
uniform sampler2D u_${lower};
uniform vec2 u_${lower}Size;

void main() {
  vec2 t = 1.0 / u_${lower}Size;
  vec3 wide = 4.0 * texture(u_${lower}, v_uv).rgb
    + 2.0 * (
      texture(u_${lower}, v_uv + vec2(t.x, 0.0)).rgb
      + texture(u_${lower}, v_uv - vec2(t.x, 0.0)).rgb
      + texture(u_${lower}, v_uv + vec2(0.0, t.y)).rgb
      + texture(u_${lower}, v_uv - vec2(0.0, t.y)).rgb
    )
    + texture(u_${lower}, v_uv + t).rgb
    + texture(u_${lower}, v_uv - t).rgb
    + texture(u_${lower}, v_uv + vec2(t.x, -t.y)).rgb
    + texture(u_${lower}, v_uv + vec2(-t.x, t.y)).rgb;
  fragColor = vec4(texture(u_${same}, v_uv).rgb + wide / 16.0, 1.0);
}
`;

/**
 * Bloom as plain passes: a chain of halvings from `source` down to 1/64, then
 * back up to half resolution, adding each level on the way. The result, in
 * the pass named {@link BLOOM}, is the sum of {@link LEVELS} levels; divide by
 * {@link BLOOM_LEVELS} for their mean.
 */
export const bloomPasses = (source: string): PassOptions[] => {
  const passes: PassOptions[] = [
    { name: downName(0), fragment: prefilter(source), inputs: [source], scale: 0.5 }
  ];
  for (let level = 1; level < LEVELS; level++) {
    passes.push({
      name: downName(level),
      fragment: downsample(downName(level - 1)),
      inputs: [downName(level - 1)],
      scale: 0.5 ** (level + 1)
    });
  }
  for (let level = LEVELS - 2; level >= 0; level--) {
    const lower = level === LEVELS - 2 ? downName(LEVELS - 1) : upName(level + 1);
    passes.push({
      name: upName(level),
      fragment: upsample(downName(level), lower),
      inputs: [downName(level), lower],
      scale: 0.5 ** (level + 1)
    });
  }
  return passes;
};

export const BLOOM_LEVELS = LEVELS;
