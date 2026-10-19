/* pianoforge — jogo de piano no browser. Sem dependências: corre em qualquer alojamento estático.
   Entrada: piano por Web MIDI (cabo USB), microfone (deteção de altura), teclado do computador ou toque no ecrã. */
'use strict';
const $ = s => document.querySelector(s);
const LEVELS = { licao: 'Chord lesson', acordes: 'Chords', facil: 'Beginner', medio: 'Intermediate', dificil: 'Advanced', completo: 'Full', arr: 'AI arranged', ia: 'AI test' };
const LEVEL_ORDER = Object.keys(LEVELS);
const LETTERS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const SOLFA = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = m => BLACK.has(((m % 12) + 12) % 12);
const AVATARS = ['🦊', '🐱', '🐻', '🐼', '🦄', '🐸', '🐯', '🐰', '🦉', '🐙', '🐶', '🦁'];
// cor por nota (os sustenidos usam a cor da nota de baixo)
const PCOL = ['#e4505e', '#e4505e', '#f08a3c', '#f08a3c', '#eebb3a', '#5bb45d', '#5bb45d', '#25a8a0', '#25a8a0', '#3f7fd8', '#3f7fd8', '#8b5ed6'];
const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const pc = m => ((m % 12) + 12) % 12;
// nome da nota: letras (C D E) ou Dó Ré Mi, à escolha
const noteName = m => ((P && P.settings && P.settings.label === 'solfege') || (!P?.settings && me?.settings?.label === 'solfege') ? SOLFA : LETTERS)[pc(m)];
const dia = m => (Math.floor(m / 12) - 1) * 7 + LETTER[pc(m)]; // Dó4 = 28; linhas: sol E4..F5 = 30..38, fá G2..A3 = 18..26
// cor por dedo: 1 polegar, 2 indicador, 3 médio, 4 anelar, 5 mindinho
const FCOL = [null, '#e4505e', '#f08a3c', '#eebb3a', '#5bb45d', '#8b5ed6'];
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const whiteMidi = d => 12 * (Math.floor(d / 7) + 1) + WHITE[((d % 7) + 7) % 7];
const colOf = n => (P.settings && P.settings.colorBy === 'note') ? PCOL[pc(n.m)] : FCOL[n.f || 1];
const inkOn = c => (c === '#eebb3a' ? '#141414' : '#fff');
const COL = { R: '#ef6a43', L: '#1fa896', auto: '#6b6b68', star: '#e2b13c', good: '#3fb26a', bad: '#e5485a', press: '#9db4ff' };

// ---------- guardar (localStorage pode falhar) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('pf_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pf_' + k, JSON.stringify(v)); } catch { } },
};
const DEFAULT_SETTINGS = { src: 'original', accomp: true, colorBy: 'finger', label: 'letters', notation: 'bars', music: 0.8, guide: true, view: 'staff', mode: 'rhythm', speed: 0.7, hands: 'both', names: true, sound: true, metro: false, hints: true };
let profiles = store.get('profiles', [
  { id: 'p1', name: 'Nuno', avatar: '🦊', level: 'medio', best: {} },
  { id: 'p2', name: 'Daughter', avatar: '🐱', level: 'facil', best: {} },
]);
let me = null;
const saveProfiles = () => store.set('profiles', profiles);

function toast(msg, ms = 3500) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id));
}
const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);
// jogadores: iniciais num círculo (cores sóbrias, fixas por jogador)
const AV_COLORS = ['#141414', '#1c6f66', '#9a4a2e', '#3d4f7a', '#6d5a2c', '#5b3d63'];
const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const avHtml = p => `<span class="av" style="background:${AV_COLORS[[...p.id].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length]}">${initials(p.name)}</span>`;
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z" class="fill"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="7" y="5.5" width="3.4" height="13" rx="1" class="fill"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1" class="fill"/></svg>',
  staff: '<svg viewBox="0 0 24 24"><path d="M3 7h18M3 10h18M3 13h18M3 16h18"/></svg>',
  fall: '<svg viewBox="0 0 24 24"><path d="M6 3v8M12 3v12M18 3v5"/><path d="M3 19h18"/></svg>',
};
const fmtTime = s => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

// ---------- 1. perfis ----------
function renderProfiles() {
  const el = $('#profile-list'); el.innerHTML = '';
  profiles.forEach(p => {
    const nStars = Object.values(p.best || {}).reduce((a, b) => a + (b.stars || 0), 0);
    const d = document.createElement('div');
    d.className = 'profile'; d.tabIndex = 0;
    d.innerHTML = `<button class="edit" title="Rename">Edit</button>${avHtml(p)}<div class="nm"></div>
      <div class="lv">${LEVELS[p.level] || ''}</div><div class="st">${nStars ? '★ ' + nStars + (nStars === 1 ? ' star' : ' stars') : ''}</div>`;
    d.querySelector('.nm').textContent = p.name;
    d.querySelector('.av').textContent = initials(p.name);
    d.onclick = e => {
      if (e.target.classList.contains('edit')) {
        e.stopPropagation();
        const n = prompt('Name:', p.name); if (n && n.trim()) p.name = n.trim().slice(0, 20);
        saveProfiles(); renderProfiles(); return;
      }
      choose(p);
    };
    el.appendChild(d);
  });
  if (profiles.length < 6) {
    const a = document.createElement('button'); a.className = 'profile add'; a.textContent = '+ New player';
    a.onclick = () => {
      const n = prompt('New player name:'); if (!n || !n.trim()) return;
      profiles.push({ id: 'p' + Date.now(), name: n.trim().slice(0, 20), avatar: AVATARS[profiles.length % AVATARS.length], level: 'facil', best: {} });
      saveProfiles(); renderProfiles();
    };
    el.appendChild(a);
  }
}
function choose(p) {
  me = p; p.settings = Object.assign({}, DEFAULT_SETTINGS, p.settings || {});
  // 17 out: o Nuno quer que a música nunca pare -> Ritmo passa a ser o modo normal
  if (!p.settings.v2) { p.settings.mode = 'rhythm'; p.settings.v2 = true; }
  store.set('last', p.id); saveProfiles();
  $('#who').innerHTML = `${avHtml(p)}<span class="wn"></span><small>switch</small>`; $('#who .wn').textContent = p.name;
  show('scr-library'); loadLibrary();
}
$('#who').onclick = () => { show('scr-profiles'); renderProfiles(); };

// ---------- 2. biblioteca ----------
let API = false, LIB = [], newSong = null;
// músicas juntadas no telemóvel (ficheiro MIDI) ficam guardadas só neste aparelho (IndexedDB)
const IDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((ok, no) => {
      try {
        const r = indexedDB.open('pianoforge', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('songs', { keyPath: 'id' });
        r.onsuccess = () => ok(this.db = r.result); r.onerror = () => no(r.error);
      } catch (e) { no(e); }
    });
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((ok, no) => { const t = db.transaction('songs', mode), st = t.objectStore('songs'), r = fn(st); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); });
  },
  all() { return this.tx('readonly', st => st.getAll()).catch(() => []); },
  get(id) { return this.tx('readonly', st => st.get(id)); },
  put(song) { return this.tx('readwrite', st => st.put(song)); },
  del(id) { return this.tx('readwrite', st => st.delete(id)); },
};
async function loadLibrary() {
  try { LIB = (await (await fetch('songs/index.json', { cache: 'no-store' })).json()).songs; } catch { LIB = []; }
  let local = (await IDB.all()) || [];
  const onSite = new Set(LIB.map(s => s.id));
  for (const x of local) if (x.cloudCopy && onSite.has(x.id)) await IDB.del(x.id);
  local = local.filter(x => !(x.cloudCopy && onSite.has(x.id)));
  LIB = local.sort((a, b) => b.added - a.added).map(x => ({ id: x.id, title: x.title, duration: x.duration, local: true, credit: x.cloudCopy ? 'new · syncing to the site' : 'MIDI file · this device only',
    counts: Object.fromEntries(Object.entries(x.levels).map(([k, v]) => [k, v.notes.length])) })).concat(LIB);
  renderLibrary();
}
// categoria de cada música (separadores da biblioteca)
const catOf = s => !s.builtin ? 'mine' : String(s.id).startsWith('mutopia-') ? 'classic' : 'kids';
const CATS = [['all', 'All'], ['mine', 'My songs'], ['classic', 'Classical'], ['kids', 'Children']];
let libTab = store.get('libTab', 'all'), libQuery = '';
function renderTabs() {
  const n = k => k === 'all' ? LIB.length : LIB.filter(s => catOf(s) === k).length;
  if (libTab !== 'all' && !n(libTab)) libTab = 'all';
  $('#lib-tabs').innerHTML = CATS.filter(([k]) => n(k)).map(([k, t]) => `<button data-k="${k}" class="${k === libTab ? 'on' : ''}">${t}<b>${n(k)}</b></button>`).join('');
}
$('#lib-tabs').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  libTab = b.dataset.k; store.set('libTab', libTab); renderTabs(); filterLib(libQuery);
};
function renderLibrary() {
  const el = $('#songs'); el.innerHTML = '';
  renderTabs();
  if (!LIB.length) el.innerHTML = '<p class="empty">No songs yet.</p>';
  LIB.forEach((s, idx) => {
    const card = document.createElement('div');
    card.className = 'song' + (s.id === newSong ? ' new' : ''); card.dataset.cat = catOf(s);
    card.style.animationDelay = Math.min(idx, 12) * 25 + 'ms';
    let lvl = me.levelBySong?.[s.id] || me.level;
    const avail = LEVEL_ORDER.filter(k => k === 'licao' || !s.counts || s.counts[k] != null);
    if (!avail.includes(lvl)) lvl = avail.includes('facil') ? 'facil' : avail[0];
    const levelBtns = avail.map(k => {
      const b = me.best[s.id + '|' + k];
      return `<button data-l="${k}" class="${k === lvl ? 'sel' : ''}" title="${LEVELS[k]}${b ? ' · ' + b.stars + ' of 3 stars' : ''}">${LEVELS[k]}<b>${b ? '★'.repeat(b.stars) : ''}</b></button>`;
    }).join('');
    const hue = [...s.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
    const kind = s.builtin ? (catOf(s) === 'classic' ? 'Classical' : 'Children') : s.audio ? 'Band' : s.kind === 'partitura' ? 'Sheet' : 'Piano';
    const credit = s.credit ? s.credit : s.builtin ? 'included' : 'from YouTube';
    const edit = (API && !s.builtin && !s.cloud) || s.local ? '<button data-a="ren" title="Rename">Rename</button><button data-a="del" title="Delete">Delete</button>'
      : s.cloud && CLOUD ? '<button data-a="del" title="Delete">Delete</button>' : '';
    const bars = [0, 1, 2, 3, 4].map(i => { const r = (hue * (i + 3) * 37 + i * 101) % 100; return `<i style="left:${4 + i * 10}px;top:${6 + r % 22}px;height:${8 + (r * 7) % 16}px"></i>`; }).join('');
    card.innerHTML = `<div class="cover" style="background:linear-gradient(150deg,hsl(${hue} 72% 60%),hsl(${(hue + 35) % 360} 66% 42%))">${bars}</div>
      <div class="info"><div class="t"></div>
      <div class="meta"><span class="kind">${kind}</span>${s.duration ? `<span>${fmtTime(s.duration)}</span><span class="dot">·</span>` : ''}<span class="cr"></span>${edit}</div></div>
      <div class="levels">${levelBtns}</div>
      <button class="playbtn" data-a="play" title="Play">${ICON.play}</button>`;
    card.querySelector('.t').textContent = s.title;
    card.querySelector('.cr').textContent = credit;
    card.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.l) {
        lvl = b.dataset.l; me.levelBySong = me.levelBySong || {}; me.levelBySong[s.id] = lvl; me.level = lvl; saveProfiles();
        card.querySelectorAll('.levels button').forEach(x => x.classList.toggle('sel', x === b));
      } else if (b.dataset.a === 'play') startSong(s, lvl);
      else if (b.dataset.a === 'del') {
        if (!confirm(`Delete “${s.title}”?`)) return;
        if (s.local) await IDB.del(s.id);
        else if (s.cloud && CLOUD) {
          let pin = store.get('pin', '') || (prompt('Family code:') || '').trim(); if (!pin) return;
          const r = await fetch(CLOUD + '/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, id: s.id }) });
          const j = await r.json(); if (j.error) { if (r.status === 403) store.set('pin', ''); toast(j.error); return; }
          store.set('pin', pin);
        } else await fetch('api/delete', { method: 'POST', body: JSON.stringify({ id: s.id }) });
        loadLibrary();
      } else if (b.dataset.a === 'ren') {
        const t = prompt('Song name:', s.title); if (!t || !t.trim()) return;
        if (s.local) { const x = await IDB.get(s.id); x.title = t.trim().slice(0, 80); await IDB.put(x); loadLibrary(); return; }
        await fetch('api/rename', { method: 'POST', body: JSON.stringify({ id: s.id, title: t }) }); loadLibrary();
      }
    };
    el.appendChild(card);
  });
  filterLib(libQuery);
}

