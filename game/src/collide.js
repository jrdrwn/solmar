// Solmar — collision and the street graph.
// Cars, police and traffic never drive through buildings: everything that
// drives moves on the street graph, and everything that walks resolves
// against the building boxes. Two small ideas, kept apart on purpose.

import { STREETS, HALF_STREET } from './config.js';

// ---------------------------------------------------------------------------
// Building boxes: axis-aligned {minX, maxX, minZ, maxZ}. A circle (player,
// car) is pushed out of any box it overlaps. Returns true when a push
// happened, so callers can tell a crash from free road.
// ---------------------------------------------------------------------------
export function resolveCircle(pos, radius, boxes) {
  let hit = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    } else {
      // Centre inside the box: shove out along the smallest penetration.
      const left = pos.x - b.minX;
      const right = b.maxX - pos.x;
      const top = pos.z - b.minZ;
      const bottom = b.maxZ - pos.z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = b.minX - radius;
      else if (m === right) pos.x = b.maxX + radius;
      else if (m === top) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
  }
  return hit;
}

export function pointInBoxes(x, z, boxes) {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Street graph: intersections of the 8x8 street grid. Nodes are numbered
// ix * 8 + iz. Every driver follows node-to-node routes on this graph, so a
// police car can never cut a corner through a block.
// ---------------------------------------------------------------------------
export function nodeId(ix, iz) {
  return ix * 8 + iz;
}

export function nodePos(id) {
  return { x: STREETS[Math.floor(id / 8)], z: STREETS[id % 8] };
}

export function nearestNode(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let ix = 0; ix < 8; ix++) {
    for (let iz = 0; iz < 8; iz++) {
      const dx = x - STREETS[ix];
      const dz = z - STREETS[iz];
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = nodeId(ix, iz);
      }
    }
  }
  return best;
}

export function neighbours(id) {
  const ix = Math.floor(id / 8);
  const iz = id % 8;
  const out = [];
  if (ix > 0) out.push(nodeId(ix - 1, iz));
  if (ix < 7) out.push(nodeId(ix + 1, iz));
  if (iz > 0) out.push(nodeId(ix, iz - 1));
  if (iz < 7) out.push(nodeId(ix, iz + 1));
  return out;
}

// Breadth-first route from one node to another, as a list of node ids
// (excluding the start, including the destination).
export function route(from, to) {
  if (from === to) return [];
  const prev = new Map();
  const queue = [from];
  prev.set(from, -1);
  while (queue.length) {
    const cur = queue.shift();
    for (const n of neighbours(cur)) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      if (n === to) {
        const path = [n];
        let p = cur;
        while (p !== from) {
          path.unshift(p);
          p = prev.get(p);
        }
        return path;
      }
      queue.push(n);
    }
  }
  return [];
}

// Snap a point onto the nearest street centreline. Cars always sit on a
// street, so a waypoint built from this can never land on a block centre.
export function nearestStreetPoint(x, z) {
  let bestX = STREETS[0];
  let bestDx = Math.abs(x - STREETS[0]);
  for (const s of STREETS) {
    const d = Math.abs(x - s);
    if (d < bestDx) {
      bestDx = d;
      bestX = s;
    }
  }
  let bestZ = STREETS[0];
  let bestDz = Math.abs(z - STREETS[0]);
  for (const s of STREETS) {
    const d = Math.abs(z - s);
    if (d < bestDz) {
      bestDz = d;
      bestZ = s;
    }
  }
  // Snap to whichever centreline is closer; the other axis stays free.
  if (bestDx <= bestDz) return { x: bestX, z, axis: 'x' };
  return { x, z: bestZ, axis: 'z' };
}

// Is a point on a street (within the asphalt, with a little slack)?
export function onStreet(x, z) {
  for (const s of STREETS) {
    if (Math.abs(x - s) <= HALF_STREET + 1 || Math.abs(z - s) <= HALF_STREET + 1) return true;
  }
  return false;
}

// Pick a random point on a real street (never a block centre).
export function randomStreetPoint(rng) {
  if (rng.chance(0.5)) {
    return { x: rng.pick(STREETS) + rng.range(-4, 4), z: rng.range(-196, 196) };
  }
  return { x: rng.range(-196, 196), z: rng.pick(STREETS) + rng.range(-4, 4) };
}
