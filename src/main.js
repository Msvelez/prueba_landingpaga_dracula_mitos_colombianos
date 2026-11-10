import './style.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CREATURES, REGIONS } from './data.js';
import { initHero } from './three/hero.js';
import { renderThumbnails, createViewer } from './three/creatures.js';
import { initMap, REGION_INFO } from './three/map.js';
import { initQuiz } from './quiz.js';
import { setSound, isSoundOn, whistle, stab, heartbeat } from './audio.js';

gsap.registerPlugin(ScrollTrigger);

const $ = (s, el = document) => el.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const DROP = '<svg viewBox="0 0 24 32" aria-hidden="true"><path d="M12 1C12 1 2 13.5 2 20.5a10 10 0 0 0 20 0C22 13.5 12 1 12 1Z"/></svg>';
const meter = (n) => Array.from({ length: 5 }, (_, i) => `<span class="${i < n ? 'on' : ''}">${DROP}</span>`).join('');

let thumbs = {};
let lastResult = null;

/* ----------------------------- Hero ----------------------------- */
const hero = initHero($('#hero-canvas'), {
  ids: CREATURES.map((c) => c.id),
  onChange(id, i) {
    const c = CREATURES[i];
    $('#h-name').textContent = c.name;
    $('#h-name').style.color = c.color;
    $('#h-count').textContent = `${String(i + 1).padStart(2, '0')} / ${CREATURES.length}`;
    $('#h-open').dataset.id = id;
  },
  onPick(id) {
    document.body.classList.remove('is-bitten');
    void document.body.offsetWidth;
    document.body.classList.add('is-bitten');
    setTimeout(() => openViewer(id), 250);
  },
});
$('#h-prev').addEventListener('click', () => hero.prev());
$('#h-next').addEventListener('click', () => hero.next());
$('#h-open').addEventListener('click', (e) => openViewer(e.currentTarget.dataset.id));

/* ----------------------------- Sonido ----------------------------- */
const soundBtn = $('#sound');
soundBtn.addEventListener('click', () => {
  const on = !isSoundOn();
  setSound(on);
  soundBtn.setAttribute('aria-pressed', on);
  soundBtn.setAttribute('aria-label', on ? 'Silenciar sonido' : 'Activar sonido');
  soundBtn.classList.toggle('is-on', on);
});

/* ----------------------------- Navegación ----------------------------- */
addEventListener('scroll', () => $('#nav').classList.toggle('is-solid', scrollY > 40), { passive: true });

/* ----------------------------- Bestiario ----------------------------- */
const grid = $('#grid');
const filters = $('#filters');

filters.innerHTML = Object.entries(REGIONS)
  .map(([k, v], i) => `<button role="tab" class="filter${i === 0 ? ' is-active' : ''}" aria-selected="${i === 0}" data-region="${k}">${v}</button>`)
  .join('');

grid.innerHTML = CREATURES.map(
  (c, i) => `
  <article class="card" data-id="${c.id}" data-region="${c.region}" style="--c:${c.color}">
    <div class="card__media">
      <span class="card__num">${String(i + 1).padStart(2, '0')}</span>
      <img alt="Modelo 3D de ${c.name}" loading="lazy" />
      <div class="card__shine"></div>
    </div>
    <div class="card__body">
      <span class="chip">${REGIONS[c.region]}</span>
      <h3 class="card__name">${c.name}</h3>
      <p class="card__tag">${c.tagline}</p>
      <div class="card__foot">
        <div class="meter" role="img" aria-label="Nivel de terror ${c.terror} de 5">${meter(c.terror)}</div>
        <button class="card__open" data-open="${c.id}">Ver en 3D <span aria-hidden="true">→</span></button>
      </div>
    </div>
  </article>`,
).join('');

