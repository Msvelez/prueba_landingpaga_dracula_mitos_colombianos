import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { glowSprite } from './textures.js';

/* ------------------------------------------------------------------ *
 * Modelos 3D procedurales: cada criatura parte de un cuerpo espectral
 * (túnica con shader animado) y suma accesorios que la identifican.
 * ------------------------------------------------------------------ */

const ROBE = [
  [0.001, 1.08], [0.18, 1.06], [0.32, 0.96], [0.39, 0.8], [0.37, 0.6],
  [0.33, 0.42], [0.4, 0.15], [0.5, -0.3], [0.64, -0.8], [0.76, -1.2],
];
const robeGeometry = new THREE.LatheGeometry(ROBE.map(([x, y]) => new THREE.Vector2(x, y)), 56, 0, Math.PI * 2);

function robeRadiusAt(y) {
  for (let i = 0; i < ROBE.length - 1; i++) {
    const [r0, y0] = ROBE[i];
    const [r1, y1] = ROBE[i + 1];
    if (y <= y0 && y >= y1) return r0 + (r1 - r0) * ((y0 - y) / (y0 - y1));
  }
  return 0.5;
}

function spectralMaterial(color, { rim = 0xff2a3a, opacity = 0.95, wave = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uRim: { value: new THREE.Color(rim) },
      uOpacity: { value: opacity },
      uWave: { value: wave },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uWave;
      varying vec3 vN;
      varying vec3 vView;
      varying float vH;
      void main() {
        vec3 p = position;
        float h = clamp((0.5 - p.y) / 1.7, 0.0, 1.0);
        float a = atan(p.z, p.x);
        p.x += sin(a * 5.0 + uTime * 2.2 + p.y * 4.0) * 0.06 * h * uWave;
        p.z += cos(a * 4.0 + uTime * 1.8 + p.y * 3.0) * 0.06 * h * uWave;
        vH = h;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uRim;
      uniform float uOpacity;
      uniform float uTime;
      varying vec3 vN;
      varying vec3 vView;
      varying float vH;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.0);
        float bands = 0.88 + 0.12 * sin(vH * 28.0 - uTime * 1.6);
        vec3 c = mix(uColor * 0.45 * bands, uRim, f);
        float alpha = uOpacity * (1.0 - smoothstep(0.65, 1.0, vH) * 0.92);
        gl_FragColor = vec4(c, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  });
}

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });

function addFace(g) {
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshBasicMaterial({ color: 0x020102 }));
  face.scale.set(1, 1.1, 0.5);
  face.position.set(0, 0.72, 0.33);
  g.add(face);
  return face;
}

function addEyes(g, color, updaters, { y = 0.74, z = 0.44, dx = 0.085, size = 0.03, glow = 0.35 } = {}) {
  const mat = new THREE.MeshBasicMaterial({ color });
  const eyes = new THREE.Group();
  [-1, 1].forEach((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), mat);
    e.scale.set(1.3, 0.8, 0.6);
    e.position.set(dx * s, y, z);
    const halo = glowSprite(color, glow, 0.9);
    halo.position.set(dx * s, y, z + 0.02);
    eyes.add(e, halo);
  });
  g.add(eyes);
  const seed = Math.random() * 10;
  updaters.push((t) => {
    const blink = Math.sin(t * 0.9 + seed) > 0.985 ? 0.1 : 1;
    eyes.scale.y = THREE.MathUtils.lerp(eyes.scale.y, blink, 0.5);
  });
  return eyes;
}

function addHair(g, updaters, { count = 46, color = 0x08050a, length = 1.6, spread = 2.6 } = {}) {
  const mat = std(color, { roughness: 0.9 });
  const strands = [];
  for (let i = 0; i < count; i++) {
    const a = Math.PI + (i / (count - 1) - 0.5) * spread;
    const len = length * (0.75 + Math.random() * 0.45);
    const geo = new THREE.CylinderGeometry(0.016, 0.004, len, 4, 1);
    geo.translate(0, -len / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.sin(a) * 0.35, 0.96, Math.cos(a) * 0.35);
    m.userData.bx = -Math.cos(a) * 0.2;
    m.userData.bz = Math.sin(a) * 0.2;
    m.userData.ph = Math.random() * 6;
    g.add(m);
    strands.push(m);
  }
  updaters.push((t) => {
    for (const m of strands) {
      m.rotation.x = m.userData.bx + Math.sin(t * 1.3 + m.userData.ph) * 0.05;
      m.rotation.z = m.userData.bz + Math.cos(t * 1.1 + m.userData.ph) * 0.04;
    }
  });
}

