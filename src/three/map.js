import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import gsap from 'gsap';
import MAP from '../map-data.json';
import { CREATURES, REGIONS } from '../data.js';
import { glowSprite, glowTexture } from './textures.js';
import { buildCreature, bodyBox, disposeTree } from './creatures.js';

/* ------------------------------------------------------------------ *
 * Mapa 3D de Colombia: contorno real (Natural Earth), regiones
 * aproximadas pintadas con puntos y un pin por criatura.
 * Tres niveles de zoom: país → región → criatura.
 * ------------------------------------------------------------------ */

const LON0 = -73.5;
const LAT0 = 4.5;
const K = 0.5;
const COS = Math.cos((LAT0 * Math.PI) / 180);
const DEPTH = 0.18;
const TOP = DEPTH + 0.03;

const px = (lon) => (lon - LON0) * K * COS;
const py = (lat) => (lat - LAT0) * K;
const toWorld = (lon, lat, y = TOP) => new THREE.Vector3(px(lon), y, -py(lat));
const toLonLat = (v) => [v.x / (K * COS) + LON0, -v.z / K + LAT0];

export const REGION_INFO = {
  caribe: { center: [-73.2, 10.3], color: '#f2a93b', text: 'Costas, ciénagas y el gran río Magdalena llegando al mar.' },
  pacifico: { center: [-77.25, 6.6], color: '#b46ad1', text: 'Selva húmeda, ríos y manglares donde la noche suena distinto.' },
  andina: { center: [-74.35, 4.3], color: '#ff2a3a', text: 'Montañas, cañones y pueblos donde nacieron muchos espantos.' },
  llanos: { center: [-70.6, 5.0], color: '#ff8a2a', text: 'Sabanas infinitas donde un silbido viaja kilómetros.' },
  amazonia: { center: [-71.4, -0.6], color: '#5fbf6a', text: 'Ríos enormes y selva profunda: aquí el agua guarda secretos.' },
};

