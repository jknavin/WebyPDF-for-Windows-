/* WebyPDF Desktop – app shell: sidebar, router, home, tool screen, processing overlay, results, theme */
import {
  $, h, svgIcon, fmtBytes, toast, downloadBlob, friendlyError, openPdf, renderToCanvas, releaseCanvas,
} from './core.js';
import { TOOLS, CATS } from './tools.js';

const app = $('#app');
const byId = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
let current = null; // active tool session (for cleanup)
const home = { q: '', cat: 'all' };

const ICONS = {
  back: svgIcon('<path d="m15 18-6-6 6-6"/>', 20),
  up: svgIcon('<path d="m6 15 6-6 6 6"/>', 16),
  down: svgIcon('<path d="m6 9 6 6 6-6"/>', 16),
  x: svgIcon('<path d="M6 6l12 12M18 6 6 18"/>', 16),
  upload: svgIcon('<path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>', 30),
  download: svgIcon('<path d="M12 4v12m0 0-4-4m4 4 4-4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>', 18),
  share: svgIcon('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6"/>', 18),
  zip: svgIcon('<path d="M5 3h9l5 5v13H5z"/><path d="M11 3v2m2 2v2m-2 2v2m2 2v2"/>', 18),
  copy: svgIcon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', 18),
  check: svgIcon('<path d="m5 12 5 5 9-10"/>', 34, 'stroke-width="3"'),
  moon: svgIcon('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>', 20),
  sun: svgIcon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>', 20),
  lock: svgIcon('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 16),
  bolt: svgIcon('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', 16),
  wifi: svgIcon('<path d="M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01"/>', 16),
  free: svgIcon('<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>', 16),
};

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const tbPage = $('#tbPage');
const tbSep = $('#tbSep');
let homeRedraw = null;

/* ------------------------------------------------------------------ *
 *  Sidebar
 * ------------------------------------------------------------------ */
const sidenav = $('#sidenav');
const navInd = $('#navInd');
const navItems = new Map();
function buildSidebar() {
  const mk = (href, label, iconHtml, id, g) => {
    const a = h('a', { class: 'navitem', href, 'data-id': id, style: g ? { '--g1': g[0], '--g2': g[1] } : {} },
      h('span', { class: 'nicon', html: iconHtml }), h('span', { class: 'nlabel' }, label));
    navItems.set(id, a);
    return a;
  };
  sidenav.append(mk('#/', 'Home', svgIcon('<path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>', 18), 'home', ['#8b5cf6', '#ec4899']));
  CATS.filter(([k]) => k !== 'all').forEach(([k, label]) => {
    const list = TOOLS.filter((t) => t.cat === k);
    if (!list.length) return;
    sidenav.append(h('div', { class: 'navgroup', 'data-cat': k }, label));
    list.forEach((t) => sidenav.append(mk(`#/${t.id}`, t.name, t.icon, t.id, t.g)));
  });
}
function setActive(id) {
  navItems.forEach((a, k) => a.classList.toggle('on', k === id));
  const a = navItems.get(id);
  if (!a) { navInd.style.opacity = 0; return; }
  navInd.style.opacity = 1;
  navInd.style.height = `${a.offsetHeight}px`;
  navInd.style.transform = `translateY(${a.offsetTop}px)`;
  const box = sidenav.getBoundingClientRect();
  const r = a.getBoundingClientRect();
  if (r.top < box.top + 8 || r.bottom > box.bottom - 8) a.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function filterSidebar(q) {
  q = q.trim().toLowerCase();
  const cats = {};
  TOOLS.forEach((t) => {
    const hit = !q || `${t.name} ${t.desc} ${t.cat}`.toLowerCase().includes(q);
    navItems.get(t.id).hidden = !hit;
    if (hit) cats[t.cat] = true;
  });
  sidenav.querySelectorAll('.navgroup').forEach((g) => { g.hidden = !cats[g.dataset.cat]; });
  if (!q) setTimeout(() => setActive(activeId), 0);
}
let activeId = 'home';

/* ------------------------------------------------------------------ *
 *  Router
 * ------------------------------------------------------------------ */
function teardown() {
  if (current) { try { current.destroy(); } catch { /* ignore */ } current = null; }
  homeRedraw = null;
}
function route() {
  teardown();
  const m = location.hash.match(/^#\/([\w-]+)/);
  const t = m && byId[m[1]];
  app.replaceChildren();
  activeId = t ? t.id : 'home';
  if (t) {
    document.title = `${t.name} – WebyPDF`;
    tbPage.textContent = t.name; tbSep.hidden = false;
    openTool(t);
  } else {
    document.title = 'WebyPDF';
    tbPage.textContent = ''; tbSep.hidden = true;
    renderHome();
  }
  setActive(activeId);
  app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter');
  app.scrollTo(0, 0);
}
addEventListener('hashchange', route);

/* ------------------------------------------------------------------ *
 *  Home
 * ------------------------------------------------------------------ */
function greeting() {
  const hr = new Date().getHours();
  return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}

function renderHome() {
  const grid = h('div', { class: 'grid', role: 'list' });
  const empty = h('p', { class: 'empty glass', hidden: true }, 'No tools match your search. Try “merge”, “compress” or “sign”.');

  const draw = () => {
    const q = home.q.trim().toLowerCase();
    let n = 0;
    grid.replaceChildren(...TOOLS.filter((t) => (home.cat === 'all' || t.cat === home.cat) && (!q || `${t.name} ${t.desc} ${t.cat}`.toLowerCase().includes(q))).map((t) => {
      const i = n++;
      return h('a', { class: 'card tool glass rise', role: 'listitem', href: `#/${t.id}`, style: { '--g1': t.g[0], '--g2': t.g[1], '--i': Math.min(i, 14) } },
        h('span', { class: 'tile', html: t.icon }),
        h('span', { class: 'tname' }, t.name),
        h('span', { class: 'tdesc' }, t.desc));
    }));
    empty.hidden = n > 0;
  };
  homeRedraw = draw;

  const chips = h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Tool categories' }, CATS.map(([k, label]) => {
    const b = h('button', { type: 'button', role: 'tab', class: 'chip' + (home.cat === k ? ' on' : ''), onClick: () => { home.cat = k; chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); b.classList.add('on'); draw(); } }, label);
    return b;
  }));

  const quick = ['merge', 'split', 'compress', 'sign'].map((id) => byId[id]).filter(Boolean).map((t, i) =>
    h('a', { class: 'qcard rise', href: `#/${t.id}`, style: { '--g1': t.g[0], '--g2': t.g[1], '--i': i + 1 } },
      h('span', { class: 'tile big', html: t.icon }),
      h('span', { class: 'qtxt' }, h('b', {}, t.name), h('small', {}, t.desc)),
      h('span', { class: 'qarrow', html: svgIcon('<path d="m9 6 6 6-6 6"/>', 18) })));

  app.append(
    h('section', { class: 'dhero' },
      h('div', { class: 'dhero-txt' },
        h('p', { class: 'eyebrow' }, greeting()),
        h('h1', {}, 'What would you like to', h('br'), h('span', { class: 'grad' }, 'do with your PDFs?')),
        h('p', { class: 'sub' }, `${TOOLS.length} professional tools. Everything runs on this computer — nothing is uploaded, ever.`),
        h('ul', { class: 'badges' },
          h('li', { class: 'glass', html: `${ICONS.lock}<span>100% private</span>` }),
          h('li', { class: 'glass', html: `${ICONS.bolt}<span>Unlimited</span>` }),
          h('li', { class: 'glass', html: `${ICONS.wifi}<span>Works offline</span>` }))),
      h('div', { class: 'hero-art', 'aria-hidden': 'true' },
        h('div', { class: 'sheet s1' }, h('i'), h('i'), h('i'), h('i')),
        h('div', { class: 'sheet s2' }, h('i'), h('i'), h('i')),
        h('div', { class: 'sheet s3' }, h('b', {}, 'PDF')))),
    h('div', { class: 'quick' }, quick),
    h('div', { class: 'secthead' }, h('h2', {}, 'All tools'), chips),
    grid, empty);
  draw();
}

