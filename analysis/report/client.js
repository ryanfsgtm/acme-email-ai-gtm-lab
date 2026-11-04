// Browser side of the report: unpacks the embedded data, routes on the URL hash,
// and re-renders with the shared View functions.
(() => {
  const root = document.getElementById('view');
  const scrolls = new Map(); // hash -> last scroll position on that view
  const expanded = new Set(); // `${hash} ${scope}` for lists the reader expanded
  let data = null;
  let transcripts = null;
  let transcriptsLoading = null;
  let index = null;
  let lastRoute = null;
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shownHash = null; // hash of the view actually on screen
  let lastJump = null; // quote button that triggered the last jump
  const focusMemory = new Map(); // hash -> href of the link the reader left from

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // On long calls the insight list scrolls away; after a quote jump, offer a way back to it.
  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'back-to-insights';
  backButton.textContent = 'Back to the quote';
  backButton.hidden = true;
  document.body.appendChild(backButton);
  backButton.addEventListener('click', () => {
    backButton.hidden = true;
    if (lastJump && root.contains(lastJump)) {
      lastJump.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
      lastJump.focus({ preventScroll: true });
    }
  });

  async function unpack(id) {
    const text = document.getElementById(id).textContent.trim();
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }

  function loadTranscripts() {
    transcriptsLoading ??= unpack('report-transcripts').then((value) => {
      transcripts = value;
      return value;
    });
    return transcriptsLoading;
  }

  const sameView = (a, b) => a && b && a.view === b.view && a.kind === b.kind && a.value === b.value && a.id === b.id;

  let scrollQueued = false;
  window.addEventListener('scroll', () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      // A scroll that lands after a click changed the hash, but before the new view
      // rendered, belongs to the old view: drop it.
      if (location.hash === shownHash) scrolls.set(shownHash, window.scrollY);
    });
  }, { passive: true });

  function expand(scope, button) {
    scope.querySelectorAll('[data-extra]').forEach((row) => { row.hidden = false; });
    (button.closest('.more-row') ?? button).remove();
  }

  function scopeOf(button) {
    return button.closest('tbody') ?? (button.previousElementSibling?.matches?.('.table-scroll') ? button.previousElementSibling : button.closest('section'));
  }

  function reexpand() {
    root.querySelectorAll('[data-more]').forEach((button) => {
      if (expanded.has(`${location.hash} ${button.dataset.more}`)) expand(scopeOf(button), button);
    });
  }

  // Which control had focus, described so it can be found again after a re-render.
  function focusKey() {
    const el = document.activeElement;
    if (!el || !root.contains(el)) return null;
    if (el.matches('select[data-filter]')) return { select: el.dataset.filter };
    const group = el.closest('[role="group"]');
    if (group && el.matches('.chip')) return { group: group.getAttribute('aria-label'), index: [...group.querySelectorAll('.chip')].indexOf(el) };
    return null;
  }

  function restoreFocus(key) {
    if (!key) return;
    let el = null;
    if (key.select) el = root.querySelector(`select[data-filter="${key.select}"]`);
    if (key.group) el = root.querySelectorAll(`[role="group"][aria-label="${key.group}"] .chip`)[key.index];
    el?.focus({ preventScroll: true });
  }

  // Keep the insight panel beside the transcript only when it fits on screen; otherwise it
  // scrolls with the page so nothing hides inside an inner scroll area.
  function fitPanel() {
    const panel = root.querySelector('.insight-panel');
    if (!panel) return;
    panel.classList.remove('is-sticky');
    if (window.matchMedia('(min-width: 961px)').matches && panel.scrollHeight <= window.innerHeight - 32) panel.classList.add('is-sticky');
  }
  window.addEventListener('resize', fitPanel);

  function setTitle(route) {
    const name = View.title(data, route);
    document.title = name ? `${name} · ACME Email call review` : 'ACME Email call review';
  }

  function settle(route, restore) {
    setTitle(route);
    if (route.anchor && restore == null) {
      const target = document.getElementById(route.anchor);
      if (target) target.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
      return;
    }
    window.scrollTo({ top: restore ?? 0 });
  }

  async function show(firstLoad) {
    const leaving = document.activeElement;
    const route = View.normalize(data, View.parseRoute(location.hash));
    const keepServerRender = firstLoad && route.view === 'summary' && root.dataset.route === View.routeKey({ ...route, anchor: null });
    // A filter change re-renders the same view: keep the reader's place and focus.
    const filterOnly = !firstLoad && sameView(route, lastRoute);
    const focus = filterOnly ? focusKey() : null;
    const y = window.scrollY;
    if (!firstLoad && !filterOnly && shownHash && leaving && root.contains(leaving) && leaving.matches('a[href]')) {
      focusMemory.set(shownHash, leaving.getAttribute('href'));
    }
    lastRoute = route;
    shownHash = location.hash;
    lastJump = null;
    backButton.hidden = true;
    if (!keepServerRender) {
      const text = route.view === 'call' && transcripts ? transcripts[index.get(route.id)] : null;
      root.innerHTML = View.render(data, route, text);
    }
    reexpand();
    fitPanel();
    if (filterOnly) {
      window.scrollTo({ top: y });
      restoreFocus(focus);
      setTitle(route);
    } else {
      settle(route, scrolls.get(location.hash));
      const href = focusMemory.get(location.hash);
      const back = href && [...root.querySelectorAll('a[href]')].find((a) => a.getAttribute('href') === href);
      back?.focus({ preventScroll: true });
    }
    if (route.view === 'call' && !transcripts) {
      await loadTranscripts();
      const now = View.parseRoute(location.hash);
      if (now.view === 'call' && now.id === route.id) {
        const keep = window.scrollY;
        root.innerHTML = View.render(data, now, transcripts[index.get(now.id)]);
        fitPanel();
        window.scrollTo({ top: scrolls.get(location.hash) ?? keep });
      }
    }
  }

  function jumpTo(id) {
    const mark = document.getElementById(id) ?? root.querySelector(`mark[data-ids~="${id}"]`);
    if (!mark) return;
    root.querySelectorAll('mark.is-current').forEach((m) => m.classList.remove('is-current'));
    mark.classList.add('is-current');
    mark.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
    mark.focus({ preventScroll: true });
    const panel = root.querySelector('.insight-panel');
    backButton.hidden = Boolean(panel?.classList.contains('is-sticky'));
  }

  document.addEventListener('click', (event) => {
    const jump = event.target.closest('[data-jump]');
    if (jump) {
      event.preventDefault();
      lastJump = jump;
      if (!transcripts) {
        loadTranscripts().then(() => jumpTo(jump.dataset.jump));
        return;
      }
      jumpTo(jump.dataset.jump);
      return;
    }
    const more = event.target.closest('[data-more]');
    if (more) {
      const scope = scopeOf(more);
      expanded.add(`${location.hash} ${more.dataset.more}`);
      const firstHidden = scope.querySelector('[data-extra]');
      expand(scope, more);
      firstHidden?.querySelector('a')?.focus({ preventScroll: true });
    }
  });

  // After a quote jump, focus sits on the highlighted line. Tab moves to the next quote
  // button and Shift+Tab or Escape returns to the one pressed, instead of leaving the panel.
  document.addEventListener('keydown', (event) => {
    const mark = document.activeElement;
    if (!lastJump || !root.contains(lastJump) || !mark?.matches?.('mark.hl') || !['Tab', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...root.querySelectorAll('button.quote')];
    const at = buttons.indexOf(lastJump);
    const target = event.key === 'Tab' && !event.shiftKey ? buttons[at + 1] ?? lastJump : lastJump;
    target?.focus();
  });

  document.addEventListener('change', (event) => {
    const select = event.target.closest('select[data-filter]');
    if (!select) return;
    const route = View.normalize(data, View.parseRoute(location.hash));
    const filters = { ...route.filters, [select.dataset.filter]: select.value };
    const base = location.hash.replace(/^#/, '').split('?')[0] || '/';
    const path = route.view === 'summary' ? '/' : base;
    location.hash = `#${path}${View.query(filters)}`;
  });

  window.addEventListener('hashchange', () => show(false));

  unpack('report-data')
    .then((value) => {
      data = value;
      index = new Map(data.calls.map((c, i) => [c.id, i]));
      return show(true);
    })
    .catch((error) => {
      root.insertAdjacentHTML('afterbegin', `<p class="error">This page could not unpack its data (${String(error.message || error)}). Open it in a current version of Chrome, Edge, Firefox or Safari.</p>`);
    });
})();