function addHat(g, { brim = 0.9, crown = 0.5, color = 0x0a0507, band = 0xc40d24, y = 1.0 } = {}) {
  const hat = new THREE.Group();
  const mat = std(color, { roughness: 0.6 });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(brim, brim * 0.96, 0.04, 48), mat);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, crown, 32), mat);
  c.position.y = crown / 2;
  const bd = new THREE.Mesh(new THREE.CylinderGeometry(0.365, 0.365, 0.08, 32), std(band, { roughness: 0.4 }));
  bd.position.y = 0.06;
  hat.add(b, c, bd);
  hat.position.y = y;
  hat.rotation.z = 0.08;
  g.add(hat);
  return hat;
}

function addPegLeg(g, color, { rings = 0 } = {}) {
  const mat = std(color, { roughness: 0.8 });
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.95, 12), mat);
  leg.position.y = -1.55;
  g.add(leg);
  for (let i = 0; i < rings; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 20), mat);
    r.rotation.x = Math.PI / 2;
    r.position.y = -1.3 - i * 0.22;
    g.add(r);
  }
  const foot = new THREE.Mesh(
    rings ? new THREE.SphereGeometry(0.12, 16, 12) : new THREE.CylinderGeometry(0.1, 0.13, 0.12, 12),
    mat,
  );
  foot.position.y = -2.04;
  g.add(foot);
}

/* ---------------------------- accesorios ---------------------------- */

