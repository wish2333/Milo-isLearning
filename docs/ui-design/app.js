/* =========================================================================
   AI Learning Compiler — Application shell
   Phase 3 · §10.3.4 deliverable

   Provides cross-page services for all Phase 3 prototype pages:
     - ALC.navigate(page, params?)    Hash-based navigation (file:// safe)
     - ALC.getState()                  Read user state from LocalStorage
     - ALC.setState(patch)             Immutably update user state
     - ALC.clearState()                Wipe progress (used by 10-done 清空进度)
     - ALC.recordAnswer(quizId, info)  Append answer to history
     - ALC.renderNavTop(stage?)        Render shared nav-top into placeholder
     - ALC.renderStaircase(progress?)  Render staircase from state

   Designed for prototype use only — no production concerns.
   ========================================================================= */

'use strict';

(function () {
  const STORAGE_KEY = 'milo-alc-state-v1';

  /* ---------- Default user state ---------- */

  const DEFAULT_STATE = Object.freeze({
    currentConceptIndex: 0,  // 0-based · which concept user is on
    currentStepInConcept: 1, // 1-based · step within current concept
    currentStage: 'concept', // 'concept' | 'challenge' | 'feynman'
    feynmanStep: 1,          // 1-6
    feynmanSubmitCount: 0,   // 0-2 (PRD §7.9 max 2)
    skippedConceptIds: [],   // ['C2', ...] — for §5.10.5 review card
    subjectiveRating: 0,     // 0-5 — PRD §11.2
    ceremonySkipped: false,  // §10.5.3
    answers: [],             // [{ quizId, isCorrect, conceptId, timestamp }]
    visitedPages: [],        // ['01-home.html', ...]
  });

  /* ---------- State ---------- */

  /**
   * @returns {typeof DEFAULT_STATE}
   */
  function getState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_STATE };
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_STATE, ...parsed };
    } catch (_) {
      return { ...DEFAULT_STATE };
    }
  }

  /**
   * @param {Partial<typeof DEFAULT_STATE>} patch
   */
  function setState(patch) {
    const next = { ...getState(), ...patch };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_) { /* quota or private mode — ignore */ }
    return next;
  }

  function clearState() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) { /* ignore */ }
  }

  /* ---------- Navigation ---------- */

  /**
   * Hash-based router · works with file:// protocol too.
   * Target format: './02-compiling.html' or absolute URL.
   *
   * @param {string} page   filename like '02-compiling.html'
   * @param {Record<string, string|number|boolean>=} params  optional query params
   */
  function navigate(page, params) {
    const target = new URL(page, window.location.href);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        target.searchParams.set(k, String(v));
      });
    }

    // Track visit
    const state = getState();
    const visited = state.visitedPages.includes(page)
      ? state.visitedPages
      : [...state.visitedPages, page];
    if (visited !== state.visitedPages) {
      setState({ visitedPages: visited });
    }

    window.location.href = target.toString();
  }

  /**
   * Navigate to previous page in history, falling back to overview.
   */
  function goBack(fallback = '03-overview.html') {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate(fallback);
    }
  }

  /* ---------- Recording answers ---------- */

  /**
   * @param {string} quizId
   * @param {{ isCorrect: boolean, conceptId?: string, interactionType?: string }} info
   */
  function recordAnswer(quizId, info) {
    const state = getState();
    const entry = {
      quizId,
      isCorrect: info.isCorrect,
      conceptId: info.conceptId || null,
      interactionType: info.interactionType || null,
      timestamp: new Date().toISOString(),
    };
    setState({ answers: [...state.answers, entry] });
  }

  /**
   * Mark a Concept as skipped after 3 consecutive wrong attempts.
   * §5.10.5 — feeds the review card on the completion page.
   * @param {string} conceptId
   */
  function markConceptSkipped(conceptId) {
    const state = getState();
    if (!state.skippedConceptIds.includes(conceptId)) {
      setState({ skippedConceptIds: [...state.skippedConceptIds, conceptId] });
    }
  }

  /* ---------- Shared renderers ---------- */

  /**
   * Render nav-top into a placeholder element with id="nav-top-mount".
   * @param {{ back?: string, backTarget?: string, stage?: 'concept'|'challenge'|'feynman', actions?: Array<{label:string,onClick?:()=>void,href?:string}> }} opts
   */
  function renderNavTop(opts = {}) {
    const mount = document.getElementById('nav-top-mount');
    if (!mount) return;

    const stageLabels = [
      { id: 'concept', label: '概念' },
      { id: 'challenge', label: 'Challenge' },
      { id: 'feynman', label: '费曼' },
    ];

    const stagesHtml = stageLabels.map(s => {
      const isActive = s.id === opts.stage;
      const color = isActive
        ? (s.id === 'feynman' ? 'var(--stage-feynman)' : 'var(--accent-primary)')
        : 'var(--fg-tertiary)';
      return `<span class="label-stage" style="color: ${color};">${s.label}</span>` +
             (s.id !== 'feynman'
               ? '<span style="color: var(--fg-quaternary); margin: 0 var(--space-2);">·</span>'
               : '');
    }).join('');

    const backHtml = opts.back
      ? `<button type="button" class="nav-top__back" data-nav-back="${opts.backTarget || ''}">
           <span aria-hidden="true">&larr;</span><span>${opts.back}</span>
         </button>`
      : '<span class="nav-top__brand">AI Learning Compiler</span>';

    const actionsHtml = (opts.actions || []).map((a, i) => {
      const tag = a.href ? 'a' : 'button';
      const href = a.href ? ` href="${a.href}"` : '';
      const type = a.onClick ? ' type="button"' : '';
      const dataAttr = `data-nav-action="${i}"`;
      return `<${tag}${href}${type} class="btn-text" ${dataAttr}>${a.label}</${tag}>`;
    }).join('');

    mount.outerHTML = `
      <header class="nav-top" role="banner">
        ${backHtml}
        ${opts.stage ? `<nav aria-label="学习阶段">${stagesHtml}</nav>` : ''}
        ${actionsHtml ? `<div class="nav-top__actions">${actionsHtml}</div>` : ''}
      </header>
    `;

    // Wire actions
    if (opts.back) {
      const backBtn = document.querySelector('.nav-top__back');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          const target = backBtn.getAttribute('data-nav-back');
          if (target) navigate(target);
          else goBack();
        });
      }
    }
    (opts.actions || []).forEach((a, i) => {
      const el = document.querySelector(`[data-nav-action="${i}"]`);
      if (el && a.onClick) el.addEventListener('click', a.onClick);
    });
  }

  /**
   * Render Module staircase into #staircase-mount.
   * @param {{ activeStage?: 'concept'|'challenge'|'feynman', allComplete?: boolean, activeConceptIndex?: number }} opts
   */
  function renderStaircase(opts = {}) {
    const mount = document.getElementById('staircase-mount');
    if (!mount) return;

    const state = getState();
    const activeStage = opts.activeStage || state.currentStage;
    const allComplete = opts.allComplete || false;
    const activeConceptIdx = opts.activeConceptIndex ?? state.currentConceptIndex;

    // 10 cells: C1×2 + C2×2 + C3×2 + Challenge×2 + Feynman×2
    const cells = [];
    for (let i = 0; i < 3; i++) {
      const status = allComplete
        ? 'stair--completed'
        : (i < activeConceptIdx
            ? 'stair--completed'
            : i === activeConceptIdx && activeStage === 'concept'
              ? 'stair--active'
              : 'stair--locked');
      cells.push(`<li class="stair ${status}" aria-label="Concept ${i + 1}"><span class="stair__label">C${i + 1}</span></li>`);
      cells.push(`<li class="stair ${status}" aria-label="Concept ${i + 1}"><span class="stair__label">C${i + 1}</span></li>`);
    }
    const challengeStatus = allComplete
      ? 'stair--completed'
      : (activeStage === 'challenge' ? 'stair--active' : 'stair--locked');
    cells.push(`<li class="stair ${challengeStatus} staircase--challenge" aria-label="Challenge"><span class="stair__label">Chl</span></li>`);
    cells.push(`<li class="stair ${challengeStatus} staircase--challenge" aria-label="Challenge"><span class="stair__label">Chl</span></li>`);

    const feynmanStatus = allComplete
      ? 'stair--completed'
      : (activeStage === 'feynman' ? 'stair--active' : 'stair--locked');
    cells.push(`<li class="stair ${feynmanStatus} staircase--feynman" aria-label="Feynman"><span class="stair__label">Fey</span></li>`);
    cells.push(`<li class="stair ${feynmanStatus} staircase--feynman" aria-label="Feynman"><span class="stair__label">Fey</span></li>`);

    mount.outerHTML = `
      <section class="staircase-wrap" aria-label="Module 学习路径">
        <ol class="staircase" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" aria-label="Module 学习进度">
          ${cells.join('')}
        </ol>
      </section>
    `;
  }

  /* ---------- Keyboard helpers ---------- */

  /**
   * Wire Cmd/Ctrl + Enter to trigger a callback when not disabled.
   * @param {() => void} callback
   */
  function wireCmdEnter(callback) {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') callback();
    });
  }

  /* ---------- Page enter animation helper ---------- */

  /**
   * Manually trigger page-enter on an element (used when SPA-like swap).
   * @param {HTMLElement} el
   */
  function triggerEnter(el) {
    el.style.opacity = '0';
    el.style.transition = 'opacity var(--duration-slow) var(--ease-standard)';
    window.requestAnimationFrame(() => {
      el.style.opacity = '1';
    });
  }

  /* ---------- Public API ---------- */

  /** @type {Readonly<typeof import('./app').ALC>} */
  window.ALC = Object.freeze({
    getState,
    setState,
    clearState,
    navigate,
    goBack,
    recordAnswer,
    markConceptSkipped,
    renderNavTop,
    renderStaircase,
    wireCmdEnter,
    triggerEnter,
  });
})();
