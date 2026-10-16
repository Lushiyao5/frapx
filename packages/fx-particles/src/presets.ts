import type { ParticleConfig, ParticlePresetName } from "./types";

// Lengths in viewport heights, times in seconds. Farther particles (depth 1)
// move at 1 / (1 + perspective) of the screen speed of near ones, so the
// lifetimes of falling and rising presets cover the slowest crossing.

const dust: ParticleConfig = {
  rate: 40,
  lifetime: [6, 10],
  emitter: { area: [0, 0, 1, 1], depth: [0, 1] },
  velocity: { min: [-0.01, -0.01, 0], max: [0.01, 0.01, 0] },
  forces: { drag: 1, curl: { strength: 0.04, scale: 1.5, speed: 0.05 } },
  size: [0.004, 0.012],
  sizeOverLife: "fadeInOut",
  color: [
    [0, "#fff3e000"],
    [0.25, "#fff3e099"],
    [0.75, "#fff3e099"],
    [1, "#fff3e000"]
  ],
  twinkle: 0.2,
  blend: "additive"
};

const snow: ParticleConfig = {
  rate: 40,
  lifetime: [20, 24],
  emitter: { area: [-0.05, 1.02, 1.05, 1.06], depth: [0, 1] },
  velocity: { min: [-0.02, -0.12, 0], max: [0.02, -0.08, 0] },
  forces: {
    gravity: [0, -0.12, 0],
    drag: 0.8,
    curl: { strength: 0.08, scale: 1.2, speed: 0.1 }
  },
  size: [0.008, 0.022],
  color: [
    [0, "#ffffff00"],
    [0.02, "#ffffffe6"],
    [0.9, "#ffffffe6"],
    [1, "#ffffff00"]
  ],
  sprite: "soft",
  blend: "normal"
};

const sparkles: ParticleConfig = {
  rate: 30,
  lifetime: [1.5, 3],
  emitter: { area: [0, 0, 1, 1], depth: [0, 0.5] },
  velocity: { min: [-0.02, 0, 0], max: [0.02, 0.05, 0] },
  forces: { drag: 1 },
  size: [0.015, 0.04],
  sizeOverLife: "fadeInOut",
  color: ["#fff7d6", "#ffd27a", "#ff9f43"],
  sprite: "glint",
  spin: [-0.5, 0.5],
  twinkle: 0.8,
  blend: "additive"
};

const bubbles: ParticleConfig = {
  rate: 6,
  lifetime: [10, 14],
  emitter: { area: [0, -0.08, 1, -0.04], depth: [0, 0.6] },
  velocity: { min: [-0.02, 0.06, 0], max: [0.02, 0.12, 0] },
  forces: {
    gravity: [0, 0.03, 0],
    drag: 0.3,
    curl: { strength: 0.12, scale: 0.8, speed: 0.2 }
  },
  size: [0.02, 0.06],
  sizeOverLife: "fadeIn",
  color: [
    [0, "#bfefffb3"],
    [0.85, "#bfefffb3"],
    [1, "#bfefff00"]
  ],
  sprite: "ring",
  blend: "normal"
};

const fireflies: ParticleConfig = {
  rate: 5,
  lifetime: [6, 10],
  emitter: { area: [0, 0, 1, 0.7], depth: [0, 0.6] },
  velocity: { min: [-0.02, -0.01, 0], max: [0.02, 0.02, 0] },
  forces: { drag: 1.5, curl: { strength: 0.06, scale: 1, speed: 0.1 } },
  size: [0.025, 0.06],
  sizeOverLife: "fadeInOut",
  color: "#d9ff7a",
  twinkle: 1,
  blend: "additive"
};

const confetti: ParticleConfig = {
  rate: 40,
  lifetime: [7, 9],
  emitter: { area: [0, 1.02, 1, 1.06], depth: [0, 0.6] },
  velocity: { min: [-0.1, -0.2, 0], max: [0.1, -0.05, 0] },
  forces: {
    gravity: [0, -0.15, 0],
    drag: 1.2,
    curl: { strength: 0.2, scale: 1, speed: 0.3 }
  },
  size: [0.012, 0.022],
  color: [
    [0, "#ffffff"],
    [0.9, "#ffffff"],
    [1, "#ffffff00"]
  ],
  palette: ["#ff4d6d", "#ffd166", "#06d6a0", "#118ab2", "#ffffff", "#c77dff"],
  sprite: "square",
  spin: [-6, 6],
  tumble: true,
  blend: "normal"
};

export const presets: Readonly<Record<ParticlePresetName, ParticleConfig>> = {
  dust,
  snow,
  sparkles,
  bubbles,
  fireflies,
  confetti
};
