// Solmar: collision helpers. Everything collides as a circle on the ground
// plane against the city's building AABBs (plus the world edge), so walking,
// driving and pedestrians share one resolver.
export function collideCircle(pos, radius, colliders, worldHalf) {
  // pos is a THREE.Vector3 (x, z used; y untouched). Returns true when pushed.
  let hit = false;
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    if (pos.x + radius <= c.minX || pos.x - radius >= c.maxX) continue;
    if (pos.z + radius <= c.minZ || pos.z - radius >= c.maxZ) continue;
    const pushLeft = (pos.x + radius) - c.minX;
    const pushRight = c.maxX - (pos.x - radius);
    const pushUp = (pos.z + radius) - c.minZ;
    const pushDown = c.maxZ - (pos.z - radius);
    const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
    if (min === pushLeft) pos.x = c.minX - radius;
    else if (min === pushRight) pos.x = c.maxX + radius;
    else if (min === pushUp) pos.z = c.minZ - radius;
    else pos.z = c.maxZ + radius;
    hit = true;
  }
  if (worldHalf !== undefined) {
    const m = worldHalf - radius;
    if (pos.x < -m) { pos.x = -m; hit = true; }
    if (pos.x > m) { pos.x = m; hit = true; }
    if (pos.z < -m) { pos.z = -m; hit = true; }
    if (pos.z > m + 90) { pos.z = m + 90; hit = true; } // beach + sea room
  }
  return hit;
}

export function circleHitsAABB(x, z, radius, c) {
  const cx = Math.max(c.minX, Math.min(x, c.maxX));
  const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < radius * radius;
}