/* ------------------------------------------------------------------ *
 *  Tool screen
 * ------------------------------------------------------------------ */
function matchesKind(kind, f) {
  if (kind === 'pdf') return f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  if (kind === 'image') return f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif|svg|heic)$/i.test(f.name);
  return true;
}
const ACCEPT = { pdf: '.pdf,application/pdf', image: 'image/*', text: '' };
let seq = 0;

function openTool(tool) {
  const ctx = {
    files: [], opts: {}, state: {},
    bytes: async (f) => new Uint8Array(await f.file.arrayBuffer()),
    progress: (p, label) => { if (proc) proc.set(Math.min(1, Math.max(0, p)), label); },
  };
  let viewToken = 0;
  let busy = false;
  let proc = null;

  /* --- header --- */
  const head = h('div', { class: 'toolhead' },
    h('a', { class: 'back btn glass', href: '#/', 'aria-label': 'Back to all tools', html: ICONS.back }),
    h('span', { class: 'tile big', html: tool.icon, style: { '--g1': tool.g[0], '--g2': tool.g[1] } }),
    h('div', {}, h('h2', {}, tool.name), h('p', {}, tool.desc)));

  /* --- dropzone --- */
  const input = h('input', { type: 'file', accept: ACCEPT[tool.kind] || '', multiple: !!tool.multi, hidden: true });
  const noun = tool.kind === 'image' ? 'images' : 'PDF';
  const drop = h('div', { class: 'drop glass', tabindex: 0, role: 'button', 'aria-label': `Choose ${noun} ${tool.multi ? 'files' : 'file'}` },
    h('span', { class: 'dicon', html: ICONS.upload }),
    h('strong', {}, tool.multi ? `Drop ${noun === 'PDF' ? 'PDFs' : 'images'} here or click to browse` : 'Drop your PDF here or click to browse'),
    h('span', { class: 'hint' }, tool.multi ? 'You can add several files' : 'Processed on this computer — never uploaded'),
    h('span', { class: 'btn primary' }, tool.multi ? 'Choose files' : 'Choose file'),
    input);
  drop.addEventListener('click', (e) => { if (e.target !== input) input.click(); });
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
  input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });

  const listHost = h('div', { class: 'files' });
  const viewHost = h('div', { class: 'view' });
  const optHost = h('div');
  const bar = h('i');
  const plabel = h('span', {}, 'Working…');
  const progress = h('div', { class: 'progresswrap glass', hidden: true }, h('div', { class: 'ptext' }, plabel), h('div', { class: 'progress' }, bar));
  const resultHost = h('div');
  const runBtn = h('button', { type: 'button', class: 'btn primary lg', onClick: run }, tool.cta || 'Process');
  const actionbar = h('div', { class: 'actionbar glass' + (tool.flowBar ? ' flow' : '') }, runBtn);

  /* --- options --- */
  if (tool.fields && tool.fields.length) {
    const rows = tool.fields.map((f) => {
      ctx.opts[f.id] = f.value;
      let control;
      const set = (v) => { ctx.opts[f.id] = v; syncVisibility(); };
      if (f.type === 'select') {
        control = h('select', { onChange: (e) => set(e.target.value) }, f.options.map(([v, l]) => h('option', { value: v, selected: v === f.value }, l)));
      } else if (f.type === 'checkbox') {
        const cb = h('input', { type: 'checkbox', checked: !!f.value, onChange: (e) => set(e.target.checked) });
        return { f, el: h('label', { class: 'check wide' }, cb, h('span', {}, f.label)) };
      } else if (f.type === 'range') {
        const out = h('output', {}, `${f.value}${f.unit || ''}`);
        control = h('div', { class: 'rangewrap' }, h('input', { type: 'range', min: f.min, max: f.max, value: f.value, onInput: (e) => { out.textContent = `${e.target.value}${f.unit || ''}`; set(+e.target.value); } }), out);
      } else if (f.type === 'color') {
        control = h('input', { type: 'color', value: f.value, onInput: (e) => set(e.target.value) });
      } else {
        const attrs = { type: f.type === 'number' ? 'number' : 'text', value: f.value, placeholder: f.placeholder || '', autocomplete: 'off', onInput: (e) => set(f.type === 'number' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value) };
        if (f.type === 'number') Object.assign(attrs, { min: f.min, max: f.max, inputMode: 'decimal' });
        if (f.maxLength) attrs.maxLength = f.maxLength;
        control = h('input', attrs);
      }
      return { f, el: h('label', { class: 'field' }, h('span', { class: 'lbl' }, f.label), control, f.hint ? h('span', { class: 'hint' }, f.hint) : null) };
    });
    const syncVisibility = () => rows.forEach(({ f, el }) => { el.hidden = f.showIf ? !f.showIf(ctx.opts) : false; });
    optHost.append(h('div', { class: 'panel glass' }, h('div', { class: 'panel-head' }, h('h3', {}, 'Options')), h('div', { class: 'fields' }, rows.map((r) => r.el))));
    syncVisibility();
  }

  /* --- file handling --- */
  function addFiles(list) {
    if (busy) return;
    const ok = list.filter((f) => matchesKind(tool.kind, f));
    const skipped = list.length - ok.length;
    if (skipped) toast(`Skipped ${skipped} file${skipped > 1 ? 's' : ''} — ${tool.kind === 'pdf' ? 'only PDF files are accepted here' : 'only image files are accepted here'}`, 'warn');
    if (!ok.length) return;
    if (ok.some((f) => f.size > 250 * 1024 * 1024)) toast('Very large file — this may be slow on phones.', 'warn');
    resultHost.replaceChildren();
    const make = (file) => ({ id: ++seq, file, name: file.name, size: file.size, url: tool.kind === 'image' ? URL.createObjectURL(file) : null });
    if (tool.multi) ctx.files.push(...ok.map(make));
    else { clearFiles(); ctx.files = [make(ok[0])]; }
    renderFiles();
    if (!tool.multi) mountView();
    if (tool.multi && ctx.files.length) setTimeout(() => actionbar.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80);
  }
  function clearFiles() {
    ctx.files.forEach((f) => f.url && URL.revokeObjectURL(f.url));
    ctx.files = [];
    if (ctx.state.cleanup) { try { ctx.state.cleanup(); } catch { /* ignore */ } }
    ctx.state = {};
    viewHost.replaceChildren();
  }
  function renderFiles() {
    const has = ctx.files.length > 0;
    listHost.replaceChildren(...ctx.files.map((f, i) => {
      const thumb = f.url ? h('img', { class: 'fthumb', src: f.url, alt: '' }) : h('span', { class: 'fthumb pdf' }, 'PDF');
      const btn = (icon, label, fn, dis) => h('button', { type: 'button', class: 'mini', 'aria-label': label, title: label, disabled: dis, onClick: fn, html: icon });
      const isNew = !f._seen; f._seen = true;
      return h('div', { class: 'file glass' + (isNew ? ' new' : '') }, thumb,
        h('div', { class: 'fmeta' }, h('span', { class: 'fname' }, f.name), h('span', { class: 'fsize' }, fmtBytes(f.size))),
        h('div', { class: 'fctl' },
          tool.ordered && ctx.files.length > 1 ? [
            btn(ICONS.up, 'Move up', () => { [ctx.files[i - 1], ctx.files[i]] = [ctx.files[i], ctx.files[i - 1]]; renderFiles(); }, i === 0),
            btn(ICONS.down, 'Move down', () => { [ctx.files[i + 1], ctx.files[i]] = [ctx.files[i], ctx.files[i + 1]]; renderFiles(); }, i === ctx.files.length - 1),
          ] : null,
          btn(ICONS.x, 'Remove', (ev) => {
            const row = ev.currentTarget.closest('.file');
            if (row) row.classList.add('out');
            setTimeout(() => {
              const idx = ctx.files.indexOf(f);
              if (idx < 0) return;
              if (f.url) URL.revokeObjectURL(f.url);
              ctx.files.splice(idx, 1);
              if (!tool.multi) { clearFiles(); }
              renderFiles();
              resultHost.replaceChildren();
            }, row ? 200 : 0);
          })));
    }));
    if (tool.multi) {
      const need = tool.min || 1;
      listHost.append(...(ctx.files.length && ctx.files.length < need ? [h('p', { class: 'hint center' }, `Add at least ${need} files.`)] : []));
      if (has) listHost.append(h('button', { type: 'button', class: 'btn sm addmore', onClick: () => input.click() }, '+ Add more files'));
    }
    drop.hidden = tool.multi ? false : has;
    if (tool.multi) drop.classList.toggle('compact', has);
    actionbar.hidden = tool.noFiles ? false : !has;
    optHost.hidden = tool.noFiles ? false : !has;
  }
  async function mountView() {
    if (!tool.view) return;
    const token = ++viewToken;
    try {
      await tool.view(viewHost, ctx);
    } catch (e) {
      if (token !== viewToken) return;
      viewHost.replaceChildren(h('div', { class: 'panel glass error' }, h('strong', {}, 'Couldn’t open this PDF'), h('p', {}, friendlyError(e)), h('button', { type: 'button', class: 'btn sm', onClick: () => { clearFiles(); renderFiles(); } }, 'Choose another file')));
      actionbar.hidden = true;
      console.error(e);
    }
  }

  /* --- run --- */
  async function run() {
    if (busy) return;
    const need = tool.noFiles ? 0 : (tool.min || 1);
    if (ctx.files.length < need) { toast(`Add at least ${need} file${need > 1 ? 's' : ''} first`, 'warn'); return; }
    busy = true;
    resultHost.replaceChildren();
    runBtn.disabled = true; runBtn.classList.add('busy');
    proc = showProc(tool); ctx.progress(0.02, 'Starting…');
    try {
      const res = await tool.run(ctx);
      ctx.progress(1, 'Finishing…');
      await proc.done(); proc = null;
      await showResult(res);
    } catch (e) {
      if (proc) { await proc.fail(); proc = null; }
      console.error(e);
      const msg = friendlyError(e);
      resultHost.replaceChildren(h('div', { class: 'panel glass error', role: 'alert' }, h('strong', {}, 'That didn’t work'), h('p', {}, msg)));
      toast(msg.length > 90 ? 'Something went wrong — see details below' : msg, 'error', 5000);
      resultHost.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      busy = false; runBtn.disabled = false; runBtn.classList.remove('busy');
    }
  }

  async function showResult(res) {
    const { files, note, text } = res;
    const rows = files.map((f) => h('div', { class: 'file glass' },
      h('span', { class: 'fthumb pdf ' + (/\.pdf$/i.test(f.name) ? '' : 'alt') }, (f.name.split('.').pop() || '').slice(0, 4).toUpperCase()),
      h('div', { class: 'fmeta' }, h('span', { class: 'fname' }, f.name), h('span', { class: 'fsize' }, fmtBytes(f.blob.size))),
      h('button', { type: 'button', class: 'btn primary sm', onClick: () => downloadBlob(f.blob, f.name), html: `${ICONS.download}<span>Download</span>` })));

    const actions = h('div', { class: 'toolbar center' });
    if (files.length > 1) {
      actions.append(h('button', { type: 'button', class: 'btn primary', html: `${ICONS.zip}<span>Download all (.zip)</span>`, onClick: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try {
          const zip = new JSZip();
          const used = new Set();
          for (const f of files) { let n = f.name, k = 1; while (used.has(n)) n = f.name.replace(/(\.[^.]+)?$/, `-${++k}$1`); used.add(n); zip.file(n, f.blob); }
          downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), `webypdf-${tool.id}.zip`);
        } catch (err) { toast(friendlyError(err), 'error'); } finally { b.disabled = false; }
      } }));
    }
    try {
      const shareFiles = files.map((f) => new File([f.blob], f.name, { type: f.blob.type }));
      if (navigator.canShare && navigator.canShare({ files: shareFiles }) && files.length <= 10) {
        actions.append(h('button', { type: 'button', class: 'btn', html: `${ICONS.share}<span>Share</span>`, onClick: () => navigator.share({ files: shareFiles }).catch(() => {}) }));
      }
    } catch { /* sharing unsupported */ }
    actions.append(h('button', { type: 'button', class: 'btn', onClick: reset }, 'Start over'));

    const preview = h('div', { class: 'previewwrap' });
    const card = h('div', { class: 'panel glass success', role: 'status' },
      h('div', { class: 'okrow' }, h('span', { class: 'okicon', html: ICONS.check }), h('div', {}, h('h3', {}, files.length > 1 ? `${files.length} files ready` : 'Your file is ready'), note ? h('p', { class: 'note' }, note) : null)),
      preview,
      files.length > 12 ? h('details', {}, h('summary', {}, `Show all ${files.length} files`), h('div', { class: 'files' }, rows)) : h('div', { class: 'files' }, rows),
      text ? textBox(text) : null,
      actions);
    resultHost.replaceChildren(card);
    actionbar.hidden = true;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.querySelectorAll('.file').forEach((el, i) => { el.style.setProperty('--i', i); el.classList.add('rise'); });

    // small first-page preview for PDF outputs
    const first = files.find((f) => /\.pdf$/i.test(f.name));
    if (first && first.blob.size < 120 * 1024 * 1024) {
      try {
        const pdf = await openPdf(new Uint8Array(await first.blob.arrayBuffer()));
        const page = await pdf.getPage(1);
        const v1 = page.getViewport({ scale: 1 });
        const c = await renderToCanvas(page, Math.min(1.2, 360 / v1.width));
        c.className = 'preview'; c.setAttribute('aria-label', 'First page preview');
        preview.append(c);
        pdf.destroy();
      } catch { /* preview is optional */ }
    }
    if (files.some((f) => f.name.endsWith('.jpg') || f.name.endsWith('.png'))) {
      const imgs = files.slice(0, 3);
      preview.classList.add('multi');
      imgs.forEach((f) => preview.append(h('img', { class: 'preview', src: URL.createObjectURL(f.blob), alt: '', onLoad: (e) => setTimeout(() => URL.revokeObjectURL(e.target.src), 5000) })));
    }
  }

  function textBox(text) {
    const ta = h('textarea', { readOnly: true, rows: 9, value: text.length > 60000 ? `${text.slice(0, 60000)}\n\n… (preview truncated — download the file for the full text)` : text });
    return h('div', { class: 'textout' }, ta, h('div', { class: 'toolbar' }, h('button', { type: 'button', class: 'btn sm', html: `${ICONS.copy}<span>Copy text</span>`, onClick: async () => { try { await navigator.clipboard.writeText(text); toast('Copied to clipboard', 'ok'); } catch { ta.select(); document.execCommand('copy'); toast('Copied', 'ok'); } } })));
  }

  function reset() {
    clearFiles();
    resultHost.replaceChildren();
    renderFiles();
    if (tool.noFiles) mountView();
    app.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* --- assemble --- */
  app.append(h('section', { class: 'toolpage' }, head, tool.noFiles ? null : drop, listHost, viewHost, optHost, progress, resultHost, actionbar));
  renderFiles();
  if (tool.noFiles) { optHost.hidden = false; actionbar.hidden = false; mountView(); }

  current = { destroy: () => { viewToken++; clearFiles(); if (proc) proc = null; }, addFiles, pick: () => { if (!busy && !drop.hidden) input.click(); }, run: () => { if (!actionbar.hidden) run(); } };
}

