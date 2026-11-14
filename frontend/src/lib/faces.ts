import type { Box, Scene } from '../types';

const SLOP = 0.4; // a click this far outside a face (as a share of its size) still counts
const MIN_SLOP = 0.015; // ...and never less than this share of the frame, for small faces

/** One person's face, as shares of the frame (0 to 1). */
export interface Face {
  /** The tracked person it belongs to. */
  id: number;
  box: Box;
}

const share = (value: number, size: number) => Math.min(1, Math.max(0, value / size));

/** Every face the backend found in the scene. */
export function facesIn(scene: Scene | null): Face[] {
  if (!scene) return [];
  const { w, h } = scene;
  return scene.people.flatMap(({ id, face }) =>
    face ? [{ id, box: [share(face[0], w), share(face[1], h), share(face[2], w), share(face[3], h)] as Box }] : [],
  );
}

/** The face at a point given as shares of the frame: the nearest one the point is on or just beside. */
export function faceAt(faces: Face[], x: number, y: number): Face | null {
  let best: Face | null = null;
  let bestDistance = Infinity;
  for (const face of faces) {
    const [x1, y1, x2, y2] = face.box;
    const slopX = Math.max((x2 - x1) * SLOP, MIN_SLOP);
    const slopY = Math.max((y2 - y1) * SLOP, MIN_SLOP);
    if (x < x1 - slopX || x > x2 + slopX || y < y1 - slopY || y > y2 + slopY) continue;
    const distance = Math.hypot(x - (x1 + x2) / 2, y - (y1 + y2) / 2);
    if (distance < bestDistance) {
      best = face;
      bestDistance = distance;
    }
  }
  return best;
}