filters.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter');
  if (!btn) return;
  filters.querySelectorAll('.filter').forEach((b) => {
    b.classList.toggle('is-active', b === btn);
    b.setAttribute('aria-selected', b === btn);
  });
  const r = btn.dataset.region;
  const cards = [...grid.children];
  const shown = cards.filter((c) => r === 'todas' || c.dataset.region === r);
  cards.forEach((c) => c.classList.toggle('is-hidden', !shown.includes(c)));
  ScrollTrigger.refresh();
  if (!reduceMotion) gsap.fromTo(shown, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.05, ease: 'power3.out' });
  heartbeat();
});

grid.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) openViewer(card.dataset.id);
});

// Inclinación 3D de las tarjetas al pasar el cursor
grid.querySelectorAll('.card').forEach((card) => {
  card.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.style.setProperty('--rx', `${-y * 10}deg`);
    card.style.setProperty('--ry', `${x * 12}deg`);
    card.style.setProperty('--mx', `${(x + 0.5) * 100}%`);
    card.style.setProperty('--my', `${(y + 0.5) * 100}%`);
  });
  card.addEventListener('pointerleave', () => {
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  });
  card.addEventListener('pointerenter', () => {
    if (card.dataset.id === 'silbon') whistle();
  });
});

/* ----------------------------- Visor 3D ----------------------------- */
const dialog = $('#viewer');
const viewer = createViewer($('#viewer-canvas'));
let currentIdx = 0;

function fillInfo(c) {
  dialog.style.setProperty('--c', c.color);
  $('#v-region').textContent = REGIONS[c.region];
  $('#v-name').textContent = c.name;
  $('#v-tagline').textContent = c.tagline;
  $('#v-meter').innerHTML = `<span class="meter__label">Terror</span>${meter(c.terror)}`;
  $('#v-story').textContent = c.story;
  $('#v-survive').textContent = c.survive;
  $('#v-where').textContent = c.where;
  $('#v-fact').textContent = `Dato: ${c.fact}`;
}

function openViewer(id) {
  currentIdx = CREATURES.findIndex((c) => c.id === id);
  const c = CREATURES[currentIdx];
  fillInfo(c);
  if (!dialog.open) dialog.showModal();
  document.documentElement.classList.add('no-scroll');
  viewer.start();
  viewer.show(id);
  $('.viewer__info').scrollTop = 0;
  if (id === 'silbon') whistle();
  else stab();
}

function step(dir) {
  const next = (currentIdx + dir + CREATURES.length) % CREATURES.length;
  openViewer(CREATURES[next].id);
}

$('#v-prev').addEventListener('click', () => step(-1));
$('#v-next').addEventListener('click', () => step(1));
$('#v-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  viewer.stop();
  document.documentElement.classList.remove('no-scroll');
});
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});
dialog.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'ArrowLeft') step(-1);
});

/* ----------------------------- Mapa ----------------------------- */
const mapPanel = $('#map-panel');
const mapRegions = $('#map-regions');
mapRegions.innerHTML = [['todo', 'Todo el país'], ...Object.entries(REGIONS).filter(([k]) => k !== 'todas')]
  .map(([k, v]) => `<button class="filter${k === 'todo' ? ' is-active' : ''}" data-r="${k}" style="--c:${REGION_INFO[k]?.color ?? 'var(--crema)'}">${v}</button>`)
  .join('');