/* ------------------------------------------------------------------ *
 *  Processing overlay – animated ring, live percentage, success morph
 * ------------------------------------------------------------------ */
const procHost = $('#proc');
function showProc(tool) {
  const C = 2 * Math.PI * 54;
  const start = performance.now();
  procHost.replaceChildren();
  const stage = h('p', { class: 'pstage' }, 'Starting…');
  const ring = h('div', { class: 'ringwrap' });
  ring.innerHTML = `<svg viewBox="0 0 140 140" class="ring" aria-hidden="true"><defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset=".5" stop-color="#8b5cf6"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs><circle class="rtrack" cx="70" cy="70" r="54"/><circle class="rbar" cx="70" cy="70" r="54"/></svg><i class="orbit"><b></b></i><div class="rcenter"><span class="rpct">0%</span><svg class="rcheck" viewBox="0 0 52 52" aria-hidden="true"><path d="M14 27l8 8 16-18"/></svg></div>`;
  const rbar = ring.querySelector('.rbar');
  const rpct = ring.querySelector('.rpct');
  rbar.style.strokeDasharray = C; rbar.style.strokeDashoffset = C;
  const card = h('div', { class: 'pcard glass', role: 'status' },
    h('span', { class: 'ptile tile', html: tool.icon, style: { '--g1': tool.g[0], '--g2': tool.g[1] } }),
    ring, h('h3', { class: 'ptitle' }, tool.name), stage,
    h('div', { class: 'pdots' }, h('i'), h('i'), h('i')));
  procHost.append(card);
  procHost.hidden = false;
  procHost.classList.remove('leave');
  requestAnimationFrame(() => procHost.classList.add('on'));

  let target = 0; let shown = 0; let raf = 0; let lastLabel = 'Starting…';
  const tick = () => {
    shown += (target - shown) * 0.14;
    if (Math.abs(target - shown) < 0.002) shown = target;
    rbar.style.strokeDashoffset = C * (1 - shown);
    rpct.textContent = `${Math.round(shown * 100)}%`;
    if (shown !== target) raf = requestAnimationFrame(tick); else raf = 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

  return {
    set(p, label) {
      target = Math.max(target, p);
      if (label && label !== lastLabel) {
        lastLabel = label; stage.textContent = label;
        stage.classList.remove('swap'); void stage.offsetWidth; stage.classList.add('swap');
      }
      kick();
    },
    async done() {
      target = 1; kick();
      const wait = Math.max(500, 1000 - (performance.now() - start));
      await delay(wait);
      stage.textContent = 'All done!';
      stage.classList.remove('swap'); void stage.offsetWidth; stage.classList.add('swap');
      card.classList.add('ok');
      const burst = h('div', { class: 'burst' }, Array.from({ length: 12 }, (_, i) => h('i', { style: { '--a': `${i * 30}deg`, '--d': `${i % 2 ? 46 : 62}px` } })));
      ring.querySelector('.rcenter').append(burst);
      await delay(950);
      procHost.classList.add('leave'); procHost.classList.remove('on');
      await delay(280);
      procHost.hidden = true; procHost.replaceChildren();
    },
    async fail() {
      cancelAnimationFrame(raf);
      card.classList.add('err');
      stage.textContent = 'Something went wrong';
      await delay(650);
      procHost.classList.add('leave'); procHost.classList.remove('on');
      await delay(260);
      procHost.hidden = true; procHost.replaceChildren();
    },
  };
}

/* ------------------------------------------------------------------ *
 *  Theme
 * ------------------------------------------------------------------ */
const themeBtn = $('#themeBtn');
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  themeBtn.innerHTML = t === 'dark' ? ICONS.sun : ICONS.moon;
  themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  try { window.desktop && window.desktop.setTheme(t); } catch { /* not in the desktop shell */ }
}
applyTheme(document.documentElement.dataset.theme || 'dark');
themeBtn.addEventListener('click', () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(t);
  try { localStorage.setItem('webypdf-theme', t); } catch { /* ignore */ }
});

