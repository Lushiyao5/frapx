import { curl3d } from "@frapx/glsl-noise";
import type { ResolvedConfig } from "./config";

// Particle state, three vec4 per particle, interleaved in one buffer:
//   posAge   xyz position, w age
//   velLife  xyz velocity, w lifetime (0 = never spawned)
//   misc     x random, y rotation, z spin, w size random
// A particle is alive while 0 <= age < lifetime.

export const STATE_ATTRIBUTES = ["a_posAge", "a_velLife", "a_misc"] as const;
export const STATE_VARYINGS = ["v_posAge", "v_velLife", "v_misc"] as const;
export const CORNER_ATTRIBUTE = "a_corner";
/** Floats per particle. */
export const STATE_FLOATS = 12;

// Positions are in viewport heights around the center: y in [-0.5, 0.5],
// x in [-aspect / 2, aspect / 2] at depth 0. A particle at depth z appears
// at position * scale, scale = 1 / (1 + z * perspective).

const common = `
uniform float u_aspect;
uniform float u_perspective;

float frapx_depthScale(float z) {
  return 1.0 / (1.0 + max(z, 0.0) * u_perspective);
}
`;

const forceCode = (config: ResolvedConfig): { uniforms: string; body: string; helpers: string } => {
  const uniforms: string[] = [];
  const body: string[] = [];
  let helpers = "";
  if (config.forces.gravity) {
    uniforms.push("uniform vec3 u_gravity;");
    body.push("acceleration += u_gravity;");
  }
  if (config.forces.curl) {
    uniforms.push("uniform float u_curlStrength;", "uniform float u_curlScale;", "uniform float u_curlSpeed;");
    helpers = curl3d;
    body.push(
      "acceleration += frapx_curl3d(position * u_curlScale + vec3(0.0, 0.0, u_time * u_curlSpeed)) * u_curlStrength;"
    );
  }
  if (config.forces.pointer) {
    uniforms.push(
      "uniform float u_pointerStrength;",
      "uniform float u_pointerRadius;",
      "uniform vec2 u_pointerUv;",
      "uniform float u_pointerActive;"
    );
    // Measured on screen, where the pointer is; pushes harder on far
    // particles so they move the same distance on screen.
    body.push(`{
      float scale = frapx_depthScale(position.z);
      vec2 away = position.xy * scale - (u_pointerUv - 0.5) * vec2(u_aspect, 1.0);
      float dist = length(away);
      float falloff = 1.0 - smoothstep(0.0, max(u_pointerRadius, 1e-4), dist);
      vec2 direction = dist > 1e-5 ? away / dist : vec2(0.0);
      acceleration.xy += direction * u_pointerStrength * falloff * u_pointerActive / scale;
    }`);
  }
  return { uniforms: uniforms.join("\n"), body: body.join("\n      "), helpers };
};

/** The transform feedback program's vertex shader: one step for every particle. */
export const simulationVertex = (config: ResolvedConfig): string => {
  const forces = forceCode(config);
  const drag = config.forces.drag ? "velocity *= exp(-u_drag * u_dt);" : "";
  return `#version 300 es
precision highp float;
precision highp int;

in vec4 a_posAge;
in vec4 a_velLife;
in vec4 a_misc;

out vec4 v_posAge;
out vec4 v_velLife;
out vec4 v_misc;

uniform float u_dt;
uniform float u_time;
uniform uint u_seed;
uniform uint u_pool;
uniform uint u_spawnBase;
uniform uint u_spawnSlot;
uniform uint u_spawnCount;
uniform vec4 u_area;
uniform vec2 u_depthRange;
uniform vec2 u_lifetime;
uniform vec3 u_velocityMin;
uniform vec3 u_velocityMax;
uniform vec2 u_spin;
${config.forces.drag ? "uniform float u_drag;" : ""}
${forces.uniforms}
${common}
${forces.helpers}

uint frapx_hash(uint x) {
  x ^= x >> 16;
  x *= 0x7feb352du;
  x ^= x >> 15;
  x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}

// Uniform in [0, 1), from the spawn's absolute index and a channel.
float frapx_random(uint spawn, uint channel) {
  uint h = frapx_hash(frapx_hash(spawn ^ frapx_hash(u_seed)) + channel * 0x9e3779b9u);
  return float(h >> 8) * (1.0 / 16777216.0);
}

void main() {
  vec4 posAge = a_posAge;
  vec4 velLife = a_velLife;
  vec4 misc = a_misc;

  // This step's spawns take consecutive slots of the ring from u_spawnSlot.
  uint slot = uint(gl_VertexID);
  uint offset = (slot + u_pool - u_spawnSlot) % u_pool;

  if (offset < u_spawnCount) {
    uint spawn = u_spawnBase + offset;
    float z = mix(u_depthRange.x, u_depthRange.y, frapx_random(spawn, 0u));
    vec2 uv = mix(u_area.xy, u_area.zw, vec2(frapx_random(spawn, 1u), frapx_random(spawn, 2u)));
    vec2 screen = (uv - 0.5) * vec2(u_aspect, 1.0);
    vec3 velocity = mix(
      u_velocityMin,
      u_velocityMax,
      vec3(frapx_random(spawn, 3u), frapx_random(spawn, 4u), frapx_random(spawn, 5u))
    );
    float lifetime = mix(u_lifetime.x, u_lifetime.y, frapx_random(spawn, 6u));
    posAge = vec4(screen / frapx_depthScale(z), z, 0.0);
    velLife = vec4(velocity, lifetime);
    misc = vec4(
      frapx_random(spawn, 7u),
      frapx_random(spawn, 8u) * 6.2831853,
      mix(u_spin.x, u_spin.y, frapx_random(spawn, 9u)),
      frapx_random(spawn, 10u)
    );
  } else if (velLife.w > 0.0 && posAge.w < velLife.w) {
    vec3 position = posAge.xyz;
    vec3 velocity = velLife.xyz;
    vec3 acceleration = vec3(0.0);
    ${forces.body}
    velocity += acceleration * u_dt;
    ${drag}
    position += velocity * u_dt;
    posAge = vec4(position, posAge.w + u_dt);
    velLife.xyz = velocity;
    misc.y += misc.z * u_dt;
  }

  v_posAge = posAge;
  v_velLife = velLife;
  v_misc = misc;
}
`;
};

