import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { glowSprite } from './textures.js';
import { buildCreature, bodyBox, disposeTree } from './creatures.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Escena del hero: las criaturas del bestiario aparecen una a una en un bosque nocturno. */
export function initHero(canvas, { ids, onChange, onPick } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0507);
  scene.fog = new THREE.FogExp2(0x16070b, 0.07);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0.3, 7);

  scene.add(new THREE.HemisphereLight(0x7a3040, 0x050203, 0.7));
  const moonLight = new THREE.DirectionalLight(0xffe6d0, 2);
  moonLight.position.set(4, 5, -2);
  const rim = new THREE.PointLight(0xff1a2e, 40, 14);
  rim.position.set(-2.5, 1, 2);
  const front = new THREE.PointLight(0xfff3e3, 14, 12);
  front.position.set(2, 1.5, 4.5);
  scene.add(moonLight, rim, front);

  /* Luna */
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1.7, 48, 32), new THREE.MeshBasicMaterial({ color: 0xffe9d6, fog: false }));
  moon.position.set(-4.6, 3, -12);
  const moonGlow = glowSprite(0xff4b5c, 11, 0.45);
  moonGlow.material.fog = false;
  moonGlow.position.copy(moon.position).add(new THREE.Vector3(0, 0, -0.5));
  scene.add(moonGlow, moon);

  /* Suelo y árboles muertos */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x0a0406, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2.4;
  scene.add(ground);

  const treeMat = new THREE.MeshStandardMaterial({ color: 0x050203, roughness: 1 });
  function deadTree(h) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.18, h, 6), treeMat);
    trunk.position.y = h / 2;
    t.add(trunk);
    for (let i = 0; i < 5; i++) {
      const len = 0.6 + Math.random() * 1.2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.06, len, 5), treeMat);
      b.geometry.translate(0, len / 2, 0);
      b.position.y = h * (0.45 + Math.random() * 0.5);
      b.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * 6, (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.7));
      t.add(b);
    }
    return t;
  }
  for (let i = 0; i < 26; i++) {
    let x = (Math.random() - 0.5) * 26;
    const z = -3 - Math.random() * 14;
    if (Math.abs(x) < 2.2 && z > -6) x += x < 0 ? -3 : 3;
    const tree = deadTree(3 + Math.random() * 4);
    tree.position.set(x, -2.4, z);
    tree.rotation.y = Math.random() * 6;
    scene.add(tree);
  }

  /* Niebla */
  const mist = [];
  for (let i = 0; i < 16; i++) {
    const m = glowSprite(0x5a1a28, 7 + Math.random() * 5, 0.22);
    m.material.blending = THREE.NormalBlending;
    m.position.set((Math.random() - 0.5) * 22, -2 + Math.random() * 0.8, -1 - Math.random() * 10);
    m.userData.v = 0.1 + Math.random() * 0.25;
    mist.push(m);
    scene.add(m);
  }

  /* Murciélagos */
  const wing = new THREE.Shape();
  wing.moveTo(0, 0.05);
  wing.quadraticCurveTo(0.18, 0.22, 0.55, 0.14);
  wing.quadraticCurveTo(0.46, 0.04, 0.5, -0.06);
  wing.quadraticCurveTo(0.37, 0.0, 0.31, -0.08);
  wing.quadraticCurveTo(0.22, -0.02, 0.14, -0.1);
  wing.lineTo(0, -0.04);
  const wingGeo = new THREE.ShapeGeometry(wing);
  const batMat = new THREE.MeshBasicMaterial({ color: 0x030102, side: THREE.DoubleSide });
  const bats = [];
  for (let i = 0; i < 34; i++) {
    const bat = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), batMat);
    body.scale.set(0.8, 1.3, 0.8);
    const l = new THREE.Group();
    const r = new THREE.Group();
    l.add(new THREE.Mesh(wingGeo, batMat));
    const rm = new THREE.Mesh(wingGeo, batMat);
    rm.scale.x = -1;
    r.add(rm);
    bat.add(body, l, r);
    bat.userData = {
      l, r,
      radius: 2.5 + Math.random() * 5,
      height: -0.5 + Math.random() * 3.5,
      speed: (0.25 + Math.random() * 0.45) * (Math.random() > 0.5 ? 1 : -1),
      phase: Math.random() * Math.PI * 2,
      depth: -2 - Math.random() * 5,
      flap: 10 + Math.random() * 8,
    };
    bat.scale.setScalar(0.6 + Math.random() * 0.7);
    bats.push(bat);
    scene.add(bat);
  }

  /* Criatura protagonista: va rotando por todo el bestiario */
  const stage = new THREE.Group();
  scene.add(stage);
  const aura = glowSprite(0xd50f25, 5.5, 0.35);
  aura.position.set(0, 0.1, -1);
  const floorGlow = glowSprite(0xd50f25, 1, 0.45);
  floorGlow.scale.set(3.6, 0.7, 1);
  floorGlow.position.y = -1.45;
  const holder = new THREE.Group();
  stage.add(aura, floorGlow, holder);

  const HOLD = 7;
  let idx = 0;
  let current = null;
  let state = 'in';
  let appear = 0;
  let dir = 1;
  let holdClock = 0;
  let hovering = false;

  function setCreature(i) {
    idx = (i + ids.length) % ids.length;
    if (current) {
      holder.remove(current);
      disposeTree(current);
    }
    current = buildCreature(ids[idx]);
    current.userData.update(0);
    // Normaliza tamaño y altura para que todas ocupen lo mismo en pantalla
    const box = bodyBox(current);
    const s = 2.35 / box.getSize(new THREE.Vector3()).y;
    current.scale.setScalar(s);
    current.position.y = -box.getCenter(new THREE.Vector3()).y * s;
    holder.add(current);
    aura.material.color.setHex(current.userData.rim);
    floorGlow.material.color.setHex(current.userData.rim);
    onChange?.(ids[idx], idx);
  }

  function go(d) {
    dir = d;
    if (state === 'idle' || state === 'in') state = 'out';
  }

  /* Postproceso */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* Interacción */
  const mouse = new THREE.Vector2();
  const target = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  let spin = 0;
  let pulse = 0;
  let scare = 0;
  let scrollP = 0;
  let base = { x: 1.7, y: 0.1, s: 1 };

  addEventListener('pointermove', (e) => {
    target.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  });

  function hitsCreature(e) {
    if (!current) return false;
    const rect = canvas.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(p, camera);
    return ray.intersectObject(holder, true).some((h) => h.object.isMesh);
  }
  canvas.addEventListener('pointermove', (e) => {
    hovering = hitsCreature(e);
    canvas.style.cursor = hovering ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', () => (hovering = false));
  canvas.addEventListener('click', (e) => {
    if (!hitsCreature(e)) return;
    spin = Math.PI * 2;
    pulse = 1;
    scare = 1;
    onPick?.(ids[idx]);
  });

  addEventListener('scroll', () => {
    scrollP = Math.min(1, scrollY / innerHeight);
  }, { passive: true });

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const narrow = w < 820;
    base = narrow ? { x: 0, y: 1.3, s: 0.62 } : { x: 1.75, y: 0.1, s: 1 };
  }
  addEventListener('resize', resize);
  resize();

  let visible = true;
  new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(canvas);

  const clock = new THREE.Clock();
  const speed = reduceMotion ? 0.35 : 1;
  setCreature(0);

  function loop() {
    requestAnimationFrame(loop);
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime * speed;

    mouse.lerp(target, 0.05);
    spin *= 0.92;
    pulse *= 0.9;
    scare *= 0.97;

    // Ciclo de aparición / desaparición entre criaturas
    if (state === 'idle') {
      holdClock += hovering ? 0 : dt;
      if (holdClock > HOLD) go(1);
    } else if (state === 'out') {
      appear -= dt * 2.4;
      if (appear <= 0) {
        appear = 0;
        setCreature(idx + dir);
        state = 'in';
      }
    } else if (state === 'in') {
      appear += dt * 1.4;
      if (appear >= 1) {
        appear = 1;
        state = 'idle';
        holdClock = 0;
      }
    }
    const e = appear * appear * (3 - 2 * appear);

    stage.position.set(base.x + mouse.x * 0.15, base.y + Math.sin(t * 1.2) * 0.08 - scrollP * 0.8, 0);
    stage.scale.setScalar(base.s * (1 + pulse * 0.1));
    holder.scale.setScalar(Math.max(0.001, e));
    holder.rotation.y = mouse.x * 0.6 - 0.2 + Math.sin(t * 0.5) * 0.2 + (1 - e) * 2.5 * dir + spin;
    holder.rotation.x = -mouse.y * 0.12;
    aura.material.opacity = 0.35 * e + scare * 0.3;
    floorGlow.material.opacity = 0.45 * e;
    current?.userData.update(t);

    camera.position.x = mouse.x * 0.35;
    camera.position.y = 0.3 + mouse.y * 0.2 - scrollP * 0.8;
    camera.lookAt(0, 0.2 - scrollP * 0.8, 0);

    rim.intensity = 40 + Math.sin(t * 2.3) * 8 + scare * 80;

    for (const bat of bats) {
      const u = bat.userData;
      const a = t * u.speed * (1 + scare * 4) + u.phase;
      bat.position.set(Math.cos(a) * u.radius, u.height + Math.sin(t * 1.3 + u.phase) * 0.3, u.depth + Math.sin(a) * 2);
      bat.rotation.y = -a + (u.speed > 0 ? 0 : Math.PI);
      const f = Math.sin(t * u.flap) * 0.9;
      u.l.rotation.y = f;
      u.r.rotation.y = -f;
    }

    for (const m of mist) {
      m.position.x += m.userData.v * dt;
      if (m.position.x > 12) m.position.x = -12;
    }

    composer.render();
  }
  loop();

  return {
    next: () => go(1),
    prev: () => go(-1),
  };
}