// Regiones naturales simplificadas (aproximación visual, no límites oficiales)
function regionOf(lon, lat) {
  if (lon < -76.7 + (lat < 3 ? -0.5 : 0) && lat < 8.7) return 'pacifico';
  if (lat > 8.4 && !(lon > -73.6 && lat < 9.3)) return 'caribe';
  if ((lat < 2 && lon > -75.6) || (lat < 3.2 && lon > -73.4)) return 'amazonia';
  const edge = -74.0 + (lat - 3) * 0.25;
  if (lon > edge && lat >= 2.5 && lat < 7.3) return 'llanos';
  return 'andina';
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const smooth = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export function initMap({ canvas, labelsEl, thumbs = {}, onFocus }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const labels = new CSS2DRenderer({ element: labelsEl });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0507);
  scene.fog = new THREE.FogExp2(0x0b0507, 0.018);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xfff3e3, 0x200508, 0.9));
  const key = new THREE.DirectionalLight(0xffe6d0, 2);
  key.position.set(-4, 8, 6);
  const red = new THREE.PointLight(0xd50f25, 30, 18);
  red.position.set(3, 3, -2);
  scene.add(key, red);

  /* Suelo */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x0d0608, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.04;
  scene.add(floor);

  /* Países vecinos: solo contorno */
  const neighborMat = new THREE.LineBasicMaterial({ color: 0x7a3a44, transparent: true, opacity: 0.55 });
  for (const n of MAP.neighbors) {
    for (const ring of n.rings) {
      const g = new THREE.BufferGeometry().setFromPoints(ring.map(([lon, lat]) => toWorld(lon, lat, 0.001)));
      scene.add(new THREE.Line(g, neighborMat));
    }
  }

  /* Colombia en relieve */
  const shapes = MAP.colombia.map((ring) => new THREE.Shape(ring.map(([lon, lat]) => new THREE.Vector2(px(lon), py(lat)))));
  const mapGeo = new THREE.ExtrudeGeometry(shapes, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  mapGeo.rotateX(-Math.PI / 2);
  const mapMesh = new THREE.Mesh(mapGeo, [
    new THREE.MeshStandardMaterial({ color: 0x1c0b10, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0x3a0610, emissive: 0x6a0814, emissiveIntensity: 0.7, roughness: 0.5 }),
  ]);
  scene.add(mapMesh);

  const outlineMat = new THREE.LineBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.9 });
  for (const ring of MAP.colombia) {
    const g = new THREE.BufferGeometry().setFromPoints(ring.map(([lon, lat]) => toWorld(lon, lat, TOP + 0.004)));
    scene.add(new THREE.Line(g, outlineMat));
  }
  /* Puntos de color por región */
  const dotPos = [];
  const dotRegion = [];
  const STEP = 0.16;
  for (let lat = -4.3; lat < 12.6; lat += STEP) {
    for (let lon = -79.1; lon < -66.8; lon += STEP) {
      if (MAP.colombia.some((r) => pointInRing(lon, lat, r))) {
        const v = toWorld(lon, lat, TOP + 0.006);
        dotPos.push(v.x, v.y, v.z);
        dotRegion.push(regionOf(lon, lat));
      }
    }
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(dotPos, 3));
  const dotColors = new Float32Array(dotPos.length);
  dotGeo.setAttribute('color', new THREE.BufferAttribute(dotColors, 3));
  const dots = new THREE.Points(
    dotGeo,
    new THREE.PointsMaterial({
      size: 0.15,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(dots);
  const regionColor = Object.fromEntries(Object.entries(REGION_INFO).map(([k, v]) => [k, new THREE.Color(v.color)]));
  const regionLevel = Object.fromEntries(Object.keys(REGION_INFO).map((k) => [k, { cur: 0, target: 0.8 }]));

  function paintDots() {
    for (let i = 0; i < dotRegion.length; i++) {
      const c = regionColor[dotRegion[i]];
      const l = regionLevel[dotRegion[i]].cur;
      dotColors[i * 3] = c.r * l;
      dotColors[i * 3 + 1] = c.g * l;
      dotColors[i * 3 + 2] = c.b * l;
    }
    dotGeo.attributes.color.needsUpdate = true;
  }

  /* Etiquetas de región */
  const regionLabels = Object.entries(REGION_INFO).map(([id, r]) => {
    const el = document.createElement('button');
    el.className = 'map-region';
    el.textContent = REGIONS[id];
    el.style.setProperty('--c', r.color);
    el.addEventListener('click', () => focusRegion(id));
    const obj = new CSS2DObject(el);
    obj.position.copy(toWorld(...r.center, TOP + 0.05));
    scene.add(obj);
    return el;
  });

  /* Pines de criaturas */
  const beamGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
  beamGeo.translate(0, 0.5, 0);
  const pins = CREATURES.map((c) => {
    const color = new THREE.Color(c.color);
    const g = new THREE.Group();
    g.position.copy(toWorld(...c.coords));
    const beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.075, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.006;
    const halo = glowSprite(color, 0.4, 0.95);
    const el = document.createElement('div');
    el.className = 'pin';
    el.style.setProperty('--c', c.color);
    el.innerHTML = `<button class="pin__btn" aria-label="${c.name}"><span class="pin__img"></span><span class="pin__name">${c.name}</span></button>`;
    el.querySelector('button').addEventListener('click', () => focusCreature(c.id));
    const label = new CSS2DObject(el);
    label.center.set(0.5, 1);
    g.add(beam, ring, halo, label);
    scene.add(g);
    return { c, g, beam, ring, halo, label, el, grow: 0, height: 0.85 };
  });

  function setThumbs(t) {
    for (const p of pins) {
      if (t[p.c.id]) p.el.querySelector('.pin__img').innerHTML = `<img src="${t[p.c.id]}" alt="" />`;
    }
  }
  setThumbs(thumbs);

  /* Cámara: un "pose" = posición + objetivo, animado con GSAP */
  const cam = { px: 0, py: 34, pz: 4, tx: 0, ty: 0, tz: 0 };
  let mode = 'overview';
  let focusR = null;
  let focusC = null;
  let zoom = 1;
  let intro = 0;
  let tween = null;
  let narrow = false;

  const pose = (pos, target) => ({ pos, target });
  const withZoom = ({ pos, target }) => pose(target.clone().add(pos.clone().sub(target).multiplyScalar(zoom)), target);

  function overviewPose() {
    const e = smooth(intro);
    const near = narrow ? new THREE.Vector3(0, 17, 10) : new THREE.Vector3(0, 12.5, 8.6);
    const far = new THREE.Vector3(0, 34, 4);
    const target = new THREE.Vector3(0, 0, narrow ? 1.2 : 0.5);
    return withZoom(pose(far.lerp(near, e), target));
  }
  function regionPose(id) {
    // Encuadra el centro de los pines de la región (con la etiqueta como respaldo)
    const list = CREATURES.filter((c) => c.region === id);
    const t = new THREE.Vector3();
    list.forEach((c) => t.add(toWorld(...c.coords, 0)));
    t.add(toWorld(...REGION_INFO[id].center, 0)).divideScalar(list.length + 1);
    t.y = 0.4;
    const off = narrow ? new THREE.Vector3(0, 7, 5) : new THREE.Vector3(0, 5.2, 4.6);
    if (!narrow) t.x += 1.1;
    else t.z += 0.9;
    return withZoom(pose(t.clone().add(off), t));
  }
  function creaturePose(c) {
    const t = toWorld(...c.coords, TOP + 0.5);
    const off = new THREE.Vector3(0.6, 1.4, 3.9);
    if (!narrow) t.x += 0.85;
    else t.y -= 0.35;
    return withZoom(pose(t.clone().add(off), t));
  }
  function currentPose() {
    if (mode === 'creature') return creaturePose(focusC);
    if (mode === 'region') return regionPose(focusR);
    return overviewPose();
  }

  function flyTo(p, duration = 1.6) {
    tween?.kill();
    tween = gsap.to(cam, {
      px: p.pos.x, py: p.pos.y, pz: p.pos.z,
      tx: p.target.x, ty: p.target.y, tz: p.target.z,
      duration,
      ease: 'power3.inOut',
      onComplete: () => (tween = null),
    });
  }

  /* Criatura que emerge del mapa */
  let model = null;
  function showModel(c) {
    hideModel();
    const creature = buildCreature(c.id);
    creature.userData.update(0);
    const box = bodyBox(creature);
    const s = 0.95 / box.getSize(new THREE.Vector3()).y;
    creature.scale.setScalar(s);
    creature.position.y = -box.min.y * s;
    const holder = new THREE.Group();
    holder.add(creature);
    holder.position.copy(toWorld(...c.coords));
    holder.scale.setScalar(0.001);
    holder.userData.creature = creature;
    scene.add(holder);
    gsap.to(holder.scale, { x: 1, y: 1, z: 1, duration: 1.1, delay: 0.9, ease: 'back.out(1.6)' });
    model = holder;
  }
  function hideModel() {
    if (!model) return;
    const m = model;
    model = null;
    gsap.to(m.scale, {
      x: 0.001, y: 0.001, z: 0.001, duration: 0.4, ease: 'power2.in',
      onComplete: () => {
        scene.remove(m);
        disposeTree(m);
      },
    });
  }

  function applyState() {
    labelsEl.dataset.mode = mode;
    for (const [k, lvl] of Object.entries(regionLevel)) {
      const active = mode === 'overview' ? true : k === (focusR ?? focusC?.region);
      lvl.target = mode === 'overview' ? 0.8 : active ? 1.4 : 0.12;
    }
    for (const p of pins) {
      const inRegion = mode === 'region' && p.c.region === focusR;
      p.el.classList.toggle('is-dim', mode === 'region' && !inRegion);
      p.el.classList.toggle('is-named', inRegion);
      p.el.classList.toggle('is-hidden', mode === 'creature');
    }
    regionLabels.forEach((el) => el.classList.toggle('is-hidden', mode !== 'overview'));
    onFocus?.({ mode, region: focusR, creature: focusC });
  }

  function focusRegion(id) {
    mode = 'region';
    focusR = id;
    focusC = null;
    hideModel();
    applyState();
    flyTo(regionPose(id));
  }
  function focusCreature(id) {
    const c = CREATURES.find((x) => x.id === id);
    mode = 'creature';
    focusC = c;
    focusR = null;
    applyState();
    flyTo(creaturePose(c), 1.8);
    showModel(c);
  }
  function overview() {
    mode = 'overview';
    focusR = null;
    focusC = null;
    zoom = 1;
    hideModel();
    applyState();
    flyTo(overviewPose(), 1.4);
  }
  function zoomBy(f) {
    zoom = THREE.MathUtils.clamp(zoom * f, 0.5, 1.5);
    flyTo(currentPose(), 0.7);
  }

  /* Clic sobre el mapa: abre la región tocada */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hitRegion(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(mapMesh)[0];
    return hit ? regionOf(...toLonLat(hit.point)) : null;
  }
  canvas.addEventListener('pointermove', (e) => {
    canvas.style.cursor = mode !== 'creature' && hitRegion(e) ? 'pointer' : '';
  });
  canvas.addEventListener('click', (e) => {
    if (mode === 'creature') return;
    const r = hitRegion(e);
    if (r && r !== focusR) focusRegion(r);
  });

  const mouse = new THREE.Vector2();
  const target = new THREE.Vector2();
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    target.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  });

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const wasNarrow = narrow;
    narrow = w < 820;
    if (wasNarrow !== narrow && mode !== 'overview') flyTo(currentPose(), 0.6);
  }
  addEventListener('resize', resize);
  resize();

  let visible = false;
  new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(canvas);

  const clock = new THREE.Clock();
  const look = new THREE.Vector3();

  function loop() {
    requestAnimationFrame(loop);
    if (!visible) return;
    const t = clock.getElapsedTime();

    if (mode === 'overview' && !tween) {
      const p = overviewPose();
      Object.assign(cam, { px: p.pos.x, py: p.pos.y, pz: p.pos.z, tx: p.target.x, ty: p.target.y, tz: p.target.z });
    }
    mouse.lerp(target, 0.05);
    const par = mode === 'creature' ? 0.15 : 0.35;
    camera.position.set(cam.px + mouse.x * par, cam.py + mouse.y * par * 0.6, cam.pz);
    look.set(cam.tx, cam.ty, cam.tz);
    camera.lookAt(look);

    // Regiones: transición suave de brillo
    let dirty = false;
    for (const lvl of Object.values(regionLevel)) {
      const d = lvl.target - lvl.cur;
      if (Math.abs(d) > 0.002) {
        lvl.cur += d * 0.08;
        dirty = true;
      }
    }
    if (dirty) paintDots();

    // Los pines "brotan" al final del zoom de entrada
    const growTarget = mode === 'overview' ? smooth((intro - 0.55) / 0.4) : 1;
    for (const p of pins) {
      // En modo criatura los demás pines se retraen para no estorbar
      const goal = mode === 'creature' ? (p.c === focusC ? 1 : 0) : growTarget;
      p.grow += (goal - p.grow) * 0.1;
      const hidden = mode === 'creature' && p.c === focusC;
      const h = Math.max(0.001, p.grow * p.height * (hidden ? 0.001 : 1));
      p.beam.scale.y = h;
      p.halo.position.y = h;
      p.label.position.y = h + 0.04;
      p.halo.scale.setScalar(0.4 + Math.sin(t * 3 + p.height * 9) * 0.05);
      p.halo.material.opacity = 0.95 * p.grow * (hidden ? 0 : 1);
      const k = (t * 0.6 + Math.abs(p.c.coords[0])) % 1;
      p.ring.scale.setScalar(1 + k * 3);
      p.ring.material.opacity = (1 - k) * p.grow;
      p.el.style.opacity = hidden ? 0 : p.grow;
    }
    regionLabels.forEach((el) => (el.style.opacity = mode === 'overview' ? smooth((intro - 0.35) / 0.4) : 0));

    if (model) {
      model.userData.creature.userData.update(t);
      model.rotation.y = t * 0.4;
    }

    renderer.render(scene, camera);
    labels.render(scene, camera);
  }
  loop();
  applyState();

  return {
    setIntro(p) {
      intro = p;
    },
    setThumbs,
    focusRegion,
    focusCreature,
    overview,
    zoomIn: () => zoomBy(0.75),
    zoomOut: () => zoomBy(1.3),
    get mode() {
      return mode;
    },
  };
}
