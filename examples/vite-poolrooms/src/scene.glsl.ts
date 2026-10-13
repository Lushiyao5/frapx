import { glsl } from "@frapx/fx-canvas";
import { raymarch, raymarchCamera } from "@frapx/glsl-raymarch";
import { sdf2d, sdf3d, sdfOps } from "@frapx/glsl-sdf";

/** Seconds in one seamless loop. */
export const LOOP_SECONDS = 24;

// An endless grid of tiled pool halls under skylights. Every sample is one
// path through the scene; the feedback buffer keeps the running mean of the
// samples drawn for the current frame (see writeSample at the bottom).
export const fragment = glsl`#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform sampler2D u_previousFrame;
// Frame number within the loop, so frame N and frame N + loop length match.
uniform float u_loopFrame;
uniform float u_fps;
// Index of this sample within the frame. Sample 0 discards the history.
uniform float u_sample;
// Samples per frame. The last one adds grain and dither; 0 never finishes.
uniform float u_samples;
// 1: fast direct lighting for scrubbing, 0: path traced.
uniform float u_preview;

#define FRAPX_RAYMARCH_STEPS 256

${sdf2d}
${sdf3d}
${sdfOps}
${raymarchCamera}
${raymarch}

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

const float LOOP_SECONDS = ${LOOP_SECONDS.toFixed(1)};
const float BAY = 4.2;              // depth of one arch bay along z
const float LOOP_BAYS = 4.0;        // bays travelled per loop; variations repeat with it
const float HALL = 6.4;             // pitch of the parallel halls along x, wall included
const float HALF_WIDTH = 3.0;       // inner half width of a hall
// Segmental barrel vault: springs from the walls at 2.9 m, crown at 4.4 m.
const float VAULT_RADIUS = 3.75;
const float VAULT_CENTER = 0.65;
const float SKY_Y = 5.0;            // emitter plane at the top of the light wells
const vec2 WELL = vec2(0.75, 0.55); // half size of a skylight opening in x and z
const float POOL_FLOOR = -0.55;
const float WATER_Y = 0.0;
const float TILE = 0.15;
const float FAR = 70.0;
const float SHUTTER = 0.5;          // 180 degrees

const vec3 SKY = vec3(26.0, 26.5, 27.5);
const vec3 HAZE = vec3(0.34, 0.37, 0.38);

// ---------------------------------------------------------------- random

uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

uint rngState;

float rand() {
  rngState = pcg(rngState);
  return float(rngState) / 4294967296.0;
}

vec2 rand2() {
  return vec2(rand(), rand());
}

// Owen-scrambled Sobol points (Burley 2020, "Practical Hash-based Owen
// Scrambling"). The samples of one pixel cover each 2D pair of these evenly,
// so the dimensions that decide the most converge faster than with
// independent random numbers. Every pixel and frame has its own scramble.
uint reverseBits(uint x) {
  x = ((x >> 1u) & 0x55555555u) | ((x & 0x55555555u) << 1u);
  x = ((x >> 2u) & 0x33333333u) | ((x & 0x33333333u) << 2u);
  x = ((x >> 4u) & 0x0f0f0f0fu) | ((x & 0x0f0f0f0fu) << 4u);
  x = ((x >> 8u) & 0x00ff00ffu) | ((x & 0x00ff00ffu) << 8u);
  return (x >> 16u) | (x << 16u);
}

uint owenScramble(uint x, uint seed) {
  x = reverseBits(x) + seed;
  x ^= x * 0x6c50b47cu;
  x ^= x * 0xb82f1e52u;
  x ^= x * 0xc7afe638u;
  x ^= x * 0x8d22f6e6u;
  return reverseBits(x);
}

// Second Sobol dimension; the first is reverseBits(index).
uint sobol1(uint index) {
  uint result = 0u;
  for (uint v = 1u << 31; index != 0u; index >>= 1u, v ^= v >> 1u) {
    if ((index & 1u) != 0u) result ^= v;
  }
  return result;
}

vec2 sobol2(uint index, uint seed) {
  uint i = owenScramble(index, pcg(seed));
  uint x = owenScramble(reverseBits(i), pcg(seed ^ 0xa511e9b3u));
  uint y = owenScramble(sobol1(i), pcg(seed ^ 0x63d83595u));
  return vec2(uvec2(x, y) >> 8u) / 16777216.0;
}

// Sample pairs drawn from the sequence: sub-pixel offset; shutter time and
// the first surface event's choice; the first diffuse vertex's light pick,
// point on the light and bounce direction. Everything else uses rand().
const int QMC_PIXEL = 0;
const int QMC_TIME = 1;
const int QMC_PICK = 2;
const int QMC_LIGHT = 3;
const int QMC_BOUNCE = 4;
vec2 qmc[5];

float hash12(vec2 p) {
  return float(pcg(pcg(uint(int(p.x) + 4096)) ^ uint(int(p.y) + 8192))) / 4294967296.0;
}

// ---------------------------------------------------------------- layout

float bayIndex(float z) {
  return floor(z / BAY + 0.5);
}

// Which of the LOOP_BAYS variants a bay is; integral, so compare with 0.5 slack.
float bayKind(float bay) {
  return mod(bay, LOOP_BAYS);
}

bool hasSkylight(float kind) {
  return abs(kind - 2.0) > 0.5;
}

// boundary k is the wall between hall k and hall k + 1.
bool archOpen(float boundary, float kind) {
  return hash12(vec2(boundary, kind)) > 0.2;
}

float frapx_map(vec3 p) {
  float hall = floor(p.x / HALL + 0.5);
  float x = p.x - hall * HALL;
  float ax = abs(x);
  float bay = bayIndex(p.z);
  float z = p.z - bay * BAY;
  float kind = bayKind(bay);

  // Walls and vault meet in a softened springing line.
  float vault = VAULT_RADIUS - length(vec2(x, p.y - VAULT_CENTER));
  float shell = frapx_opSmoothUnion(HALF_WIDTH - ax, vault, 0.15);

  // Round-headed arches through the side walls into the neighbouring halls.
  if (archOpen(x > 0.0 ? hall : hall - 1.0, kind)) {
    vec2 q = vec2(z, p.y);
    float arch = min(
      frapx_sdBox(q - vec2(0.0, 0.55), vec2(0.85, 0.9)),
      frapx_sdCircle(q - vec2(0.0, 1.45), 0.85)
    );
    shell = frapx_opSmoothSubtract(shell, max(arch, 2.7 - ax), 0.04);
  }

  if (hasSkylight(kind)) {
    float well = frapx_sdRoundBox(vec2(x, z), WELL, 0.05);
    shell = frapx_opSmoothSubtract(shell, max(well, 4.0 - p.y), 0.12);
  }

  // Pilasters at the bay boundaries carry on over the vault as ribs.
  float boundaryZ = abs(z) - 0.5 * BAY;
  float pilaster = frapx_sdRoundBox(
    vec3(ax - HALF_WIDTH, p.y - 1.2, boundaryZ),
    vec3(0.16, 1.7, 0.22),
    0.03
  );
  float rib = max(abs(boundaryZ) - 0.22, vault - 0.16);
  pilaster = frapx_opSmoothUnion(pilaster, rib, 0.06);

  // Submerged benches along both walls; the channel between them is deeper.
  float bench = frapx_sdRoundBox(vec2(ax - 2.7, p.y + 0.62), vec2(0.7, 0.4), 0.06);
  float floorSlab = p.y - POOL_FLOOR;

  return min(min(shell, pilaster), min(bench, floorSlab));
}

// ---------------------------------------------------------------- tracing

const int HIT_NONE = 0;
const int HIT_SOLID = 1;
const int HIT_WATER = 2;
const int HIT_SKY = 3;

struct Hit {
  int kind;
  float t;
};

// The water surface and the sky are planes, intersected exactly; only the
// solid architecture is sphere traced.
Hit trace(vec3 ro, vec3 rd) {
  // Where the march stops if it hits nothing solid, and what is there.
  float limit = FAR;
  int limitKind = HIT_NONE;
  float tWater = (WATER_Y - ro.y) / rd.y;
  if (tWater > 0.0 && tWater < limit) {
    limit = tWater;
    limitKind = HIT_WATER;
  }
  float tSky = (SKY_Y - ro.y) / rd.y;
  if (tSky > 0.0 && tSky < limit) {
    limit = tSky;
    limitKind = HIT_SKY;
  }

  float t = frapx_raymarch(ro, rd, 0.0, limit);
  if (t > 0.0) return Hit(HIT_SOLID, t);
  // A march that runs out of steps also misses; only count the sky when the
  // ray really reached it inside a light well.
  if (limitKind == HIT_SKY && frapx_map(ro + rd * tSky) <= 0.0) limitKind = HIT_NONE;
  return Hit(limitKind, limitKind == HIT_NONE ? FAR : limit);
}

vec3 surfaceNormal(vec3 p, float t) {
  return frapx_normal(p, max(0.0004, 0.0004 * t));
}

// ---------------------------------------------------------------- water

// Ripples that close up over the loop in time and in space: temporal
// frequencies are whole multiples of the loop, and wave numbers along z are
// whole multiples of the distance travelled, since the camera ends the loop
// LOOP_BAYS bays back from where the water started.
vec2 rippleGradient(vec2 xz, vec2 waves, float amplitude, float cycles, float offset, float w) {
  vec2 k = vec2(waves.x, TAU * waves.y / (LOOP_BAYS * BAY));
  return k * amplitude * cos(dot(k, xz) + cycles * w + offset);
}

vec3 waterNormal(vec2 xz, float seconds) {
  float w = TAU * seconds / LOOP_SECONDS;
  // waves: x wave number in radians per metre, z in waves per loop distance.
  vec2 g = rippleGradient(xz, vec2(1.68, 3.0), 0.006, 3.0, 0.0, w)
    + rippleGradient(xz, vec2(-1.85, 9.0), 0.004, -5.0, 1.3, w)
    + rippleGradient(xz, vec2(1.26, -17.0), 0.0022, 7.0, 2.1, w)
    + rippleGradient(xz, vec2(-9.9, -9.0), 0.0011, -11.0, 0.4, w);
  return normalize(vec3(-g.x, 1.0, -g.y));
}

float fresnel(float cosTheta, float f0) {
  return f0 + (1.0 - f0) * pow(1.0 - clamp(cosTheta, 0.0, 1.0), 5.0);
}

// ---------------------------------------------------------------- materials

vec3 tileAlbedo(vec3 p, vec3 n) {
  vec3 an = abs(n);
  vec2 uv = an.y > max(an.x, an.z) ? p.xz : (an.x > an.z ? p.zy : p.xy);
  vec2 g = abs(fract(uv / TILE) - 0.5) * TILE;
  float edge = 0.5 * TILE - max(g.x, g.y);
  float grout = 1.0 - smoothstep(0.0025, 0.005, edge);
  return mix(vec3(0.86, 0.87, 0.85), vec3(0.5, 0.53, 0.52), grout);
}

// ---------------------------------------------------------------- preview

// Centre of the nearest lit skylight emitter above p.
vec3 nearestSkylight(vec3 p) {
  float hall = floor(p.x / HALL + 0.5);
  float bay = bayIndex(p.z);
  if (!hasSkylight(bayKind(bay))) {
    bay += p.z - bay * BAY > 0.0 ? 1.0 : -1.0;
  }
  return vec3(hall * HALL, SKY_Y, bay * BAY);
}

vec3 previewSolid(vec3 p, vec3 n) {
  vec3 light = nearestSkylight(p);
  vec3 toLight = light - p;
  float dist = length(toLight);
  toLight /= dist;
  float shadow = frapx_softShadow(p + n * 0.01, toLight, 0.02, dist - 0.3, 10.0);
  float direct = max(dot(n, toLight), 0.0) * shadow * 9.0 / (1.0 + dist * dist);
  float ao = frapx_ao(p, n, 0.4);
  return tileAlbedo(p, n) * (direct + 0.22 * ao);
}

vec3 previewRadiance(vec3 ro, vec3 rd, float seconds) {
  Hit hit = trace(ro, rd);
  vec3 color = HAZE;

  if (hit.kind == HIT_SKY) {
    color = SKY;
  } else if (hit.kind == HIT_SOLID) {
    vec3 p = ro + rd * hit.t;
    color = previewSolid(p, surfaceNormal(p, hit.t));
  } else if (hit.kind == HIT_WATER) {
    vec3 p = ro + rd * hit.t;
    vec3 n = waterNormal(p.xz, seconds);
    float f = fresnel(dot(-rd, n), 0.02);

    vec3 reflected = reflect(rd, n);
    Hit up = trace(p + n * 0.002, reflected);
    vec3 above = HAZE;
    if (up.kind == HIT_SKY) above = SKY;
    if (up.kind == HIT_SOLID) {
      vec3 q = p + reflected * up.t;
      above = previewSolid(q, surfaceNormal(q, up.t));
    }

    vec3 refracted = refract(rd, n, 1.0 / 1.333);
    Hit down = trace(p - n * 0.002, refracted);
    vec3 below = vec3(0.0);
    if (down.kind == HIT_SOLID) {
      vec3 q = p + refracted * down.t;
      vec3 absorb = exp(-vec3(0.45, 0.12, 0.09) * down.t);
      below = previewSolid(q, surfaceNormal(q, down.t)) * absorb;
    }

    color = mix(below, above, f);
  }

  return mix(color, HAZE, 1.0 - exp(-0.018 * hit.t));
}

// ---------------------------------------------------------------- path tracing

const int MAX_EVENTS = 8;          // surface events per path, water included
const int MAX_DIFFUSE = 3;         // diffuse bounces per path
const vec3 WATER_ABSORPTION = vec3(0.35, 0.08, 0.06); // per metre
const float WATER_IOR = 1.333;
const float TILE_F0 = 0.04;
const float TILE_ROUGHNESS = 0.025;
const float INDIRECT_CLAMP = 4.0;  // firefly guard for anything past the camera ray

vec3 cosineSample(vec3 n, vec2 u) {
  float r = sqrt(u.x);
  float phi = TAU * u.y;
  vec3 t = normalize(cross(abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), n));
  vec3 b = cross(n, t);
  return normalize(t * r * cos(phi) + b * r * sin(phi) + n * sqrt(1.0 - u.x));
}

vec3 randomInSphere() {
  vec2 u = rand2();
  float z = 2.0 * u.x - 1.0;
  float r = sqrt(1.0 - z * z);
  float phi = TAU * u.y;
  return vec3(r * cos(phi), r * sin(phi), z) * pow(rand(), 1.0 / 3.0);
}

float groutMask(vec3 p, vec3 n) {
  vec3 an = abs(n);
  vec2 uv = an.y > max(an.x, an.z) ? p.xz : (an.x > an.z ? p.zy : p.xy);
  vec2 g = abs(fract(uv / TILE) - 0.5) * TILE;
  return 1.0 - smoothstep(0.0025, 0.005, 0.5 * TILE - max(g.x, g.y));
}

// Light focused by the ripples onto a point at the given depth below the
// surface, for light falling straight down: the inverse of how much the
// refracted rays spread. The depth is exaggerated so shallow water still
// shows caustics.
float caustics(vec2 xz, float depth, float seconds) {
  float e = 0.01;
  float d = depth * 18.0;
  vec3 down = vec3(0.0, -1.0, 0.0);
  vec2 r0 = refract(down, waterNormal(xz, seconds), 1.0 / WATER_IOR).xz;
  vec2 rx = refract(down, waterNormal(xz + vec2(e, 0.0), seconds), 1.0 / WATER_IOR).xz;
  vec2 rz = refract(down, waterNormal(xz + vec2(0.0, e), seconds), 1.0 / WATER_IOR).xz;
  vec2 dx = vec2(1.0, 0.0) + d * (rx - r0) / e;
  vec2 dz = vec2(0.0, 1.0) + d * (rz - r0) / e;
  return clamp(1.0 / max(abs(dx.x * dz.y - dx.y * dz.x), 0.05), 0.0, 3.0);
}

// Direct light sampled from the skylights in this hall and its two
// neighbours, within NEE_BAYS bays, picking one in proportion to a rough
// estimate of its contribution. Shadow rays pass straight through the water
// surface, losing the Fresnel reflection and absorption, plus caustics.
const int NEE_BAYS = 2;
const int NEE_COUNT = 3 * (2 * NEE_BAYS + 1);
const vec2 LIGHT_SIZE = WELL - 0.04;
const float NEIGHBOUR_WEIGHT = 0.25;

float skylightWeight(vec3 p, vec3 n, float hall, float bay) {
  if (!hasSkylight(bayKind(bay))) return 0.0;
  vec3 toLight = vec3(hall * HALL, SKY_Y, bay * BAY) - p;
  float dist2 = dot(toLight, toLight);
  vec3 l = toLight * inversesqrt(dist2);
  return max(dot(n, l), 0.0) * max(l.y, 0.0) / dist2;
}

vec3 sampleSkylights(vec3 p, vec3 n, float seconds, float pickU, vec2 pointU) {
  float hall0 = floor(p.x / HALL + 0.5);
  float bay0 = bayIndex(p.z);
  float weights[NEE_COUNT];
  float total = 0.0;
  for (int i = 0; i < NEE_COUNT; i++) {
    float hall = hall0 + float(i / (2 * NEE_BAYS + 1)) - 1.0;
    float bay = bay0 + float(i % (2 * NEE_BAYS + 1) - NEE_BAYS);
    // The wall hides most of a neighbouring hall's skylights.
    weights[i] = skylightWeight(p, n, hall, bay) * (i / (2 * NEE_BAYS + 1) == 1 ? 1.0 : NEIGHBOUR_WEIGHT);
    total += weights[i];
  }
  if (total <= 0.0) return vec3(0.0);

  float pick = pickU * total;
  int chosen = NEE_COUNT - 1;
  for (int i = 0; i < NEE_COUNT; i++) {
    pick -= weights[i];
    if (pick < 0.0) {
      chosen = i;
      break;
    }
  }
  float probability = weights[chosen] / total;
  float hall = hall0 + float(chosen / (2 * NEE_BAYS + 1)) - 1.0;
  float bay = bay0 + float(chosen % (2 * NEE_BAYS + 1) - NEE_BAYS);

  vec2 u = pointU * 2.0 - 1.0;
  vec3 lightPoint = vec3(hall * HALL + u.x * LIGHT_SIZE.x, SKY_Y, bay * BAY + u.y * LIGHT_SIZE.y);
  vec3 toLight = lightPoint - p;
  float dist2 = dot(toLight, toLight);
  float dist = sqrt(dist2);
  vec3 l = toLight / dist;
  float cosSurface = dot(n, l);
  float cosLight = l.y;
  if (cosSurface <= 0.0 || cosLight <= 0.0) return vec3(0.0);

  vec3 ro = p + n * 0.003;
  if (frapx_raymarch(ro, l, 0.0, dist - 0.02) > 0.0) return vec3(0.0);

  vec3 transmission = vec3(1.0);
  if (p.y < WATER_Y) {
    float tWater = (WATER_Y - p.y) / l.y;
    transmission = exp(-WATER_ABSORPTION * tWater)
      * (1.0 - fresnel(l.y, 0.02))
      * caustics(p.xz + l.xz * tWater, WATER_Y - p.y, seconds);
  }

  float area = 4.0 * LIGHT_SIZE.x * LIGHT_SIZE.y;
  return SKY * transmission * cosSurface * cosLight * area / (probability * PI * dist2);
}

// Whether the sky seen at skyPoint could have been sampled directly from the
// last diffuse vertex, so it is not added twice.
bool skyCovered(vec3 skyPoint, float neeHall, float neeBay) {
  return abs(floor(skyPoint.x / HALL + 0.5) - neeHall) < 1.5
    && abs(bayIndex(skyPoint.z) - neeBay) < float(NEE_BAYS) + 0.5;
}

vec3 pathRadiance(vec3 ro, vec3 rd, float seconds, out float firstDistance) {
  vec3 radiance = vec3(0.0);
  vec3 throughput = vec3(1.0);
  bool lastDiffuse = false;
  float neeHall = 0.0;
  float neeBay = 0.0;
  int diffuseBounces = 0;
  firstDistance = FAR;

  for (int event = 0; event < MAX_EVENTS; event++) {
    Hit hit = trace(ro, rd);
    if (event == 0) firstDistance = hit.t;

    // Light is absorbed along every underwater segment.
    if (ro.y < WATER_Y) throughput *= exp(-WATER_ABSORPTION * hit.t);

    vec3 p = ro + rd * hit.t;
    if (hit.kind == HIT_SKY) {
      if (!lastDiffuse || !skyCovered(p, neeHall, neeBay)) {
        vec3 light = throughput * SKY;
        radiance += event == 0 ? light : min(light, vec3(INDIRECT_CLAMP));
      }
      break;
    }
    if (hit.kind == HIT_NONE) {
      radiance += throughput * HAZE;
      break;
    }

    if (hit.kind == HIT_WATER) {
      bool fromAbove = rd.y < 0.0;
      vec3 n = waterNormal(p.xz, seconds);
      vec3 facing = fromAbove ? n : -n;
      float eta = fromAbove ? 1.0 / WATER_IOR : WATER_IOR;
      vec3 refracted = refract(rd, facing, eta);
      float f = fresnel(dot(-rd, facing), 0.02);
      if (dot(refracted, refracted) < 0.5 || (event == 0 ? qmc[QMC_TIME].y : rand()) < f) {
        rd = reflect(rd, facing);
        ro = p + facing * 0.002;
      } else {
        rd = refracted;
        ro = p - facing * 0.002;
      }
      continue;
    }

    vec3 n = surfaceNormal(p, hit.t);
    float grout = groutMask(p, n);
    vec3 albedo = mix(vec3(0.86, 0.87, 0.85), vec3(0.5, 0.53, 0.52), grout);

    // Glazed tiles: a glossy coat over a diffuse base. Grout is matte.
    float coat = fresnel(dot(-rd, n), TILE_F0) * (1.0 - grout);
    if ((event == 0 ? qmc[QMC_TIME].y : rand()) < coat) {
      rd = normalize(reflect(rd, n) + TILE_ROUGHNESS * randomInSphere());
      if (dot(rd, n) <= 0.0) break;
      ro = p + n * 0.003;
      lastDiffuse = false;
      continue;
    }

    if (diffuseBounces >= MAX_DIFFUSE) break;
    bool first = diffuseBounces == 0;
    diffuseBounces++;

    throughput *= albedo;
    vec3 direct = throughput * sampleSkylights(
      p,
      n,
      seconds,
      first ? qmc[QMC_PICK].x : rand(),
      first ? qmc[QMC_LIGHT] : rand2()
    );
    radiance += min(direct, vec3(INDIRECT_CLAMP));

    neeHall = floor(p.x / HALL + 0.5);
    neeBay = bayIndex(p.z);
    lastDiffuse = true;
    rd = cosineSample(n, first ? qmc[QMC_BOUNCE] : rand2());
    ro = p + n * 0.003;
  }

  return radiance;
}

// ---------------------------------------------------------------- output

// Display encoding: exposure, vignette and an exponential tone curve, all
// invertible, so the buffer always holds a viewable image while the running
// mean is still taken in linear light.
const float EXPOSURE = 1.15;

float vignette() {
  vec2 c = v_uv - 0.5;
  c.x *= u_resolution.x / u_resolution.y;
  return 1.0 - 0.32 * smoothstep(0.2, 1.05, length(c));
}

vec3 encodeDisplay(vec3 linear) {
  vec3 mapped = 1.0 - exp(-max(linear, 0.0) * EXPOSURE * vignette());
  return pow(mapped, vec3(1.0 / 2.2));
}

vec3 decodeDisplay(vec3 display) {
  vec3 mapped = min(pow(max(display, 0.0), vec3(2.2)), vec3(0.9995));
  return -log(1.0 - mapped) / (EXPOSURE * vignette());
}

// The buffer is half float, 11 significant bits. A late sample moves the mean
// by less than the rounding step, and a GPU that truncates when it stores (an
// Apple M-series one does) let the mean drift darker as samples were added:
// -5% at 256 samples, -23% at 2048.
// Rounding here to a neighbouring half float, up with the probability of the
// remainder, keeps the stored mean unbiased whatever rounding the GPU does.
vec3 roundToHalf(vec3 v) {
  vec3 step = exp2(floor(log2(max(abs(v), 6.104e-5))) - 10.0);
  return floor(v / step + vec3(rand(), rand(), rand())) * step;
}

void writeSample(vec3 radiance) {
  float k = u_sample;
  vec3 mean = radiance;
  if (k > 0.5) {
    vec3 previous = decodeDisplay(texelFetch(u_previousFrame, ivec2(gl_FragCoord.xy), 0).rgb);
    mean = mix(previous, radiance, 1.0 / (k + 1.0));
  }
  vec3 color = encodeDisplay(mean);

  if (u_samples > 0.5 && k > u_samples - 1.5) {
    // Grain, then triangular dither so 8-bit export does not band.
    float grain = rand() + rand() - 1.0;
    color *= 1.0 + 0.025 * grain;
    color += (rand() + rand() - 1.0) / 255.0;
  }
  fragColor = vec4(roundToHalf(color), 1.0);
}

void main() {
  uvec2 pixel = uvec2(gl_FragCoord.xy);
  uint pixelSeed = pcg(pixel.x + pcg(pixel.y + pcg(uint(u_loopFrame))));
  rngState = pcg(pixelSeed + pcg(uint(u_sample)));
  for (int i = 0; i < 5; i++) qmc[i] = sobol2(uint(u_sample), pixelSeed + uint(i) * 0x9e3779b9u);

  // Sub-pixel jitter and a moment within the open shutter, per sample.
  vec2 fragCoord = gl_FragCoord.xy + (u_samples > 0.5 || u_sample > 0.5 ? qmc[QMC_PIXEL] - 0.5 : vec2(0.0));
  float seconds = (u_loopFrame + SHUTTER * qmc[QMC_TIME].x) / u_fps;

  float phase = seconds / LOOP_SECONDS;
  float a = TAU * phase;
  vec3 eye = vec3(0.12 * sin(a), 1.25, LOOP_BAYS * BAY * phase);
  float yaw = 0.05 * sin(2.0 * a + 0.7);
  vec3 forward = vec3(sin(yaw), 0.0, cos(yaw));
  mat3 camera = frapx_lookAt(eye, eye + forward, 0.0);
  vec3 rd = frapx_cameraRay(fragCoord, u_resolution, camera, radians(64.0));

  if (u_preview > 0.5) {
    writeSample(previewRadiance(eye, rd, seconds));
    return;
  }

  // Aerial perspective on the camera ray only: distant halls fade to haze.
  float firstDistance;
  vec3 radiance = pathRadiance(eye, rd, seconds, firstDistance);
  writeSample(mix(radiance, HAZE, 1.0 - exp(-0.006 * firstDistance)));
}
`;
