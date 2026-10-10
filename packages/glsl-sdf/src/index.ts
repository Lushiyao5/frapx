const glsl = String.raw;

// Every group is self-contained and the groups never define the same
// signature twice, so any combination can be concatenated into one shader.
// Overloads share a name across 2D and 3D (e.g. frapx_sdBox(vec2, vec2) and
// frapx_sdBox(vec3, vec3)); GLSL ES 1.00 resolves them by exact type.

export const sdfLicense = glsl`
// Distance functions follow Inigo Quilez's articles (MIT):
// https://iquilezles.org/articles/distfunctions/
// https://iquilezles.org/articles/distfunctions2d/
// See LICENSES/iq-distfunctions-MIT.txt in @frapx/glsl-sdf.
`;

/** 2D primitives. Negative inside, positive outside. */
export const sdf2d = glsl`
${sdfLicense}

float frapx_sdCircle(vec2 p, float r) {
  return length(p) - r;
}

// b: half size.
float frapx_sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// b: half size including the rounding.
float frapx_sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Per-corner radii: x top-right, y bottom-right, z top-left, w bottom-left.
float frapx_sdRoundBox(vec2 p, vec2 b, vec4 r) {
  r.xy = p.x > 0.0 ? r.xy : r.zw;
  r.x = p.y > 0.0 ? r.x : r.y;
  vec2 q = abs(p) - b + r.x;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r.x;
}

// Unsigned distance to the segment a-b; subtract a radius for thickness.
float frapx_sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float frapx_sdTriangle(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0;
  vec2 e1 = p2 - p1;
  vec2 e2 = p0 - p2;
  vec2 v0 = p - p0;
  vec2 v1 = p - p1;
  vec2 v2 = p - p2;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(
    min(
      vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
      vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))
    ),
    vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x))
  );
  return -sqrt(d.x) * sign(d.y);
}

// Pointing up, centered on its centroid. r: half the side length.
float frapx_sdEquilateralTriangle(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) {
    p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  }
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

// Flat top and bottom. r: inner radius (center to edge).
float frapx_sdHexagon(vec2 p, float r) {
  const vec3 k = vec3(-0.8660254, 0.5, 0.57735027);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

// b: half the diagonals.
float frapx_sdRhombus(vec2 p, vec2 b) {
  p = abs(p);
  vec2 q = b - 2.0 * p;
  float h = clamp((q.x * b.x - q.y * b.y) / dot(b, b), -1.0, 1.0);
  float d = length(p - 0.5 * b * vec2(1.0 - h, 1.0 + h));
  return d * sign(p.x * b.y + p.y * b.x - b.x * b.y);
}

// Circular sector opening around +y. angle: half the aperture in radians.
float frapx_sdPie(vec2 p, float angle, float r) {
  vec2 c = vec2(sin(angle), cos(angle));
  p.x = abs(p.x);
  float l = length(p) - r;
  float m = length(p - c * clamp(dot(p, c), 0.0, r));
  return max(l, m * sign(c.y * p.x - c.x * p.y));
}

// Arc of radius r centered on +y. angle: half the aperture in radians.
float frapx_sdArc(vec2 p, float angle, float r, float thickness) {
  vec2 c = vec2(sin(angle), cos(angle));
  p.x = abs(p.x);
  float d = c.y * p.x > c.x * p.y ? length(p - c * r) : abs(length(p) - r);
  return d - thickness;
}
`;