/* ------------------------------------------------------------------ *
 *  Sidebar search, shortcuts, global drag & drop, button ripple
 * ------------------------------------------------------------------ */
const sideSearch = $('#sideSearch');
sideSearch.addEventListener('input', () => {
  home.q = sideSearch.value;
  filterSidebar(sideSearch.value);
  if (homeRedraw) homeRedraw();
  else if (sideSearch.value.trim() && activeId !== 'home') location.hash = '#/';
});

addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); sideSearch.focus(); sideSearch.select(); }
  else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); current && current.pick(); }
  else if (mod && e.key === 'Enter') { e.preventDefault(); current && current.run(); }
  else if (e.key === 'Escape') {
    if (document.activeElement === sideSearch && sideSearch.value) { sideSearch.value = ''; sideSearch.dispatchEvent(new Event('input')); }
    else if (!procHost.hidden) { /* busy – ignore */ }
    else if (location.hash.length > 2) location.hash = '#/';
  }
});

let dragDepth = 0;
addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
  if (e.target.closest && e.target.closest('.drop')) return; // the drop zone handles its own files
  const files = [...(e.dataTransfer ? e.dataTransfer.files : [])];
  if (files.length && current) current.addFiles(files);
  else if (files.length) toast('Open a tool first, then drop your files', 'warn');
});

addEventListener('pointerdown', (e) => {
  const b = e.target.closest && e.target.closest('.btn, .qcard, .navitem, .chip, .mini');
  if (!b || b.disabled) return;
  const r = b.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * 1.6;
  const rp = h('span', { class: 'ripple', style: { width: `${d}px`, height: `${d}px`, left: `${e.clientX - r.left - d / 2}px`, top: `${e.clientY - r.top - d / 2}px` } });
  b.append(rp);
  setTimeout(() => rp.remove(), 650);
}, { passive: true });

if (window.desktop && window.desktop.onSaved) {
  window.desktop.onSaved((p) => {
    const t = h('div', { class: 'toast ok' }, h('span', {}, `Saved · ${p.split(/[\\/]/).pop()}`),
      h('button', { type: 'button', class: 'toastbtn', onClick: () => window.desktop.reveal(p) }, 'Show in folder'));
    $('#toasts').append(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, 7000);
  });
}

buildSidebar();
route();
