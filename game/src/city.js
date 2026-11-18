// Solmar: the city. A procedural sun-soaked coastal city on a street grid:
// roads and sidewalks painted on one ground canvas, buildings merged into a
// single mesh per material from a facade atlas, palms, streetlights, the beach
// and the sea, plus the landmarks the missions use (Rosa's garage, the docks,
// the police station, the hospital, the pier). All original Solmar geography.
import * as THREE from 'three';
import { WORLD, STREETS, PALETTE } from './config.js';
import { mulberry32, range, rangeInt, pick } from './rng.js';

const ATLAS_COLS = 5; // 4 facades + 1 roof

function facadeAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const tints = ['#e8dcc8', '#d8c8b0', '#c9b8a0', '#dfe4e8'];
  for (let col = 0; col < 4; col += 1) {
    const x0 = col * 128;
    g.fillStyle = tints[col];
    g.fillRect(x0, 0, 128, 256);
    // ground floor: shopfront band
    g.fillStyle = ['#7a5a3a', '#4a6a7a', '#8a6a5a', '#5a6a5a'][col];
    g.fillRect(x0, 216, 128, 40);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(x0 + 8, 224, 52, 24);
    g.fillRect(x0 + 68, 224, 52, 24);
    // window grid
    for (let row = 0; row < 7; row += 1) {
      for (let c = 0; c < 4; c += 1) {
        const lit = ((col * 7 + row * 4 + c) % 5) === 0;
        g.fillStyle = lit ? '#ffd98a' : '#33506e';
        g.fillRect(x0 + 10 + c * 30, 14 + row * 28, 20, 18);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(x0 + 10 + c * 30, 14 + row * 28, 20, 4);
      }
    }
    // roofline trim
    g.fillStyle = '#6b5a4a';
    g.fillRect(x0, 0, 128, 8);
  }
  // roof column: plain warm grey
  g.fillStyle = '#7a6a58';
  g.fillRect(512, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 40; i += 1) g.fillRect(512 + ((i * 37) % 120), ((i * 53) % 240), 8, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function groundTexture(cityHalf, beachZ) {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  const scale = S / (cityHalf * 2 + 120); // world metres -> px, with margin
  const toPx = (v) => (v + cityHalf + 60) * scale;
  // base: dry grass
  g.fillStyle = '#7a9a58';
  g.fillRect(0, 0, S, S);
  // sand strip along the south (high z)
  g.fillStyle = '#e8cf9a';
  g.fillRect(0, toPx(beachZ), S, S - toPx(beachZ));
  // blocks: sidewalk slabs
  const pitch = WORLD.pitch;
  for (let i = 0; i < WORLD.grid; i += 1) {
    for (let j = 0; j < WORLD.grid; j += 1) {
      const x0 = -WORLD.half + WORLD.road + i * pitch;
      const z0 = -WORLD.half + WORLD.road + j * pitch;
      g.fillStyle = '#9a938a';
      g.fillRect(toPx(x0), toPx(z0), WORLD.block * scale, WORLD.block * scale);
      g.fillStyle = '#8a8378';
      g.fillRect(toPx(x0) + 4, toPx(z0) + 4, WORLD.block * scale - 8, WORLD.block * scale - 8);
    }
  }
  // roads: asphalt with dashed centre lines
  g.fillStyle = '#2e3138';
  const streets = STREETS;
  for (const s of streets) {
    g.fillRect(0, toPx(s - WORLD.road / 2), S, WORLD.road * scale); // east-west
    g.fillRect(toPx(s - WORLD.road / 2), 0, WORLD.road * scale, S); // north-south
  }
  // centre dashes
  g.fillStyle = '#d8d3c0';
  for (const s of streets) {
    for (let p = -WORLD.half; p < WORLD.half; p += 12) {
      g.fillRect(toPx(p), toPx(s) - 1, 6 * scale, 2);
      g.fillRect(toPx(s) - 1, toPx(p), 2, 6 * scale);
    }
  }
  // crosswalks at every intersection
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (const sx of streets) {
    for (const sz of streets) {
      for (let k = -2; k <= 2; k += 1) {
        g.fillRect(toPx(sx + k * 2.4) - 2, toPx(sz - 6), 4, 12);
        g.fillRect(toPx(sx - 6), toPx(sz + k * 2.4) - 2, 12, 4);
      }
    }
  }
  // shoreline foam
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(0, toPx(beachZ) - 3, S, 6);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function textTexture(text, bg, fg, size) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg;
  g.font = `bold ${size || 56}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Merge many boxes into one geometry, remapping UVs per face into the atlas:
// side faces use the facade column, top/bottom the roof column.
function mergeBuildings(buildings) {
  const pos = [];
  const norm = [];
  const uv = [];
  const idx = [];
  let base = 0;
  for (const b of buildings) {
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    geo.translate(b.x, b.h / 2, b.z);
    const p = geo.attributes.position.array;
    const n = geo.attributes.normal.array;
    const u = geo.attributes.uv.array;
    const col = b.variant;
    for (let v = 0; v < 24; v += 1) {
      pos.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
      norm.push(n[v * 3], n[v * 3 + 1], n[v * 3 + 2]);
      const face = Math.floor(v / 4); // 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
      const isTop = face === 2 || face === 3;
      const colIdx = isTop ? 4 : col;
      const uu = (colIdx + 0.03 + u[v * 2] * 0.94) / ATLAS_COLS;
      const vv = isTop ? u[v * 2 + 1] : u[v * 2 + 1] * Math.max(1, Math.round(b.h / 9));
      uv.push(uu, vv);
    }
    const ia = geo.index.array;
    for (let i = 0; i < ia.length; i += 1) idx.push(ia[i] + base);
    base += 24;
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

function mergeBoxes(boxes, size) {
  // boxes: [{x,y,z,w,h,d,ry}] merged into one geometry with the given box size
  // semantics: each box is a unit box scaled by (w,h,d) and rotated ry.
  const pos = [];
  const norm = [];
  const uv = [];
  const idx = [];
  let base = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const b of boxes) {
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    q.setFromAxisAngle(up, b.ry || 0);
    m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(m);
    const p = geo.attributes.position.array;
    const n = geo.attributes.normal.array;
    const u = geo.attributes.uv.array;
    for (let v = 0; v < 24; v += 1) {
      pos.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
      norm.push(n[v * 3], n[v * 3 + 1], n[v * 3 + 2]);
      uv.push(u[v * 2], u[v * 2 + 1]);
    }
    const ia = geo.index.array;
    for (let i = 0; i < ia.length; i += 1) idx.push(ia[i] + base);
    base += 24;
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

export function createCity(scene, seed) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  scene.add(group);

  const half = WORLD.half;
  const pitch = WORLD.pitch;
  STREETS.length = 0;
  for (let i = 0; i <= WORLD.grid; i += 1) STREETS.push(-half + WORLD.road / 2 + i * pitch);
  const beachZ = half + 6;
  WORLD.beachAt = beachZ;

  // --- sky, sun, fog ---
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(0xcfe4f2, 180, 620);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.1));

  // --- ground ---
  const groundSize = half * 2 + 120;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshLambertMaterial({ map: groundTexture(half, beachZ) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 30);
  ground.receiveShadow = true;
  group.add(ground);

  // --- sea ---
  const seaCanvas = document.createElement('canvas');
  seaCanvas.width = 256;
  seaCanvas.height = 256;
  const sg = seaCanvas.getContext('2d');
  sg.fillStyle = '#1d7f9e';
  sg.fillRect(0, 0, 256, 256);
  sg.strokeStyle = 'rgba(255,255,255,0.35)';
  sg.lineWidth = 3;
  for (let i = 0; i < 12; i += 1) {
    sg.beginPath();
    const y = i * 22 + 8;
    sg.moveTo(0, y);
    sg.bezierCurveTo(60, y - 6, 140, y + 6, 256, y);
    sg.stroke();
  }
  const seaTex = new THREE.CanvasTexture(seaCanvas);
  seaTex.colorSpace = THREE.SRGBColorSpace;
  seaTex.wrapS = THREE.RepeatWrapping;
  seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(6, 4);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 420),
    new THREE.MeshLambertMaterial({ map: seaTex }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, beachZ + 210);
  group.add(sea);

  // --- buildings ---
  const buildings = [];
  const colliders = [];
  const landmarks = {};
  const blockCenter = (i) => -half + WORLD.road + WORLD.block / 2 + i * pitch;
  // landmark blocks: [i, j] in block grid
  const landmarkBlocks = {
    garage: [1, 5],
    police: [3, 1],
    hospital: [5, 2],
    docks: [6, 3],
  };
  for (let i = 0; i < WORLD.grid; i += 1) {
    for (let j = 0; j < WORLD.grid; j += 1) {
      const cx = blockCenter(i);
      const cz = blockCenter(j);
      const key = Object.keys(landmarkBlocks).find((k) => landmarkBlocks[k][0] === i && landmarkBlocks[k][1] === j);
      const downtown = Math.abs(i - 3) <= 1 && Math.abs(j - 3) <= 1;
      const beachfront = j === WORLD.grid - 1;
      if (key === 'docks') {
        // dock yard: containers instead of buildings
        continue;
      }
      const hBase = downtown ? range(rng, 24, 48) : beachfront ? range(rng, 16, 30) : range(rng, 8, 22);
      if (key) {
        // one landmark building, taller, with a sign
        const h = key === 'police' ? 16 : key === 'hospital' ? 20 : 10;
        buildings.push({ x: cx, z: cz, w: 34, d: 26, h, variant: key === 'police' ? 3 : key === 'hospital' ? 0 : 1 });
        colliders.push({ minX: cx - 17, maxX: cx + 17, minZ: cz - 13, maxZ: cz + 13 });
        landmarks[key] = { x: cx, z: cz - 16, hx: cx, hz: cz };
        continue;
      }
      if (downtown || rng() < 0.45) {
        buildings.push({ x: cx, z: cz, w: range(rng, 26, 36), d: range(rng, 26, 36), h: hBase, variant: rangeInt(rng, 0, 3) });
        colliders.push({ minX: cx - 19, maxX: cx + 19, minZ: cz - 19, maxZ: cz + 19 });
      } else {
        // 2x2 small lots
        for (const [dx, dz] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
          if (rng() < 0.25) continue;
          const w = range(rng, 12, 17);
          const d = range(rng, 12, 17);
          const h = range(rng, 6, 14);
          buildings.push({ x: cx + dx, z: cz + dz, w, d, h, variant: rangeInt(rng, 0, 3) });
          colliders.push({ minX: cx + dx - w / 2 - 0.5, maxX: cx + dx + w / 2 + 0.5, minZ: cz + dz - d / 2 - 0.5, maxZ: cz + dz + d / 2 + 0.5 });
        }
      }
    }
  }
  const facadeMat = new THREE.MeshLambertMaterial({ map: facadeAtlas() });
  const cityMesh = new THREE.Mesh(mergeBuildings(buildings), facadeMat);
  cityMesh.castShadow = true;
  cityMesh.receiveShadow = true;
  group.add(cityMesh);

  // --- landmark signs ---
  const signs = [
    { text: "ROSA'S GARAGE", bg: '#7a2e2e', fg: '#ffd75e', at: landmarks.garage, w: 22, h: 5.5, y: 8 },
    { text: 'SOLMAR PD', bg: '#1e3a5f', fg: '#ffffff', at: landmarks.police, w: 20, h: 5, y: 13 },
    { text: 'GENERAL HOSPITAL', bg: '#f5f0e6', fg: '#c0392b', at: landmarks.hospital, w: 26, h: 5, y: 16 },
  ];
  for (const s of signs) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(s.w, s.h),
      new THREE.MeshBasicMaterial({ map: textTexture(s.text, s.bg, s.fg, 52) }),
    );
    mesh.position.set(s.at.x, s.y, s.at.z - 13.2);
    group.add(mesh);
  }

  // --- docks (east edge) ---
  const docks = { x: half + 28, z: 30 };
  const dockDeck = new THREE.Mesh(
    new THREE.BoxGeometry(56, 1.2, 90),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }),
  );
  dockDeck.position.set(docks.x, 0.6, docks.z);
  dockDeck.receiveShadow = true;
  group.add(dockDeck);
  colliders.push({ minX: docks.x - 28, maxX: docks.x + 28, minZ: docks.z - 45, maxZ: docks.z + 45 });
  const containerColors = [0xc0392b, 0x2471a3, 0x1e8449, 0xd35400, 0x7d3c98];
  const containers = [];
  for (let i = 0; i < 14; i += 1) {
    const cx = docks.x - 18 + (i % 4) * 12;
    const cz = docks.z - 34 + Math.floor(i / 4) * 20;
    const stacked = i % 5 === 0;
    containers.push({ x: cx, y: 2.2, z: cz, w: 10, h: 2.6, d: 2.8, ry: 0 });
    colliders.push({ minX: cx - 5, maxX: cx + 5, minZ: cz - 1.6, maxZ: cz + 1.6 });
    if (stacked) containers.push({ x: cx, y: 4.9, z: cz, w: 10, h: 2.6, d: 2.8, ry: 0 });
  }
  // individual container meshes (few) with colour materials
  const containerMats = containerColors.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  containers.forEach((c, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), containerMats[i % containerMats.length]);
    m.position.set(c.x, c.y, c.z);
    m.castShadow = true;
    group.add(m);
  });
  landmarks.docks = { x: docks.x - 6, z: docks.z, hx: docks.x, hz: docks.z };
  // dock crane
  const crane = new THREE.Group();
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8a020 });
  const leg1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 26, 1.5), craneMat);
  leg1.position.set(-4, 13, 0);
  const leg2 = leg1.clone();
  leg2.position.set(4, 13, 0);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(22, 1.5, 1.5), craneMat);
  beam.position.set(0, 26, 0);
  crane.add(leg1, leg2, beam);
  crane.position.set(docks.x - 20, 0, docks.z - 30);
  group.add(crane);

  // --- pier (south beach, mission 5) ---
  const pier = { x: -60, z0: beachZ + 4, z1: beachZ + 70 };
  const pierDeck = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1, pier.z1 - pier.z0),
    new THREE.MeshLambertMaterial({ color: 0x9a7a52 }),
  );
  pierDeck.position.set(pier.x, 0.8, (pier.z0 + pier.z1) / 2);
  group.add(pierDeck);
  landmarks.pier = { x: pier.x, z: pier.z1 - 6, hx: pier.x, hz: pier.z1 - 6 };

  // --- palms ---
  const palmTrunks = [];
  const palmCrowns = [];
  const palmSpots = [];
  for (let i = 0; i < 26; i += 1) {
    const x = range(rng, -half + 10, half - 10);
    palmSpots.push({ x, z: beachZ + range(rng, 8, 26) });
  }
  for (let i = 0; i < 14; i += 1) {
    const s = pick(rng, STREETS);
    palmSpots.push({ x: s + (rng() < 0.5 ? -8.5 : 8.5), z: range(rng, -half + 10, half - 10) });
  }
  for (const p of palmSpots) {
    palmTrunks.push({ x: p.x, y: 3, z: p.z, w: 0.5, h: 6, d: 0.5, ry: 0 });
    for (let f = 0; f < 5; f += 1) {
      const a = (f / 5) * Math.PI * 2;
      palmCrowns.push({
        x: p.x + Math.cos(a) * 1.4, y: 6.2, z: p.z + Math.sin(a) * 1.4,
        w: 3.2, h: 0.25, d: 1.1, ry: -a,
      });
    }
  }
  const trunkMesh = new THREE.Mesh(mergeBoxes(palmTrunks), new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk }));
  trunkMesh.castShadow = true;
  group.add(trunkMesh);
  const crownMesh = new THREE.Mesh(mergeBoxes(palmCrowns), new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf }));
  crownMesh.castShadow = true;
  group.add(crownMesh);

  // --- streetlights ---
  const poles = [];
  const lamps = [];
  for (const s of STREETS) {
    for (let p = -half + 20; p < half - 10; p += 52) {
      const side = (Math.floor(p / 52) % 2 === 0) ? -8 : 8;
      poles.push({ x: s + side, y: 3.5, z: p, w: 0.25, h: 7, d: 0.25, ry: 0 });
      poles.push({ x: s + side - Math.sign(side) * 1.6, y: 6.9, z: p, w: 3.2, h: 0.25, d: 0.25, ry: 0 });
      lamps.push({ x: s + side - Math.sign(side) * 3, y: 6.8, z: p });
    }
  }
  const poleMesh = new THREE.Mesh(mergeBoxes(poles), new THREE.MeshLambertMaterial({ color: 0x3a4048 }));
  group.add(poleMesh);
  const lampGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, lamps.length);
  const lm = new THREE.Matrix4();
  lamps.forEach((l, i) => {
    lm.makeTranslation(l.x, l.y, l.z);
    lampMesh.setMatrixAt(i, lm);
  });
  group.add(lampMesh);

  // --- clouds ---
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const clouds = [];
  for (let i = 0; i < 10; i += 1) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(range(rng, 18, 34), 3, range(rng, 8, 14)), cloudMat);
    c.position.set(range(rng, -300, 300), range(rng, 90, 140), range(rng, -300, 300));
    clouds.push(c);
    group.add(c);
  }

  // --- road graph for traffic ---
  const nodes = [];
  const nodeIndex = new Map();
  for (let i = 0; i < STREETS.length; i += 1) {
    for (let j = 0; j < STREETS.length; j += 1) {
      const key = `${i},${j}`;
      nodeIndex.set(key, nodes.length);
      nodes.push({ x: STREETS[i], z: STREETS[j], i, j });
    }
  }
  const neighbours = nodes.map((n) => {
    const out = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = n.i + di;
      const nj = n.j + dj;
      if (ni >= 0 && ni < STREETS.length && nj >= 0 && nj < STREETS.length) {
        out.push(nodeIndex.get(`${ni},${nj}`));
      }
    }
    return out;
  });

  const spawn = { x: 0, z: 28, heading: Math.PI };

  return {
    group,
    colliders,
    streets: STREETS,
    nodes,
    neighbours,
    landmarks,
    spawn,
    beachZ,
    update(dt) {
      for (const c of clouds) {
        c.position.x += dt * 1.5;
        if (c.position.x > 320) c.position.x = -320;
      }
      seaTex.offset.y += dt * 0.01;
    },
  };
}