// topo da biblioteca: notas coloridas a cair (só decoração)
(() => {
  const el = $('.rain'); if (!el) return;
  const cols = ['#ef6a43', '#1fa896', '#e2b13c', '#2f6fd6', '#d63b4a', '#7a4fd0'];
  el.innerHTML = Array.from({ length: 14 }, (_, i) => {
    const x = (i * 53) % 100, h = 30 + (i * 37) % 70, d = 5 + (i * 7) % 6, dl = -((i * 1.7) % d);
    return `<i style="left:${x}%;height:${h}px;background:${cols[i % cols.length]};animation-duration:${d}s;animation-delay:${dl}s"></i>`;
  }).join('');
})();
// importar do YouTube (só com o servidor local)
async function detectApi() {
  try { const r = await fetch('api/ping', { cache: 'no-store' }); API = r.ok && (await r.json()).ok; } catch { API = false; }
  $('#hero-hint').textContent = API
    ? 'Paste a link and press Open: the app writes a piano arrangement and opens the song when it is ready (about twice the length of the song). You can also type to search.'
    : CLOUD ? 'Paste a link, pick an audio file or take a photo of sheet music: the cloud writes a piano arrangement and the song opens when ready (a few minutes). You can also type to search.'
      : 'Type to search for a song.';
  if (API) pollJobs();
  cloudPoll();
}
const isUrl = v => /^https?:\/\/|youtu\.?be/i.test(v);
const myJobs = new Set();
$('#yt-go').onclick = async () => {
  const v = $('#yt-url').value.trim();
  if (!v) { $('#yt-url').focus(); return; }
  if (!isUrl(v)) { // procurar: abre a primeira música que bate certo
    const s = LIB.find(x => x.title.toLowerCase().includes(v.toLowerCase()));
    if (s) startSong(s, levelFor(s)); else toast('Song not found.');
    return;
  }
  const url = /^https?:/i.test(v) ? v : 'https://' + v;
  if (!API) {
    if (!CLOUD) { toast('To convert videos, open pianoforge on the PC.', 6000); return; }
    if (await cloudStart({ url }, url)) { $('#yt-url').value = ''; filterLib(''); }
    return;
  }
  const r = await fetch('api/import', { method: 'POST', body: JSON.stringify({ url }) });
  const j = await r.json(); if (j.error) { toast(j.error); return; }
  myJobs.add(j.id); $('#yt-url').value = ''; filterLib(''); pollJobs();
};
// foto(s) de uma pauta -> o PC lê a pauta (OMR) e faz os níveis
async function sendSheetPhotos(files) {
  files = [...files].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  if (!API && !CLOUD) { toast('Sheet music reading runs on the PC. Open pianoforge there and send the photo.', 6000); return; }
  toast(`Sending ${files.length} photo(s)…`);
  const shrink = f => new Promise((ok, no) => { // reduz para ~2400 px (chega para ler e envia mais depressa)
    const img = new Image(); img.onload = () => {
      const k = Math.min(1, 2400 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); ok(c.toDataURL('image/jpeg', 0.92));
    }; img.onerror = no; img.src = URL.createObjectURL(f);
  });
  try {
    const images = await Promise.all(files.map(shrink));
    if (!API) { await cloudStart({ images }, `Sheet music (${files.length} photo${files.length > 1 ? 's' : ''})`); return; }
    const r = await fetch('api/omr', { method: 'POST', body: JSON.stringify({ images }) });
    const j = await r.json(); if (j.error) { toast(j.error); return; }
    myJobs.add(j.id); pollJobs();
  } catch (e) { toast('Could not send the photo: ' + (e.message || e)); }
}
// ---------- nuvem (Modal): para o telemóvel ou quando o PC está desligado ----------
const CLOUD = (window.PF_CLOUD || '').replace(/\/$/, '');
let cloudJobs = store.get('cloudJobs', []); // [{id, label, started}]
async function cloudStart(payload, label) {
  let pin = store.get('pin', '');
  if (!pin) { pin = (prompt('Family code (ask Nuno):') || '').trim(); if (!pin) return false; }
  toast('Sending to the cloud…');
  try {
    const r = await fetch(CLOUD + '/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, ...payload }) });
    const j = await r.json();
    if (r.status === 403) { store.set('pin', ''); toast('Wrong code. Try again.'); return false; }
    if (j.error) { toast(j.error, 5000); return false; }
    store.set('pin', pin);
    cloudJobs.unshift({ id: j.id, label: label || 'Song', started: Date.now(), mine: true }); store.set('cloudJobs', cloudJobs.slice(0, 6));
    cloudPoll(); return true;
  } catch (e) { toast('The cloud did not respond: ' + (e.message || e), 5000); return false; }
}
async function cloudPoll() {
  clearTimeout(cloudPoll._t);
  if (!CLOUD || !cloudJobs.length) return;
  const el = $('#jobs');
  let running = false;
  for (const job of cloudJobs) {
    if (job.state === 'done' || job.state === 'error') continue;
    try {
      const j = await (await fetch(CLOUD + '/status?id=' + encodeURIComponent(job.id))).json();
      job.state = j.state; job.stage = j.stage; job.pct = j.pct;
      if (j.state === 'done' && j.song) {
        job.title = j.song.title; job.song = j.song.id;
        await IDB.put({ ...j.song, cloudCopy: true }); // abre já; o site também a vai ter daqui a ~1 min
        await loadLibrary();
        const s = LIB.find(x => x.id === j.song.id);
        if (job.mine && s && !$('#scr-library').classList.contains('hidden')) { toast(`“${j.song.title}” is ready.`); startSong(s, levelFor(s)); }
        else toast(`“${j.song.title}” is now in the library.`);
      }
    } catch { job.stage = 'No connection to the cloud — retrying…'; }
    if (job.state !== 'done' && job.state !== 'error') running = true;
  }
  if (Date.now() - (cloudJobs[0]?.started || 0) > 3 * 3600e3) running = false;
  store.set('cloudJobs', cloudJobs.slice(0, 6));
  el.querySelectorAll('.cjob').forEach(x => x.remove());
  cloudJobs.slice(0, 3).forEach(job => {
    if (job.state === 'done' && Date.now() - job.started > 600e3) return;
    const d = document.createElement('div'); d.className = 'job cjob ' + (job.state || 'running');
    const pct = job.pct == null ? null : Math.round(job.pct);
    d.innerHTML = `<div></div>${job.state === 'done' || job.state === 'error' ? '' : `<div class="bar"><i style="width:${pct || 3}%"></i></div>`}`;
    d.firstChild.textContent = job.state === 'done' ? '✓ ' + (job.title || job.label) + ' — ready!' : job.state === 'error' ? '✗ ' + job.stage
      : `${job.label}: ${job.stage || 'starting…'}${pct != null ? ` · ${pct}%` : ''}`;
    el.prepend(d);
  });
  if (running) cloudPoll._t = setTimeout(cloudPoll, 3000);
}
$('#audio-file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > 40e6) { toast('The file is too large (max. 40 MB).'); return; }
  const name = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  if (!CLOUD) { toast('Converting audio files needs the cloud.'); return; }
  const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
  await cloudStart({ audio: data, filename: f.name, title: name }, name);
};
$('#sheet-photo').onchange = e => { sendSheetPhotos(e.target.files); e.target.value = ''; };
addEventListener('paste', e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length && !$('#scr-library').classList.contains('hidden')) { e.preventDefault(); sendSheetPhotos(fs); } });
$('.hero').addEventListener('dragover', e => e.preventDefault());
$('.hero').addEventListener('drop', e => { e.preventDefault(); sendSheetPhotos(e.dataTransfer.files); });
$('#yt-url').oninput = e => filterLib(isUrl(e.target.value) ? '' : e.target.value.trim());
function filterLib(q) {
  libQuery = q || ''; q = libQuery.toLowerCase();
  let shown = 0;
  document.querySelectorAll('#songs .song').forEach(c => {
    const hide = (!!q && !c.querySelector('.t').textContent.toLowerCase().includes(q)) || (!q && libTab !== 'all' && c.dataset.cat !== libTab);
    c.classList.toggle('hidden', hide); if (!hide) shown++;
  });
  let e = $('#songs .empty.q');
  if (!shown && LIB.length) { if (!e) { e = document.createElement('p'); e.className = 'empty q'; $('#songs').appendChild(e); } e.textContent = 'No song with that name. Paste a YouTube link to add it.'; }
  else if (e) e.remove();
}
function levelFor(s) {
  const avail = LEVEL_ORDER.filter(k => k === 'licao' || !s.counts || s.counts[k] != null);
  const want = (me.levelBySong || {})[s.id] || me.level || 'facil';
  return avail.includes(want) ? want : avail.includes('facil') ? 'facil' : avail[0];
}
// ---------- juntar um ficheiro MIDI (funciona no telemóvel, sem o PC) ----------
let midiInfo = null;
$('#midi-file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    midiInfo = MidiImport.analyse(MidiImport.parse(await f.arrayBuffer()));
  } catch (err) { toast('Could not read the file: ' + (err.message || err), 5000); return; }
  const parts = midiInfo.parts.filter(p => !p.drums);
  if (!parts.length) { toast('This MIDI has no notes (or only drums).'); return; }
  const sg = MidiImport.suggest(parts);
  const opts = (sel, extra) => extra + parts.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}></option>`).join('');
  const dlg = $('#midi-dialog');
  dlg.innerHTML = `<h2>Add “<span class="mt"></span>”</h2>
    <label>Name <input id="md-title" maxlength="80"></label>
    <label>Right hand (melody) <select id="md-r">${opts(sg.R, '')}</select></label>
    <label>Left hand <select id="md-l">${opts(sg.L, `<option value="split" ${sg.L === 'split' ? 'selected' : ''}>Split the right-hand part at middle C</option><option value="none">None (right hand only)</option>`)}</select></label>
    <p class="hint">${API ? 'It goes to the library and to the site.' : 'It is saved on this device.'} Drums are ignored.</p>
    <div class="row"><button class="btn primary" id="md-ok">Add</button><button class="btn" id="md-cancel">Cancel</button></div>`;
  const name = f.name.replace(/\.midi?$/i, '').replace(/[_-]+/g, ' ').trim();
  dlg.querySelector('.mt').textContent = name; $('#md-title').value = name;
  dlg.querySelectorAll('select option[value]').forEach(o => { const p = parts.find(x => String(x.id) === o.value); if (p) o.textContent = p.label; });
  dlg.classList.remove('hidden'); dlg.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#md-cancel').onclick = () => dlg.classList.add('hidden');
  $('#md-ok').onclick = async () => {
    let song;
    try { song = MidiImport.buildSong(midiInfo, $('#md-r').value, $('#md-l').value, ($('#md-title').value || name).trim()); }
    catch (err) { toast(err.message || String(err), 5000); return; }
    if (API) {
      const r = await fetch('api/add_song', { method: 'POST', body: JSON.stringify(song) });
      const j = await r.json(); if (j.error) { toast(j.error); return; }
      song.id = j.id || song.id;
    } else await IDB.put(song);
    dlg.classList.add('hidden'); newSong = song.id; await loadLibrary();
    toast(`“${song.title}” is now in the library.` + (API ? ' (syncing to the site…)' : ''));
  };
};
$('#yt-url').onkeydown = e => { if (e.key === 'Enter') $('#yt-go').click(); };
let seenDone = new Set(store.get('seenJobs', []));
async function pollJobs() {
  clearTimeout(pollJobs._t);
  let jobs = [];
  try { jobs = (await (await fetch('api/jobs', { cache: 'no-store' })).json()).jobs; } catch { }
  const el = $('#jobs'); el.innerHTML = '';
  jobs.slice(0, 4).forEach(j => {
    const d = document.createElement('div'); d.className = 'job ' + j.state;
    const pct = j.pct == null ? null : Math.round(j.pct);
    d.innerHTML = `<div></div>${j.state === 'running' ? `<div class="bar"><i style="width:${pct || 3}%"></i></div>` : ''}`;
    d.firstChild.textContent = (j.state === 'done' ? '✓ ' + j.title + ' — ' + j.stage : j.state === 'error' ? '✗ ' + j.stage
      : `${j.stage}${pct != null ? ` · ${pct}%` : ''}`);
    el.appendChild(d);
    if (j.state === 'done' && !seenDone.has(j.id)) {
      seenDone.add(j.id); store.set('seenJobs', [...seenDone]); newSong = j.song;
      loadLibrary().then(() => {
        const s = LIB.find(x => x.id === j.song);
        if (myJobs.has(j.id) && s && !$('#scr-library').classList.contains('hidden')) { toast(`“${j.title}” is ready.`); startSong(s, levelFor(s)); }
        else toast(`“${j.title}” is now in the library.`);
      });
    }
  });
  if (jobs.some(j => j.state === 'running' || (j.state === 'done' && j.stage.endsWith('…')))) pollJobs._t = setTimeout(pollJobs, 1200);
}

// ---------- som (WebAudio) ----------
let AC = null, master = null;
function audio() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createDynamicsCompressor(); master.connect(AC.destination);
  }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
// piano verdadeiro: amostras do Salamander Grand Piano (CC-BY, Alexander Holm) de 3 em 3 meios-tons
const PIANO = { buf: new Map(), loading: null };
const SAMPLES = [[21, 'A0'], [108, 'C8']];
for (let o = 1; o <= 7; o++) ['C', 'Ds', 'Fs', 'A'].forEach((n, i) => SAMPLES.push([12 * (o + 1) + i * 3, n + o]));
function loadPiano() {
  if (PIANO.loading) return PIANO.loading;
  const a = audio();
  PIANO.loading = Promise.all(SAMPLES.map(async ([m, f]) => {
    try {
      const r = await fetch(`samples/piano/${f}.mp3`); if (!r.ok) return;
      const ab = await r.arrayBuffer();
      PIANO.buf.set(m, await new Promise((ok, no) => a.decodeAudioData(ab, ok, no)));
    } catch { }
  }));
  return PIANO.loading;
}
const SND = { p: null, loading: null };
function loadGrand() {
  if (SND.loading) return SND.loading;
  SND.loading = import('https://unpkg.com/smplr@1.1.0/dist/index.mjs').then(async mod => {
    const a = audio(), p = new mod.SplendidGrandPiano(a, { decayTime: 0.5 });
    await p.load;
    try { p.output.addEffect('reverb', new mod.Reverb(a), 0.12); } catch { }
    SND.p = p;
  }).catch(e => console.warn('piano (smplr) indisponível, uso o de reserva', e));
  return SND.loading;
}
// when = hora no relógio do áudio (para tocar exatamente a tempo); vel 0..1
function playTone(m, dur = null, vel = 0.7, when = null) {
  if (SND.p) {
    const a = audio(), t = Math.max(a.currentTime, when ?? a.currentTime);
    const stop = SND.p.start({ note: m, velocity: Math.max(1, Math.min(127, Math.round(vel * 127))), time: t, ...(dur != null ? { duration: Math.max(0.08, dur) } : {}) });
    return { stop, smplr: true };
  }
  if (PIANO.buf.size < SAMPLES.length / 2) { loadPiano(); return synthTone(m, dur, vel); }
  const a = audio(), t = Math.max(a.currentTime, when ?? a.currentTime);
  let best = null;
  for (const s of PIANO.buf.keys()) if (best == null || Math.abs(s - m) < Math.abs(best - m)) best = s;
  const src = a.createBufferSource(), g = a.createGain();
  src.buffer = PIANO.buf.get(best); src.playbackRate.value = 2 ** ((m - best) / 12);
  g.gain.value = 0.25 + 0.75 * vel * vel;
  src.connect(g).connect(master); src.start(t);
  const v = { g, src };
  if (dur != null) releaseTone(v, t + Math.max(0.25, dur));
  return v;
}
function synthTone(m, dur = null, vel = 0.7) {
  const a = audio(), t = a.currentTime, f = 440 * 2 ** ((m - 69) / 12);
  const g = a.createGain(), lp = a.createBiquadFilter(), o1 = a.createOscillator(), o2 = a.createOscillator(), g2 = a.createGain();
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(9000, f * 9), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.6), t + 1.0);
  o1.type = 'triangle'; o1.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2; g2.gain.value = 0.25;
  o1.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(master);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.32, t + 0.006);
  g.gain.exponentialRampToValueAtTime(vel * 0.1, t + 0.45); g.gain.exponentialRampToValueAtTime(0.0005, t + 3);
  o1.start(t); o2.start(t); o1.stop(t + 3.1); o2.stop(t + 3.1);
  const v = { g };
  if (dur != null) releaseTone(v, t + dur);
  return v;
}
function releaseTone(v, when) {
  if (v && v.smplr) { try { v.stop(when ?? undefined); } catch { } return; }
  const a = audio(); when = Math.max(when ?? a.currentTime, a.currentTime);
  v.g.gain.cancelScheduledValues(when); v.g.gain.setTargetAtTime(0.0001, when, v.src ? 0.11 : 0.07);
  if (v.src && !v.stopped) { v.stopped = true; v.src.stop(when + 1.2); }
}
function click(strong) {
  const a = audio(), t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.frequency.value = strong ? 1500 : 1000; g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.06);
}

// ---------- entrada: MIDI, teclado, toque, microfone ----------
let inputName = '';
function setBadge() {
  const b = $('#input-badge');
  if (mic.on) { b.textContent = 'Listening through the microphone'; b.className = 'badge on'; }
  else if (inputName) { b.textContent = 'Piano connected: ' + inputName; b.className = 'badge on'; }
  else { b.textContent = 'Connect a piano via USB, or use the microphone or keyboard (A S D F…)'; b.className = 'badge'; }
  $('#c-mic').classList.toggle('on', mic.on);
}
if (navigator.requestMIDIAccess) {
  navigator.requestMIDIAccess().then(acc => {
    const bind = () => {
      const names = [];
      acc.inputs.forEach(inp => { inp.onmidimessage = onMidi; names.push(inp.name); });
      const had = inputName; inputName = names.join(', ');
      if (inputName && inputName !== had) toast('Piano connected: ' + inputName);
      setBadge();
    };
    bind(); acc.onstatechange = bind;
  }).catch(() => setBadge());
} else setBadge();
function onMidi(e) {
  const [st, d1, d2] = e.data, c = st & 0xf0;
  if (c === 0x90 && d2 > 0) noteOn(d1, 'midi');
  else if (c === 0x80 || (c === 0x90 && d2 === 0)) noteOff(d1);
}
const KEYMAP = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17 };
let kbBase = 60;
const kbDown = new Map();
addEventListener('keydown', e => {
  if (e.target.tagName !== 'INPUT' && !$('#scr-play').classList.contains('hidden') && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
    e.preventDefault(); jump(e.code === 'ArrowLeft' ? -5 : 5); return;
  }
  if (e.target.tagName === 'INPUT' || $('#scr-play').classList.contains('hidden')) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
  if (e.code === 'KeyZ') { kbBase -= 12; toast('Computer keyboard: ' + noteName(kbBase) + (kbBase / 12 - 1)); return; }
  if (e.code === 'KeyX') { kbBase += 12; toast('Computer keyboard: ' + noteName(kbBase) + (kbBase / 12 - 1)); return; }
  if (e.code in KEYMAP && !e.repeat) { const m = kbBase + KEYMAP[e.code]; kbDown.set(e.code, m); noteOn(m, 'keys'); }
});
addEventListener('keyup', e => { if (kbDown.has(e.code)) { noteOff(kbDown.get(e.code)); kbDown.delete(e.code); } });

// microfone: deteção de altura (YIN), uma nota de cada vez
const mic = { on: false, an: null, buf: null, cur: null, cand: null, n: 0, lvl: 0, lastOn: 0, stream: null };
async function toggleMic() {
  if (mic.on) {
    mic.stream?.getTracks().forEach(t => t.stop()); mic.on = false; if (mic.cur != null) noteOff(mic.cur); setBadge(); return;
  }
  try {
    const a = audio();
    mic.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const src = a.createMediaStreamSource(mic.stream);
    mic.an = a.createAnalyser(); mic.an.fftSize = 2048; src.connect(mic.an);
    mic.buf = new Float32Array(mic.an.fftSize); mic.on = true;
    if (P.settings) { P.settings.sound = false; syncControls(); }
    toast('Microphone on. Play one note at a time (Beginner works best for this).', 5000);
  } catch (err) {
    toast('Could not use the microphone: ' + (err.message || err), 5000);
  }
  setBadge();
}
$('#c-mic').onclick = toggleMic;
function yin(buf, sr) {
  const N = buf.length >> 1, d = new Float32Array(N);
  const minT = Math.floor(sr / 1400), maxT = Math.min(N - 1, Math.floor(sr / 60));
  for (let tau = 1; tau <= maxT; tau++) {
    let s = 0;
    for (let i = 0; i < N; i++) { const x = buf[i] - buf[i + tau]; s += x * x; }
    d[tau] = s;
  }
  let run = 0; d[0] = 1;
  for (let tau = 1; tau <= maxT; tau++) { run += d[tau]; d[tau] = d[tau] * tau / (run || 1); }
  for (let tau = minT; tau < maxT; tau++) {
    if (d[tau] < 0.15) {
      while (tau + 1 < maxT && d[tau + 1] < d[tau]) tau++;
      const a = d[tau - 1], b = d[tau], c = d[tau + 1], den = a - 2 * b + c;
      const shift = den ? 0.5 * (a - c) / den : 0;
      return sr / (tau + shift);
    }
  }
  return 0;
}
function micTick() {
  if (!mic.on) return;
  mic.an.getFloatTimeDomainData(mic.buf);
  let rms = 0; for (const x of mic.buf) rms += x * x; rms = Math.sqrt(rms / mic.buf.length);
  const now = performance.now(), attack = rms > mic.lvl * 1.7 + 0.004;
  mic.lvl = mic.lvl * 0.8 + rms * 0.2;
  if (rms < 0.008) { if (mic.cur != null) { noteOff(mic.cur); mic.cur = null; } mic.cand = null; return; }
  const f = yin(mic.buf, AC.sampleRate); if (!f) return;
  const m = Math.round(69 + 12 * Math.log2(f / 440)); if (m < 28 || m > 100) return;
  if (m === mic.cand) mic.n++; else { mic.cand = m; mic.n = 1; mic.att = mic.att || attack; }
  if (attack) mic.att = true;
  if (mic.n >= 2 && (m !== mic.cur || (mic.att && now - mic.lastOn > 140))) {
    if (mic.cur != null) noteOff(mic.cur);
    mic.cur = m; mic.lastOn = now; mic.att = false; noteOn(m, 'mic');
  }
}

// ---------- 3. o jogo ----------
const P = { song: null, level: 'facil', notes: [], steps: [], si: 0, t: 0, state: 'idle', settings: null,
  score: 0, streak: 0, best: 0, hits: 0, wrong: 0, missed: 0, A: null, B: null, loop: false, startT: 0,
  pressed: new Map(), flash: new Map(), pops: [], lo: 48, hi: 84, end: 0, count: 0, voices: new Map(), beatIdx: 0, fresh: true };
const cv = $('#cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, KB = { kh: 0, ww: 0, keys: {} };

// ---------- música de fundo (instrumental sem voz), sincronizada com o jogo ----------
const BG = { el: null, ok: false };
function setupBacking(song) {
  if (BG.el) { BG.el.pause(); if (BG.el.src.startsWith('blob:')) URL.revokeObjectURL(BG.el.src); BG.el.removeAttribute('src'); }
  BG.el = null; BG.ok = false;
  $('#music-row').classList.toggle('hidden', !song.audio);
  $('#c-src').classList.toggle('hidden', !song.audio);
  $('#c-novocal').classList.toggle('hidden', !song.audio_full);
  if (!song.audio) return;
  const file = song.audio_full && P.settings?.src !== 'novocal' ? song.audio_full : song.audio; // «Original» = com voz
  BG.file = file;
  // carregado inteiro para memória: assim dá para saltar para qualquer ponto em qualquer servidor
  const el = new Audio(); el.preload = 'auto'; el.preservesPitch = true; BG.el = el;
  fetch('songs/' + file).then(r => { if (!r.ok) throw 0; return r.blob(); }).then(b => {
    if (BG.el !== el) return;
    el.src = URL.createObjectURL(b);
    el.addEventListener('canplay', () => { BG.ok = true; }, { once: true });
  }).catch(() => { BG.ok = false; $('#music-row').classList.add('hidden'); });
}
// «Piano»: sem a gravação; a app toca todas as notas do nível com o piano (como «Transcribed» noutras apps)
const pianoMode = () => !!(P.song && P.song.audio && P.settings && P.settings.src === 'piano');
const bgPlaying = () => BG.el && BG.ok && !BG.el.paused;
function bgSync() {
  const el = BG.el; if (!el || !BG.ok) return;
  const want = P.state === 'play' && !P.warm && !P.waiting && P.t >= 0 && P.t < (el.duration || 1e9) && P.settings.music > 0 && !pianoMode();
  el.volume = P.settings.music; el.playbackRate = spd();
  if (!want) { if (!el.paused) el.pause(); return; }
  if (el.paused) { el.currentTime = Math.max(0, P.t); el.play().catch(() => { }); }
  else if (Math.abs(el.currentTime - P.t) > 0.5) el.currentTime = P.t; // depois de saltar / repetir A–B
}
function bgStop() { if (BG.el && !BG.el.paused) BG.el.pause(); }

// ---------- ecrã inteiro (telemóvel): esconde a barra do browser e roda para horizontal ----------
const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement) || matchMedia('(display-mode: fullscreen)').matches;
async function goFull() {
  try {
    const el = document.documentElement;
    if (!isFull()) await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.());
    await screen.orientation?.lock?.('landscape');
  } catch { } // iPhone: não deixa no browser — instalar como app (Partilhar → Adicionar ao ecrã principal)
}
function leaveFull() { try { if (document.fullscreenElement) document.exitFullscreen(); screen.orientation?.unlock?.(); } catch { } }
$('#c-full').onclick = () => { if (document.fullscreenElement) leaveFull(); else goFull(); };
async function startSong(s, level) {
  if (isPhone()) goFull(); // no telemóvel, tocar = ecrã inteiro na horizontal
  let song;
  try { song = s.local ? await IDB.get(s.id) : await (await fetch('songs/' + s.file, { cache: 'no-store' })).json(); } catch { toast('Could not open the song.'); return; }
  if (!song.levels.licao) { const L = buildLesson(song); if (L) song.levels.licao = L; }
  if (!song.levels[level]) level = LEVEL_ORDER.find(k => song.levels[k] && k !== 'licao') || LEVEL_ORDER.find(k => song.levels[k]);
  P.song = song; P.level = level; P.settings = me.settings; P.warm = null;
  // cada nível tem a sua velocidade (o Iniciante começa devagar)
  P.settings.speeds = P.settings.speeds || {};
  if (!P.settings.v3) { P.settings.speeds = {}; P.settings.v3 = true; } // 17 out: 100% passou a ser um andamento confortável
  P.settings.speed = P.settings.speeds[level] ?? 1;
  $('#p-title').textContent = song.title;
  $("#p-level").textContent = `${LEVELS[level]} · ${me.name}`;
  show('scr-play'); audio(); loadPiano(); loadGrand();
  P.A = P.B = null; P.loop = false;
  setupBacking(song); prepare(); syncControls(); resize(); restart(false);
}
function prepare() {
  const lv = P.song.levels[P.level] || P.song.levels.facil;
  P.notes = (P.warm ? P.warm.notes : lv.notes).map((n, i) => ({ ...n, i, hit: false, miss: false, done: false }));
  P.end = Math.max(...P.notes.map(n => n.t + n.d)) + 1.2;
  let lo = Math.min(...P.notes.map(n => n.m)) - 1, hi = Math.max(...P.notes.map(n => n.m)) + 1;
  while (hi - lo < 24) { if ((hi - lo) % 2) lo--; else hi++; }
  if (isBlack(lo)) lo--; if (isBlack(hi)) hi++;
  P.lo = lo; P.hi = hi;
  const rh = P.notes.filter(n => n.h === 'R').map(n => n.m);
  kbBase = rh.length ? 12 * Math.floor(Math.min(...rh) / 12) : 60;
  const ds = P.notes.map(n => dia(n.m));
  P.diMin = Math.min(17, Math.min(...ds) - 1); P.diMax = Math.max(39, Math.max(...ds) + 1);
  // pauta grande (como no Yousician): direita sempre na pauta de cima, esquerda na de baixo, com espaço entre elas
  const dT = P.notes.filter(n => staffOf(n) === 'T').map(n => dia(n.m)), dB = P.notes.filter(n => staffOf(n) === 'B').map(n => dia(n.m));
  P.tHi = Math.max(39, ...dT.map(d => d + 1)); P.tLo = Math.min(29, ...dT.map(d => d - 1));
  P.bHi = Math.max(27, ...dB.map(d => d + 1)); P.bLo = Math.min(17, ...dB.map(d => d - 1));
  const bt = P.song.beats || [];
  P.beatLen = bt.length > 2 ? bt.slice(1).map((b, i) => b - bt[i]).sort((a, b) => a - b)[bt.length >> 1] : 60 / (P.song.bpm || 100);
  P.accomp = [];
  const full = (P.song.levels.dificil || {}).notes || [];
  if (!['dificil', 'completo', 'arr', 'ia'].includes(P.level) && full.length) { // o Completo e o Teste IA já são o arranjo inteiro
    let base = full;
    if (P.level !== 'acordes') { // quem toca a melodia és tu: tira-se a linha de cima da mão direita
      const top = new Map();
      for (const n of full) if (n.h === 'R') { const k = Math.round(n.t * 30), g = top.get(k); if (!g || n.m > g.m) top.set(k, n); }
      const tops = new Set(top.values()); base = full.filter(n => !tops.has(n));
    }
    const mine = new Map();
    for (const x of P.notes) { const k = Math.round(x.t * 20); if (!mine.has(k)) mine.set(k, new Set()); mine.get(k).add(pc(x.m)); }
    const dup = n => [-1, 0, 1].some(o => mine.get(Math.round(n.t * 20) + o)?.has(pc(n.m)));
    P.accomp = base.filter(n => !dup(n)).map(n => ({ t: n.t, d: n.d, m: n.m, v: n.v, sch: false }));
  }
  if (P.song.accomp && P.song.accomp.length) { // dueto: a parte do professor toca sempre, em todos os níveis
    P.accomp = (P.accomp || []).concat(P.song.accomp.map(n => ({ t: n.t, d: n.d, m: n.m, v: n.v ?? 60, sch: false })));
  }
  P.levelScale = LEVEL_BEAT[P.level] ? Math.min(1, P.beatLen / LEVEL_BEAT[P.level]) : 1;
  const byT = new Map(); // acordes: notas da mesma mão ao mesmo tempo a uma terceira ou menos ficam mais finas
  for (const n of P.notes) { const k = n.h + Math.round(n.t * 30); if (!byT.has(k)) byT.set(k, []); byT.get(k).push(n); n.stk = false; }
  for (const g of byT.values()) if (g.length > 1) {
    g.sort((a, b) => dia(a.m) - dia(b.m));
    for (let i = 1; i < g.length; i++) if (dia(g[i].m) - dia(g[i - 1].m) <= 2) g[i].stk = g[i - 1].stk = true;
  }
  P.bars = P.warm ? P.warm.bars : findChords();
  if (P.warm) P.accomp = [];
  const keepF = P.warm ? P.notes.map(n => n.f) : null;
  assignFingers();
  if (keepF) P.notes.forEach((n, i) => { if (keepF[i]) n.f = keepF[i]; });
  buildSteps(); drawMiniMap();
}
// dedilhado automático: as notas de cada mão agrupam-se em posições de 5 teclas brancas seguidas.
// Mão direita: polegar (1) na tecla mais baixa; esquerda: mindinho (5) na mais baixa. Acorde largo: 1-3-5.
function assignFingers() {
  P.positions = { R: [], L: [] };
  for (const h of ['R', 'L']) {
    const groups = [];
    for (const n of P.notes) {
      if (n.h !== h) continue;
      const g = groups[groups.length - 1];
      if (g && n.t - g.t < 0.04) g.notes.push(n); else groups.push({ t: n.t, notes: [n] });
    }
    let pos = null;
    for (const g of groups) {
      const ds = g.notes.map(n => dia(n.m)), lo = Math.min(...ds), hi = Math.max(...ds);
      const end = g.t + Math.max(...g.notes.map(n => n.d));
      if (pos && Math.max(pos.hi, hi) - Math.min(pos.lo, lo) <= 4) {
        pos.lo = Math.min(pos.lo, lo); pos.hi = Math.max(pos.hi, hi); pos.groups.push(g); pos.t1 = Math.max(pos.t1, end);
      } else { pos = { lo, hi, t0: g.t, t1: end, groups: [g] }; P.positions[h].push(pos); }
    }
    for (const p of P.positions[h]) {
      p.base = p.hi - p.lo <= 4 ? Math.max(p.lo, Math.min(p.lo, p.hi - 4)) : p.lo;
      for (const g of p.groups) {
        const ds = g.notes.map(n => dia(n.m));
        if (Math.max(...ds) - Math.min(...ds) > 4 || p.hi - p.lo > 4) {
          const so = [...g.notes].sort((a, b) => a.m - b.m);
          so.forEach((n, i) => { const f = so.length === 1 ? 1 : Math.round(1 + 4 * i / (so.length - 1)); n.f = h === 'R' ? f : 6 - f; });
        } else for (const n of g.notes) { const k = dia(n.m) - p.base; n.f = h === 'R' ? k + 1 : 5 - k; }
      }
    }
  }
}
// acorde de cada compasso (tríade maior/menor que melhor explica as notas)
function findChords() {
  if (P.song.chords) return P.song.chords.map(c => ({ t: c.t, chord: { r: c.r, q: c.q } }));
  const beats = P.song.beats || [], src = (P.song.levels.dificil || P.song.levels[P.level]).notes, bars = [];
  for (let i = 0; i + 1 < beats.length; i += 4) {
    const a = beats[i], b = beats[Math.min(i + 4, beats.length - 1)];
    const w = new Array(12).fill(0); let low = null, tot = 0;
    for (const n of src) {
      const ov = Math.min(n.t + n.d, b) - Math.max(n.t, a); if (ov <= 0) continue;
      w[pc(n.m)] += ov; tot += ov; if (!low || n.m < low.m) low = n;
    }
    let best = null;
    if (tot > 0) for (let r = 0; r < 12; r++) for (const [q, iv] of [['', [0, 4, 7]], ['m', [0, 3, 7]]]) {
      const inn = iv.reduce((s, k) => s + w[(r + k) % 12], 0);
      const sc = inn - 0.6 * (tot - inn) + (low && pc(low.m) === r ? 0.25 * tot : 0) + w[r] * 0.3;
      if (!best || sc > best.sc) best = { sc, r, q };
    }
    bars.push({ t: a, chord: best && best.sc > 0.2 * tot ? best : null });
  }
  return bars;
}
function drawMiniMap() {
  const c = $('#prog-map'); if (!c || !P.notes.length) return;
  const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  c.width = Math.max(1, Math.round(r.width * d)); c.height = Math.max(1, Math.round(r.height * d));
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  const lo = Math.min(...P.notes.map(n => n.m)), hi = Math.max(...P.notes.map(n => n.m)) + 1;
  for (const n of P.notes) {
    g.fillStyle = PCOL[pc(n.m)];
    g.fillRect(n.t / P.end * c.width, c.height - (n.m - lo + 1) / (hi - lo + 1) * c.height * 0.9 - c.height * 0.05,
      Math.max(1.5 * d, n.d / P.end * c.width), Math.max(1.5 * d, c.height / (hi - lo + 2)));
  }
}
// velocidade real = botão × escala do nível. 100% no botão = andamento confortável para o nível (como nas apps de
// piano: ~70 batidas/min no Acordes e Iniciante, ~100 no Intermédio, original no Avançado); nunca mais rápido que o original
const LEVEL_BEAT = { licao: 0.86, acordes: 0.86, facil: 0.86, medio: 0.6, dificil: 0, completo: 0, arr: 0, ia: 0 };
// ajudas dos níveis fáceis (como no Yousician): as próximas teclas acendem-se antes e o acorde aparece em cima
const HINT_LEVELS = new Set(['licao', 'acordes', 'facil', 'medio']);
const hintsOn = () => P.settings && P.settings.hints !== false && HINT_LEVELS.has(P.level);
const chordName = c => c ? noteName(c.r) + (c.q || '') : '';
function chordHelp() {
  const el = $('#chord-now');
  if (!hintsOn() || !P.bars || !P.bars.some(b => b.chord)) { el.classList.add('hidden'); return; }
  let i = -1; for (let k = 0; k < P.bars.length && P.bars[k].t <= P.t + 0.05; k++) i = k;
  const curC = i >= 0 ? P.bars[i].chord : null;
  let next = null; for (let k = i + 1; k < P.bars.length; k++) { const c = P.bars[k].chord; if (c && chordName(c) !== chordName(curC)) { next = P.bars[k]; break; } }
  const a = chordName(curC) || '–', b = next && next.t - P.t < 8 * (P.beatLen || 0.5) ? 'next ' + chordName(next.chord) : '';
  if (el._k !== a + '|' + b) { el._k = a + '|' + b; el.querySelector('b').textContent = a; el.querySelector('i').textContent = b; }
  el.classList.remove('hidden');
}
function spd() { return (P.settings ? P.settings.speed : 1) * (P.levelScale || 1); }
const active = n => P.settings.hands === 'both' || n.h === P.settings.hands;
function buildSteps() {
  P.steps = [];
  for (const n of P.notes) {
    if (!active(n)) continue;
    const s = P.steps[P.steps.length - 1];
    if (s && n.t - s.t < 0.04) s.notes.push(n); else P.steps.push({ t: n.t, notes: [n] });
  }
  P.si = P.steps.findIndex(s => s.t >= P.t - 0.01); if (P.si < 0) P.si = P.steps.length;
  // uma bolinha por pauta: os passos de cada mão em separado
  const per = h => P.steps.map(st => ({ t: st.t, notes: st.notes.filter(n => staffOf(n) === h) })).filter(st => st.notes.length);
  P.stepsT = per('T'); P.stepsB = per('B');
}
function restart(autostart = true) {
  stopVoices();
  const first = P.steps.length ? P.steps[0].t : (P.notes[0]?.t || 0);
  const from = P.loop && P.A != null ? P.A : first - 1.5 * spd() - 0.5;
  seek(from); P.startT = from;
  P.score = 0; P.streak = 0; P.best = 0; P.hits = 0; P.wrong = 0; P.missed = 0; P.fresh = true; P.missRun = 0;
  hideOverlay(); updateHud();
  if (autostart) countIn(); else { P.state = 'pause'; showStart(); }
}
function seek(t) {
  P.t = t;
  for (const n of P.notes) if (n.t >= t - 0.01) { n.hit = n.miss = n.done = n.g = n.sch = false; }
  for (const n of P.accomp || []) n.sch = n.t < t - 0.01;
  P.si = P.steps.findIndex(s => s.t >= t - 0.01); if (P.si < 0) P.si = P.steps.length;
  P.beatIdx = (P.song.beats || []).findIndex(b => b >= t); if (P.beatIdx < 0) P.beatIdx = 1e9;
}
function countIn() { audio(); hideOverlay(); P.state = 'count'; P.count = 3; P.lastCount = 4; }
function togglePlay() {
  if (P.state === 'play' || P.state === 'count') { P.state = 'pause'; stopVoices(); showPaused(); }
  else if (P.state === 'end') restart(true);
  else { if (P.fresh) P.startT = P.t; countIn(); }
}
function stopVoices() {
  bgStop();
  if (SND.p) try { SND.p.stop(); } catch { } // corta também as notas já agendadas
  for (const n of P.notes) if (n.t > P.t) n.sch = false;
  for (const n of P.accomp || []) if (n.t > P.t) n.sch = false; P.voices.forEach(v => releaseTone(v)); P.voices.clear(); }

// botões
$('#back').onclick = () => { P.state = 'idle'; stopVoices(); bgStop(); $('#more').classList.add('hidden'); show('scr-library'); renderLibrary(); };
$('#c-play').onclick = togglePlay;
$('#c-restart').onclick = () => restart(true);
function segInit(id, key, after) {
  $(id).onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    P.settings[key] = b.dataset.v; saveProfiles(); syncControls(); after && after();
  };
}
segInit('#c-mode', 'mode');
segInit('#c-src', 'src', () => {
  bgStop();
  const want = P.song.audio_full && P.settings.src !== 'novocal' ? P.song.audio_full : P.song.audio;
  if (want && want !== BG.file) setupBacking(P.song); // trocou entre com voz / sem voz
});
segInit('#c-view', 'view');
segInit('#c-hands', 'hands', () => { buildSteps(); });
$('#c-speed').oninput = e => { P.settings.speed = +e.target.value; (P.settings.speeds = P.settings.speeds || {})[P.level] = P.settings.speed; saveProfiles(); syncControls(); };
for (const [id, k] of [['#c-names', 'names'], ['#c-sound', 'sound'], ['#c-metro', 'metro'], ['#c-guide', 'guide'], ['#c-hints', 'hints']])
  $(id).onclick = () => { P.settings[k] = !P.settings[k]; saveProfiles(); syncControls(); };
$('#c-lat').oninput = e => { P.settings.latency = +e.target.value; saveProfiles(); syncControls(); };
$('#c-accomp').onclick = () => { P.settings.accomp = P.settings.accomp === false; saveProfiles(); syncControls(); };
$('#c-color').onclick = () => { P.settings.colorBy = P.settings.colorBy === 'note' ? 'finger' : 'note'; saveProfiles(); syncControls(); };
$('#c-midi').onclick = () => {
  if (!P.song) return;
  const bpm = P.song.bpm || 100, tpb = 480, tick = t => Math.max(0, Math.round(t * bpm / 60 * tpb));
  const vlq = n => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
  const track = (evs, name) => { // evs: [tick, on, nota, força, canal]
    evs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const d = [0, 0xFF, 0x03, ...vlq(name.length), ...[...name].map(c => c.charCodeAt(0) & 0x7f)];
    let last = 0;
    for (const [t, on, m, v, ch] of evs) { d.push(...vlq(t - last), (on ? 0x90 : 0x80) | ch, m, on ? v : 0); last = t; }
    d.push(0, 0xFF, 0x2F, 0);
    return [0x4D, 0x54, 0x72, 0x6B, d.length >>> 24, (d.length >>> 16) & 255, (d.length >>> 8) & 255, d.length & 255, ...d];
  };
  const ev = (ns, ch) => ns.flatMap(n => [[tick(n.t), 1, n.m, Math.min(127, n.v ?? 80), ch], [tick(n.t + n.d), 0, n.m, 0, ch]]);
  const lv = P.song.levels[P.level].notes, us = Math.round(60e6 / bpm);
  const tempo = [0, 0xFF, 0x51, 3, us >> 16, (us >> 8) & 255, us & 255, 0, 0xFF, 0x58, 4, P.song.bpb || 4, 2, 24, 8, 0, 0xFF, 0x2F, 0];
  const tracks = [[0x4D, 0x54, 0x72, 0x6B, 0, 0, 0, tempo.length, ...tempo],
    track(ev(lv.filter(n => n.h === 'R'), 0), 'Right hand'), track(ev(lv.filter(n => n.h === 'L'), 1), 'Left hand')];
  if ((P.accomp || []).length) tracks.push(track(ev(P.accomp, 2), 'Accompaniment'));
  const head = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, tpb >> 8, tpb & 255];
  const blob = new Blob([new Uint8Array(head.concat(...tracks))], { type: 'audio/midi' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${P.song.title} - ${LEVELS[P.level]}.mid`.replace(/[\\/:*?"<>|]/g, ''); a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
$('#c-music').oninput = e => { P.settings.music = +e.target.value; saveProfiles(); };
$('#c-notation').onclick = () => {
  const st = P.settings, order = [['letters', 'bars'], ['solfege', 'bars'], [st.label, 'classic']];
  const i = st.notation === 'classic' ? 2 : st.label === 'solfege' ? 1 : 0;
  const [l, n] = order[(i + 1) % 3]; if (n === 'classic') st.label = st.label; else st.label = l;
  st.notation = n; if (n === 'classic' && st.view !== 'staff') st.view = 'staff';
  saveProfiles(); syncControls(); toast(n === 'classic' ? 'Classic notation' : l === 'solfege' ? 'Names: Do Re Mi' : 'Names: C D E');
};
$('#c-viewbtn').onclick = () => { P.settings.view = P.settings.view === 'staff' ? 'fall' : 'staff'; saveProfiles(); syncControls(); };
$('#c-more').onclick = e => { e.stopPropagation(); $('#more').classList.toggle('hidden'); syncControls(); };
addEventListener('pointerdown', e => {
  if (!$('#more').classList.contains('hidden') && !e.target.closest('#more') && !e.target.closest('#c-more')) { $('#more').classList.add('hidden'); syncControls(); }
});
$('#c-a').onclick = () => { P.A = Math.max(0, P.t); if (P.B != null && P.B <= P.A) P.B = null; syncControls(); toast('Loop start set (A). Now set the end (B).'); };
$('#c-b').onclick = () => {
  if (P.A == null || P.t <= P.A + 1) { toast('Set the start (A) first, play a little, then press B.'); return; }
  P.B = P.t; P.loop = true; syncControls(); toast('Looping from A to B.');
};
$('#c-loop').onclick = () => {
  if (P.A == null || P.B == null) { toast('Set the start (A) and end (B) of the part you want to practise.'); return; }
  P.loop = !P.loop; syncControls();
};
// barra da música: arrastar para trás/para a frente; ao largar continua dali (se estava a tocar) ou fica em pausa
const SCRUB = { on: false, was: false };
const scrubT = e => { const r = $('#progress').getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * P.end; };
$('#progress').onpointerdown = e => {
  e.preventDefault(); $('#progress').setPointerCapture(e.pointerId); $('#progress').classList.add('drag');
  SCRUB.on = true; SCRUB.was = P.state === 'play' || P.state === 'count';
  stopVoices(); bgStop(); P.state = 'pause'; P.fresh = false; hideOverlay(); seek(scrubT(e));
};
$('#progress').onpointermove = e => { if (SCRUB.on) seek(scrubT(e)); };
const endScrub = e => {
  if (!SCRUB.on) return; SCRUB.on = false; $('#progress').classList.remove('drag');
  seek(Math.max(0, scrubT(e) - 1));
  if (SCRUB.was) countIn(); else { P.state = 'pause'; hideOverlay(); }
  syncControls();
};
$('#progress').onpointerup = endScrub; $('#progress').onpointercancel = endScrub;
function jump(dt) {
  const was = P.state === 'play' || P.state === 'count';
  stopVoices(); bgStop(); seek(Math.max(0, Math.min(P.end - 0.5, P.t + dt))); P.fresh = false;
  if (was) countIn(); else { P.state = 'pause'; hideOverlay(); }
  syncControls();
}
$('#c-back5').onclick = () => jump(-5); $('#c-fwd5').onclick = () => jump(5);
function syncControls() {
  const s = P.settings; if (!s) return;
  document.querySelectorAll('#c-view button').forEach(b => b.classList.toggle('on', b.dataset.v === s.view));
  document.querySelectorAll('#c-src button').forEach(b => b.classList.toggle('on', b.dataset.v === (s.src || 'original')));
  document.querySelectorAll('#c-mode button').forEach(b => b.classList.toggle('on', b.dataset.v === s.mode));
  document.querySelectorAll('#c-hands button').forEach(b => b.classList.toggle('on', b.dataset.v === s.hands));
  $('#c-speed').value = s.speed; $('#c-speed-v').textContent = Math.round(s.speed * 100) + '%';
  if (P.beatLen) $('#c-speed').parentElement.title = `Speed · ♩ = ${Math.round(60 / P.beatLen * spd())} per minute`;
  $('#c-names').classList.toggle('on', s.names); $('#c-hints').classList.toggle('on', s.hints !== false); $('#c-sound').classList.toggle('on', s.sound); $('#c-metro').classList.toggle('on', s.metro);
  $('#c-loop').classList.toggle('on', P.loop);
  const playing = P.state === 'play' || P.state === 'count';
  $('#c-play i').innerHTML = playing ? ICON.pause : ICON.play; $('#c-play span').textContent = playing ? 'Pause' : 'Play';
  $('#c-viewbtn i').innerHTML = s.view === 'staff' ? ICON.staff : ICON.fall;
  $('#c-notation i').textContent = s.notation === 'classic' ? '♩' : s.label === 'solfege' ? 'Do' : 'C';
  const lat = s.latency == null ? Math.round(lagSec() / (s.speed || 1) * 1000) : s.latency;
  $('#c-lat').value = lat; $('#c-lat-v').textContent = lat + ' ms' + (s.latency == null ? ' (auto)' : '');
  $('#c-guide').classList.toggle('on', !!s.guide); $('#c-accomp').classList.toggle('on', s.accomp !== false);
  $('#c-accomp').classList.toggle('hidden', !P.accomp || !P.accomp.length);
  $('#c-color').classList.toggle('on', s.colorBy !== 'note'); $('#c-color').textContent = s.colorBy === 'note' ? 'Colour by note' : 'Colour by finger'; $('#c-music').value = s.music ?? 0.8;
  $('#c-more').classList.toggle('on', !$('#more').classList.contains('hidden'));
}

// notas tocadas pelo jogador
const match = (a, b) => a === b || (mic.on && ((a - b) % 12 === 0));
function noteOn(m, src) {
  const prev = P.pressed.get(m);
  if (prev?.v) releaseTone(prev.v);
  const rec = { at: performance.now(), ok: null };
  if ((src === 'keys' || src === 'touch') && (P.settings?.sound ?? true)) rec.v = playTone(m);
  P.pressed.set(m, rec);
  if (P.state !== 'play' && P.state !== 'count') return;
  if (P.state === 'count') return;
  judge(m, rec);
}
function noteOff(m) {
  const r = P.pressed.get(m); if (!r) return;
  if (r.v) releaseTone(r.v);
  P.pressed.delete(m); P.flash.set(m, { ok: r.ok, until: performance.now() + 180 });
}
// atraso do som (auscultadores Bluetooth ~0,15–0,3 s): o que se vê e o que se avalia anda atrás do relógio do áudio
function lagSec() {
  if (!P.settings) return 0;
  const auto = AC ? Math.round(((AC.outputLatency || 0) + (AC.baseLatency || 0)) * 1000) : 0;
  const ms = P.settings.latency == null ? auto : P.settings.latency;
  return ms / 1000 * spd();
}
function judge(m, rec) { const t0 = P.t; P.t = t0 - lagSec(); try { judgeAt(m, rec); } finally { P.t = t0; } }
function judgeAt(m, rec) {
  if (P.settings.mode === 'wait') {
    const s = P.steps[P.si];
    if (s) {
      const n = s.notes.find(n => !n.hit && match(n.m, m));
      if (n) {
        hit(n, 'Boa!', 100); rec.ok = true;
        if (mic.on) s.notes.forEach(x => { if (!x.hit) { x.hit = true; x.done = true; } });
        if (s.notes.every(x => x.hit)) { P.si++; }
        return;
      }
      if (s.notes.some(x => x.hit && match(x.m, m))) { rec.ok = true; return; } // a repetir uma nota do acorde
    }
    wrong(m, rec);
  } else {
    const win = 0.22 * spd();
    let best = null;
    for (let i = Math.max(0, P.si - 20); i < P.steps.length; i++) {
      const s = P.steps[i]; if (s.t > P.t + win) break;
      for (const n of s.notes) if (!n.hit && !n.miss && match(n.m, m) && Math.abs(n.t - P.t) <= win) {
        if (!best || Math.abs(n.t - P.t) < Math.abs(best.t - P.t)) best = n;
      }
    }
    if (best) {
      const err = Math.abs(best.t - P.t) / spd();
      hit(best, err < 0.08 ? 'Perfect!' : 'Good!', err < 0.08 ? 100 : 60); rec.ok = true;
    } else wrong(m, rec);
  }
}
function hit(n, label, pts) {
  n.hit = true; n.done = true;
  P.streak++; P.best = Math.max(P.best, P.streak); P.hits++;
  P.score += Math.round(pts * (1 + Math.min(P.streak, 30) / 15));
  const k = KB.keys[n.m]; if (k) P.pops.push({ x: k.x + k.w / 2, y: H - KB.kh - 16 * DPR, txt: P.streak % 10 === 0 ? `${P.streak} in a row` : label, born: performance.now(), col: COL.good });
  updateHud();
}
function wrong(m, rec) {
  rec.ok = false; P.wrong++; P.streak = 0; updateHud();
}
function accuracy() {
  if (P.settings.mode === 'wait') return P.hits + P.wrong ? P.hits / (P.hits + P.wrong) : 1;
  const tot = P.hits + P.missed; return tot ? P.hits / (tot + P.wrong * 0.5) : 1;
}
function updateHud() {
  $('#h-score').textContent = P.score; $('#h-streak').textContent = P.streak;
  $('#h-acc').textContent = (P.hits + P.wrong + P.missed) ? Math.round(accuracy() * 100) + '%' : '–';
}

// ---------- ciclo ----------
let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
  micTick();
  if (!$('#scr-play').classList.contains('hidden') && P.song) { update(dt); draw(now); }
  requestAnimationFrame(frame);
}
function update(dt) {
  if (P.state === 'count') {
    P.count -= dt;
    const c = Math.ceil(P.count);
    if (c !== P.lastCount && c > 0) { P.lastCount = c; click(c === 3); }
    if (P.count <= 0) { P.state = 'play'; syncControls(); }
    return;
  }
  if (P.state !== 'play') return;
  let nt = P.t + dt * spd();
  if (bgPlaying()) { const at = BG.el.currentTime; if (Math.abs(at - nt) > 0.04 && Math.abs(at - nt) < 0.5) nt = at; }
  P.waiting = false;
  if (P.settings.mode === 'wait') {
    const s = P.steps[P.si];
    if (s && nt >= s.t + lagSec()) { nt = s.t + lagSec(); P.waiting = true; }
  }
  // notas que a app toca sozinha (outra mão, guia, acompanhamento): agendadas ~0,12 s antes no relógio do áudio,
  // para soarem exatamente a tempo (tocar no frame em que passam dá um ritmo irregular, sobretudo no telemóvel)
  {
    const a = audio(), sp = spd();
    let horizon = nt + 0.12 * sp;
    if (P.settings.mode === 'wait' && P.steps[P.si]) horizon = Math.min(horizon, P.steps[P.si].t + 1e-3);
    const sched = (n, vel) => { n.sch = true; playTone(n.m, n.d / sp, vel, a.currentTime + (n.t - nt) / sp); };
    for (const n of P.notes) {
      if (n.sch || n.t > horizon || n.t < nt - 0.05) continue;
      if (!active(n)) { if (P.settings.sound) sched(n, 0.5 * (n.v ?? 80) / 100); else n.sch = true; }
      else if (pianoMode() && P.settings.mode === 'rhythm') sched(n, 0.62 * (n.v ?? 85) / 100); // piano: a tua parte bem audível
      else if (P.settings.guide && P.settings.mode === 'rhythm') sched(n, 0.32);
      else n.sch = true;
    }
    if (P.settings.accomp !== false && (!P.song.audio || pianoMode())) for (const n of P.accomp || []) {
      if (n.sch || n.t > horizon || n.t < nt - 0.05) continue;
      sched(n, 0.42 * (n.v ?? 75) / 100); // a força original da partitura, mais baixinho
    }
  }
  // metrónomo
  const beats = P.song.beats || [];
  while (P.beatIdx < beats.length && beats[P.beatIdx] <= nt) {
    if (P.settings.metro && beats[P.beatIdx] > P.t - 0.001) click(P.beatIdx % 4 === 0);
    P.beatIdx++;
  }
  P.t = nt;
  bgSync();
  if (P.settings.mode === 'rhythm') {
    const win = 0.22 * spd();
    while (P.si < P.steps.length && P.steps[P.si].t < P.t - lagSec() - win) {
      let lost = false;
      for (const n of P.steps[P.si].notes) if (!n.hit) { n.miss = true; n.done = true; P.missed++; P.streak = 0; lost = true; }
      P.missRun = lost ? (P.missRun || 0) + 1 : 0;
      P.si++; updateHud();
      // (não se pára a música quando falhas notas — o Nuno quer que continue sempre)
    }
  }
  if (P.loop && P.A != null && P.B != null && P.t >= P.B) {
    stopVoices(); seek(P.A); return;
  }
  if (P.t >= P.end || (P.settings.mode === 'wait' && P.si >= P.steps.length && P.t >= P.end - 1)) finish();
}
function finish() {
  if (P.warm) { P.state = 'end'; stopVoices(); endWarm(true); return; }
  P.state = 'end'; stopVoices(); syncControls();
  const acc = accuracy();
  const st = acc >= 0.9 ? 3 : acc >= 0.75 ? 2 : acc >= 0.5 ? 1 : 0;
  const full = P.startT <= (P.steps[0]?.t ?? 0) && P.hits > 0;
  const key = P.song.id + '|' + P.level, prev = me.best[key];
  let record = false;
  if (full && (!prev || P.score > prev.score)) { me.best[key] = { stars: Math.max(st, prev?.stars || 0), acc: Math.round(acc * 100), score: P.score }; record = true; }
  else if (full && prev && st > prev.stars) prev.stars = st;
  saveProfiles();
  const msg = st === 3 ? 'Fantastic!' : st === 2 ? 'Well played' : st === 1 ? 'Nice — once more?' : 'Keep practising';
  const next = st === 3 ? LEVEL_ORDER.slice(LEVEL_ORDER.indexOf(P.level) + 1).find(k => P.song.levels[k]) || null : null;
  showOverlay(`<div class="result">
    <div class="stars">${[0, 1, 2].map(i => `<span class="${i < st ? '' : 'off'}">★</span>`).join('')}</div>
    <h3>${msg}</h3>
    <p>${Math.round(acc * 100)}% accuracy · ${P.score} points · ${P.best} in a row</p>
    ${record ? '<p style="color:var(--star)">New record</p>' : prev ? `<p>Record: ${prev.score} points</p>` : ''}
    ${!full ? '<p>(you started midway — records only count from the start)</p>' : ''}
    ${st < 2 && P.settings.mode === 'rhythm' ? '<p>Tip: try <b>Wait</b> — the music waits for you.</p>' : ''}
    <div class="row"><button class="btn primary" data-r="again">Again</button>
    ${next ? `<button class="btn" data-r="next">Move up to ${LEVELS[next]} →</button>` : ''}
    <button class="btn" data-r="lib">Library</button></div></div>`, e => {
    const r = e.target.closest('button')?.dataset.r;
    if (r === 'again') restart(true);
    else if (r === 'lib') $('#back').click();
    else if (r === 'next') { P.level = next; me.level = next; me.levelBySong = me.levelBySong || {}; me.levelBySong[P.song.id] = next; saveProfiles();
      $('#p-level').textContent = `${LEVELS[next]} · ${me.name}`; P.A = P.B = null; P.loop = false; prepare(); resize(); restart(false); }
  });
}
function showOverlay(html, onclick) {
  const o = $('#overlay'); o.innerHTML = html; o.onclick = onclick || null; o.classList.remove('hidden');
  o.classList.toggle('full', !!o.querySelector('.result.prep'));
  const h = o.querySelector('.prep-head h3'); if (h) h.textContent = P.song?.title || '';
}
function hideOverlay() { $('#overlay').classList.add('hidden'); }
function askWait() {
  P.state = 'pause'; stopVoices(); syncControls();
  showOverlay(`<div class="result"><h3>Is the music running away?</h3>
    <p>In <b>Wait</b> mode the music stops at each note until you press the right key.</p>
    <div class="row"><button class="btn primary" data-r="wait">Yes, wait for me</button>
    <button class="btn" data-r="go">Keep going in Rhythm</button></div></div>`, e => {
    const r = e.target.closest('button')?.dataset.r; if (!r) return;
    if (r === 'wait') { P.settings.mode = 'wait'; saveProfiles(); restart(true); } else countIn();
    syncControls();
  });
}
// ---------- Chord lesson (como no Yousician): a música toda, mas a tua parte é feita para aprender 2 acordes ----------
// Quando a música passa por um dos acordes da lição (C e G, ou os 2 acordes maiores mais frequentes), tocas o acorde
// completo com a mão direita (1-3-5), de 2 em 2 batidas; no resto da música tocas só a melodia, nota a nota.
function buildLesson(song) {
  const keep = [P.song, P.level]; P.song = song; P.level = 'dificil';
  let bars; try { bars = findChords(); } finally { [P.song, P.level] = keep; }
  const names = bars.map(b => b.chord ? chordName(b.chord) : null);
  let target = ['C', 'G'].filter(n => names.includes(n));
  if (target.length < 2) {
    const cnt = {}; names.forEach(n => { if (n && !/m/.test(n.slice(1))) cnt[n] = (cnt[n] || 0) + 1; });
    target = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 2);
  }
  if (!target.length) return null;
  const mel = ((song.levels.facil || song.levels.medio || {}).notes || []).filter(n => n.h === 'R');
  const bt = song.beats || [], beat = bt.length > 2 ? bt.slice(1).map((b, i) => b - bt[i]).sort((a, b) => a - b)[bt.length >> 1] : 0.6;
  const out = [];
  bars.forEach((b, i) => {
    const t0 = b.t, t1 = i + 1 < bars.length ? bars[i + 1].t : t0 + 4 * beat, nm = names[i];
    if (nm && target.includes(nm)) {
      const iv = (CHORD_IV[b.chord.q] || CHORD_IV['']).slice(0, 3);
      let root = 60 + b.chord.r; if (root > 66) root -= 12;
      for (let t = t0; t < t1 - 0.25 * beat; t += 2 * beat) {
        const d = Math.max(0.2, Math.min(2 * beat, t1 - t) - 0.06);
        iv.forEach((k, j) => out.push({ t: +t.toFixed(3), d: +d.toFixed(3), m: root + k, h: 'R', f: [1, 3, 5][j], v: 84, chord: nm }));
      }
    } else mel.filter(n => n.t >= t0 - 0.02 && n.t < t1 - 0.02).forEach(n => out.push({ ...n }));
  });
  if (!out.some(n => n.chord)) return null;
  return { notes: out.sort((a, b) => a.t - b.t || a.m - b.m), transpose: 0, target };
}