/** 3D primitives. Negative inside, positive outside. */
export const sdf3d = glsl`
${sdfLicense}

float frapx_sdSphere(vec3 p, float r) {
  return length(p) - r;
}

// b: half size.
float frapx_sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// b: half size including the rounding.
float frapx_sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// Edges of a box. b: half size, e: half the edge thickness.
float frapx_sdBoxFrame(vec3 p, vec3 b, float e) {
  p = abs(p) - b;
  vec3 q = abs(p + e) - e;
  return min(
    min(
      length(max(vec3(p.x, q.y, q.z), 0.0)) + min(max(p.x, max(q.y, q.z)), 0.0),
      length(max(vec3(q.x, p.y, q.z), 0.0)) + min(max(q.x, max(p.y, q.z)), 0.0)
    ),
    length(max(vec3(q.x, q.y, p.z), 0.0)) + min(max(q.x, max(q.y, p.z)), 0.0)
  );
}

// In the xz plane. t: (major radius, minor radius).
float frapx_sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

// Capped, along y. h: half height.
float frapx_sdCylinder(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// Along y. h: half height, r1: bottom radius, r2: top radius.
float frapx_sdCappedCone(vec3 p, float h, float r1, float r2) {
  vec2 q = vec2(length(p.xz), p.y);
  vec2 k1 = vec2(r2, h);
  vec2 k2 = vec2(r2 - r1, 2.0 * h);
  vec2 ca = vec2(q.x - min(q.x, q.y < 0.0 ? r1 : r2), abs(q.y) - h);
  vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
  float s = cb.x < 0.0 && ca.y < 0.0 ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}

// Segment a-b with radius r.
float frapx_sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// n must be normalized; the plane passes through -n * h.
float frapx_sdPlane(vec3 p, vec3 n, float h) {
  return dot(p, n) + h;
}

// r: radii per axis. A bound, not an exact distance.
float frapx_sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}

// s: center to vertex.
float frapx_sdOctahedron(vec3 p, float s) {
  p = abs(p);
  float m = p.x + p.y + p.z - s;
  vec3 q;
  if (3.0 * p.x < m) {
    q = p.xyz;
  } else if (3.0 * p.y < m) {
    q = p.yzx;
  } else if (3.0 * p.z < m) {
    q = p.zxy;
  } else {
    return m * 0.57735027;
  }
  float k = clamp(0.5 * (q.z - q.y + s), 0.0, s);
  return length(vec3(q.x, q.y - s + k, q.z - k));
}

// Along z. h: (inner radius of the hexagon, half depth).
float frapx_sdHexPrism(vec3 p, vec2 h) {
  const vec3 k = vec3(-0.8660254, 0.5, 0.57735027);
  p = abs(p);
  p.xy -= 2.0 * min(dot(k.xy, p.xy), 0.0) * k.xy;
  vec2 d = vec2(
    length(p.xy - vec2(clamp(p.x, -k.z * h.x, k.z * h.x), h.x)) * sign(p.y - h.x),
    p.z - h.y
  );
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
`;

/**
 * Boolean and shaping operators on distances. Smooth variants take a blend
 * radius `k` that must be greater than 0.
 */
export const sdfOps = glsl`
${sdfLicense}

float frapx_opUnion(float a, float b) {
  return min(a, b);
}

// a with b removed.
float frapx_opSubtract(float a, float b) {
  return max(a, -b);
}

float frapx_opIntersect(float a, float b) {
  return max(a, b);
}

float frapx_opSmoothUnion(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float frapx_opSmoothSubtract(float a, float b, float k) {
  float h = clamp(0.5 - 0.5 * (a + b) / k, 0.0, 1.0);
  return mix(a, -b, h) + k * h * (1.0 - h);
}

float frapx_opSmoothIntersect(float a, float b, float k) {
  float h = clamp(0.5 - 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) + k * h * (1.0 - h);
}

// Grows the shape by r, rounding its corners.
float frapx_opRound(float d, float r) {
  return d - r;
}

// Hollows the shape into a shell of the given half thickness.
float frapx_opOnion(float d, float thickness) {
  return abs(d) - thickness;
}
`;

/**
 * Domain operators: transform the point before evaluating a distance.
 * Twist and bend distort space, so their results are not exact distances;
 * shorten raymarch steps (e.g. multiply by 0.5) when using them.
 */
export const sdfDomain = glsl`
// Rotates p counter-clockwise by angle radians. For 3D, rotate a swizzle:
// p.xz = frapx_rotate(p.xz, angle).
vec2 frapx_rotate(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Infinite repetition with the given cell size, centered on the origin cell.
vec2 frapx_opRepeat(vec2 p, vec2 spacing) {
  return p - spacing * floor(p / spacing + 0.5);
}

vec3 frapx_opRepeat(vec3 p, vec3 spacing) {
  return p - spacing * floor(p / spacing + 0.5);
}

// Repetition limited to cells -limit..limit on each axis.
vec2 frapx_opRepeatLimited(vec2 p, vec2 spacing, vec2 limit) {
  return p - spacing * clamp(floor(p / spacing + 0.5), -limit, limit);
}

vec3 frapx_opRepeatLimited(vec3 p, vec3 spacing, vec3 limit) {
  return p - spacing * clamp(floor(p / spacing + 0.5), -limit, limit);
}

// Twists around the y axis by k radians per unit of height.
vec3 frapx_opTwist(vec3 p, float k) {
  float c = cos(k * p.y);
  float s = sin(k * p.y);
  return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
}

// Bends the xy plane around the z axis by k radians per unit along x.
vec3 frapx_opBend(vec3 p, float k) {
  float c = cos(k * p.x);
  float s = sin(k * p.x);
  return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}
`;

/** Every 2D/3D primitive, operator and domain helper in one snippet. */
export const sdf = glsl`
${sdf2d}
${sdf3d}
${sdfOps}
${sdfDomain}
`;
