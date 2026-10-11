// Reference values evaluated on the GPU by e2e/raymarch.spec.ts. Each
// expression returns a float or vec3; `expected` lists its components.
// The unit tests require every exported GLSL function to appear here.

export type RaymarchCase = {
  expr: string;
  expected: number[];
  tolerance?: number;
};

// The scene every case runs against: a unit sphere at the origin above the
// plane y = -2.
export const sceneMap = `float frapx_map(vec3 p) {
  return min(length(p) - 1.0, p.y + 2.0);
}`;

const map = (x: number, y: number, z: number): number =>
  Math.min(Math.hypot(x, y, z) - 1, y + 2);

// Mirrors frapx_ao so partial occlusion has an exact expected value.
const ao = (p: [number, number, number], n: [number, number, number], radius: number, samples = 5): number => {
  let occ = 0;
  let total = 0;
  let weight = 1;
  for (let i = 0; i < samples; i++) {
    const h = (radius * (i + 1)) / samples;
    occ += (h - map(p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h)) * weight;
    total += h * weight;
    weight *= 0.95;
  }
  return Math.min(Math.max(1 - occ / total, 0), 1);
};

// Mirrors frapx_softShadow, so penumbra values check the improved estimate
// rather than only the fully lit and fully shadowed ends.
const softShadow = (
  ro: [number, number, number],
  rd: [number, number, number],
  tmin: number,
  tmax: number,
  k: number
): number => {
  let res = 1;
  let t = tmin;
  let ph = 1e10;
  for (let i = 0; i < 64; i++) {
    const h = map(ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t);
    if (h < 0) {
      res = 0;
      break;
    }
    const y = (h * h) / (2 * ph);
    res = y < h && y < t ? Math.min(res, (k * Math.sqrt(h * h - y * y)) / (t - y)) : Math.min(res, (k * h) / Math.max(t, 1e-4));
    ph = h;
    t += Math.max(h, 0.0005 * Math.max(t, 1));
    if (res < 1e-4 || t > tmax) break;
  }
  res = Math.min(Math.max(res, 0), 1);
  return res * res * (3 - 2 * res);
};

const INV_SQRT2 = Math.SQRT1_2;
const INV_SQRT3 = 1 / Math.sqrt(3);
const HALF_PI = "1.5707963";