// ---------- antes de começar (níveis fáceis): onde pôr as mãos e os acordes da música ----------
const CHORD_IV = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6], aug: [0, 4, 8], sus4: [0, 5, 7], sus2: [0, 2, 7] };
// teclado pequeno em SVG: marks = Map(midi -> {f: dedo, col})
function miniKeys(lo, hi, marks) {
  while (isBlack(lo)) lo--; while (isBlack(hi)) hi++;
  const whites = []; for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const ww = 30, wh = 104, bw = 19, bh = 64, Wd = whites.length * ww;
  let svgW = '', svgB = '';
  whites.forEach((m, i) => {
    const k = marks.get(m), x = i * ww;
    svgW += `<rect x="${x + 0.5}" y="0.5" width="${ww - 1}" height="${wh}" rx="3" fill="${k ? k.col : '#fff'}" stroke="#cfcfca"/>`;
    if (k && k.f) svgW += `<text x="${x + ww / 2}" y="${wh - 22}" text-anchor="middle" font-size="16" font-weight="700" fill="#fff">${k.f}</text>`;
    svgW += `<text x="${x + ww / 2}" y="${wh - 8}" text-anchor="middle" font-size="11" fill="${k ? '#fff' : (pc(m) === 0 ? '#e5482c' : '#9a9a95')}">${noteName(m)}${pc(m) === 0 ? (m / 12 - 1) : ''}</text>`;
    if (m + 1 <= hi && isBlack(m + 1)) {
      const kb = marks.get(m + 1), bx = x + ww - bw / 2;
      svgB += `<rect x="${bx}" y="0.5" width="${bw}" height="${bh}" rx="2" fill="${kb ? kb.col : '#151515'}" stroke="${kb ? kb.col : '#151515'}"/>`;
      if (kb && kb.f) svgB += `<text x="${bx + bw / 2}" y="${bh - 9}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">${kb.f}</text>`;
    }
  });
  return `<svg class="mk" viewBox="0 0 ${Wd + 1} ${wh + 1}" width="${Wd + 1}" height="${wh + 1}" style="stroke-width:1">${svgW}${svgB}</svg>`;
}
// acordes da música pela ordem em que aparecem, com a forma da mão direita (a do nível, se o nível os tiver)
function chordShapes() {
  const seen = new Map();
  for (const b of P.bars || []) if (b.chord) { const k = chordName(b.chord); if (!seen.has(k)) seen.set(k, b); }
  const tg = P.level === 'licao' && P.song.levels.licao ? P.song.levels.licao.target : null;
  return [...seen.entries()].filter(([name]) => !tg || tg.includes(name)).slice(0, 8).map(([name, b]) => {
    const iv = CHORD_IV[b.chord.q] || CHORD_IV[''];
    const bar = P.bars[P.bars.indexOf(b) + 1], t1 = bar ? bar.t : b.t + 4 * (P.beatLen || 0.5);
    const inLevel = (P.warm ? [] : P.notes).filter(n => n.h === 'R' && n.t >= b.t - 0.05 && n.t < t1 - 0.05);
    const first = inLevel.length ? inLevel.filter(n => Math.abs(n.t - inLevel[0].t) < 0.04) : [];
    let notes = first.length >= 3 ? first.map(n => ({ m: n.m, f: n.f })) : null;
    if (!notes) {
      let root = 60 + b.chord.r; if (root > 66) root -= 12;
      const ms = iv.map(k => root + k);
      notes = ms.map((m, i) => ({ m, f: ms.length === 4 ? [1, 2, 3, 5][i] : [1, 3, 5][i] }));
    }
    return { name, chord: b.chord, notes, iv };
  });
}
// exercício antes da música: Acordes = cada acorde 2 vezes (direita + baixo na esquerda);
// Iniciante/Intermédio = os 5 dedos de cada mão (1-2-3-4-5-4-3-2-1) e depois as primeiras notas da música
function buildWarm() {
  const beat = P.beatLen || 0.6, notes = [], bars = [];
  let t = 1;
  const add = (m, h, f, d) => notes.push({ t: +t.toFixed(3), d, m, h, f, v: 80 });
  if (P.level === 'acordes' || P.level === 'licao') {
    for (const c of chordShapes()) for (let r = 0; r < 2; r++) {
      bars.push({ t, chord: c.chord });
      c.notes.forEach(n => add(n.m, 'R', n.f, beat * 1.8));
      if (P.settings.hands !== 'R') { let b = 36 + c.chord.r; if (b < 43) b += 12; add(b, 'L', 5, beat * 1.8); }
      t += beat * 2;
    }
  } else {
    for (const h of ['R', 'L']) {
      if (P.settings.hands !== 'both' && P.settings.hands !== h) continue;
      const pos = P.positions?.[h]?.[0]; if (!pos) continue;
      for (const i of [0, 1, 2, 3, 4, 3, 2, 1, 0]) { const k = h === 'R' ? i : 4 - i; add(whiteMidi(pos.base + k), h, h === 'R' ? k + 1 : 5 - k, beat * 0.9); t += beat; }
      t += beat;
    }
    const first = P.steps.slice(0, 10), t0 = first[0]?.t ?? 0;
    for (const st of first) for (const n of st.notes) notes.push({ t: +(t + (n.t - t0)).toFixed(3), d: n.d, m: n.m, h: n.h, f: n.f, v: 80 });
  }
  return { notes, bars, mode: P.settings.mode };
}
function startWarm() {
  const w = buildWarm(); if (!w.notes.length) return;
  P.warm = w; P.settings.mode = 'wait';
  $('#p-level').textContent = `Warm-up · ${LEVELS[P.level]} · ${me.name}`;
  prepare(); resize(); restart(true); syncControls();
}
function endWarm(done) {
  P.settings.mode = P.warm.mode; P.warm = null;
  $('#p-level').textContent = `${LEVELS[P.level]} · ${me.name}`;
  prepare(); resize(); restart(false); syncControls();
  if (done) toast('Warm-up done. Now the real song!');
}
function prepHtml() {
  const rows = [];
  // 1) posição inicial das mãos (os 5 dedos de cada mão)
  const marks = new Map(); let lo = 127, hi = 0;
  for (const h of ['L', 'R']) {
    if (P.settings.hands !== 'both' && P.settings.hands !== h) continue;
    const pos = P.positions?.[h]?.[0]; if (!pos) continue;
    for (let i = 0; i < 5; i++) {
      const m = whiteMidi(pos.base + i); marks.set(m, { f: h === 'R' ? i + 1 : 5 - i, col: h === 'R' ? COL.R : COL.L });
      lo = Math.min(lo, m); hi = Math.max(hi, m);
    }
  }
  if (marks.size) rows.push(`<div class="prep-sec hands"><h4>Hand position</h4><p>Place your fingers on the numbered keys${marks.size > 5 ? ' — <b style="color:var(--left)">left</b> and <b style="color:var(--right)">right</b> hand' : ''}.</p>
    <div class="mk-wrap">${miniKeys(lo - 2, hi + 2, marks)}</div></div>`);
  // 2) acordes da música, pela ordem em que aparecem, com a forma da mão direita (a do nível, se o nível os tiver)
  const cards = chordShapes().map(({ name, chord, notes, iv }) => {
    const b = { chord };
    const mk = new Map(notes.map(n => [n.m, { f: n.f, col: COL.R }]));
    const lo = Math.min(...notes.map(n => n.m)), hi = Math.max(...notes.map(n => n.m));
    const names = iv.map(k => noteName((b.chord.r + k) % 12)).join(' · ');
    return `<button class="chord-card" data-play="${notes.map(n => n.m).join(',')}" title="Play the chord"><b>${name}</b><small>${names}</small>${miniKeys(lo - 1, hi + 2, mk)}</button>`;
  });
  const lessonTip = P.level === 'licao' ? ` Play single notes most of the time — when the song reaches <b>${chordShapes().map(c => c.name).join('</b> or <b>')}</b>, play the whole chord.` : '';
  if (cards.length) rows.push(`<div class="prep-sec chords"><h4>${P.level === 'licao' ? 'Chords you will learn' : 'Chords in this song'}</h4><p>Tap a chord to hear it. The numbers are the right-hand fingers.${lessonTip}</p><div class="chord-grid">${cards.join('')}</div></div>`);
  return rows.join('');
}
function showStart() {
  const hint = inputName ? `Piano connected: ${inputName}` : mic.on ? 'Microphone on' : 'Connect a piano via USB, use the microphone, tap the screen or use the keyboard (A S D F…)';
  const prep = hintsOn() ? prepHtml() : '';
  const warmBtn = prep ? `<div class="warm-row"><button class="btn warm" data-r="warm"><b>Warm up first</b><small>${P.level === 'acordes' || P.level === 'licao' ? 'play each chord twice — the music waits for you' : 'five-finger exercise, then the first notes — slowly'}</small></button></div>` : '';
  const head = prep ? `<header class="prep-head"><div><p class="eyebrow">Before you start · ${LEVELS[P.level]}</p><h3></h3></div><p>${hint}</p></header>` : `<h3>Ready to play?</h3><p>${hint}</p>`;
  showOverlay(`<div class="result${prep ? ' prep' : ''}">${head}${prep ? `<div class="prep-body">${prep}</div><footer class="prep-foot">${warmBtn}` : ''}
    <div class="row modes">
      <button class="btn ${P.settings.mode === 'rhythm' ? 'primary' : ''}" data-r="rhythm"><b>Rhythm</b><small>the music keeps going, you follow</small></button>
      <button class="btn ${P.settings.mode === 'wait' ? 'primary' : ''}" data-r="wait"><b>Wait for me</b><small>stops at each note until you play it</small></button>
    </div>${prep ? '</footer>' : ''}</div>`,
    e => {
      const pl = e.target.closest('[data-play]');
      if (pl) { audio(); pl.dataset.play.split(',').map(Number).forEach((m, i) => playTone(m, 1.2, 0.6)); return; }
      const r = e.target.closest('button')?.dataset.r; if (!r) return;
      if (r === 'warm') { startWarm(); return; }
      P.settings.mode = r; saveProfiles(); buildSteps(); P.fresh = true; P.askedWait = false; countIn(); syncControls();
    });
}
function showPaused() {
  syncControls();
  showOverlay(`<div class="result"><h3>Paused</h3><div class="row"><button class="btn primary" data-r="go">Continue</button>
    <button class="btn" data-r="re">From the start</button></div></div>`, e => {
    const r = e.target.closest('button')?.dataset.r; if (r === 'go') { countIn(); syncControls(); } else if (r === 're') restart(true);
  });
}

