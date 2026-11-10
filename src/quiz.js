import { QUIZ, CREATURES, REGIONS } from './data.js';

export function initQuiz(root, { onResult, onOpen, onAnswer, thumbs }) {
  let step = 0;
  let scores = {};

  function render() {
    if (step >= QUIZ.length) return renderResult();
    const { q, options } = QUIZ[step];
    root.innerHTML = `
      <div class="quiz__progress" aria-hidden="true"><span style="width:${(step / QUIZ.length) * 100}%"></span></div>
      <p class="quiz__step">Pregunta ${step + 1} de ${QUIZ.length}</p>
      <h3 class="quiz__q">${q}</h3>
      <div class="quiz__options">
        ${options.map((o, i) => `<button class="quiz__opt" data-i="${i}"><span class="quiz__letter">${'ABCD'[i]}</span>${o.label}</button>`).join('')}
      </div>`;
    root.querySelectorAll('.quiz__opt').forEach((btn) =>
      btn.addEventListener('click', () => {
        const opt = options[+btn.dataset.i];
        for (const [k, v] of Object.entries(opt.score)) scores[k] = (scores[k] || 0) + v;
        btn.classList.add('is-picked');
        onAnswer?.();
        setTimeout(() => {
          step++;
          render();
        }, 280);
      }),
    );
  }

  function renderResult() {
    const [winnerId] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    const c = CREATURES.find((x) => x.id === winnerId);
    root.innerHTML = `
      <div class="quiz__result" style="--c:${c.color}">
        <div class="quiz__result-img">${thumbs()[c.id] ? `<img src="${thumbs()[c.id]}" alt="${c.name}" />` : ''}</div>
        <div>
          <p class="quiz__step">Te persigue…</p>
          <h3 class="quiz__name">${c.name}</h3>
          <span class="chip">${REGIONS[c.region]}</span>
          <p class="quiz__tag">${c.tagline}</p>
          <p class="quiz__survive"><strong>Tu única salida:</strong> ${c.survive}</p>
          <div class="quiz__actions">
            <button class="btn btn--blood" data-open>Verla en 3D</button>
            <button class="btn btn--ghost" data-retry>Repetir test</button>
          </div>
        </div>
      </div>`;
    root.querySelector('[data-open]').addEventListener('click', () => onOpen(c.id));
    root.querySelector('[data-retry]').addEventListener('click', () => {
      step = 0;
      scores = {};
      render();
    });
    onResult?.(c);
  }

  render();
}