const BUILDERS = {
  llorona(g, u) {
    addHair(g, u, { count: 60, length: 1.9 });
    const veil = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.2),
      new THREE.MeshBasicMaterial({ color: 0xdfeaff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
    );
    veil.position.y = 0.72;
    g.add(veil);
    const tearMat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff });
    const tears = [0, 1, 2, 3].map((i) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), tearMat);
      s.scale.y = 1.6;
      g.add(s);
      return { s, off: i * 0.5, x: i % 2 ? 0.085 : -0.085 };
    });
    u.push((t) => {
      for (const { s, off, x } of tears) {
        const p = (t * 0.55 + off) % 1;
        s.position.set(x, 0.68 - p * 1.4, 0.44 + p * 0.12);
        s.scale.setScalar(1 - p * 0.6);
      }
    });
  },

  silbon(g, u) {
    g.scale.set(0.9, 1.25, 0.9);
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), std(0x5a3a22, { roughness: 1 }));
    sack.scale.set(1, 1.3, 0.9);
    sack.position.set(0.2, -0.15, -0.5);
    g.add(sack);
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 8), sack.material);
    knot.position.set(0.12, 0.35, -0.42);
    g.add(knot);
    const boneMat = std(0xefe6d2, { roughness: 0.5 });
    const bones = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.28, 4, 8), boneMat);
      const a = (i / 8) * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.95, -0.3 + Math.sin(a * 3) * 0.35, Math.sin(a) * 0.95);
      b.rotation.set(a, a * 2, 0.6);
      bones.add(b);
    }
    g.add(bones);
    u.push((t) => {
      bones.rotation.y = t * 0.5;
      bones.children.forEach((b, i) => (b.rotation.x += 0.01 + i * 0.001));
      sack.rotation.z = Math.sin(t * 1.4) * 0.08;
    });
  },

  patasola(g, u) {
    addHair(g, u, { count: 50, length: 1.4, color: 0x140808 });
    addPegLeg(g, 0x3a1f17);
    const fang = new THREE.ConeGeometry(0.022, 0.1, 8);
    fang.rotateX(Math.PI);
    const fm = std(0xfff4e6, { roughness: 0.3 });
    [-0.05, 0.05].forEach((x) => {
      const f = new THREE.Mesh(fang, fm);
      f.position.set(x, 0.63, 0.43);
      g.add(f);
    });
    u.push((t) => {
      // salta en un solo pie
      g.position.y = Math.abs(Math.sin(t * 3.2)) * 0.18;
    });
  },

  mohan(g, u) {
    const furMat = std(0x3b2a18, { roughness: 1 });
    const cone = new THREE.ConeGeometry(0.035, 0.38, 4);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 150; i++) {
      const y = 0.9 - Math.random() * 1.95;
      const a = Math.random() * Math.PI * 2;
      if (y > 0.5 && Math.abs(a - Math.PI / 2) < 0.6) continue; // deja ver la cara
      const r = robeRadiusAt(y) + 0.02;
      const m = new THREE.Mesh(cone, furMat);
      m.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      const dir = new THREE.Vector3(Math.cos(a) * 0.5, -1, Math.sin(a) * 0.5).normalize();
      m.quaternion.setFromUnitVectors(up, dir);
      g.add(m);
    }
    const beardMat = std(0x8a8170, { roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.5 + Math.random() * 0.3, 5), beardMat);
      b.rotation.x = Math.PI;
      b.position.set((i - 4) * 0.035, 0.36, 0.42 - Math.abs(i - 4) * 0.015);
      g.add(b);
    }
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.035, 12, 40),
      std(0xf2c14e, { metalness: 1, roughness: 0.25, emissive: 0x6b4a00 }),
    );
    ring.position.set(0, -0.1, 0.85);
    g.add(ring);
    const ripples = [0, 1, 2].map((i) => {
      const r = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 1, 64),
        new THREE.MeshBasicMaterial({ color: 0x6fb7ff, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
      );
      r.rotation.x = -Math.PI / 2;
      r.position.y = -1.22;
      r.userData.skipFrame = true;
      g.add(r);
      return { r, off: i / 3 };
    });
    u.push((t) => {
      ring.rotation.y = t * 1.5;
      ring.position.y = -0.1 + Math.sin(t * 2) * 0.08;
      for (const { r, off } of ripples) {
        const p = (t * 0.35 + off) % 1;
        r.scale.setScalar(0.6 + p * 1.2);
        r.material.opacity = (1 - p) * 0.5;
      }
    });
  },

  caiman(g, u) {
    const skin = std(0x2f4a24, { roughness: 0.55 });
    const head = new THREE.Group();
    head.position.set(0, 0.72, 0.2);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 16), skin);
    skull.scale.set(1, 0.8, 1.1);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.8), skin);
    upper.position.set(0, 0.0, 0.5);
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.08, 0.12);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.76), std(0x5d6b3a));
    lower.position.z = 0.38;
    jaw.add(lower);
    const toothGeo = new THREE.ConeGeometry(0.022, 0.08, 6);
    const toothMat = std(0xfff7e8, { roughness: 0.3 });
    for (let i = 0; i < 7; i++) {
      [-1, 1].forEach((s) => {
        const tUp = new THREE.Mesh(toothGeo, toothMat);
        tUp.rotation.x = Math.PI;
        tUp.position.set(s * 0.155, -0.09, 0.18 + i * 0.1);
        head.add(tUp);
        const tLo = new THREE.Mesh(toothGeo, toothMat);
        tLo.position.set(s * 0.13, 0.07, 0.08 + i * 0.1);
        jaw.add(tLo);
      });
    }
    [-0.1, 0.1].forEach((x) => {
      const bump = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), skin);
      bump.position.set(x, 0.17, 0.1);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
      eye.position.set(x, 0.19, 0.16);
      const halo = glowSprite(0xffd23a, 0.25, 0.9);
      halo.position.copy(eye.position);
      head.add(bump, eye, halo);
    });
    head.add(skull, upper, jaw);
    g.add(head);
    const tailGeo = new THREE.ConeGeometry(0.2, 1.5, 10);
    tailGeo.translate(0, 0.75, 0);
    const tail = new THREE.Mesh(tailGeo, skin);
    tail.position.set(0, -1.05, -0.45);
    tail.rotation.x = -Math.PI / 2 - 0.2;
    g.add(tail);
    u.push((t) => {
      jaw.rotation.x = Math.max(0, Math.sin(t * 1.8)) * 0.45;
      tail.rotation.z = Math.sin(t * 1.5) * 0.35;
      head.rotation.y = Math.sin(t * 0.6) * 0.25;
    });
  },

  madremonte(g, u) {
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.quadraticCurveTo(0.12, 0.12, 0, 0.32);
    leafShape.quadraticCurveTo(-0.12, 0.12, 0, 0);
    const leafGeo = new THREE.ShapeGeometry(leafShape, 6);
    const leafMats = [0x2f6b2a, 0x4d8f35, 0x6aa84f, 0x23461f].map((c) => std(c, { side: THREE.DoubleSide, roughness: 0.6 }));
    const swirl = new THREE.Group();
    for (let i = 0; i < 70; i++) {
      const l = new THREE.Mesh(leafGeo, leafMats[i % 4]);
      const a = Math.random() * Math.PI * 2;
      const r = 0.8 + Math.random() * 0.6;
      l.position.set(Math.cos(a) * r, -1.1 + Math.random() * 2.4, Math.sin(a) * r);
      l.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      swirl.add(l);
    }
    g.add(swirl);
    const crown = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const l = new THREE.Mesh(leafGeo, leafMats[i % 4]);
      const a = (i / 16) * Math.PI * 2;
      l.scale.setScalar(1.8);
      l.position.set(Math.cos(a) * 0.3, 0.95, Math.sin(a) * 0.3);
      l.rotation.set(0, -a + Math.PI / 2, -0.9);
      crown.add(l);
    }
    g.add(crown);
    const mossMat = std(0x3d5a2a, { roughness: 1 });
    for (let i = 0; i < 12; i++) {
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.01, 1 + Math.random(), 5), mossMat);
      const a = Math.random() * Math.PI * 2;
      v.position.set(Math.cos(a) * 0.42, 0.0, Math.sin(a) * 0.42);
      v.rotation.z = (Math.random() - 0.5) * 0.4;
      g.add(v);
    }
    u.push((t) => {
      swirl.rotation.y = t * 0.35;
      swirl.children.forEach((l, i) => {
        l.rotation.x += 0.01;
        l.position.y += Math.sin(t + i) * 0.002;
      });
    });
  },

  sombreron(g, u) {
    const hat = addHat(g, { brim: 1.05, crown: 0.62, y: 1.0 });
    const dogEyes = new THREE.Group();
    [-1.15, 1.15].forEach((x) => {
      [-0.05, 0.05].forEach((dx) => {
        const s = glowSprite(0xff2030, 0.22, 1);
        s.position.set(x + dx, -0.95, 0.3);
        dogEyes.add(s);
      });
    });
    g.add(dogEyes);
    const linkGeo = new THREE.TorusGeometry(0.05, 0.014, 6, 12);
    const linkMat = std(0x8d8a86, { metalness: 0.9, roughness: 0.35 });
    const chains = [-1, 1].map((s) => {
      const chain = new THREE.Group();
      for (let i = 0; i < 12; i++) {
        const l = new THREE.Mesh(linkGeo, linkMat);
        const p = i / 11;
        l.position.set(s * (0.45 + p * 0.65), -0.2 - p * 0.75 - Math.sin(p * Math.PI) * 0.12, 0.3);
        l.rotation.set(i % 2 ? Math.PI / 2 : 0, 0, s * 0.8);
        chain.add(l);
      }
      g.add(chain);
      return chain;
    });
    u.push((t) => {
      hat.rotation.y = Math.sin(t * 0.5) * 0.3;
      hat.position.y = 1.0 + Math.sin(t * 2) * 0.03;
      dogEyes.children.forEach((e, i) => (e.material.opacity = Math.sin(t * 0.8 + i * 0.3) > 0.96 ? 0.1 : 1));
      chains.forEach((c, i) => (c.rotation.x = Math.sin(t * 2 + i) * 0.05));
    });
  },

  tunda(g, u, ctx) {
    addPegLeg(g, 0x6b4a2e, { rings: 3 });
    addHair(g, u, { count: 30, length: 1.1, color: 0x1a0a20 });
    // la "otra" forma: una silueta cálida que aparece y desaparece
    const disguise = new THREE.Mesh(robeGeometry, spectralMaterial(0xffc9a8, { rim: 0xffe2c8, opacity: 0.6 }));
    disguise.scale.setScalar(1.03);
    g.add(disguise);
    ctx.mats.push(disguise.material);
    u.push((t) => {
      const k = (Math.sin(t * 1.2) + 1) / 2;
      disguise.material.uniforms.uOpacity.value = Math.pow(k, 3) * 0.55;
      ctx.robe.material.uniforms.uOpacity.value = 0.95 - Math.pow(k, 3) * 0.5;
    });
  },

  bufeo(g, u) {
    addHat(g, { brim: 0.62, crown: 0.4, color: 0xf6f1ea, band: 0xf08cab, y: 1.0 });
    const pink = std(0xf08cab, { roughness: 0.35 });
    const dolphin = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.55, 8, 16), pink);
    body.rotation.z = Math.PI / 2;
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 10), pink);
    snout.rotation.z = -Math.PI / 2;
    snout.position.x = 0.5;
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), pink);
    fin.position.set(-0.02, 0.15, 0);
    fin.rotation.z = 0.5;
    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.3), pink);
    tailFin.position.x = -0.45;
    dolphin.add(body, snout, fin, tailFin);
    const orbit = new THREE.Group();
    dolphin.position.z = 1.15;
    dolphin.rotation.y = Math.PI;
    orbit.add(dolphin);
    g.add(orbit);
    u.push((t) => {
      orbit.rotation.y = t * 0.8;
      dolphin.position.y = -0.4 + Math.sin(t * 2.4) * 0.35;
      dolphin.rotation.z = Math.cos(t * 2.4) * 0.5;
    });
  },

  candileja(g, u) {
    const balls = [0, 1, 2].map((i) => {
      const b = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
      const halo = glowSprite(0xff6a1a, 1.0, 0.95);
      const outer = glowSprite(0xff2a0a, 1.8, 0.5);
      b.add(core, halo, outer);
      g.add(b);
      return { b, halo, off: (i / 3) * Math.PI * 2 };
    });
    const count = 90;
    const pos = new Float32Array(count * 3);
    const seeds = [];
    for (let i = 0; i < count; i++) seeds.push({ a: Math.random() * 6.28, r: Math.random() * 1.1, s: 0.3 + Math.random() * 0.6, o: Math.random() });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sparks = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xffa040, size: 0.045, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    g.add(sparks);
    u.push((t) => {
      for (const { b, halo, off } of balls) {
        const a = t * 0.9 + off;
        b.position.set(Math.cos(a) * 0.95, 0.1 + Math.sin(t * 1.7 + off) * 0.5, Math.sin(a) * 0.95);
        halo.scale.setScalar(0.9 + Math.sin(t * 13 + off * 4) * 0.12);
      }
      for (let i = 0; i < count; i++) {
        const s = seeds[i];
        const p = (t * s.s + s.o) % 1;
        pos[i * 3] = Math.cos(s.a + t * 0.3) * s.r;
        pos[i * 3 + 1] = -1.1 + p * 2.6;
        pos[i * 3 + 2] = Math.sin(s.a + t * 0.3) * s.r;
      }
      geo.attributes.position.needsUpdate = true;
    });
  },
};

