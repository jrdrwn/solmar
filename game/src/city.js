// Solmar — the city itself: streets, blocks, buildings, beach, sea,
// docks and pier, all built from one seed. Returns the building boxes the
// rest of the game collides against, and the named landmarks the missions
// point at. Nothing here knows about the player.

import * as THREE from 'three';
import { STREETS, STREET_W, CITY, BEACH_Z0, SEA_Z0, DOCKS_X0, PIER_X, PIER_Z0, PALETTE } from './config.js';

// Landmarks the missions use, as street-side points (always on real
// streets, never on a block centre).
export const LANDMARKS = {
  garage: { x: 196, z: 140, label: "Rosa's Garage" },
  bank: { x: 84, z: -84, label: 'Solmar Trust Bank' },
  docks: { x: 252, z: 84, label: 'Solmar Docks' },
  plaza: { x: 0, z: 0, label: 'Solmar Plaza' },
  hideout: { x: -196, z: 140, label: 'West Hideout' },
  downtown: { x: -28, z: -84, label: 'Downtown' },
};

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function facadeTexture(base, lit) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // faint vertical grime
    g.fillStyle = 'rgba(0,0,0,0.06)';
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 4, h);
    // window grid
    const cols = 4;
    const rows = 8;
    const cw = w / cols;
    const rh = h / rows;
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        const litWin = Math.random() < 0.28;
        g.fillStyle = litWin ? '#ffe9a8' : '#5a7a8c';
        g.fillRect(cx * cw + 6, cy * rh + 8, cw - 12, rh - 16);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(cx * cw + 6, cy * rh + 8, cw - 12, 4);
      }
    }
    void lit;
  });
}

function roadTexture() {
  return canvasTexture(64, 128, (g, w, h) => {
    g.fillStyle = '#3a3f46';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8d3c0';
    g.fillRect(2, 0, 2, h);
    g.fillRect(w - 4, 0, 2, h);
    g.fillStyle = '#e8c82e';
    g.fillRect(w / 2 - 2, 8, 4, 40);
    g.fillRect(w / 2 - 2, 72, 4, 40);
  });
}

function signTexture(text, bg, fg) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = 'bold 26px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 1);
  });
}

