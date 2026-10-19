/* pianoforge — ler um ficheiro MIDI no browser e fazer a música com os 4 níveis (Acordes, Iniciante, Intermédio,
   Avançado). As mesmas regras de midi_song.py / transcribe.py, para funcionar também no telemóvel sem servidor. */
'use strict';
const MidiImport = (() => {
  // ---------- 1. ler o ficheiro ----------
  function parse(buf) {
    const d = new DataView(buf); let p = 0;
    const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p + i)); p += n; return s; };
    const u32 = () => { const v = d.getUint32(p); p += 4; return v; }, u16 = () => { const v = d.getUint16(p); p += 2; return v; };
    const u8 = () => d.getUint8(p++);
    const vlq = () => { let v = 0, b; do { b = u8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
    if (str(4) !== 'MThd') throw new Error('This file is not a MIDI file.');
    const hl = u32(); u16(); const ntr = u16(), div = u16(); p += hl - 6;
    if (div & 0x8000) throw new Error('This type of MIDI (SMPTE) is not supported.');
    const tracks = [], tempos = [], sigs = [];
    for (let t = 0; t < ntr && p + 8 <= d.byteLength; t++) {
      const id = str(4), len = u32(), end = Math.min(d.byteLength, p + len);
      if (id !== 'MTrk') { p = end; continue; }
      let tick = 0, run = 0, name = '';
      const on = new Map(), notes = [], prog = {};
      while (p < end) {
        tick += vlq();
        let st = d.getUint8(p);
        if (st & 0x80) { p++; if (st < 0xF0) run = st; } else st = run;
        if (st === 0xFF) {
          const type = u8(), l = vlq();
          if (type === 0x51 && l >= 3) tempos.push([tick, (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2)]);
          else if (type === 0x58 && l >= 2) sigs.push([tick, d.getUint8(p), 2 ** d.getUint8(p + 1)]);
          else if (type === 0x03 && !name) name = new TextDecoder('latin1').decode(new Uint8Array(buf, p, l)).trim();
          p += l;
        } else if (st === 0xF0 || st === 0xF7) { p += vlq(); }
        else {
          const ty = st & 0xF0, ch = st & 15, a = u8(), b = (ty === 0xC0 || ty === 0xD0) ? 0 : u8();
          if (ty === 0x90 && b > 0) { const k = ch * 128 + a; if (!on.has(k)) on.set(k, []); on.get(k).push([tick, b]); }
          else if (ty === 0x80 || (ty === 0x90 && b === 0)) {
            const q = on.get(ch * 128 + a);
            if (q && q.length) { const [s, v] = q.shift(); notes.push({ s, e: tick, m: a, v, ch }); }
          } else if (ty === 0xC0 && prog[ch] == null) prog[ch] = a;
        }
      }
      p = end;
      tracks.push({ name, notes, prog });
    }
    return { div, tracks, tempos, sigs };
  }

  // ---------- 2. partes (uma por pista e canal), tempo em segundos, batidas ----------
  const GM = ['Piano', 'Piano', 'Piano', 'Piano', 'Electric piano', 'Electric piano', 'Harpsichord', 'Clavinet'];
  function instrumentName(prog, ch) {
    if (ch === 9) return 'Drums';
    if (prog == null || prog < 8) return GM[prog || 0];
    const fam = ['Percussion', 'Organ', 'Guitar', 'Bass', 'Strings', 'Ensemble', 'Brass', 'Reed', 'Flute', 'Synth', 'Synth', 'Synth', 'Ethnic', 'Percussion', 'Effects'];
    return fam[Math.floor(prog / 8) - 1] || 'Instrument';
  }
  function analyse(midi) {
    const marks = [[0, 500000]];
    for (const [t, v] of midi.tempos.sort((a, b) => a[0] - b[0])) { if (t === 0) marks[0] = [0, v]; else marks.push([t, v]); }
    const t2s = tick => {
      let s = 0, lt = 0, lv = marks[0][1];
      for (let i = 1; i < marks.length && marks[i][0] < tick; i++) { s += (marks[i][0] - lt) * lv / 1e6 / midi.div; lt = marks[i][0]; lv = marks[i][1]; }
      return s + (tick - lt) * lv / 1e6 / midi.div;
    };
    const parts = []; let endTick = 0;
    midi.tracks.forEach((tr, ti) => {
      const byCh = new Map();
      for (const n of tr.notes) { if (!byCh.has(n.ch)) byCh.set(n.ch, []); byCh.get(n.ch).push(n); endTick = Math.max(endTick, n.e); }
      for (const [ch, ns] of byCh) {
        const notes = ns.map(n => [t2s(n.s), t2s(n.e), n.m, n.v]).sort((a, b) => a[0] - b[0] || a[2] - b[2]);
        const avg = notes.reduce((a, n) => a + n[2], 0) / notes.length;
        const prog = tr.prog[ch] ?? midi.tracks.map(t => t.prog[ch]).find(v => v != null);
        parts.push({ id: parts.length, label: `${tr.name || 'Track ' + (ti + 1)} · ${instrumentName(prog, ch)} · ${notes.length} notes`, notes, avg, prog, drums: ch === 9 });
      }
    });
    const sig = (midi.sigs.sort((a, b) => a[0] - b[0])[0]) || [0, 4, 4];
    const [num, den] = [sig[1], sig[2]];
    let beatTicks, bpb, compound = false;
    if (den === 8 && [6, 9, 12].includes(num)) { beatTicks = midi.div * 1.5; bpb = num / 3; compound = true; } else { beatTicks = midi.div * 4 / den; bpb = num; }
    const beats = [];
    for (let k = 0; k * beatTicks <= endTick + beatTicks; k++) beats.push(t2s(k * beatTicks));
    return { parts, beats, bpb, compound, duration: t2s(endTick) };
  }
  // sugestão: direita = parte de piano mais aguda; esquerda = a mais grave (ou o baixo); se só houver uma, divide pelo Dó central
  function suggest(parts) {
    const ok = parts.filter(p => !p.drums && p.notes.length >= 8);
    if (!ok.length) return { R: null, L: null };
    // melodia = a parte mais "cantável": uma nota de cada vez (monofónica) e aguda
    const mono = p => {
      let groups = 0, single = 0;
      for (let i = 0; i < p.notes.length;) {
        let j = i; while (j < p.notes.length && p.notes[j][0] - p.notes[i][0] < 0.03) j++;
        groups++; if (j - i === 1) single++; i = j;
      }
      return single / Math.max(1, groups);
    };
    const score = p => mono(p) * 2 + (p.avg - 55) / 10 + Math.log10(p.notes.length) / 2;
    const R = ok.reduce((a, b) => (score(b) > score(a) ? b : a));
    const rest = ok.filter(p => p !== R);
    if (!rest.length) return { R: R.id, L: 'split' };
    const bassPart = rest.find(p => p.prog >= 32 && p.prog < 40);
    const piano = rest.filter(p => p.prog == null || p.prog < 8);
    const L = bassPart || (piano.length ? piano : rest).reduce((a, b) => (b.avg < a.avg ? b : a));
    return { R: R.id, L: L.id };
  }

  // ---------- 3. níveis ----------
  const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  const toRange = (m, lo, hi) => { while (m < lo) m += 12; while (m > hi) m -= 12; return m; };
  function melody(notes) {
    const ns = [...notes].sort((a, b) => a[0] - b[0] || b[2] - a[2]), cand = [];
    for (let i = 0; i < ns.length;) {
      let j = i; while (j < ns.length && ns[j][0] - ns[i][0] < 0.05) j++;
      const top = ns.slice(i, j).reduce((a, b) => (b[2] > a[2] ? b : a));
      if (top[2] >= 52) cand.push(top);
      i = j;
    }
    let cur = cand;
    for (let r = 0; r < 3; r++) {
      const keep = [];
      cur.forEach((n, k) => {
        const p = keep[keep.length - 1], q = cur[k + 1];
        if (p && q && n[2] < p[2] - 4 && n[2] < q[2] - 4 && n[0] < p[1] - 0.02) return;
        keep.push(n);
      });
      if (keep.length === cur.length) break;
      cur = keep;
    }
    return cur;
  }
  function bass(notes, beats) {
    const low = notes.filter(n => n[2] < 60), out = [];
    for (let k = 0; k + 1 < beats.length; k++) {
      const a = beats[k], b = beats[k + 1];
      const c = low.filter(n => n[0] >= a - 0.08 && n[0] < b - 0.08);
      if (c.length) { const n = c.reduce((x, y) => (y[2] < x[2] ? y : x)); out.push([a, b, n[2], n[3]]); }
    }
    const merged = [];
    for (const n of out) {
      const l = merged[merged.length - 1];
      if (l && l[2] === n[2] && Math.abs(l[1] - n[0]) < 0.01 && n[1] - l[0] < 2.5) l[1] = n[1]; else merged.push([...n]);
    }
    return merged;
  }
  const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function corr(a, b) {
    const ma = a.reduce((s, x) => s + x, 0) / 12, mb = b.reduce((s, x) => s + x, 0) / 12;
    let n = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return n / Math.sqrt(da * db || 1);
  }
  function keyScale(notes) {
    const h = new Array(12).fill(0);
    for (const n of notes) h[n[2] % 12] += Math.max(0.05, n[1] - n[0]);
    let best = null;
    for (let t = 0; t < 12; t++) for (const [prof, minor] of [[MAJ, false], [MIN, true]]) {
      const r = corr(h, prof.map((_, i) => prof[(i - t + 12) % 12]));
      if (!best || r > best[0]) best = [r, t, minor];
    }
    return new Set((best[2] ? [0, 2, 3, 5, 7, 8, 10, 11] : [0, 2, 4, 5, 7, 9, 11]).map(k => (best[1] + k) % 12));
  }
  function barStart(notes, beats, bpb) {
    const step = med(beats.slice(1).map((b, i) => b - beats[i])), sc = new Array(bpb).fill(0);
    for (const n of notes) {
      const k = Math.round((n[0] - beats[0]) / step);
      if (Math.abs(beats[0] + k * step - n[0]) < 0.05) sc[((k % bpb) + bpb) % bpb] += Math.min(2, n[1] - n[0]);
    }
    return sc.indexOf(Math.max(...sc));
  }
  function chordsPerBar(notes, beats, duration, bpb) {
    const sc = keyScale(notes), b = [...beats], k0 = barStart(notes, beats, bpb), out = [];
    const starts = (k0 ? [0] : []).concat(Array.from({ length: Math.ceil((b.length - 1 - k0) / bpb) }, (_, i) => k0 + i * bpb));
    starts.forEach((i, j) => {
      const a = b[i], e = j + 1 < starts.length ? b[starts[j + 1]] : b[Math.min(i + bpb, b.length - 1)];
      const w = new Array(12).fill(0); let low = null, tot = 0;
      for (const n of notes) {
        const ov = Math.min(n[1], e) - Math.max(n[0], a); if (ov <= 0) continue;
        w[n[2] % 12] += ov; tot += ov; if (low == null || n[2] < low) low = n[2];
      }
      if (tot <= 0) return;
      let best = null;
      for (let r = 0; r < 12; r++) for (const [q, iv] of [['', [0, 4, 7]], ['m', [0, 3, 7]]]) {
        const pcs = iv.map(k => (r + k) % 12), inn = pcs.reduce((s, x) => s + w[x], 0);
        let s = inn - 0.6 * (tot - inn) + (low != null && low % 12 === r ? 0.25 * tot : 0) + 0.3 * w[r];
        if (pcs.every(x => sc.has(x))) s += 0.15 * tot;
        if (!best || s > best[0]) best = [s, r, q];
      }
      if (best[0] > 0.2 * tot) out.push({ t: +a.toFixed(3), d: +(e - a).toFixed(3), r: best[1], q: best[2] });
    });
    return out;
  }
  function chordLevel(chords) {
    const notes = [];
    for (const c of chords) {
      const d = +Math.max(0.3, c.d - 0.06).toFixed(3);
      for (const k of (c.q ? [0, 3, 7] : [0, 4, 7])) notes.push({ t: c.t, d, m: 60 + (c.r + k) % 12, h: 'R' });
      notes.push({ t: c.t, d, m: 48 + c.r, h: 'L' });
    }
    return { notes: notes.sort((a, b) => a.t - b.t || a.m - b.m), transpose: 0 };
  }
  // Iniciante: a melodia inteira, só sem as notas muito rápidas (o tempo delas passa para a anterior); uma oitava para todas
  function easyLine(mel, beats, duration, shift, minFrac) {
    const step = med(beats.slice(1).map((b, i) => b - beats[i])) || 0.5;
    const mono = [];
    for (const n of [...mel].sort((a, b) => a[0] - b[0] || b[2] - a[2])) if (!mono.length || Math.abs(mono[mono.length - 1][0] - n[0]) >= 0.03) mono.push(n);
    const keep = mono.filter((n, i) => ((i + 1 < mono.length ? mono[i + 1][0] : n[1]) - n[0] >= minFrac * step) || (n[1] - n[0] >= minFrac * step));
    return keep.map((n, i) => {
      const nxt = i + 1 < keep.length ? keep[i + 1][0] : n[0] + Math.max(n[1] - n[0], step);
      let m = n[2] + shift; if (m < 53 || m > 88) m = toRange(m, 55, 84);
      return { t: +n[0].toFixed(3), d: +Math.max(0.15, Math.min(nxt - n[0] - 0.03, step * 4)).toFixed(3), m, h: 'R' };
    });
  }
  // há melodia que se cante? (peças só de arpejos quase não têm notas vizinhas)
  function hasMelody(mel) {
    const ms = [...mel].sort((a, b) => a[0] - b[0]).map(n => n[2]), iv = ms.slice(1).map((m, i) => Math.abs(m - ms[i]));
    if (iv.length < 8) return true;
    const near = iv.filter(x => x >= 1 && x <= 2).length / iv.length;
    return !(near < 0.25 && med(iv) >= 4);
  }

  // ---------- 4. música completa ----------
  function buildSong(info, rightId, leftId, title) {
    const byId = id => info.parts.find(p => p.id === +id);
    let R = [], L = [];
    const r = byId(rightId);
    if (leftId === 'split') { for (const n of (r ? r.notes : [])) (n[2] >= 60 ? R : L).push(n); }
    else { R = r ? r.notes : []; const l = byId(leftId); L = l ? l.notes : []; }
    if (R.length < 4) throw new Error('The right hand does not have enough notes. Choose another part.');
    const { beats, bpb, duration } = info;
    const all = R.map(n => [...n, 'R']).concat(L.map(n => [...n, 'L'])).sort((a, b) => a[0] - b[0]);
    const mk = (n, h, m) => ({ t: +n[0].toFixed(3), d: +Math.max(0.1, n[1] - n[0]).toFixed(3), m: m ?? n[2], h: h ?? n[4], v: n[3] });
    const mel = melody(R), shift = 12 * Math.round((67 - med(mel.map(n => n[2]))) / 12);
    const medio = mel.map(n => mk(n, 'R', toRange(n[2] + shift, 60, 84)))
      .concat(bass(L, beats).map(n => mk(n, 'L', toRange(n[2] + shift, 43, 59)))).sort((a, b) => a.t - b.t || a.m - b.m);
    const chords = chordsPerBar(all, beats, duration, bpb);
    const slug = title.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[\s_]+/g, '-').slice(0, 40) || 'musica';
    const step = med(beats.slice(1).map((b, i) => b - beats[i]));
    return {
      id: 'midi-' + slug + '-' + Date.now().toString(36), title, builtin: false, kind: 'midi', credit: 'ficheiro MIDI',
      bpm: +(60 / step).toFixed(1), duration: +(duration + 0.5).toFixed(2), beats: beats.map(b => +b.toFixed(3)), bpb,
      levels_v: 4, added: Math.floor(Date.now() / 1000),
      chords: chords.map(c => ({ t: c.t, r: c.r, q: c.q })),
      levels: {
        acordes: chordLevel(chords),
        facil: { notes: easyLine(mel, beats, duration, shift, info.compound ? 0.3 : 0.45), transpose: shift },
        medio: { notes: medio, transpose: shift },
        dificil: { notes: all.map(n => mk(n)), transpose: 0 },
      },
    };
  }
  return { parse, analyse, suggest, buildSong: (...a) => { const s = buildSong(...a); if (!hasMelody(melody(a[0].parts.find(p => p.id === +a[1])?.notes || []))) delete s.levels.facil; return s; } };
})();