const LOOKS = {
  llorona: { color: 0xdfeaff, rim: 0x9fc4ff, eyes: 0xbfe0ff },
  silbon: { color: 0x6b5f45, rim: 0xd9d2b0, eyes: 0xfff1b0 },
  patasola: { color: 0x5a1a1a, rim: 0xff3b3b, eyes: 0xff2a1a },
  mohan: { color: 0x4a3a1e, rim: 0xc9a24a, eyes: 0xffcc33 },
  caiman: { color: 0x2a3d1e, rim: 0x9fd66b, eyes: null, thumbRot: -1.05 },
  madremonte: { color: 0x2d4a24, rim: 0x7fd66b, eyes: 0xffb21a },
  sombreron: { color: 0x120a0c, rim: 0xe0303f, eyes: 0xff1a2a },
  tunda: { color: 0x3d1f52, rim: 0xd17cff, eyes: 0xff4fd8 },
  bufeo: { color: 0xe9dce4, rim: 0xff9cc2, eyes: 0xff7fb0 },
  candileja: { color: 0x3a1206, rim: 0xff8a2a, eyes: 0xffb347, opacity: 0.45 },
};

export function buildCreature(id) {
  const look = LOOKS[id];
  const g = new THREE.Group();
  const updaters = [];
  const robeMat = spectralMaterial(look.color, { rim: look.rim, opacity: look.opacity ?? 0.95 });
  const robe = new THREE.Mesh(robeGeometry, robeMat);
  g.add(robe);
  const ctx = { robe, mats: [robeMat] };
  if (look.eyes) {
    addFace(g);
    addEyes(g, look.eyes, updaters);
  }
  BUILDERS[id](g, updaters, ctx);

  const root = new THREE.Group();
  root.add(g);
  root.userData.update = (t) => {
    for (const m of ctx.mats) m.uniforms.uTime.value = t;
    for (const fn of updaters) fn(t);
  };
  root.userData.rim = look.rim;
  root.userData.thumbRot = look.thumbRot ?? -0.35;
  return root;
}