export const raymarchCases: RaymarchCase[] = [
  // --- frapx_raymarch ---
  { expr: "frapx_raymarch(vec3(0.0, 0.0, 5.0), vec3(0.0, 0.0, -1.0), 0.0, 20.0)", expected: [4] },
  { expr: "frapx_raymarch(vec3(5.0, 0.0, 0.0), vec3(0.0, -1.0, 0.0), 0.0, 20.0)", expected: [2] },
  // Starting further along the ray lands on the same surface.
  { expr: "frapx_raymarch(vec3(0.0, 0.0, 5.0), vec3(0.0, 0.0, -1.0), 1.0, 20.0)", expected: [4] },
  // Misses: pointing away from everything, and the sphere lies beyond tmax.
  { expr: "frapx_raymarch(vec3(0.0, 0.0, 5.0), vec3(0.0, 1.0, 0.0), 0.0, 20.0)", expected: [-1] },
  { expr: "frapx_raymarch(vec3(0.0, 0.0, 5.0), vec3(0.0, 0.0, -1.0), 0.0, 3.0)", expected: [-1] },

  // --- frapx_normal ---
  { expr: "frapx_normal(vec3(0.0, 0.0, 1.0), 0.0005)", expected: [0, 0, 1], tolerance: 1e-3 },
  {
    expr: `frapx_normal(vec3(${INV_SQRT3}), 0.0005)`,
    expected: [INV_SQRT3, INV_SQRT3, INV_SQRT3],
    tolerance: 1e-3
  },
  { expr: "frapx_normal(vec3(5.0, -2.0, 0.0), 0.0005)", expected: [0, 1, 0], tolerance: 1e-3 },

  // --- frapx_softShadow ---
  // Origins sit 0.01 above the plane. Straight under the sphere: fully shadowed.
  { expr: "frapx_softShadow(vec3(0.0, -1.99, 0.0), vec3(0.0, 1.0, 0.0), 0.01, 10.0, 8.0)", expected: [0] },
  // Far to the side: fully lit, including the stretch where each sample's
  // sphere swallows the previous one while marching straight off the plane.
  { expr: "frapx_softShadow(vec3(5.0, -1.99, 0.0), vec3(0.0, 1.0, 0.0), 0.01, 10.0, 8.0)", expected: [1] },
  { expr: "frapx_softShadow(vec3(5.0, -1.99, 0.0), vec3(0.0, 1.0, 0.0), 0.01, 10.0, 32.0)", expected: [1] },
  // Penumbra just outside the sphere's footprint. The plain k * h / t estimate
  // gives about 0.07 more here, beyond the tolerance.
  {
    expr: "frapx_softShadow(vec3(1.1, -1.99, 0.0), vec3(0.0, 1.0, 0.0), 0.01, 10.0, 8.0)",
    expected: [softShadow([1.1, -1.99, 0], [0, 1, 0], 0.01, 10, 8)],
    tolerance: 1e-2
  },
  {
    expr: "frapx_softShadow(vec3(1.2, -1.99, 0.0), vec3(0.0, 1.0, 0.0), 0.01, 10.0, 8.0)",
    expected: [softShadow([1.2, -1.99, 0], [0, 1, 0], 0.01, 10, 8)],
    tolerance: 1e-2
  },

  // --- frapx_ao ---
  { expr: "frapx_ao(vec3(5.0, -2.0, 0.0), vec3(0.0, 1.0, 0.0), 1.0)", expected: [1] },
  {
    expr: "frapx_ao(vec3(0.0, -2.0, 0.0), vec3(0.0, 1.0, 0.0), 1.0)",
    expected: [ao([0, -2, 0], [0, 1, 0], 1)]
  },
  {
    expr: "frapx_ao(vec3(0.0, -2.0, 0.0), vec3(0.0, 1.0, 0.0), 2.0)",
    expected: [ao([0, -2, 0], [0, 1, 0], 2)]
  },

  // --- frapx_lookAt: eye on +z looking at the origin ---
  { expr: "frapx_lookAt(vec3(0.0, 0.0, 5.0), vec3(0.0), 0.0) * vec3(1.0, 0.0, 0.0)", expected: [1, 0, 0] },
  { expr: "frapx_lookAt(vec3(0.0, 0.0, 5.0), vec3(0.0), 0.0) * vec3(0.0, 1.0, 0.0)", expected: [0, 1, 0] },
  { expr: "frapx_lookAt(vec3(0.0, 0.0, 5.0), vec3(0.0), 0.0) * vec3(0.0, 0.0, 1.0)", expected: [0, 0, -1] },
  // A quarter roll turns the camera's right into world up.
  { expr: `frapx_lookAt(vec3(0.0, 0.0, 5.0), vec3(0.0), ${HALF_PI}) * vec3(1.0, 0.0, 0.0)`, expected: [0, 1, 0] },
  { expr: `frapx_lookAt(vec3(0.0, 0.0, 5.0), vec3(0.0), ${HALF_PI}) * vec3(0.0, 1.0, 0.0)`, expected: [-1, 0, 0] },

  // --- frapx_cameraRay: 100 x 100 viewport, 90 degree vertical fov ---
  {
    expr: `frapx_cameraRay(vec2(50.0), vec2(100.0), vec3(0.0, 0.0, 5.0), vec3(0.0), ${HALF_PI})`,
    expected: [0, 0, -1]
  },
  // The top edge sits fov / 2 above the view direction.
  {
    expr: `frapx_cameraRay(vec2(50.0, 100.0), vec2(100.0), vec3(0.0, 0.0, 5.0), vec3(0.0), ${HALF_PI})`,
    expected: [0, INV_SQRT2, -INV_SQRT2]
  },
  // Horizontal extent scales with the aspect ratio: 200 x 100 puts the right
  // edge at uv.x = 1.
  {
    expr: `frapx_cameraRay(vec2(200.0, 50.0), vec2(200.0, 100.0), vec3(0.0, 0.0, 5.0), vec3(0.0), ${HALF_PI})`,
    expected: [2 / Math.sqrt(5), 0, -1 / Math.sqrt(5)]
  },
  {
    expr: `frapx_cameraRay(vec2(50.0, 100.0), vec2(100.0), frapx_lookAt(vec3(0.0, 0.0, 5.0), vec3(0.0), ${HALF_PI}), ${HALF_PI})`,
    expected: [-INV_SQRT2, 0, -INV_SQRT2]
  }
];

// Evaluated with u_camPos = (0, 0, 5), u_camTarget = (0, 0, 0), u_fov = pi / 2.
export const cameraUniforms = {
  u_camPos: [0, 0, 5],
  u_camTarget: [0, 0, 0],
  u_fov: [Math.PI / 2]
};

export const uniformCases: RaymarchCase[] = [
  { expr: "frapx_cameraRay(vec2(50.0), vec2(100.0))", expected: [0, 0, -1] },
  { expr: "frapx_cameraRay(vec2(50.0, 100.0), vec2(100.0))", expected: [0, INV_SQRT2, -INV_SQRT2] }
];