export const simulationFragment = `#version 300 es
precision mediump float;
out vec4 fragColor;
void main() {
  fragColor = vec4(0.0);
}
`;

const sizeCurve: Record<ResolvedConfig["sizeOverLife"], string> = {
  constant: "1.0",
  fadeIn: "smoothstep(0.0, 0.2, life)",
  fadeOut: "1.0 - smoothstep(0.8, 1.0, life)",
  fadeInOut: "smoothstep(0.0, 0.2, life) * (1.0 - smoothstep(0.8, 1.0, life))"
};

export const renderVertex = (config: ResolvedConfig): string => `#version 300 es
precision highp float;

in vec2 a_corner;
in vec4 a_posAge;
in vec4 a_velLife;
in vec4 a_misc;

out vec2 v_uv;
out float v_life;
out float v_random;
out float v_alpha;

uniform vec2 u_size;
uniform float u_opacity;
uniform float u_twinkle;
${common}

void main() {
  float lifetime = a_velLife.w;
  float age = a_posAge.w;
  if (lifetime <= 0.0 || age >= lifetime) {
    // Outside the clip volume: nothing is rasterized.
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float life = age / lifetime;
  float scale = frapx_depthScale(a_posAge.z);
  float size = mix(u_size.x, u_size.y, a_misc.w) * (${sizeCurve[config.sizeOverLife]}) * scale;

  vec2 corner = a_corner;
  ${config.tumble ? "corner.x *= cos(a_misc.y * 0.7 + a_misc.x * 6.2831853);" : ""}
  float c = cos(a_misc.y);
  float s = sin(a_misc.y);
  vec2 offset = mat2(c, s, -s, c) * corner * 0.5 * size;
  vec2 screen = a_posAge.xy * scale + offset;
  gl_Position = vec4(screen.x * 2.0 / u_aspect, screen.y * 2.0, 0.0, 1.0);

  float rate = mix(3.0, 9.0, fract(a_misc.x * 7.31));
  float flicker = 0.5 + 0.5 * sin(age * rate + a_misc.x * 40.0);
  v_uv = a_corner * 0.5 + 0.5;
  v_life = life;
  v_random = a_misc.x;
  // Far particles are dimmer as well as smaller.
  v_alpha = u_opacity * mix(1.0, flicker, clamp(u_twinkle, 0.0, 1.0)) * mix(1.0, scale, 0.5);
}
`;

const shapes: Record<Exclude<ResolvedConfig["sprite"], { texture: unknown }>, string> = {
  soft: "exp(-r * r * 4.0) * (1.0 - smoothstep(0.8, 1.0, r))",
  disc: "1.0 - smoothstep(1.0 - aa, 1.0, r)",
  ring: "smoothstep(0.62 - aa, 0.62, r) * (1.0 - smoothstep(1.0 - aa, 1.0, r)) + 0.12 * (1.0 - smoothstep(0.62 - aa, 0.62, r))",
  square: "(1.0 - smoothstep(1.0 - aa, 1.0, abs(p.x))) * (1.0 - smoothstep(1.0 - aa, 1.0, abs(p.y)))",
  glint:
    "max(exp(-r * r * 9.0), (exp(-abs(p.x) * 14.0) * exp(-p.y * p.y * 2.0) + exp(-abs(p.y) * 14.0) * exp(-p.x * p.x * 2.0)) * 0.8) * (1.0 - smoothstep(0.85, 1.0, r))"
};

export const renderFragment = (config: ResolvedConfig): string => {
  const textured = typeof config.sprite === "object";
  return `#version 300 es
precision highp float;

in vec2 v_uv;
in float v_life;
in float v_random;
in float v_alpha;

uniform sampler2D u_lut;
uniform float u_paletteSize;
${textured ? "uniform sampler2D u_sprite;" : ""}
out vec4 fragColor;

void main() {
  vec4 color = texture(u_lut, vec2(v_life, 0.25));
  if (u_paletteSize > 0.0) {
    int index = int(min(floor(v_random * u_paletteSize), u_paletteSize - 1.0));
    color *= texelFetch(u_lut, ivec2(index, 1), 0);
  }
${
  textured
    ? `  vec4 sprite = texture(u_sprite, v_uv);
  color.rgb *= sprite.rgb;
  float shape = sprite.a;`
    : `  vec2 p = v_uv * 2.0 - 1.0;
  float r = length(p);
  float aa = max(fwidth(r) * 1.5, 1e-3);
  float shape = ${shapes[config.sprite as keyof typeof shapes]};`
}
  float alpha = clamp(color.a * shape * v_alpha, 0.0, 1.0);
  fragColor = vec4(color.rgb * alpha, alpha);
}
`;
};

/** Converts the premultiplied particle layer to straight alpha for capture. */
export const unpremultiplyFragment = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
  vec4 color = texture(u_texture, v_uv);
  fragColor = color.a > 0.0 ? vec4(color.rgb / color.a, color.a) : vec4(0.0);
}
`;