/* ---------------------------- escenario ---------------------------- */

function makeStage(rim) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff3e3, 0x200508, 1.1));
  const key = new THREE.DirectionalLight(0xfff3e3, 2.2);
  key.position.set(2, 3, 4);
  const back = new THREE.DirectionalLight(rim, 3);
  back.position.set(-3, 2, -3);
  const red = new THREE.PointLight(0xd50f25, 6, 6);
  red.position.set(0, -1.4, 1.5);
  scene.add(key, back, red);
  scene.userData.back = back;
  return scene;
}

/** Caja del cuerpo de la criatura: ignora sprites de brillo y ondas de agua. */
export function bodyBox(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  object.traverse((o) => {
    if (o.isMesh && !o.userData.skipFrame) box.expandByObject(o);
  });
  return box;
}

function frame(camera, object, margin = 1.2) {
  const box = bodyBox(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const fitH = (size.y * margin) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fitW = (Math.max(size.x, size.z) * margin) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.aspect;
  const dist = Math.max(fitH, fitW) + size.z / 2;
  camera.position.set(center.x, center.y + size.y * 0.05, center.z + dist);
  camera.lookAt(center);
  return center;
}

/** Renderiza una miniatura PNG de cada criatura para las tarjetas. */
export function renderThumbnails(ids, width = 420, height = 520) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 50);
  const out = {};
  for (const id of ids) {
    const creature = buildCreature(id);
    const scene = makeStage(creature.userData.rim);
    creature.rotation.y = creature.userData.thumbRot;
    creature.userData.update(1.6);
    scene.add(creature);
    frame(camera, creature, 1.12);
    renderer.render(scene, camera);
    out[id] = renderer.domElement.toDataURL('image/png');
    disposeTree(creature);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && o.geometry !== robeGeometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

/** Visor interactivo del modal. */
export function createViewer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  const scene = makeStage(0xff2a3a);

  const ground = glowSprite(0xd50f25, 4, 0.35);
  ground.position.y = -2.3;
  ground.scale.set(4, 1.2, 1);
  scene.add(ground);

  const dust = new THREE.Points(
    (() => {
      const g = new THREE.BufferGeometry();
      const p = new Float32Array(300 * 3);
      for (let i = 0; i < p.length; i += 3) {
        p[i] = (Math.random() - 0.5) * 8;
        p[i + 1] = (Math.random() - 0.5) * 6;
        p[i + 2] = (Math.random() - 0.5) * 8;
      }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      return g;
    })(),
    new THREE.PointsMaterial({ color: 0xffd9c7, size: 0.02, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  scene.add(dust);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  controls.minDistance = 2.5;
  controls.maxDistance = 12;
  controls.addEventListener('start', () => (controls.autoRotate = false));

  let current = null;
  let running = false;
  const clock = new THREE.Clock();

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function show(id) {
    if (current) {
      scene.remove(current);
      disposeTree(current);
    }
    current = buildCreature(id);
    current.userData.update(0);
    scene.add(current);
    scene.userData.back.color.setHex(current.userData.rim);
    resize();
    const center = frame(camera, current, 1.25);
    controls.target.copy(center);
    controls.autoRotate = true;
    controls.update();
    current.scale.setScalar(0.01);
  }

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    if (current) {
      current.userData.update(t);
      current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.08);
    }
    dust.rotation.y = t * 0.03;
    controls.update();
    renderer.render(scene, camera);
  }

  addEventListener('resize', resize);
  return {
    show,
    start() {
      if (running) return;
      running = true;
      resize();
      loop();
    },
    stop() {
      running = false;
    },
  };
}