const map = initMap({
  canvas: $('#map-canvas'),
  labelsEl: $('#map-labels'),
  onFocus({ mode, region, creature }) {
    const active = mode === 'overview' ? 'todo' : region ?? creature.region;
    mapRegions.querySelectorAll('.filter').forEach((b) => b.classList.toggle('is-active', b.dataset.r === active));
    if (mode === 'overview') {
      mapPanel.classList.remove('is-open');
      return;
    }
    if (mode === 'region') {
      const list = CREATURES.filter((c) => c.region === region);
      mapPanel.style.setProperty('--c', REGION_INFO[region].color);
      mapPanel.innerHTML = `
        <button class="mapa__back" data-back>← Todo el país</button>
        <p class="kicker">Región</p>
        <h3 class="mapa__title">${REGIONS[region]}</h3>
        <p class="mapa__text">${REGION_INFO[region].text}</p>
        <p class="mapa__count">${list.length} ${list.length === 1 ? 'criatura acecha' : 'criaturas acechan'} aquí</p>
        <div class="mapa__list">
          ${list
            .map(
              (c) => `<button class="mapa__item" data-c="${c.id}" style="--c:${c.color}">
                <span class="mapa__thumb">${thumbs[c.id] ? `<img src="${thumbs[c.id]}" alt="" />` : ''}</span>
                <span><strong>${c.name}</strong><small>${c.place}</small></span>
              </button>`,
            )
            .join('')}
        </div>`;
    } else {
      const c = creature;
      mapPanel.style.setProperty('--c', c.color);
      mapPanel.innerHTML = `
        <button class="mapa__back" data-region="${c.region}">← ${REGIONS[c.region]}</button>
        <span class="chip" style="--c:${c.color}">${c.place}</span>
        <h3 class="mapa__title">${c.name}</h3>
        <p class="mapa__text">${c.tagline}</p>
        <div class="meter" role="img" aria-label="Nivel de terror ${c.terror} de 5">${meter(c.terror)}</div>
        <p class="mapa__text mapa__text--soft">${c.where}</p>
        <button class="btn btn--blood" data-open="${c.id}">Ver ficha en 3D</button>`;
      if (c.id === 'silbon') whistle();
      else heartbeat();
    }
    mapPanel.classList.add('is-open');
  },
});

mapPanel.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.back !== undefined) map.overview();
  else if (t.dataset.region) map.focusRegion(t.dataset.region);
  else if (t.dataset.c) map.focusCreature(t.dataset.c);
  else if (t.dataset.open) openViewer(t.dataset.open);
});
mapRegions.addEventListener('click', (e) => {
  const b = e.target.closest('.filter');
  if (!b) return;
  if (b.dataset.r === 'todo') map.overview();
  else map.focusRegion(b.dataset.r);
});
$('#map-in').addEventListener('click', () => map.zoomIn());
$('#map-out').addEventListener('click', () => map.zoomOut());

// Zoom de entrada: al hacer scroll la cámara baja desde Suramérica hasta Colombia
if (reduceMotion) map.setIntro(1);
else {
  ScrollTrigger.create({
    trigger: '#map-stage',
    start: 'top top',
    end: '+=120%',
    pin: true,
    scrub: 0.6,
    onUpdate: (self) => map.setIntro(self.progress),
  });
}

/* ----------------------------- Linterna ----------------------------- */
const flash = $('#linterna');
const dark = $('#flash-dark');
const flashContent = $('#flash-content');
const EYE_COLORS = ['#ff2a3a', '#ffcc33', '#9fc4ff', '#ff4fd8', '#7fd66b', '#ff8a2a'];
const eyes = [];
const spots = [
  [8, 45], [24, 12], [33, 62], [46, 30], [55, 85], [62, 50], [70, 32], [88, 40], [92, 86], [40, 90], [22, 62], [84, 10],
];
spots.forEach(([x, y], i) => {
  const el = document.createElement('div');
  el.className = 'eyes';
  el.style.cssText = `left:${x}%;top:${y}%;--ec:${EYE_COLORS[i % EYE_COLORS.length]};--d:${(i * 0.37) % 3}s;--s:${0.7 + ((i * 7) % 5) / 6}`;
  el.innerHTML = '<i></i><i></i>';
  flashContent.appendChild(el);
  eyes.push({ el, x, y, found: false });
});
$('#eyes-total').textContent = eyes.length;