// ---------- desenho ----------
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1);
  const r = cv.getBoundingClientRect(); W = Math.round(r.width * DPR); H = Math.round(r.height * DPR);
  cv.width = W; cv.height = H;
  let whites = 0; for (let m = P.lo; m <= P.hi; m++) if (!isBlack(m)) whites++;
  const ww = W / whites; KB.ww = ww;
  KB.kh = Math.min(H * (H < 500 * DPR ? 0.24 : 0.28), ww * 5.2, 190 * DPR);
  KB.keys = {}; let x = 0;
  for (let m = P.lo; m <= P.hi; m++) {
    if (!isBlack(m)) { KB.keys[m] = { x, w: ww, black: false }; x += ww; }
    else { const bw = ww * 0.6; KB.keys[m] = { x: x - bw / 2, w: bw, black: true }; }
  }
}
addEventListener('resize', () => { if (P.song) { resize(); drawMiniMap(); } });
// pauta dupla na horizontal: as notas andam da direita para a linha de tocar
function staffOf(n) { return n.h === 'L' ? 'B' : n.h === 'R' ? 'T' : dia(n.m) >= 28 ? 'T' : 'B'; }
function drawStaff(now, bottom, cur, pulse) {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, bottom);
  const GAP = 4; // espaço entre as pautas, em espaços da pauta
  const top = Math.min(30 * DPR, bottom * 0.09), pad = 6 * DPR, n = (P.tHi - P.tLo) + (P.bHi - P.bLo) + GAP * 2;
  const s = Math.min(26 * DPR, (bottom - top - pad) / (n / 2)), off = top + Math.max(0, (bottom - top - pad - s * n / 2) / 2);
  const yT = d => off + (P.tHi - d) * s / 2, offB = yT(P.tLo) + GAP * s, yB = d => offB + (P.bHi - d) * s / 2;
  const yS = (st, d) => st === 'B' ? yB(d) : yT(d), yN = nt => yS(staffOf(nt), dia(nt.m));
  const yTop = yT(P.tHi), yBot = yB(P.bLo);
  const clefW = s * 3.4, x0 = clefW + s * 2.2;
  const look = 5 * spd();
  // na pauta clássica cada batida tem pelo menos ~3 cabeças de largura, para as notas não se encavalitarem
  const pps = Math.max((W - x0) / look, P.settings.notation === 'classic' ? 3.2 * s / (P.beatLen || 0.5) : 0);
  const X = t => x0 + (t - P.t) * pps;
  const ink = '#1a1a1a', LINES = [30, 32, 34, 36, 38].map(yT).concat([18, 20, 22, 24, 26].map(yB));
  ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, 1.1 * DPR);
  for (const ly of LINES) { ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke(); }
  // compassos + acordes
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = `600 ${Math.min(20 * DPR, s * 0.95)}px 'Schibsted Grotesk', sans-serif`;
  let lastChord = '';
  for (const b of P.bars || []) {
    const x = X(b.t); if (x > W + 5) break;
    if (x >= x0 - 2) { ctx.fillStyle = ink; const bw = Math.max(1, 1.4 * DPR); ctx.fillRect(x, yT(38), bw, yT(30) - yT(38)); ctx.fillRect(x, yB(26), bw, yB(18) - yB(26)); }
    const ch = b.chord ? noteName(b.chord.r).replace('♯', '#') + b.chord.q : '';
    if (ch && ch !== lastChord && x > clefW && x < W - 20) { ctx.fillStyle = '#75756f'; ctx.fillText(ch, x + 4 * DPR, yTop - s * 0.2); }
    if (ch) lastChord = ch;
  }
  for (const t of [P.A, P.B]) if (t != null) { const x = X(t); if (x > x0 && x < W) { ctx.fillStyle = COL.star; ctx.fillRect(x - DPR, yTop, 3 * DPR, yBot - yTop); } }
  if (P.settings.notation === 'classic') drawClassic(X, yS, s, clefW, cur, pulse, ink);
  else {
  const H1 = s * 1.4, H2 = s * 0.98;
  ctx.textBaseline = 'middle';
  for (const nt of P.notes) {
    const xa = X(nt.t); if (xa > W) continue;
    const h = nt.stk ? H2 : H1, fs = Math.min(22 * DPR, h * (nt.stk ? 0.72 : 0.66));
    ctx.font = `600 ${fs}px 'Schibsted Grotesk', sans-serif`;
    const w = Math.max(nt.d * pps - 3 * DPR, H1 * 1.5), xb = xa + w; if (xb < clefW) continue;
    const d = dia(nt.m), st = staffOf(nt), yc = yS(st, d), act = active(nt);
    ledgers(xa - s * 0.45, s * 1.6, d, st, yS, ink);
    ctx.globalAlpha = nt.miss ? 0.25 : nt.hit ? 0.35 : 1;
    rr(xa, yc - h / 2, w, h, h / 2); ctx.fillStyle = act ? colOf(nt) : '#d4d4cf'; ctx.fill();
    if (nt.stk) { ctx.lineWidth = 1.5 * DPR; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    if (cur && cur.notes.includes(nt) && !nt.hit) { ctx.lineWidth = (2 + 2.5 * pulse) * DPR; ctx.strokeStyle = ink; ctx.stroke(); }
    if (P.settings.names) {
      ctx.globalAlpha = nt.miss ? 0.35 : nt.hit ? 0.5 : 1;
      ctx.fillStyle = act ? inkOn(colOf(nt)) : ink;
      ctx.fillText(noteName(nt.m), xa + h * 0.45, yc + DPR);
    }
    ctx.globalAlpha = 1;
  }
  }
  // painel das claves (tapa as notas que já passaram)
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, clefW, bottom);
  ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, 1.1 * DPR);
  for (const ly of LINES) { ctx.beginPath(); ctx.moveTo(s * 0.6, ly); ctx.lineTo(clefW, ly); ctx.stroke(); }
  ctx.fillStyle = ink; ctx.fillRect(s * 0.6, yT(38), Math.max(1.5, 2 * DPR), yB(18) - yT(38));
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  clef('\u{1D11E}', s * 0.9, yT(39.6), yT(27.4));
  clef('\u{1D122}', s * 0.9, yB(26.3), yB(21.1));
  // linha de tocar
  ctx.fillStyle = P.waiting ? `rgba(229,72,44,${0.65 + 0.35 * pulse})` : '#e5482c';
  ctx.fillRect(x0 - 1.5 * DPR, yTop - s * 0.3, 3 * DPR, yBot - yTop + s * 0.6);
  ctx.fillStyle = '#cfcfca'; ctx.fillRect(0, bottom, W, H - bottom);
  // bolinha: cai em cima de cada nota quando é para a tocar, e salta em arco até à seguinte
  // bolinha da mão direita na pauta de cima e da esquerda na de baixo
  const ballAt = st => ({ x: x0, y: Math.min(...st.notes.map(yN)) - s * 0.72 });
  bouncingBall(ballAt, s * 0.42, s * 4.5, yTop + s, P.stepsT || P.steps);
  if (P.stepsB) bouncingBall(ballAt, s * 0.42, s * 4.5, yT(P.tLo) + s * 0.5, P.stepsB);
}
// linhas suplementares: cada pauta tem as suas (a direita abaixo de Mi4 desce a partir do Dó4, a esquerda acima de Lá3 sobe)
function ledgers(x, w, d, st, yS, ink) {
  ctx.fillStyle = ink;
  const led = l => ctx.fillRect(x, yS(st, l) - 0.6 * DPR, w, Math.max(1, 1.2 * DPR));
  if (st === 'T') { for (let l = 40; l <= d; l += 2) led(l); for (let l = 28; l >= d; l -= 2) led(l); }
  else { for (let l = 28; l <= d; l += 2) led(l); for (let l = 16; l >= d; l -= 2) led(l); }
}
// pauta clássica: cabeças de nota, hastes e colchetes (as notas do mesmo ataque partilham a haste)
function drawClassic(X, yS, s, clefW, cur, pulse, ink) {
  const beat = P.beatLen || 0.5, rx = s * 0.62, ry = s * 0.46, pps = (X(1) - X(0));
  const groups = new Map();
  for (const nt of P.notes) {
    const xa = X(nt.t); if (xa > W + rx * 2) continue;
    if (xa + Math.max(nt.d * pps, rx * 2) < clefW) continue;
    const staff = staffOf(nt), key = staff + Math.round(nt.t * 30);
    if (!groups.has(key)) groups.set(key, { staff, xa, notes: [] });
    groups.get(key).notes.push(nt);
  }
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  for (const g of groups.values()) {
    const cx = g.xa + rx, ds = g.notes.map(n => dia(n.m)), y = d => yS(g.staff, d);
    const act = g.notes.some(active), hit = g.notes.every(n => n.hit), miss = g.notes.some(n => n.miss);
    const col = hit ? COL.good : act ? ink : '#bdbdb7';
    ctx.globalAlpha = miss ? 0.3 : 1;
    // linha suave com a duração (ajuda a saber quanto tempo segurar)
    for (const n of g.notes) {
      ctx.fillStyle = act ? colOf(n) : '#e2e2dd'; ctx.globalAlpha = (miss ? 0.15 : 0.35);
      rr(cx, y(dia(n.m)) - s * 0.14, Math.max(0, n.d * pps - rx), s * 0.28, s * 0.14); ctx.fill();
    }
    ctx.globalAlpha = miss ? 0.3 : 1;
    if (cur && g.notes.some(n => cur.notes.includes(n) && !n.hit)) {
      ctx.fillStyle = `rgba(229,72,44,${0.14 + 0.18 * pulse})`;
      for (const d of ds) { ctx.beginPath(); ctx.arc(cx, y(d), rx * 1.9, 0, 7); ctx.fill(); }
    }
    for (const n of g.notes) {
      const d = dia(n.m), yc = y(d), open = n.d >= beat * 1.75;
      ledgers(cx - rx * 1.6, rx * 3.2, d, g.staff, yS, ink);
      ctx.beginPath(); ctx.ellipse(cx, yc, rx, ry, -0.35, 0, 7);
      ctx.fillStyle = col; ctx.strokeStyle = col;
      if (open) { ctx.lineWidth = Math.max(1.5, s * 0.16); ctx.stroke(); } else ctx.fill();
      if (isBlack(n.m)) { ctx.fillStyle = col; ctx.font = `${s * 1.5}px "Noto Music", serif`; ctx.fillText('\u266F', cx - rx * 2.7, yc); }
      if (P.settings.names && act) {
        ctx.fillStyle = colOf(n); ctx.font = `600 ${Math.min(14 * DPR, s * 0.75)}px 'Schibsted Grotesk', sans-serif`;
        ctx.fillText(noteName(n.m), cx + rx * 1.35, yc - s * 0.55);
      }
    }
    // haste e colchetes
    const minD = Math.min(...g.notes.map(n => n.d));
    if (minD < beat * 3.5) {
      const mid = g.staff === 'T' ? 34 : 22, avg = ds.reduce((a, b) => a + b, 0) / ds.length, up = avg < mid;
      const lo = Math.min(...ds), hi = Math.max(...ds), len = s * 3.4;
      const sx = up ? cx + rx * 0.92 : cx - rx * 0.92, y1 = up ? y(lo) : y(hi), y2 = up ? y(hi) - len : y(lo) + len;
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, s * 0.11);
      ctx.beginPath(); ctx.moveTo(sx, y1); ctx.lineTo(sx, y2); ctx.stroke();
      const flags = minD < beat * 0.375 ? 2 : minD < beat * 0.75 ? 1 : 0;
      for (let f = 0; f < flags; f++) {
        const fy = y2 + (up ? 1 : -1) * f * s * 0.8;
        ctx.beginPath(); ctx.moveTo(sx, fy);
        ctx.bezierCurveTo(sx + s * 0.2, fy + (up ? 1 : -1) * s * 0.9, sx + s * 1.1, fy + (up ? 1 : -1) * s * 1.2, sx + s * 0.6, fy + (up ? 1 : -1) * s * 2.2);
        ctx.lineWidth = Math.max(1.5, s * 0.18); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
// desenha uma clave a ocupar exatamente a altura [top, bottom]
function clef(ch, x, top, bottom) {
  const F = '"Noto Music", "Segoe UI Symbol", serif';
  ctx.font = `100px ${F}`;
  const m = ctx.measureText(ch), hh = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || 100;
  ctx.font = `${100 * (bottom - top) / hh}px ${F}`;
  ctx.fillText(ch, x, top + ctx.measureText(ch).actualBoundingBoxAscent);
}
function bouncingBall(pos, r, maxH, minY, steps = P.steps) {
  if (!steps.length) return;
  let i = steps.findIndex(st => st.t > P.t + 1e-4);
  if (i < 0) i = steps.length;
  const prev = steps[i - 1], next = steps[i];
  if (!prev && !next) return;
  if (P.settings.mode === 'wait' && P.waiting && P.steps[P.si]) { // à espera: fica em cima da nota desta mão (se for a que espera)
    const w = steps.find(st => Math.abs(st.t - P.steps[P.si].t) < 0.05);
    if (w) { const a = pos(w); return drawBall(a.x, a.y - r, r, 0); }
  }
  const A = prev ? pos(prev) : null, B = next ? pos(next) : null;
  if (!A) return drawBall(B.x, B.y - r, r, 0);
  if (!B) return drawBall(A.x, A.y - r, r, 0);
  const gap = (next.t - prev.t) / spd(), u = Math.max(0, Math.min(1, (P.t - prev.t) / (next.t - prev.t)));
  const h = Math.min(maxH, r * 3 + gap * r * 4);
  const x = A.x + (B.x - A.x) * u, yb = A.y + (B.y - A.y) * u - h * 4 * u * (1 - u);
  drawBall(x, Math.max(minY, yb) - r, r, u);
}
function drawBall(x, y, r, u) {
  const squash = u < 0.08 ? 1 - (0.08 - u) * 2.5 : u > 0.94 ? 1 - (u - 0.94) * 2.5 : 1; // achata ao bater
  ctx.save(); ctx.translate(x, y + r * (1 - squash)); ctx.scale(1 + (1 - squash) * 0.6, squash);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7);
  ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(43,37,64,.35)'; ctx.shadowBlur = r * 0.8; ctx.shadowOffsetY = r * 0.25; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.lineWidth = Math.max(1.5, r * 0.28); ctx.strokeStyle = '#e5482c'; ctx.stroke();
  ctx.restore();
}
function drawFalling(now, hitY, cur, pulse) {
  const look = 3.2 * spd(), pps = (hitY - 10 * DPR) / look;
  const g = ctx.createLinearGradient(0, 0, 0, hitY); g.addColorStop(0, '#111111'); g.addColorStop(1, '#1d1d1d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, hitY);
  // faixas das teclas Dó e linhas de compasso
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let m = P.lo; m <= P.hi; m++) if (((m % 12) + 12) % 12 === 0 && KB.keys[m]) ctx.fillRect(KB.keys[m].x, 0, 1.2 * DPR, hitY);
  const beats = P.song.beats || [];
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < beats.length; i += 4) { const y = hitY - (beats[i] - P.t) * pps; if (y > 0 && y < hitY) ctx.fillRect(0, y, W, 1 * DPR); }
  // A–B
  if (P.A != null) { const y = hitY - (P.A - P.t) * pps; if (y > 0 && y < hitY) { ctx.fillStyle = COL.star; ctx.fillRect(0, y, W, 2 * DPR); } }
  if (P.B != null) { const y = hitY - (P.B - P.t) * pps; if (y > 0 && y < hitY) { ctx.fillStyle = COL.star; ctx.fillRect(0, y, W, 2 * DPR); } }

  // notas a cair
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (const n of P.notes) {
    if (n.t > P.t + look + 0.1) continue;
    if (n.t + n.d < P.t - 0.6) continue;
    const k = KB.keys[n.m]; if (!k) continue;
    const yb = hitY - (n.t - P.t) * pps, h = Math.max(n.d * pps, 14 * DPR), y = yb - h;
    const pad = k.black ? 1 * DPR : 3 * DPR, x = k.x + pad, w = k.w - 2 * pad;
    const act = active(n);
    let col = act ? COL[n.h] || COL.R : COL.auto;
    ctx.globalAlpha = n.miss ? 0.3 : (n.hit ? 0.55 : 1);
    if (n.hit) col = COL.good;
    rr(x, y, w, h, 7 * DPR); ctx.fillStyle = col; ctx.fill();
    if (cur && cur.notes.includes(n) && !n.hit) {
      ctx.lineWidth = (2 + 3 * pulse) * DPR; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (P.settings.names && act && w > 12 * DPR && h > 16 * DPR) {
      ctx.fillStyle = 'rgba(15,18,40,0.85)';
      ctx.font = `600 ${Math.min(15 * DPR, w * 0.42)}px 'Schibsted Grotesk', sans-serif`;
      ctx.fillText(noteName(n.m).replace('♯', '#'), x + w / 2, yb - 4 * DPR);
    }
  }
  // linha de toque
  ctx.fillStyle = P.waiting ? `rgba(255,207,74,${0.6 + 0.4 * pulse})` : 'rgba(255,255,255,0.5)';
  ctx.fillRect(0, hitY - 2 * DPR, W, 3 * DPR);
  bouncingBall(st => { const top = st.notes.reduce((a, b) => (b.m > a.m ? b : a)); const k = KB.keys[top.m]; return { x: k ? k.x + k.w / 2 : W / 2, y: hitY - 4 * DPR }; },
    Math.min(11 * DPR, KB.ww * 0.3), hitY * 0.35, 12 * DPR);

}
function rr(x, y, w, h, r) { w = Math.max(0, w); h = Math.max(0, h); r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function draw(now) { const t0 = P.t; P.t = t0 - lagSec(); try { drawAt(now); } finally { P.t = t0; } }
function drawAt(now) {
  { const r = cv.getBoundingClientRect(); if (Math.round(r.width * Math.min(2, devicePixelRatio || 1)) !== W || Math.round(r.height * Math.min(2, devicePixelRatio || 1)) !== H) resize(); }
  if (!W || !H) return;
  const hitY = H - KB.kh;
  const cur = P.settings.mode === 'wait' ? P.steps[P.si] : null;
  const pulse = 0.5 + 0.5 * Math.sin(now / 160);
  ctx.clearRect(0, 0, W, H);
  if (P.settings.view === 'staff') drawStaff(now, hitY, cur, pulse); else drawFalling(now, hitY, cur, pulse);
  ctx.fillStyle = '#cfcfca'; ctx.fillRect(0, hitY, W, H - hitY); // fundo do teclado: as teclas brancas ficam separadas por linhas finas
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';

  // teclado
  const expect = new Map();
  if (cur) cur.notes.forEach(n => { if (!n.hit) expect.set(n.m, n); });
  else if (P.settings.mode === 'rhythm') for (let i = Math.max(0, P.si - 2); i < Math.min(P.steps.length, P.si + 4); i++) {
    const s = P.steps[i]; if (Math.abs(s.t - P.t) < 0.25 * spd()) s.notes.forEach(n => { if (!n.hit) expect.set(n.m, n); });
  }
  const sounding = new Set();
  for (const n of P.notes) if (!active(n) && n.t <= P.t && n.t + n.d > P.t) sounding.add(n.m);
  // próximas teclas: o passo seguinte acende-se aos poucos nas 2 batidas antes de chegar
  const ghost = new Map(); let ghostAt = null;
  if (hintsOn()) {
    const look = 2 * (P.beatLen || 0.5);
    for (let i = Math.max(0, P.si - 1); i < P.steps.length; i++) {
      const s = P.steps[i], dt = s.t - P.t;
      if (dt <= 0.05 || s.notes.every(n => expect.has(n.m) || n.hit)) continue;
      if (dt > look) break;
      const k = 1 - dt / look; s.notes.forEach(n => { if (!expect.has(n.m)) ghost.set(n.m, { n, k }); }); ghostAt = s; break;
    }
  }
  chordHelp();
  const keyCol = (m, k) => {
    const p = P.pressed.get(m), f = P.flash.get(m);
    if (p) return p.ok === false ? COL.bad : p.ok ? COL.good : COL.press;
    if (f && f.until > now) return f.ok === false ? COL.bad : f.ok ? COL.good : COL.press;
    if (expect.has(m)) return P.settings.view === 'staff' || P.settings.colorBy === 'finger' ? colOf(expect.get(m)) : COL[expect.get(m).h];
    if (sounding.has(m)) return k.black ? '#55555a' : '#dcdcd8';
    return null;
  };
  // posição de cada mão agora: 5 teclas pintadas de leve com o número do dedo
  const handKeys = new Map();
  for (const h of ['R', 'L']) {
    if (P.settings.hands !== 'both' && P.settings.hands !== h) continue;
    const pos = (P.positions?.[h] || []).find(p => p.t1 >= P.t - 0.05);
    if (!pos || pos.t0 - P.t > 4 * spd()) continue;
    for (let i = 0; i < 5; i++) handKeys.set(whiteMidi(pos.base + i), h === 'R' ? i + 1 : 5 - i);
  }
  for (const pass of [false, true]) {
    for (let m = P.lo; m <= P.hi; m++) {
      const k = KB.keys[m]; if (k.black !== pass) continue;
      const h = pass ? KB.kh * 0.62 : KB.kh, c = keyCol(m, k);
      rr(k.x + (pass ? 0 : 1 * DPR), hitY, k.w - (pass ? 0 : 2 * DPR), h, 6 * DPR);
      ctx.fillStyle = c || (pass ? '#151515' : '#ffffff'); ctx.fill();
      if (!c && ghost.has(m)) { // próxima tecla: cor do dedo, cada vez mais forte
        const g = ghost.get(m), col = P.settings.colorBy === 'note' ? PCOL[pc(m)] : FCOL[g.n.f || 1];
        ctx.globalAlpha = 0.18 + 0.5 * g.k; ctx.fillStyle = col; ctx.fill();
        ctx.globalAlpha = 0.6 + 0.4 * g.k; ctx.lineWidth = 2.5 * DPR; ctx.strokeStyle = col; ctx.stroke(); ctx.globalAlpha = 1;
        if (g.n.f) {
          ctx.fillStyle = pass ? '#fff' : col; ctx.font = `700 ${Math.min(16 * DPR, k.w * (pass ? 0.6 : 0.45))}px 'Schibsted Grotesk', sans-serif`;
          ctx.fillText(String(g.n.f), k.x + k.w / 2, hitY + h * (pass ? 0.9 : 0.62));
        }
      }
      if (expect.has(m) && !P.pressed.has(m)) { ctx.globalAlpha = 0.25 + 0.3 * pulse; ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 1; }
      if (!pass && handKeys.has(m) && !ghost.has(m) && P.settings.colorBy !== 'note') {
        const f = (expect.has(m) && expect.get(m).f) || handKeys.get(m);
        if (!c) { ctx.globalAlpha = 0.28; ctx.fillStyle = FCOL[f]; rr(k.x + 2 * DPR, hitY + KB.kh * 0.66, k.w - 4 * DPR, KB.kh * 0.32, 5 * DPR); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.fillStyle = c ? '#fff' : FCOL[f]; ctx.font = `700 ${Math.min(15 * DPR, k.w * 0.45)}px 'Schibsted Grotesk', sans-serif`;
        ctx.fillText(String(f), k.x + k.w / 2, hitY + KB.kh * 0.62);
      }
      if (!pass && P.settings.names && k.w > 16 * DPR) {
        ctx.fillStyle = c ? '#151515' : (((m % 12) === 0) ? '#e5482c' : '#8c8c88');
        ctx.font = `${(m % 12) === 0 ? 600 : 400} ${Math.min(14 * DPR, k.w * 0.38)}px 'Schibsted Grotesk', sans-serif`;
        ctx.fillText(noteName(m), k.x + k.w / 2, H - 8 * DPR);
      }
    }
  }
  // nível Acordes: o nome do acorde por cima das teclas da mão direita (as que acendem a seguir ou agora)
  if (hintsOn() && (P.level === 'acordes' || P.level === 'licao')) {
    const src = ghostAt || (cur || P.steps[P.si]);
    const rk = src ? src.notes.filter(n => n.h === 'R').map(n => KB.keys[n.m]).filter(Boolean) : [];
    const bar = src && P.bars ? [...P.bars].reverse().find(b => b.t <= src.t + 0.05) : null;
    const lc = P.level === 'licao' ? src?.notes.find(n => n.chord)?.chord : null; // na lição só nos acordes a tocar
    if (rk.length && bar && bar.chord && (P.level !== 'licao' || lc)) {
      const x = (Math.min(...rk.map(k => k.x)) + Math.max(...rk.map(k => k.x + k.w))) / 2, txt = lc || chordName(bar.chord);
      ctx.font = `600 ${18 * DPR}px 'Schibsted Grotesk', sans-serif`;
      const w = ctx.measureText(txt).width + 18 * DPR, hh = 28 * DPR, y = hitY - hh - 8 * DPR;
      rr(x - w / 2, y, w, hh, hh / 2); ctx.fillStyle = '#141414'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y + hh / 2 + DPR);
      ctx.textBaseline = 'bottom';
    }
  }
  // textos que sobem
  P.pops = P.pops.filter(p => now - p.born < 700);
  for (const p of P.pops) {
    const a = (now - p.born) / 700;
    ctx.globalAlpha = 1 - a; ctx.fillStyle = p.col; ctx.font = `700 ${18 * DPR}px 'Schibsted Grotesk', sans-serif`;
    ctx.fillText(p.txt, p.x, p.y - a * 50 * DPR);
  }
  ctx.globalAlpha = 1;
  // contagem
  if (P.state === 'count') {
    ctx.fillStyle = COL.star; ctx.font = `700 ${110 * DPR}px 'Schibsted Grotesk', sans-serif`; ctx.textBaseline = 'middle';
    ctx.fillText(Math.max(1, Math.ceil(P.count)), W / 2, hitY / 2);
  }
  // barra de progresso
  const f = Math.max(0, Math.min(1, P.t / P.end));
  $('#prog-fill').style.width = f * 100 + '%'; $('#prog-head').style.left = `calc(${f * 100}% - 1px)`;
  const tc = fmtTime(Math.max(0, P.t)), te = fmtTime(Math.max(0, P.end - 1.2));
  if (drawAt._tc !== tc) { drawAt._tc = tc; $('#t-cur').textContent = tc; }
  if (drawAt._te !== te) { drawAt._te = te; $('#t-end').textContent = te; }
  const pl = $('#prog-loop');
  if (P.A != null) {
    pl.style.display = 'block'; pl.style.left = (P.A / P.end * 100) + '%';
    pl.style.width = (((P.B ?? P.t) - P.A) / P.end * 100) + '%'; pl.style.opacity = P.loop ? 1 : 0.5;
  } else pl.style.display = 'none';
}

// toque / rato no teclado do ecrã
const touches = new Map();
function keyAt(px, py) {
  const x = px * DPR, y = py * DPR, hitY = H - KB.kh; if (y < hitY) return null;
  for (let m = P.lo; m <= P.hi; m++) { const k = KB.keys[m]; if (k.black && x >= k.x && x <= k.x + k.w && y <= hitY + KB.kh * 0.62) return m; }
  for (let m = P.lo; m <= P.hi; m++) { const k = KB.keys[m]; if (!k.black && x >= k.x && x < k.x + k.w) return m; }
  return null;
}
cv.addEventListener('pointerdown', e => {
  const r = cv.getBoundingClientRect(), m = keyAt(e.clientX - r.left, e.clientY - r.top); if (m == null) return;
  cv.setPointerCapture(e.pointerId); touches.set(e.pointerId, m); noteOn(m, 'touch');
});
const up = e => { if (touches.has(e.pointerId)) { noteOff(touches.get(e.pointerId)); touches.delete(e.pointerId); } };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

// ---------- arranque ----------
renderProfiles(); detectApi(); setBadge();
const last = profiles.find(p => p.id === store.get('last'));
if (last) choose(last); else show('scr-profiles');
requestAnimationFrame(frame);
