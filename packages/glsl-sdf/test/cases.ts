// Analytic reference values, evaluated on the GPU by e2e/sdf.spec.ts. Each
// expression returns a float, vec2 or vec3; `expected` lists its components.
// The unit tests require every exported GLSL function to appear here.

export type SdfCase = {
  expr: string;
  expected: number[];
};

const HALF_PI = Math.PI / 2;
const INV_SQRT3 = 1 / Math.sqrt(3);

export const sdfCases: SdfCase[] = [
  // --- 2D ---
  { expr: "frapx_sdCircle(vec2(3.0, 4.0), 2.0)", expected: [3] },
  { expr: "frapx_sdCircle(vec2(0.0), 2.0)", expected: [-2] },
  { expr: "frapx_sdBox(vec2(3.0, 0.0), vec2(1.0))", expected: [2] },
  { expr: "frapx_sdBox(vec2(0.0), vec2(1.0, 2.0))", expected: [-1] },
  { expr: "frapx_sdBox(vec2(2.0, 3.0), vec2(1.0))", expected: [Math.sqrt(5)] },
  { expr: "frapx_sdRoundBox(vec2(3.0, 0.0), vec2(1.0), 0.5)", expected: [2] },
  {
    expr: "frapx_sdRoundBox(vec2(2.0), vec2(1.0), 0.5)",
    expected: [Math.sqrt(4.5) - 0.5]
  },
  { expr: "frapx_sdRoundBox(vec2(0.0), vec2(1.0), 0.5)", expected: [-1] },
  {
    expr: "frapx_sdRoundBox(vec2(2.0), vec2(1.0), vec4(0.5, 0.0, 0.0, 0.0))",
    expected: [Math.sqrt(4.5) - 0.5]
  },
  {
    expr: "frapx_sdRoundBox(vec2(-2.0), vec2(1.0), vec4(0.5, 0.0, 0.0, 0.0))",
    expected: [Math.SQRT2]
  },
  {
    expr: "frapx_sdSegment(vec2(0.0, 1.0), vec2(-1.0, 0.0), vec2(1.0, 0.0))",
    expected: [1]
  },
  {
    expr: "frapx_sdSegment(vec2(3.0, 0.0), vec2(-1.0, 0.0), vec2(1.0, 0.0))",
    expected: [2]
  },
  {
    expr: "frapx_sdTriangle(vec2(0.0, -1.0), vec2(-1.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0))",
    expected: [1]
  },
  {
    expr: "frapx_sdTriangle(vec2(0.0, 0.25), vec2(-1.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0))",
    expected: [-0.25]
  },
  { expr: "frapx_sdEquilateralTriangle(vec2(0.0), 1.0)", expected: [-INV_SQRT3] },
  {
    expr: "frapx_sdEquilateralTriangle(vec2(0.0, -2.0), 1.0)",
    expected: [2 - INV_SQRT3]
  },
  { expr: "frapx_sdHexagon(vec2(0.0), 1.0)", expected: [-1] },
  { expr: "frapx_sdHexagon(vec2(0.0, 3.0), 1.0)", expected: [2] },
  // Vertex on the x axis at 2 / sqrt(3).
  { expr: "frapx_sdHexagon(vec2(3.0, 0.0), 1.0)", expected: [3 - 2 * INV_SQRT3] },
  { expr: "frapx_sdRhombus(vec2(0.0), vec2(1.0))", expected: [-Math.SQRT1_2] },
  { expr: "frapx_sdRhombus(vec2(2.0, 0.0), vec2(1.0))", expected: [1] },
  { expr: "frapx_sdPie(vec2(0.0, 2.0), 0.785398, 1.0)", expected: [1] },
  // Inside near the axis: the 45° edge is closer than the rim.
  {
    expr: "frapx_sdPie(vec2(0.0, 0.5), 0.785398, 1.0)",
    expected: [-0.5 * Math.SQRT1_2]
  },
  { expr: "frapx_sdArc(vec2(0.0, 1.0), 1.570796, 1.0, 0.1)", expected: [-0.1] },
  { expr: "frapx_sdArc(vec2(0.0), 1.570796, 1.0, 0.1)", expected: [0.9] },
  // Below the 90° half aperture the arc ends at (1, 0).
  { expr: "frapx_sdArc(vec2(1.0, -1.0), 1.570796, 1.0, 0.1)", expected: [0.9] },

  // --- 3D ---
  { expr: "frapx_sdSphere(vec3(0.0, 3.0, 0.0), 1.0)", expected: [2] },
  { expr: "frapx_sdBox(vec3(3.0, 0.0, 0.0), vec3(1.0))", expected: [2] },
  { expr: "frapx_sdBox(vec3(2.0), vec3(1.0))", expected: [Math.sqrt(3)] },
  { expr: "frapx_sdBox(vec3(0.0), vec3(1.0))", expected: [-1] },
  {
    expr: "frapx_sdRoundBox(vec3(2.0), vec3(1.0), 0.5)",
    expected: [Math.sqrt(3 * 2.25) - 0.5]
  },
  { expr: "frapx_sdRoundBox(vec3(0.0), vec3(1.0), 0.5)", expected: [-1] },
  // Bars along x occupy |y|, |z| in [0.8, 1.0].
  {
    expr: "frapx_sdBoxFrame(vec3(0.0), vec3(1.0), 0.1)",
    expected: [Math.sqrt(2 * 0.64)]
  },
  // Centered in the cross-section of the bar along z.
  { expr: "frapx_sdBoxFrame(vec3(0.9, 0.9, 0.0), vec3(1.0), 0.1)", expected: [-0.1] },
  { expr: "frapx_sdTorus(vec3(0.0), vec2(1.0, 0.25))", expected: [0.75] },
  { expr: "frapx_sdTorus(vec3(1.0, 1.0, 0.0), vec2(1.0, 0.25))", expected: [0.75] },
  { expr: "frapx_sdTorus(vec3(0.0, 0.0, 1.0), vec2(1.0, 0.25))", expected: [-0.25] },
  { expr: "frapx_sdCylinder(vec3(0.0), 1.0, 0.5)", expected: [-0.5] },
  { expr: "frapx_sdCylinder(vec3(0.0, 3.0, 0.0), 1.0, 0.5)", expected: [2] },
  { expr: "frapx_sdCylinder(vec3(2.0, 0.0, 0.0), 1.0, 0.5)", expected: [1.5] },
  { expr: "frapx_sdCappedCone(vec3(0.0, 2.0, 0.0), 1.0, 1.0, 0.5)", expected: [1] },
  { expr: "frapx_sdCappedCone(vec3(0.0, -2.0, 0.0), 1.0, 1.0, 0.5)", expected: [1] },
  // The slanted side passes x = 0.75 at y = 0 with slope dx/dy = -0.25.
  {
    expr: "frapx_sdCappedCone(vec3(0.0), 1.0, 1.0, 0.5)",
    expected: [-0.75 / Math.sqrt(1.0625)]
  },
  {
    expr: "frapx_sdCapsule(vec3(0.0, 3.0, 0.0), vec3(0.0, -1.0, 0.0), vec3(0.0, 1.0, 0.0), 0.5)",
    expected: [1.5]
  },
  {
    expr: "frapx_sdCapsule(vec3(2.0, 0.0, 0.0), vec3(0.0, -1.0, 0.0), vec3(0.0, 1.0, 0.0), 0.5)",
    expected: [1.5]
  },
  {
    expr: "frapx_sdPlane(vec3(0.0, 3.0, 0.0), vec3(0.0, 1.0, 0.0), 1.0)",
    expected: [4]
  },
  { expr: "frapx_sdEllipsoid(vec3(2.0, 0.0, 0.0), vec3(1.0))", expected: [1] },
  {
    expr: "frapx_sdEllipsoid(vec3(0.0, 3.0, 0.0), vec3(1.0, 2.0, 1.0))",
    expected: [1]
  },
  { expr: "frapx_sdOctahedron(vec3(0.0), 1.0)", expected: [-INV_SQRT3] },
  { expr: "frapx_sdOctahedron(vec3(2.0, 0.0, 0.0), 1.0)", expected: [1] },
  { expr: "frapx_sdOctahedron(vec3(1.0), 1.0)", expected: [2 * INV_SQRT3] },
  { expr: "frapx_sdHexPrism(vec3(0.0), vec2(1.0))", expected: [-1] },
  { expr: "frapx_sdHexPrism(vec3(0.0, 0.0, 3.0), vec2(1.0))", expected: [2] },
  { expr: "frapx_sdHexPrism(vec3(0.0, 3.0, 0.0), vec2(1.0))", expected: [2] },

  // --- Operators ---
  { expr: "frapx_opUnion(1.0, 2.0)", expected: [1] },
  { expr: "frapx_opSubtract(1.0, -0.5)", expected: [1] },
  { expr: "frapx_opSubtract(-1.0, -0.5)", expected: [0.5] },
  { expr: "frapx_opIntersect(1.0, 2.0)", expected: [2] },
  { expr: "frapx_opSmoothUnion(0.0, 0.0, 1.0)", expected: [-0.25] },
  { expr: "frapx_opSmoothUnion(1.0, 5.0, 0.5)", expected: [1] },
  { expr: "frapx_opSmoothSubtract(0.0, 0.0, 1.0)", expected: [0.25] },
  { expr: "frapx_opSmoothSubtract(-1.0, -5.0, 0.5)", expected: [5] },
  { expr: "frapx_opSmoothIntersect(0.0, 0.0, 1.0)", expected: [0.25] },
  { expr: "frapx_opSmoothIntersect(1.0, 5.0, 0.5)", expected: [5] },
  { expr: "frapx_opRound(1.0, 0.25)", expected: [0.75] },
  { expr: "frapx_opOnion(-1.0, 0.1)", expected: [0.9] },

  // --- Domain ---
  { expr: "frapx_rotate(vec2(1.0, 0.0), 1.5707963)", expected: [0, 1] },
  { expr: "frapx_opRepeat(vec2(2.6, -0.4), vec2(1.0))", expected: [-0.4, -0.4] },
  {
    expr: "frapx_opRepeat(vec3(5.2, 0.0, -5.2), vec3(2.0))",
    expected: [-0.8, 0, 0.8]
  },
  {
    expr: "frapx_opRepeatLimited(vec2(10.3, 0.2), vec2(1.0), vec2(2.0))",
    expected: [8.3, 0.2]
  },
  {
    expr: "frapx_opRepeatLimited(vec3(1.2, -10.3, 0.0), vec3(1.0), vec3(2.0))",
    expected: [0.2, -8.3, 0]
  },
  {
    expr: "frapx_opTwist(vec3(1.0, 1.5707963, 0.0), 1.0)",
    expected: [0, HALF_PI, 1]
  },
  {
    expr: "frapx_opBend(vec3(1.5707963, 0.0, 0.5), 1.0)",
    expected: [0, HALF_PI, 0.5]
  }
];