let found = 0;
function moveLight(clientX, clientY) {
  const r = flash.getBoundingClientRect();
  const x = clientX - r.left;
  const y = clientY - r.top;
  dark.style.setProperty('--x', `${x}px`);
  dark.style.setProperty('--y', `${y}px`);
  const radius = Math.min(170, r.width * 0.28);
  for (const e of eyes) {
    const ex = (e.x / 100) * r.width;
    const ey = (e.y / 100) * r.height;
    const lit = Math.hypot(ex - x, ey - y) < radius * 0.7;
    e.el.classList.toggle('is-lit', lit);
    if (lit && !e.found) {
      e.found = true;
      e.el.classList.add('is-found');
      found++;
      $('#eyes-found').textContent = found;
      heartbeat();
      if (found === eyes.length) {
        flash.classList.add('is-complete');
        stab();
      }
    }
  }
}
flash.addEventListener('pointermove', (e) => moveLight(e.clientX, e.clientY));
flash.addEventListener('pointerdown', (e) => moveLight(e.clientX, e.clientY));
flash.addEventListener('pointerleave', () => {
  dark.style.setProperty('--x', '-999px');
  dark.style.setProperty('--y', '-999px');
});

/* ----------------------------- Test ----------------------------- */
initQuiz($('#quiz'), {
  thumbs: () => thumbs,
  onOpen: openViewer,
  onAnswer: heartbeat,
  onResult(c) {
    lastResult = c;
    stab();
  },
});

/* ----------------------------- Chorreado del CTA ----------------------------- */
(function drawDrips() {
  const band = 34;
  const drips = [];
  for (let x = 30; x < 1420; x += 70 + Math.random() * 90) {
    drips.push({ cx: x, w: 16 + Math.random() * 30, len: 20 + Math.random() * 110 });
  }
  let d = `M0 0H1440V${band}`;
  for (const { cx, w, len } of drips.reverse()) {
    const r = w / 2;
    const y = band + len;
    d += `L${cx + r + 12} ${band}Q${cx + r} ${band} ${cx + r} ${band + 12}L${cx + r} ${y}`;
    d += `A${r} ${r} 0 0 1 ${cx - r} ${y}L${cx - r} ${band + 12}Q${cx - r} ${band} ${cx - r - 12} ${band}`;
  }
  d += `L0 ${band}Z`;
  $('#drips-path').setAttribute('d', d);
})();

/* ----------------------------- Compartir ----------------------------- */
$('#share').addEventListener('click', async () => {
  const text = lastResult
    ? `¡Me persigue ${lastResult.name}! ${lastResult.tagline} Descubre cuál criatura te persigue a ti 🩸`
    : 'Descubre qué criatura de las leyendas colombianas te persigue 🩸';
  const data = { title: 'Drácula · Leyendas que muerden', text, url: location.href };
  try {
    if (navigator.share) await navigator.share(data);
    else {
      await navigator.clipboard.writeText(`${text} ${location.href}`);
      $('#share').textContent = '¡Enlace copiado!';
      setTimeout(() => ($('#share').textContent = 'Compartir mi resultado'), 2000);
    }
  } catch {
    /* el usuario canceló */
  }
});

/* ----------------------------- Miniaturas + entrada ----------------------------- */
requestAnimationFrame(() => {
  setTimeout(() => {
    try {
      thumbs = renderThumbnails(CREATURES.map((c) => c.id));
      grid.querySelectorAll('.card').forEach((card) => {
        $('img', card).src = thumbs[card.dataset.id];
      });
      map.setThumbs(thumbs);
    } catch (err) {
      console.warn('No se pudieron generar las miniaturas 3D', err);
    }
    document.body.classList.add('is-ready');
    intro();
  }, 60);
});

function intro() {
  if (reduceMotion) return;
  gsap.from('.hero__content > *', { y: 40, opacity: 0, duration: 1, stagger: 0.12, ease: 'power3.out', delay: 0.3 });
  gsap.utils.toArray('.reveal').forEach((el) =>
    gsap.from(el, { y: 50, opacity: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 85%' } }),
  );
  gsap.from('.card', {
    y: 60,
    opacity: 0,
    duration: 0.8,
    stagger: 0.07,
    ease: 'power3.out',
    scrollTrigger: { trigger: '#grid', start: 'top 85%' },
  });
  gsap.to('.marquee__track', { xPercent: -50, ease: 'none', duration: 40, repeat: -1 });
}