export function buildCity(scene, rng) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  const lambert = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });

  // -- ground ----------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY * 2 + 140, CITY * 2 + 140),
    lambert(0xb0a890),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(40, 0, 0);
  group.add(ground);

  // -- beach + sea -----------------------------------------------------------
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY * 2 + 140, 80),
    lambert(PALETTE.sand),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(40, 0.03, BEACH_Z0 + 40);
  group.add(sand);

  const seaTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#1e7fa8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      const y = 8 + i * 13;
      g.moveTo(0, y);
      g.bezierCurveTo(30, y - 5, 60, y + 5, 128, y);
      g.stroke();
    }
  });
  seaTex.wrapS = THREE.RepeatWrapping;
  seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(10, 4);
  const seaMat = new THREE.MeshLambertMaterial({ map: seaTex });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 320), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(40, 0.05, SEA_Z0 + 160);
  group.add(sea);

  // -- docks -----------------------------------------------------------------
  const dock = new THREE.Mesh(
    new THREE.PlaneGeometry(96, CITY * 2),
    lambert(PALETTE.dockConcrete),
  );
  dock.rotation.x = -Math.PI / 2;
  dock.position.set(DOCKS_X0 + 48, 0.03, 0);
  group.add(dock);

  // -- roads + sidewalks -----------------------------------------------------
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const walkMat = lambert(PALETTE.sidewalk);
  for (const s of STREETS) {
    // vertical road (along z)
    const walkV = new THREE.Mesh(new THREE.PlaneGeometry(STREET_W + 6, CITY * 2), walkMat);
    walkV.rotation.x = -Math.PI / 2;
    walkV.position.set(s, 0.01, 0);
    group.add(walkV);
    const texV = roadTex.clone();
    texV.needsUpdate = true;
    texV.wrapS = THREE.RepeatWrapping;
    texV.wrapT = THREE.RepeatWrapping;
    texV.repeat.set(1, 28);
    const roadV = new THREE.Mesh(
      new THREE.PlaneGeometry(STREET_W, CITY * 2),
      new THREE.MeshLambertMaterial({ map: texV }),
    );
    roadV.rotation.x = -Math.PI / 2;
    roadV.position.set(s, 0.02, 0);
    group.add(roadV);
    // horizontal road (along x)
    const walkH = new THREE.Mesh(new THREE.PlaneGeometry(CITY * 2, STREET_W + 6), walkMat);
    walkH.rotation.x = -Math.PI / 2;
    walkH.position.set(0, 0.01, s);
    group.add(walkH);
    const texH = roadTex.clone();
    texH.needsUpdate = true;
    texH.wrapS = THREE.RepeatWrapping;
    texH.wrapT = THREE.RepeatWrapping;
    texH.repeat.set(28, 1);
    const roadH = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY * 2, STREET_W),
      new THREE.MeshLambertMaterial({ map: texH }),
    );
    roadH.rotation.x = -Math.PI / 2;
    roadH.position.set(0, 0.02, s);
    group.add(roadH);
  }
  void roadMat;

  // -- buildings -------------------------------------------------------------
  // One facade texture per wall colour; each building clones its texture
  // and repeats it so the windows stay ~1.75 m across whatever its size.
  const facadeBases = ['#e8c9a0', '#d8b48c', '#c9a06a', '#b8c4c8'].map((c) => facadeTexture(c));
  function facadeMaterial(w, h) {
    const tex = rng.pick(facadeBases).clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(1, Math.round(w / 7)), Math.max(1, Math.round(h / 7)));
    return new THREE.MeshLambertMaterial({ map: tex });
  }
  const roofMat = lambert(0x8c5a3c);
  const roofMats = PALETTE.roof.map((c) => lambert(c));

  // Blocks: the squares between streets. Block (bi, bj) spans
  // [STREETS[bi]+7, STREETS[bi+1]-7] x [STREETS[bj]+7, STREETS[bj+1]-7].
  for (let bi = 0; bi < 7; bi++) {
    for (let bj = 0; bj < 7; bj++) {
      const x0 = STREETS[bi] + 7;
      const x1 = STREETS[bi + 1] - 7;
      const z0 = STREETS[bj] + 7;
      const z1 = STREETS[bj + 1] - 7;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      // Central block is Solmar Plaza: open, trees, no buildings.
      if (bi === 3 && bj === 3) {
        const plaza = new THREE.Mesh(
          new THREE.PlaneGeometry(42, 42),
          lambert(0x9ab87a),
        );
        plaza.rotation.x = -Math.PI / 2;
        plaza.position.set(cx, 0.04, cz);
        group.add(plaza);
        for (let t = 0; t < 8; t++) {
          addPalm(group, rng, cx + rng.range(-16, 16), cz + rng.range(-16, 16));
        }
        continue;
      }
      // Some blocks are parking lots: flat, a few parked-car pads.
      if (rng.chance(0.14)) {
        const lot = new THREE.Mesh(new THREE.PlaneGeometry(42, 42), lambert(0x6a6a62));
        lot.rotation.x = -Math.PI / 2;
        lot.position.set(cx, 0.04, cz);
        group.add(lot);
        continue;
      }
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k++) {
        const w = rng.range(12, 26);
        const d = rng.range(12, 26);
        const h = rng.chance(0.75) ? rng.range(8, 22) : rng.range(22, 44);
        const px = cx + rng.range(-(42 - w) / 2 + 2, (42 - w) / 2 - 2) * (n === 1 ? 0 : 1);
        const pz = cz + rng.range(-(42 - d) / 2 + 2, (42 - d) / 2 - 2) * (n === 1 ? 0 : 1);
        const facade = facadeMaterial(w, h);
        const roof = rng.pick(roofMats);
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          [facade, facade, roof, roofMat, facade, facade],
        );
        mesh.position.set(px, h / 2, pz);
        group.add(mesh);
        colliders.push({ minX: px - w / 2, maxX: px + w / 2, minZ: pz - d / 2, maxZ: pz + d / 2 });
      }
    }
  }

  // -- landmark signs ----------------------------------------------------------
  function addSign(text, x, z, y, rotY, bg, fg) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 4),
      new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) }),
    );
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    group.add(m);
  }
  // Garage: low wide building on the block north-east of its marker.
  const garage = new THREE.Mesh(new THREE.BoxGeometry(24, 7, 16), lambert(0xc8542e));
  garage.position.set(196 - 24, 3.5, 140 - 24);
  group.add(garage);
  colliders.push({ minX: 160, maxX: 184, minZ: 108, maxZ: 124 });
  addSign("ROSA'S GARAGE", 172, 140 - 15.9, 5.5, 0, '#20242a', '#ffd24a');
  // Bank: tall pale building near its marker.
  const bank = new THREE.Mesh(new THREE.BoxGeometry(20, 26, 16), lambert(0xe8e4d8));
  bank.position.set(84 - 22, 13, -84 - 22);
  group.add(bank);
  colliders.push({ minX: 84 - 32, maxX: 84 - 12, minZ: -84 - 30, maxZ: -84 - 14 });
  addSign('SOLMAR TRUST', 62, -84 - 13.9, 8, 0, '#1e3a5c', '#ffffff');

  // -- docks props -------------------------------------------------------------
  for (let i = 0; i < 14; i++) {
    const w = rng.range(8, 12);
    const h = rng.range(2.5, 7.5);
    const d = rng.range(2.5, 2.5);
    const px = rng.range(DOCKS_X0 + 12, DOCKS_X0 + 80);
    const pz = rng.range(-200, 200);
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      lambert(rng.pick(PALETTE.container)),
    );
    c.position.set(px, h / 2, pz);
    c.rotation.y = rng.chance(0.5) ? 0 : Math.PI / 2;
    group.add(c);
    colliders.push({
      minX: px - w / 2 - 1,
      maxX: px + w / 2 + 1,
      minZ: pz - d / 2 - 1,
      maxZ: pz + d / 2 + 1,
    });
  }
  // Crates stacked near the Dockside mission crate, so the docks read as
  // a working port from the mission screenshot (deterministic, not random).
  const dockCrates = [
    { x: 250, z: -152, w: 12, h: 5, d: 2.5, c: 0xc8542e, ry: 0 },
    { x: 266, z: -152, w: 8, h: 2.5, d: 2.5, c: 0x2e7a9c, ry: 0 },
    { x: 272, z: -128, w: 12, h: 5, d: 2.5, c: 0x8c9c2e, ry: Math.PI / 2 },
    { x: 244, z: -160, w: 8, h: 7.5, d: 2.5, c: 0xb89c2e, ry: 0 },
  ];
  for (const dc of dockCrates) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(dc.w, dc.h, dc.d), lambert(dc.c));
    c.position.set(dc.x, dc.h / 2, dc.z);
    c.rotation.y = dc.ry;
    group.add(c);
    const hw = dc.ry === 0 ? dc.w / 2 + 1 : dc.d / 2 + 1;
    const hd = dc.ry === 0 ? dc.d / 2 + 1 : dc.w / 2 + 1;
    colliders.push({ minX: dc.x - hw, maxX: dc.x + hw, minZ: dc.z - hd, maxZ: dc.z + hd });
  }

  // Two cranes.
  for (const cz of [-120, 120]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 34, 4), lambert(0xd8b13c));
    tower.position.set(DOCKS_X0 + 20, 17, cz);
    group.add(tower);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(30, 2, 2), lambert(0xd8b13c));
    beam.position.set(DOCKS_X0 + 8, 32, cz);
    group.add(beam);
    colliders.push({ minX: DOCKS_X0 + 18, maxX: DOCKS_X0 + 22, minZ: cz - 2, maxZ: cz + 2 });
  }

  // -- pier --------------------------------------------------------------------
  const pierMat = lambert(0x8a6a48);
  for (let z = PIER_Z0; z < 348; z += 4) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 3.6), pierMat);
    plank.position.set(PIER_X, 0.6, z + 2);
    group.add(plank);
  }
  const pierEnd = new THREE.Mesh(new THREE.BoxGeometry(18, 0.6, 10), pierMat);
  pierEnd.position.set(PIER_X, 0.6, 350);
  group.add(pierEnd);

  // -- palms on the beach ------------------------------------------------------
  for (let x = -210; x <= 210; x += 28) {
    if (Math.abs(x) < 14) continue;
    addPalm(group, rng, x + rng.range(-4, 4), BEACH_Z0 + rng.range(6, 26));
  }

  // -- streetlights --------------------------------------------------------------
  const poleMat = lambert(0x2a2a30);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const s of STREETS) {
    for (const t of STREETS) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), poleMat);
      pole.position.set(s + 8, 3, t + 8);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), bulbMat);
      bulb.position.set(s + 8, 6.1, t + 8);
      group.add(bulb);
    }
  }

  // -- sun + sky -----------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xffe8c0, 2.4);
  sun.position.set(-120, 180, 120);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfdcff, 0x8a7a5a, 1.1);
  scene.add(hemi);
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 320, 950);

  return {
    colliders,
    update(dt, t) {
      seaTex.offset.x = t * 0.008;
      seaTex.offset.y = Math.sin(t * 0.3) * 0.02;
      void dt;
    },
  };
}

function addPalm(group, rng, x, z) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.28, 5, 6),
    new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk }),
  );
  trunk.position.set(x, 2.5, z);
  trunk.rotation.z = rng.range(-0.08, 0.08);
  group.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(x + Math.cos(a) * 1.1, 5.4, z + Math.sin(a) * 1.1);
    leaf.rotation.z = Math.cos(a) * 1.1;
    leaf.rotation.x = -Math.sin(a) * 1.1;
    group.add(leaf);
  }
}
