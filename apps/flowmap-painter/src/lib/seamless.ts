/**
 * Return all stamp positions needed for seamless (tiling) painting.
 * When the brush overlaps a canvas edge, also stamp on the opposite side.
 */
export function seamlessPositions(
  x: number,
  y: number,
  radius: number,
  size: number
): ReadonlyArray<readonly [number, number]> {
  const positions: Array<readonly [number, number]> = [[x, y]];

  const wrapX =
    x - radius < 0 ? x + size : x + radius > size ? x - size : null;
  const wrapY =
    y - radius < 0 ? y + size : y + radius > size ? y - size : null;

  if (wrapX !== null) positions.push([wrapX, y]);
  if (wrapY !== null) positions.push([x, wrapY]);
  if (wrapX !== null && wrapY !== null) positions.push([wrapX, wrapY]);

  return positions;
}
