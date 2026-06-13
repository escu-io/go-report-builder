(function () {
  'use strict';

  const data = JSON.parse(document.getElementById('coverage-data').textContent);
  const colors = data.colors || { min: '#ef4444', mid: '#f59e0b', max: '#22c55e' };
  const GAUGE_CIRC = 2 * Math.PI * 15.5;

  /* ---------- persisted UI state ----------
   * Remember the theme, active view and selected file across reloads so the
   * report reopens exactly where the user left off. Keyed by module path so
   * different reports don't clobber each other's state. Wrapped in try/catch
   * because localStorage can be unavailable (file://, private mode, etc.). */
  const STORE_KEY = 'go-report-builder:' + (data.modulePath || '.');
  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveState(patch) {
    try {
      const next = Object.assign(loadState(), patch);
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch (e) { /* storage unavailable — state just won't persist */ }
  }
  const savedState = loadState();

  // Restore the run filter, keeping only run ids that still exist; fall back to
  // "all runs" when nothing valid was stored.
  const validRunIds = new Set(data.runs.map(r => r.id));
  const savedRuns = Array.isArray(savedState.runs)
    ? savedState.runs.filter(id => validRunIds.has(id)) : null;
  let activeRuns = (savedRuns && savedRuns.length)
    ? new Set(savedRuns) : new Set(data.runs.map(r => r.id));
  let treemapStack = [data.tree];
  let selectedFile = (savedState.selectedFile && data.files[savedState.selectedFile])
    ? savedState.selectedFile : null;
  let currentView = savedState.view === 'files' ? 'files' : 'treemap';
  let treeQuery = typeof savedState.query === 'string' ? savedState.query : '';
  let visibleFileRows = []; // { path, row } in DOM order, for keyboard nav

  const els = {
    modulePath: document.getElementById('module-path'),
    overallPct: document.getElementById('overall-pct'),
    overallMeta: document.getElementById('overall-meta'),
    gaugeArc: document.getElementById('gauge-arc'),
    themeToggle: document.getElementById('theme-toggle'),
    viewSelector: document.getElementById('view-selector'),
    segIndicator: document.getElementById('seg-indicator'),
    views: {
      treemap: document.getElementById('view-treemap'),
      files: document.getElementById('view-files'),
    },
    explorer: document.getElementById('explorer'),
    explorerSidebar: document.getElementById('explorer-sidebar'),
    explorerToggle: document.getElementById('explorer-toggle'),
    fileHead: document.querySelector('#explorer-detail .file-head'),
    treeScroll: document.getElementById('tree-scroll'),
    treeExpand: document.getElementById('tree-expand'),
    treeCollapse: document.getElementById('tree-collapse'),
    searchBox: document.getElementById('search-box'),
    searchInput: document.getElementById('search-input'),
    searchClear: document.getElementById('search-clear'),
    runFilter: document.getElementById('run-filter'),
    runTrigger: document.getElementById('run-trigger'),
    runTriggerLabel: document.getElementById('run-trigger-label'),
    runMenu: document.getElementById('run-menu'),
    fileName: document.getElementById('file-name'),
    filePath: document.getElementById('file-path'),
    filePct: document.getElementById('file-pct'),
    runBadges: document.getElementById('run-badges'),
    sourceView: document.querySelector('#source-view code'),
    header: document.querySelector('.app-header'),
    toolbar: document.querySelector('.toolbar'),
    footer: document.querySelector('.legend'),
  };

  /* ---------- responsive layout metrics ---------- */
  // Mirror the live heights of the sticky chrome (header / toolbar / footer)
  // into CSS variables so sticky offsets and scroll-area heights stay correct
  // no matter how the fluid fonts or wrapping change those heights.
  function syncLayoutVars() {
    const root = document.documentElement.style;
    if (els.header) root.setProperty('--header-h', els.header.offsetHeight + 'px');
    if (els.toolbar) root.setProperty('--toolbar-h', els.toolbar.offsetHeight + 'px');
    if (els.footer) root.setProperty('--footer-h', els.footer.offsetHeight + 'px');
  }

  /* ---------- color helpers ---------- */
  function pctColor(pct) {
    const t = Math.max(0, Math.min(100, pct)) / 100;
    return t <= 0.5
      ? lerpColor(colors.min, colors.mid, t * 2)
      : lerpColor(colors.mid, colors.max, (t - 0.5) * 2);
  }
  function lerpColor(a, b, t) {
    const pa = hexToRgb(a), pb = hexToRgb(b);
    const r = Math.round(pa.r + (pb.r - pa.r) * t);
    const g = Math.round(pa.g + (pb.g - pa.g) * t);
    const bl = Math.round(pa.b + (pb.b - pa.b) * t);
    return `rgb(${r},${g},${bl})`;
  }
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function formatPct(n) { return (Math.round(n * 10) / 10).toFixed(1) + '%'; }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Multi-stop coverage gradient for the treemap: a rich red→orange→pale-yellow→
  // light-green→medium-green→dark-green ramp where each band maps to a coverage
  // range, so every intermediate percentage gets its own shade.
  const TM_STOPS = [
    { p: 0.00, c: '#A9001A' },   // deep red — lowest / 0%
    { p: 0.30, c: '#E67E22' },   // orange — low-mid
    { p: 0.55, c: '#FFF9A6' },   // pale yellow — mid-range
    { p: 0.65, c: '#A8E092' },   // light green — lower-green / container fill
    { p: 0.80, c: '#34A853' },   // medium green — standard high
    { p: 1.00, c: '#0B6A3A' },   // dark green — highest / 90%+
  ];
  function tmRgb(pct) {
    const t = Math.max(0, Math.min(100, pct)) / 100;
    let lo = TM_STOPS[0], hi = TM_STOPS[TM_STOPS.length - 1];
    for (let i = 0; i < TM_STOPS.length - 1; i++) {
      if (t >= TM_STOPS[i].p && t <= TM_STOPS[i + 1].p) {
        lo = TM_STOPS[i]; hi = TM_STOPS[i + 1]; break;
      }
    }
    const span = hi.p - lo.p;
    const local = span > 0 ? (t - lo.p) / span : 0;
    const a = hexToRgb(lo.c), b = hexToRgb(hi.c);
    return {
      r: Math.round(a.r + (b.r - a.r) * local),
      g: Math.round(a.g + (b.g - a.g) * local),
      b: Math.round(a.b + (b.b - a.b) * local),
    };
  }
  function tmColor(pct) {
    const c = tmRgb(pct);
    return `rgb(${c.r},${c.g},${c.b})`;
  }
  // A stronger (darker) shade of the same gradient color, used for the borders /
  // margins so each box reads as enclosed by a richer version of its own color.
  function tmStrong(pct) {
    const c = tmRgb(pct);
    const k = 0.62; // darken toward black
    return `rgb(${Math.round(c.r * k)},${Math.round(c.g * k)},${Math.round(c.b * k)})`;
  }

  /* ---------- coverage computation (run filtered) ---------- */
  function allRunsActive() { return activeRuns.size === data.runs.length; }

  function fileCoveredStmts(file) {
    if (allRunsActive()) return file.coveredStmts;
    if (activeRuns.size === 0) return 0;
    const activeCount = [...activeRuns].filter(id => file.runCoverage[id]).length;
    if (activeCount === 0) return 0;
    if (activeCount === data.runs.length) return file.coveredStmts;
    return Math.round(file.coveredStmts * (activeCount / data.runs.length));
  }

  function filterTree(node) {
    if (!node.isDir) {
      const file = data.files[node.path];
      if (!file) return null;
      const covered = fileCoveredStmts(file);
      const total = file.totalStmts;
      return { ...node, orig: node, covered, total, percent: total > 0 ? (covered / total) * 100 : 0 };
    }
    const children = (node.children || []).map(filterTree).filter(Boolean);
    if (!children.length && node.path !== '') return null;
    let total = 0, covered = 0;
    children.forEach(c => { total += c.total; covered += c.covered; });
    return { ...node, orig: node, children, total, covered, percent: total > 0 ? (covered / total) * 100 : 0 };
  }

  function overallStats() {
    const root = filterTree(data.tree) || data.tree;
    return { covered: root.covered || 0, total: root.total || 0, percent: root.percent || 0 };
  }

  // Prune a (run-filtered) tree down to the nodes matching the live text query,
  // recomputing directory totals so treemap box sizes reflect only matches.
  // Returns null when nothing matches. With no query, returns the node as-is.
  function pruneTreeByQuery(node) {
    if (!treeQuery) return node;
    if (!node.isDir) return fileMatch(node) ? node : null;
    const children = (node.children || []).map(pruneTreeByQuery).filter(Boolean);
    if (!children.length) return null;
    let total = 0, covered = 0;
    children.forEach(c => { total += c.total; covered += c.covered; });
    return { ...node, children, total, covered, percent: total > 0 ? (covered / total) * 100 : 0 };
  }

  /* ---------- header ---------- */
  function setGauge(pct) {
    els.gaugeArc.style.strokeDashoffset = GAUGE_CIRC * (1 - Math.max(0, Math.min(100, pct)) / 100);
    els.gaugeArc.style.stroke = pctColor(pct);
  }
  function initHeader() {
    els.modulePath.textContent = data.modulePath || '.';
    els.modulePath.title = data.modulePath || '.';
    updateHeadline();
  }
  function updateHeadline() {
    const s = allRunsActive()
      ? { covered: data.coveredStmts, total: data.totalStmts, percent: data.overallPct }
      : overallStats();
    els.overallPct.textContent = Math.round(s.percent) + '%';
    els.overallMeta.textContent = `${s.covered} / ${s.total} statements`;
    setGauge(s.percent);
  }

  /* ---------- view selector (segmented) ---------- */
  function moveIndicator() {
    const active = els.viewSelector.querySelector('.seg.active');
    if (!active) return;
    els.segIndicator.style.width = active.offsetWidth + 'px';
    els.segIndicator.style.transform = `translateX(${active.offsetLeft - 4}px)`;
  }
  function switchView(view) {
    currentView = view;
    saveState({ view });
    els.viewSelector.querySelectorAll('.seg').forEach(b => {
      const on = b.dataset.view === view;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    Object.entries(els.views).forEach(([k, v]) => v.classList.toggle('active', k === view));
    moveIndicator();
    if (view === 'treemap') renderTreemap();
    else { renderTree(); renderFileDetail(); }
  }
  function initViewSelector() {
    els.viewSelector.querySelectorAll('.seg').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    moveIndicator();
    window.addEventListener('resize', moveIndicator);
  }

  /* ---------- theme ---------- */
  function applyTheme(theme) {
    const light = theme === 'light';
    document.body.classList.toggle('theme-light', light);
    document.body.classList.toggle('theme-dark', !light);
  }
  function initTheme() {
    if (savedState.theme === 'light' || savedState.theme === 'dark') {
      applyTheme(savedState.theme);
    }
    els.themeToggle.addEventListener('click', () => {
      const light = document.body.classList.toggle('theme-light');
      document.body.classList.toggle('theme-dark', !light);
      saveState({ theme: light ? 'light' : 'dark' });
      if (currentView === 'treemap') renderTreemap();
    });
  }

  /* ---------- run filter dropdown ---------- */
  function runLabel() {
    if (allRunsActive()) return 'All runs';
    if (activeRuns.size === 0) return 'All runs';
    if (activeRuns.size === 1) {
      const r = data.runs.find(r => activeRuns.has(r.id));
      return r ? r.label : '1 run';
    }
    return `${activeRuns.size} runs`;
  }
  function refreshAll() {
    updateHeadline();
    if (currentView === 'treemap') renderTreemap();
    else { renderTree(); renderFileDetail(); }
  }
  function initRunFilter() {
    if (data.runs.length <= 1) { els.runFilter.style.display = 'none'; }
    data.runs.forEach(r => {
      const opt = document.createElement('label');
      opt.className = 'run-option';
      const checked = activeRuns.has(r.id) ? ' checked' : '';
      opt.innerHTML = `<input type="checkbox"${checked} value="${r.id}"><span class="ro-label">${esc(r.label)}</span>`;
      opt.querySelector('input').addEventListener('change', e => {
        if (e.target.checked) activeRuns.add(r.id); else activeRuns.delete(r.id);
        if (activeRuns.size === 0) {
          data.runs.forEach(x => activeRuns.add(x.id));
          els.runMenu.querySelectorAll('input').forEach(i => { i.checked = true; });
        }
        saveState({ runs: [...activeRuns] });
        els.runTriggerLabel.textContent = runLabel();
        refreshAll();
      });
      els.runMenu.appendChild(opt);
    });
    els.runTriggerLabel.textContent = runLabel();
    els.runTrigger.addEventListener('click', e => {
      e.stopPropagation();
      const open = els.runFilter.classList.toggle('open');
      els.runTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', e => {
      if (!els.runFilter.contains(e.target)) {
        els.runFilter.classList.remove('open');
        els.runTrigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- fuzzy matching (drives the live tree filter) ---------- */
  function fuzzyScore(query, target) {
    // subsequence match; returns {score, positions} or null
    const q = query.toLowerCase(), t = target.toLowerCase();
    let qi = 0, ti = 0, score = 0, streak = 0;
    const positions = [];
    while (qi < q.length && ti < t.length) {
      if (q[qi] === t[ti]) {
        positions.push(ti);
        streak++;
        score += 10 + streak * 4;
        if (ti === 0 || /[\/_.\-]/.test(t[ti - 1])) score += 15; // boundary bonus
        qi++;
      } else { streak = 0; }
      ti++;
    }
    if (qi < q.length) return null;
    score -= ti * 0.5; // prefer shorter / earlier matches
    return { score, positions };
  }

  function highlight(text, positions, offset) {
    let out = '', last = 0;
    const set = new Set(positions.map(p => p - offset));
    for (let i = 0; i < text.length; i++) {
      if (set.has(i)) {
        if (last < i) out += esc(text.slice(last, i));
        out += '<mark>' + esc(text[i]) + '</mark>';
        last = i + 1;
      }
    }
    out += esc(text.slice(last));
    return out;
  }

  // Returns the fuzzy match result for a file node against the active query,
  // or null when it doesn't match. Empty query matches everything.
  function fileMatch(node) {
    if (!treeQuery) return { positions: [] };
    const rel = (data.files[node.path] && data.files[node.path].relPath) || node.path;
    return fuzzyScore(treeQuery, rel);
  }

  function moveSelection(delta) {
    if (!visibleFileRows.length) return;
    let idx = visibleFileRows.findIndex(r => r.path === selectedFile);
    idx = idx < 0 ? (delta > 0 ? 0 : visibleFileRows.length - 1) : idx + delta;
    idx = Math.max(0, Math.min(visibleFileRows.length - 1, idx));
    selectedFile = visibleFileRows[idx].path;
    renderFileDetail();
    markActiveRow();
    const row = visibleFileRows[idx].row;
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }

  function initSearch() {
    const apply = () => {
      treeQuery = els.searchInput.value.trim();
      els.searchClear.hidden = !treeQuery;
      saveState({ query: treeQuery });
      if (currentView === 'treemap') renderTreemap();
      else renderTree();
    };
    // Restore a previously typed filter so the same files stay narrowed down.
    if (treeQuery) {
      els.searchInput.value = treeQuery;
      els.searchClear.hidden = false;
    }
    els.searchInput.addEventListener('input', apply);
    els.searchInput.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (!visibleFileRows.some(r => r.path === selectedFile)) moveSelection(1);
        els.searchInput.blur();
      } else if (e.key === 'Escape') {
        els.searchInput.value = ''; apply(); els.searchInput.blur();
      }
    });
    els.searchClear.addEventListener('click', () => {
      els.searchInput.value = ''; treeQuery = ''; els.searchClear.hidden = true;
      saveState({ query: '' });
      if (currentView === 'treemap') renderTreemap(); else renderTree();
      els.searchInput.focus();
    });
    document.addEventListener('keydown', e => {
      if (e.key === '/' && document.activeElement !== els.searchInput) {
        e.preventDefault(); els.searchInput.focus(); els.searchInput.select();
      }
    });
  }

  /* ---------- breadcrumb ---------- */
  function buildBreadcrumb(onClick) {
    const bc = document.createElement('div');
    bc.className = 'breadcrumb';
    treemapStack.forEach((n, i) => {
      if (i > 0) { const s = document.createElement('span'); s.className = 'sep'; s.textContent = '/'; bc.appendChild(s); }
      if (i === treemapStack.length - 1) {
        const cur = document.createElement('span');
        cur.className = 'crumb-current';
        cur.textContent = n.name || 'root';
        bc.appendChild(cur);
      } else {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = n.name || 'root';
        btn.addEventListener('click', () => onClick(i));
        bc.appendChild(btn);
      }
    });
    return bc;
  }

  /* ---------- treemap ---------- */
  // Packages are drawn as nested frames that physically surround their
  // sub-packages and files. Nesting depth is NOT fixed: a package keeps
  // unfolding its children inline for as long as there is enough room on
  // screen to show them. When a package gets too small to unfold it falls
  // back to a single colored cell with a "click to open" affordance.
  const SVGNS = 'http://www.w3.org/2000/svg';
  let tmClipSeq = 0;            // unique clip-path ids, reset on each full render
  const TM_MAX_DEPTH = 16;      // safety cap; the real limit is available pixels
  const TM_GAP = 8;             // gap between sibling cells
  const TM_MIN_NEST_W = 120;    // min size before a package stops unfolding inline
  const TM_MIN_NEST_H = 96;
  const TM_LABEL_W = 52;        // min cell size to show a text label
  const TM_LABEL_H = 24;
  const TM_GLYPH_MIN = 15;      // min cell size to show a "click to open" glyph

  // ---- Squarified weighting (log-scaled) ----
  // Codebases have extreme size variance (a core package may have tens of
  // thousands of statements while a sibling has ten), so sizing tiles by raw
  // counts makes the small ones vanish into slivers. Instead each tile's
  // *visual weight* is log-scaled and blends coverable statements (S) with the
  // file count (N):
  //     W = α·log10(S + 1) + β·log10(N + 1)
  // The `+ 1` avoids log10(0). Tiles are then sized in proportion to their
  // share of the total weight, and the long tail past TM_MAX_ITEMS is folded
  // into one synthetic "Others" tile so a level never dissolves into clutter.
  const TM_W_ALPHA = 0.8;       // weight given to statement count (size)
  const TM_W_BETA = 0.2;        // weight given to file count
  const TM_MAX_ITEMS = 20;      // max tiles per level before aggregating "Others"

  // Files are drawn as small rectangles sized to just fit their (truncated)
  // file name plus a file icon — not by statement count. Packages keep their
  // area encoding; files are uniform little chips so they read as "leaves".
  const FILE_CHIP_H = 23;       // fixed chip height
  const FILE_CHIP_GAP = 6;      // gap between chips
  const FILE_CHIP_MINW = 30;    // smallest chip (icon only)
  const FILE_CHIP_MAXW = 172;   // widest chip before the name gets truncated
  const CHIP_PADX = 7;          // horizontal padding inside a chip
  const CHIP_ICON = 13;         // icon box size inside a chip
  const CHIP_CHARW = 6.7;       // approx label width per character
  const MAX_FILE_STRIP_ROWS = 4; // file-strip rows when a package also has sub-packages

  // 24x24 stroke icons (same paths as the tree view) so files and packages are
  // visually distinguished inside the treemap: a document for files, a folder
  // for packages.
  const ICON_PATHS = {
    file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6'],
    folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  };
  function tmIcon(kind, x, y, size) {
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('transform', `translate(${x},${y}) scale(${size / 24})`);
    g.setAttribute('class', 'treemap-icon');
    ICON_PATHS[kind].forEach(d => {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', d);
      g.appendChild(p);
    });
    return g;
  }

  // Width a file chip needs to show its whole name (capped at FILE_CHIP_MAXW,
  // beyond which the name is truncated with an ellipsis).
  function tmChipWidth(name) {
    // +6 slack so a name that fits never gets truncated by a rounding/floor edge.
    const inner = CHIP_ICON + 4 + name.length * CHIP_CHARW + 6;
    return Math.round(Math.min(FILE_CHIP_MAXW, Math.max(FILE_CHIP_MINW, CHIP_PADX * 2 + inner)));
  }

  // Pack file chips into rows that fit within `w` (a simple wrap/flow layout).
  // Returns [{ items: [{file, w}], w }] in draw order.
  function packChips(files, w) {
    const rows = [];
    let cur = [], curW = 0;
    files.forEach(f => {
      const cw = tmChipWidth(f.name);
      if (cur.length && curW + FILE_CHIP_GAP + cw > w) { rows.push({ items: cur, w: curW }); cur = []; curW = 0; }
      curW += (cur.length ? FILE_CHIP_GAP : 0) + cw;
      cur.push({ file: f, w: cw });
    });
    if (cur.length) rows.push({ items: cur, w: curW });
    return rows;
  }

  // Surrounding frame thickness, generous near the top so a parent package
  // visibly wraps its children, tighter as we go deeper to conserve space.
  // (Mirrors go-cover-treemap's larger root `padding` vs. inner `padding-box`.)
  function tmPad(depth) {
    if (depth <= 0) return 24;
    if (depth === 1) return 18;
    if (depth === 2) return 13;
    return 10;
  }

  // Collapse single-child directory chains into one box, like go-cover-treemap's
  // `collapse-root`: a package that only contains another package is shown as
  // `parent/child` so we don't waste a whole nesting level (and padding) on it.
  function tmCollapse(node) {
    let cur = node;
    let name = node.name;
    while (cur.isDir) {
      const kids = (cur.children || []).filter(c => c.total > 0);
      if (kids.length === 1 && kids[0].isDir) {
        cur = kids[0];
        name = name + '/' + cur.name;
      } else break;
    }
    return cur === node ? node : { ...cur, name, orig: cur.orig };
  }

  function tmHeaderH(w, h) {
    if (w < 90 || h < 70) return 18;
    return 24;
  }

  function tmTrunc(s, w, perChar) {
    const max = Math.floor(w / perChar);
    if (max < 2) return '';
    return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
  }

  function tmCountLeaves(n) {
    if (!n.isDir) return 1;
    return (n.children || []).reduce((s, c) => s + (c.total > 0 ? tmCountLeaves(c) : 0), 0);
  }

  function layoutTreemap(items, x, y, w, h, horizontal) {
    if (!items.length) return [];
    if (items.length === 1) return [{ ...items[0], x, y, w, h }];
    const total = items.reduce((s, i) => s + i.value, 0);
    let acc = 0, split = 0;
    for (let i = 0; i < items.length; i++) { acc += items[i].value; if (acc >= total / 2) { split = i + 1; break; } }
    if (split === 0) split = 1;
    const left = items.slice(0, split), right = items.slice(split);
    const ratio = left.reduce((s, i) => s + i.value, 0) / total;
    const rects = [];
    if (horizontal) {
      const lw = w * ratio;
      rects.push(...layoutTreemap(left, x, y, lw, h, !horizontal));
      rects.push(...layoutTreemap(right, x + lw, y, w - lw, h, !horizontal));
    } else {
      const lh = h * ratio;
      rects.push(...layoutTreemap(left, x, y, w, lh, !horizontal));
      rects.push(...layoutTreemap(right, x, y + lh, w, h - lh, !horizontal));
    }
    return rects;
  }

  function drillInto(origNode) {
    treemapStack.push(origNode);
    renderTreemap();
  }
  function openFile(node) {
    selectedFile = node.path;
    switchView('files');
  }

  function tmRect(x, y, w, h, cls) {
    const r = document.createElementNS(SVGNS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', Math.max(0, w)); r.setAttribute('height', Math.max(0, h));
    r.setAttribute('rx', 4);
    if (cls) r.setAttribute('class', cls);
    return r;
  }
  function tmTitle(el, n) {
    const t = document.createElementNS(SVGNS, 'title');
    const lead = n.others ? `Others — ${n._count} smaller items folded together` : n.name;
    t.textContent = `${lead} — ${formatPct(n.percent)} (${n.covered}/${n.total})`;
    el.appendChild(t);
  }
  // Return a <g> clipped to the given rect, appended to `parent`. Anything drawn
  // into it is cropped to the rect instead of bleeding over a neighbour — the
  // safety net behind "hide it rather than show it weirdly".
  function tmClip(parent, x, y, w, h) {
    const id = 'tmclip-' + (tmClipSeq++);
    const cp = document.createElementNS(SVGNS, 'clipPath');
    cp.setAttribute('id', id);
    const r = document.createElementNS(SVGNS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', Math.max(0, w)); r.setAttribute('height', Math.max(0, h));
    cp.appendChild(r);
    parent.appendChild(cp);
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('clip-path', `url(#${id})`);
    parent.appendChild(g);
    return g;
  }
  // A "+" mark telling the user there is content to open inside a small cell.
  function tmPlus(cx, cy, r) {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', `M${cx - r} ${cy} H${cx + r} M${cx} ${cy - r} V${cy + r}`);
    p.setAttribute('class', 'treemap-glyph');
    return p;
  }
  // A small ">" chevron hinting "click to drill into this package".
  function tmChevron(x, y, s) {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', `M${x} ${y} l${s} ${s} l${-s} ${s}`);
    p.setAttribute('class', 'treemap-glyph');
    return p;
  }

  // Draw a single package cell that is too small to unfold (collapsed package).
  function tmDrawLeaf(svg, n, x, y, w, h) {
    const cw = Math.max(0, w - TM_GAP), ch = Math.max(0, h - TM_GAP);
    const isPkg = n.isDir && (n.children || []).some(c => c.total > 0);
    const g = document.createElementNS(SVGNS, 'g');
    const rect = tmRect(x, y, cw, ch, 'treemap-cell' + (n.isDir ? ' is-dir' : '') + (n.others ? ' treemap-others' : ''));
    rect.setAttribute('fill', tmColor(n.percent));
    rect.setAttribute('stroke', tmStrong(n.percent));
    tmTitle(rect, n);
    rect.addEventListener('click', () => { if (n.isDir) drillInto(n.orig); else openFile(n); });
    g.appendChild(rect);

    if (cw > TM_LABEL_W && ch > TM_LABEL_H) {
      let lx = x + 7;
      if (isPkg && cw > 70) {
        const ic = Math.min(14, ch - 6);
        g.appendChild(tmIcon('folder', x + 7, y + 6, ic));
        lx += ic + 5;
      }
      const t1 = document.createElementNS(SVGNS, 'text');
      t1.setAttribute('x', lx); t1.setAttribute('y', y + 18);
      t1.setAttribute('class', 'treemap-label');
      t1.textContent = tmTrunc(n.name, x + cw - 7 - lx, 7.6);
      g.appendChild(t1);
      if (ch > 46) {
        const subText = isPkg ? `${formatPct(n.percent)} · ${tmCountLeaves(n)} files` : formatPct(n.percent);
        const sub = tmTrunc(subText, cw - 14, 6.2);
        if (sub) {
          const t2 = document.createElementNS(SVGNS, 'text');
          t2.setAttribute('x', x + 7); t2.setAttribute('y', y + 35);
          t2.setAttribute('class', 'treemap-label sub');
          t2.textContent = sub;
          g.appendChild(t2);
        }
      }

      // Packages always advertise that there's more to open inside.
      if (isPkg && cw > 34) g.appendChild(tmChevron(x + cw - 13, y + 8, 4));
    } else if (isPkg && cw > TM_GLYPH_MIN && ch > TM_GLYPH_MIN) {
      // Too small for a label: still show that there's something to open.
      const r = Math.min(6, cw / 3.5, ch / 3.5);
      g.appendChild(tmPlus(x + cw / 2, y + ch / 2, r));
    }
    svg.appendChild(g);
  }

  // Draw a single file as a small rectangle just wide enough for its name,
  // prefixed with a file icon. The name is truncated with an ellipsis when the
  // chip is at its maximum width.
  function tmDrawFileChip(svg, n, x, y, w, h) {
    const g = document.createElementNS(SVGNS, 'g');
    const rect = tmRect(x, y, w, h, 'treemap-file');
    rect.setAttribute('rx', 4);
    rect.setAttribute('fill', tmColor(n.percent));
    rect.setAttribute('stroke', tmStrong(n.percent));
    tmTitle(rect, n);
    rect.addEventListener('click', () => openFile(n));
    g.appendChild(rect);

    let textX = x + CHIP_PADX;
    const iconSize = Math.min(CHIP_ICON, h - 8);
    if (w >= FILE_CHIP_MINW && iconSize >= 9) {
      g.appendChild(tmIcon('file', x + CHIP_PADX, y + (h - iconSize) / 2, iconSize));
      textX += iconSize + 4;
    }
    const avail = x + w - CHIP_PADX - textX;
    if (avail > 8) {
      const label = tmTrunc(n.name, avail, CHIP_CHARW);
      if (label) {
        const t = document.createElementNS(SVGNS, 'text');
        t.setAttribute('x', textX); t.setAttribute('y', y + h / 2);
        t.setAttribute('class', 'treemap-file-label');
        t.textContent = label;
        g.appendChild(t);
      }
    }
    svg.appendChild(g);
  }

  // A "+N" chip standing in for files that didn't fit, so a package with many
  // files visibly signals there is more than what is shown.
  function tmDrawMoreChip(svg, count, x, y, w, h, onClick) {
    const g = document.createElementNS(SVGNS, 'g');
    const rect = tmRect(x, y, w, h, 'treemap-more');
    rect.setAttribute('rx', 4);
    const title = document.createElementNS(SVGNS, 'title');
    title.textContent = `${count} more file${count === 1 ? '' : 's'} — click to open this package`;
    rect.appendChild(title);
    if (onClick) { rect.addEventListener('click', onClick); rect.style.cursor = 'pointer'; }
    g.appendChild(rect);
    const t = document.createElementNS(SVGNS, 'text');
    t.setAttribute('x', x + w / 2); t.setAttribute('y', y + h / 2);
    t.setAttribute('class', 'treemap-more-label');
    t.textContent = '+' + count;
    g.appendChild(t);
    svg.appendChild(g);
  }

  // Lay files out as small name-sized chips that wrap across rows within the
  // available area. When there are more files than fit, the last visible slot
  // becomes a "+N" overflow chip.
  function tmDrawFileFlow(svg, files, x, y, w, h, onMore) {
    if (w < FILE_CHIP_MINW || h < FILE_CHIP_H || !files.length) return;
    files = files.slice().sort((a, b) => a.name.localeCompare(b.name));
    const rowPitch = FILE_CHIP_H + FILE_CHIP_GAP;
    const maxRows = Math.max(1, Math.floor((h + FILE_CHIP_GAP) / rowPitch));

    let rows = packChips(files, w);
    let shown = rows.slice(0, maxRows);
    const shownCount = shown.reduce((s, r) => s + r.items.length, 0);
    let overflow = files.length - shownCount;
    if (overflow > 0) {
      // Carve room for a "+N" chip in the last visible row. Size it for the
      // worst-case digit count up front so it never grows (and spills) later,
      // and never let it be wider than the row itself.
      const digits = ('' + files.length).length;
      const moreW = Math.min(w, Math.max(FILE_CHIP_MINW, 16 + digits * CHIP_CHARW + CHIP_PADX * 2));
      const last = shown[shown.length - 1];
      const rowW = items => items.reduce((s, it, i) => s + (i ? FILE_CHIP_GAP : 0) + it.w, 0);
      // Drop trailing chips — down to an empty row if needed — until the "+N"
      // marker fits. This guarantees the row never extends past `w`.
      while (last.items.length && rowW(last.items) + FILE_CHIP_GAP + moreW > w) {
        last.items.pop();
        overflow++;
      }
      last.items.push({ more: overflow, w: moreW });
      last.w = rowW(last.items);
    }

    const usedH = shown.length * rowPitch - FILE_CHIP_GAP;
    let cy = y + Math.max(0, (h - usedH) / 2);
    shown.forEach(row => {
      let cx = x; // left aligned
      row.items.forEach(it => {
        if (it.more) tmDrawMoreChip(svg, it.more, cx, cy, it.w, FILE_CHIP_H, onMore);
        else tmDrawFileChip(svg, it.file, cx, cy, it.w, FILE_CHIP_H);
        cx += it.w + FILE_CHIP_GAP;
      });
      cy += rowPitch;
    });
  }

  // Draw a package as a frame that surrounds its children. The WHOLE rectangle
  // is filled with the package's coverage color; a label sits in the top band
  // and the children are laid out (and recursively unfolded) on top, each with
  // its own border so the separation between items stays visible.
  function tmDrawContainer(svg, n, x, y, w, h, depth) {
    const cw = Math.max(0, w - TM_GAP), ch = Math.max(0, h - TM_GAP);
    const headerH = tmHeaderH(cw, ch);
    const clickable = depth > 0;
    const g = document.createElementNS(SVGNS, 'g');

    const bg = tmRect(x, y, cw, ch, 'treemap-container' + (clickable ? ' tm-clickable' : '') + (n.others ? ' treemap-others' : ''));
    bg.setAttribute('fill', tmColor(n.percent));
    bg.setAttribute('stroke', tmStrong(n.percent));
    tmTitle(bg, n);
    g.appendChild(bg);

    const kids = (n.children || []).filter(c => c.total > 0);
    const dirs = kids.filter(c => c.isDir);
    const files = kids.filter(c => !c.isDir);

    // Folder icon marking this box as a package.
    let labelX = x + 8;
    const hIcon = Math.min(15, headerH - 5);
    if (cw > 64 && hIcon >= 10) {
      g.appendChild(tmIcon('folder', x + 8, y + (headerH - hIcon) / 2 - 1, hIcon));
      labelX += hIcon + 5;
    }

    const label = document.createElementNS(SVGNS, 'text');
    label.setAttribute('x', labelX); label.setAttribute('y', y + headerH - 7);
    label.setAttribute('class', 'treemap-header-label');
    const meta = files.length > 0 ? `  ${formatPct(n.percent)} · ${files.length}f` : `  ${formatPct(n.percent)}`;
    label.textContent = tmTrunc(`${n.name}${meta}`, x + cw - 14 - labelX, 7);
    g.appendChild(label);

    if (clickable) {
      const drill = () => drillInto(n.orig);
      bg.addEventListener('click', drill);
      label.addEventListener('click', drill);
      label.style.cursor = 'pointer';
      if (cw > 40) g.appendChild(tmChevron(x + cw - 14, y + headerH / 2 - 4, 4));
    }

    svg.appendChild(g);

    const pad = tmPad(depth);
    const bx = x + pad, by = y + headerH, bw = cw - pad * 2, bh = ch - headerH - pad;
    if (bw <= 2 || bh <= 2) return;
    const onMore = clickable ? () => drillInto(n.orig) : null;

    // Everything inside the package is drawn into a group clipped to the body,
    // so a child that ends up a hair too large is cropped rather than painting
    // over a sibling package.
    const body = tmClip(svg, bx, by, bw, bh);

    if (!dirs.length) {
      // Leaf package: just files, flowed as name-sized chips.
      tmDrawFileFlow(body, files, bx, by, bw, bh, onMore);
    } else if (!files.length) {
      // Only sub-packages: squarify them across the whole body.
      tmLayoutNodes(body, dirs, bx, by, bw, bh, depth + 1, n.path);
    } else {
      // Both: sub-packages fill the body, files sit in a strip at the bottom.
      const rows = packChips(files, bw);
      const wantRows = Math.min(rows.length, MAX_FILE_STRIP_ROWS);
      let stripH = wantRows * (FILE_CHIP_H + FILE_CHIP_GAP) - FILE_CHIP_GAP;
      stripH = Math.min(stripH, Math.max(0, bh * 0.5));
      const dirH = bh - stripH - FILE_CHIP_GAP;
      if (dirH >= TM_MIN_NEST_H * 0.5 && stripH >= FILE_CHIP_H) {
        tmLayoutNodes(body, dirs, bx, by, bw, dirH, depth + 1, n.path);
        tmDrawFileFlow(body, files, bx, by + dirH + FILE_CHIP_GAP, bw, stripH, onMore);
      } else {
        // Too cramped to split: give the whole body to the sub-packages.
        tmLayoutNodes(body, dirs, bx, by, bw, bh, depth + 1, n.path);
      }
    }
  }

  // Number of files a node represents: a leaf is one file, a package is its
  // count of coverable leaves (or an explicit override for synthetic nodes).
  function tmFileCount(n) {
    if (typeof n._files === 'number') return n._files;
    return n.isDir ? tmCountLeaves(n) : 1;
  }

  // Log-scaled visual weight  W = α·log10(S + 1) + β·log10(N + 1)  where S is
  // coverable statements and N is the file count. This compresses the codebase's
  // huge size variance so small packages stay legible next to large ones.
  function tmWeight(n) {
    const s = Math.max(0, n.total || 0);
    const nf = Math.max(0, tmFileCount(n));
    return TM_W_ALPHA * Math.log10(s + 1) + TM_W_BETA * Math.log10(nf + 1);
  }

  // Fold a list of small items into one synthetic "Others" package. Its raw
  // statements/files are the combined sums of its members, so its own weight is
  // computed exactly like a normal folder. It keeps the real members as children
  // so clicking it drills in to reveal them.
  function tmMakeOthers(rest, parentPath) {
    let total = 0, covered = 0, files = 0;
    rest.forEach(c => { total += c.total || 0; covered += c.covered || 0; files += tmFileCount(c); });
    const node = {
      isDir: true,
      others: true,
      name: 'Others',
      path: (parentPath || '') + '/\u2039others\u203a',
      children: rest,
      total, covered,
      percent: total > 0 ? (covered / total) * 100 : 0,
      _files: files,
      _count: rest.length,
    };
    node.orig = node;
    return node;
  }

  // Squarify a list of (coverable) nodes inside the given rect and draw each.
  // Tiles are ranked by log-scaled weight; everything past TM_MAX_ITEMS is
  // aggregated into a single "Others" tile, and each tile's area is made
  // proportional to its share of the total weight (A_i = A_total · W_i / ΣW_j).
  function tmLayoutNodes(svg, nodes, x, y, w, h, depth, parentPath) {
    if (w <= 2 || h <= 2) return;
    let coverable = nodes.filter(c => c.total > 0);
    if (!coverable.length) return;

    coverable = coverable.slice().sort((a, b) => tmWeight(b) - tmWeight(a));
    let display = coverable;
    if (coverable.length > TM_MAX_ITEMS) {
      // Keep the top (K-1) heaviest items and reserve the last slot for "Others".
      const top = coverable.slice(0, TM_MAX_ITEMS - 1);
      const others = tmMakeOthers(coverable.slice(TM_MAX_ITEMS - 1), parentPath);
      display = top.concat(others);
    }

    const items = display
      .map(c => ({ node: c.others ? c : tmCollapse(c), value: tmWeight(c) }))
      .sort((a, b) => b.value - a.value);
    const rects = layoutTreemap(items, x, y, w, h, w >= h);
    rects.forEach(r => tmDrawNode(svg, r.node, r.x, r.y, r.w, r.h, depth));
  }

  // Decide whether a package has room to keep unfolding inline, or should
  // collapse into a single clickable cell.
  function tmCanNest(n, w, h, depth) {
    if (depth >= TM_MAX_DEPTH || !n.isDir) return false;
    if (!(n.children || []).some(c => c.total > 0)) return false;
    return w >= TM_MIN_NEST_W && h >= TM_MIN_NEST_H;
  }

  function tmDrawNode(svg, n, x, y, w, h, depth) {
    if (tmCanNest(n, w, h, depth)) tmDrawContainer(svg, n, x, y, w, h, depth);
    else tmDrawLeaf(svg, n, x, y, w, h);
  }

  function renderTreemap() {
    const container = els.views.treemap;
    container.innerHTML = '';
    const node = treemapStack[treemapStack.length - 1];
    const filtered = pruneTreeByQuery(filterTree(node) || node);

    container.appendChild(buildBreadcrumb(i => { treemapStack = treemapStack.slice(0, i + 1); renderTreemap(); }));

    const hasItems = filtered && (filtered.children || []).some(c => c.total > 0);
    if (!hasItems) {
      const d = document.createElement('div');
      d.className = 'treemap-empty';
      d.textContent = treeQuery
        ? 'No files match “' + treeQuery + '”'
        : 'No coverable statements in this view.';
      container.appendChild(d);
      return;
    }

    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    container.appendChild(svg);

    // Size the coordinate system to the SVG's *actual* pixel box so one user
    // unit equals one screen pixel. Previously the viewBox height was guessed
    // from window.innerHeight while CSS sized the element via a clamp(), and
    // preserveAspectRatio:none stretched every cell (and its text) to bridge
    // the gap — which is what pushed labels out of their rectangles. Matching
    // the viewBox to the rendered size keeps geometry and truncation honest.
    const box = svg.getBoundingClientRect();
    const width = Math.max(320, Math.round(box.width || container.clientWidth || 960));
    const height = Math.max(320, Math.round(box.height || 560));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // The current root is the big enclosing frame; its sub-packages unfold
    // inside it, each holding their own sub-packages / file cells, as deep
    // as the available space allows.
    tmClipSeq = 0;
    tmDrawContainer(svg, tmCollapse(filtered), 0, 0, width, height, 0);
  }

  /* ---------- tree ---------- */
  const FOLDER_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>';
  const FILE_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path></svg>';
  const CHEV_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"></path></svg>';

  // Recursively render a node. Returns true when the node (or a descendant)
  // is part of the current filter, false when it should be pruned.
  function renderTreeNode(node, parentUl, depth) {
    if (node.isDir) {
      const childUl = document.createElement('ul');
      childUl.className = 'tree-list';
      let matched = false;
      (node.children || []).forEach(c => { if (renderTreeNode(c, childUl, depth + 1)) matched = true; });
      if (treeQuery && !matched) return false;

      const li = document.createElement('li');
      li.className = 'tree-item';
      const row = buildTreeRow(node, depth, false);
      const toggle = row.querySelector('.tree-toggle');
      const open = treeQuery ? true : depth < 1;
      childUl.style.display = open ? 'block' : 'none';
      toggle.classList.toggle('open', open);
      li.append(row, childUl);
      row.addEventListener('click', () => {
        const isOpen = childUl.style.display !== 'none';
        childUl.style.display = isOpen ? 'none' : 'block';
        toggle.classList.toggle('open', !isOpen);
      });
      parentUl.appendChild(li);
      return true;
    }

    const m = fileMatch(node);
    if (!m) return false;
    const li = document.createElement('li');
    li.className = 'tree-item';
    const row = buildTreeRow(node, depth, true, m.positions);
    if (node.path === selectedFile) row.classList.add('active');
    li.appendChild(row);
    row.addEventListener('click', () => {
      selectedFile = node.path;
      renderFileDetail();
      markActiveRow();
    });
    parentUl.appendChild(li);
    visibleFileRows.push({ path: node.path, row });
    return true;
  }

  function buildTreeRow(node, depth, isFile, positions) {
    const row = document.createElement('div');
    row.className = 'tree-row ' + (isFile ? 'is-file' : 'is-dir');
    row.style.paddingLeft = (0.6 + depth * 1.1) + 'rem';

    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle' + (isFile ? ' leaf' : '');
    if (!isFile) toggle.innerHTML = CHEV_SVG;

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.innerHTML = isFile ? FILE_SVG : FOLDER_SVG;

    const name = document.createElement('span');
    name.className = 'tree-name';
    if (isFile && treeQuery && positions && positions.length) {
      const rel = (data.files[node.path] && data.files[node.path].relPath) || node.path;
      name.innerHTML = highlight(node.name, positions, rel.length - node.name.length);
    } else {
      name.textContent = node.name;
    }

    const spacer = document.createElement('span');
    spacer.className = 'tree-spacer';

    const count = document.createElement('span');
    count.className = 'count-label';
    count.textContent = `${node.covered}/${node.total}`;

    const barWrap = document.createElement('div');
    barWrap.className = 'bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'bar-fill';
    bar.style.width = Math.max(0, Math.min(100, node.percent)) + '%';
    bar.style.background = pctColor(node.percent);
    barWrap.appendChild(bar);

    const pct = document.createElement('span');
    pct.className = 'pct-label';
    pct.textContent = formatPct(node.percent);
    pct.style.color = pctColor(node.percent);

    const meta = document.createElement('div');
    meta.className = 'tree-meta';
    meta.append(count, barWrap, pct);

    row.append(toggle, icon, name, spacer, meta);
    return row;
  }

  function markActiveRow() {
    visibleFileRows.forEach(r => r.row.classList.toggle('active', r.path === selectedFile));
  }

  // Offset the tree sidebar so its top lines up with the code block (the source
  // view) rather than the file header above it. Disabled on the stacked mobile
  // layout where the sidebar sits above the detail.
  function alignSidebar() {
    if (!els.fileHead || !els.explorerSidebar) return;
    if (window.innerWidth <= 860) { els.explorerSidebar.style.marginTop = ''; return; }
    const mb = parseFloat(getComputedStyle(els.fileHead).marginBottom) || 0;
    els.explorerSidebar.style.marginTop = (els.fileHead.offsetHeight + mb) + 'px';
  }

  function renderTree() {
    const container = els.treeScroll;
    container.innerHTML = '';
    visibleFileRows = [];

    const filtered = filterTree(data.tree);
    const ul = document.createElement('ul');
    ul.className = 'tree-list';
    if (filtered && filtered.children) filtered.children.forEach(c => renderTreeNode(c, ul, 0));

    if (treeQuery && !visibleFileRows.length) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = 'No files match “' + treeQuery + '”';
      container.appendChild(empty);
      return;
    }
    container.appendChild(ul);
  }
  function toggleAllTree(open) {
    els.treeScroll.querySelectorAll('.tree-item > .tree-list').forEach(ul => { ul.style.display = open ? 'block' : 'none'; });
    els.treeScroll.querySelectorAll('.tree-toggle:not(.leaf)').forEach(t => t.classList.toggle('open', open));
  }
  function initExplorer() {
    els.treeExpand.addEventListener('click', () => toggleAllTree(true));
    els.treeCollapse.addEventListener('click', () => toggleAllTree(false));
    els.explorerToggle.addEventListener('click', () => {
      const collapsed = els.explorer.classList.toggle('sidebar-collapsed');
      els.explorerToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  }

  /* ---------- file detail ---------- */
  function renderFileDetail() {
    if (!selectedFile) { selectedFile = Object.keys(data.files).sort()[0] || null; }
    if (selectedFile) saveState({ selectedFile });
    const file = selectedFile ? data.files[selectedFile] : null;
    const detail = selectedFile ? data.fileDetails[selectedFile] : null;

    if (!file) {
      els.fileName.textContent = 'No files';
      els.filePath.textContent = '';
      els.filePct.textContent = '';
      els.runBadges.innerHTML = '';
      els.sourceView.innerHTML = '<div class="source-empty">No files available.</div>';
      alignSidebar();
      return;
    }

    const rel = file.relPath || selectedFile;
    const slash = rel.lastIndexOf('/');
    els.fileName.textContent = slash >= 0 ? rel.slice(slash + 1) : rel;
    els.filePath.textContent = rel;
    const pct = file.totalStmts > 0 ? (fileCoveredStmts(file) / file.totalStmts) * 100 : 0;
    els.filePct.textContent = formatPct(pct);
    els.filePct.style.color = pctColor(pct);

    els.runBadges.innerHTML = '';
    data.runs.forEach(r => {
      const hit = file.runCoverage[r.id];
      const b = document.createElement('span');
      b.className = 'badge' + (hit ? ' hit' : '') + (activeRuns.has(r.id) ? '' : ' dim');
      b.textContent = (hit ? '✓ ' : '✗ ') + r.label;
      els.runBadges.appendChild(b);
    });

    els.sourceView.innerHTML = '';
    if (!detail || !detail.lines || !detail.lines.length) {
      els.sourceView.innerHTML = '<div class="source-empty">Source unavailable for this file.</div>';
      alignSidebar();
      return;
    }
    const frag = document.createDocumentFragment();
    detail.lines.forEach(line => {
      const row = document.createElement('div');
      row.className = 'source-line line-' + line.state;
      const num = document.createElement('span');
      num.className = 'line-num';
      num.textContent = line.num || '';
      const gutter = document.createElement('span');
      gutter.className = 'line-gutter';
      const code = document.createElement('span');
      code.className = 'line-code';
      code.innerHTML = line.html || '&nbsp;';
      row.append(num, gutter, code);
      frag.appendChild(row);
    });
    els.sourceView.appendChild(frag);
    markActiveRow();
    alignSidebar();
  }

  /* ---------- init ---------- */
  initHeader();
  initViewSelector();
  initTheme();
  initRunFilter();
  initExplorer();
  initSearch();
  syncLayoutVars();
  switchView(currentView);
  requestAnimationFrame(() => { moveIndicator(); syncLayoutVars(); });

  // Keep the sticky-stack metrics in sync as the chrome reflows (font scaling,
  // toolbar wrapping, run-filter visibility, etc.).
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(syncLayoutVars);
    [els.header, els.toolbar, els.footer].forEach(el => el && ro.observe(el));
  }

  // Re-pack the treemap on resize so it always shows as much as fits on screen.
  let tmResizeRAF = null;
  window.addEventListener('resize', () => {
    syncLayoutVars();
    if (currentView === 'files') { alignSidebar(); return; }
    if (currentView !== 'treemap') return;
    if (tmResizeRAF) cancelAnimationFrame(tmResizeRAF);
    tmResizeRAF = requestAnimationFrame(renderTreemap);
  });
})();
