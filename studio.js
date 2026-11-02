/* studio.js — THE STUDIO (Premium VibeZ) for the Virtual PC.
   Mr. Moore's order 2026-11-01: a recording studio inside his PC,
   modeled on BandLab (phone) + GarageBand (Apple), merged and fitted
   to his screens. Design source of truth: studio-design-spec.md.
   The wide layout replicates the crowned concept picture: colored
   track stack (Kick / Bass / Synth Pad / Vocals) with waveforms and
   per-track volume at LEFT, transport + big red record on TOP, loops
   library at RIGHT, on the dark blue/purple room register.

   AUDIO HONESTY (the spec's Part 3): every sound here is real Web
   Audio — synthesized drums, rendered melodic loops, his imported
   tracks, his recorded takes. Effects are real nodes (3-band EQ,
   compressor, echo, generated-impulse reverb). No plug-ins, no fake
   meters. Recording delay is measured from the AudioContext and
   takes are shifted into line automatically.

   PC CONTRACTS this surface honors:
   - MASTER VOLUME: window.__vpcMasterVol is the PC's one master
     gain, owned by the top window's hub (tools.js, tablet lane):
     it is pushed into this frame as a var + a 'vpc-mastervol'
     postMessage + a call to __vpcApplyMasterVol(). The Studio's
     master fader IS that control: dragging it calls
     top.__vpcSetMasterVol(v) when the hub is present; the value is
     also mirrored from localStorage 'vpc_master_vol' so the fader
     and the hub can never disagree. When the hub has not loaded
     (standalone surface), the fader writes the same localStorage
     keys the hub reads, so the level survives until the hub boots.
   - YOUR MUSIC: the loop library's first shelf reads the soundbar
     lane's published list — window.top.__vpcMusic.tracks (same 6
     entries: the office's five + "Nov 1 Remix"). If the soundbar
     has not loaded, a built-in copy of that exact list is used
     (flagged in the lane report as the seam).
   - ONE AUDIO AT A TIME: starting Studio playback/recording stops
     the soundbar (top.__vpcMusic.stop()); a {vpc:'music'} note from
     the soundbar pauses the Studio.
   - PERSISTENCE: the project autosaves to localStorage
     ('vpc_studio_v1'); audio blobs (imports, takes) live in
     IndexedDB ('vpc-studio'/'audio') so a project always finds its
     sounds after a reload — the shortz/youtube surfaces' pattern.
   - BROTHER LINK: the 🎥 BROTHER button asks the top window
     (brotherlink.js) to open the camera choice panel — inside the
     Studio the invite/video-chat works exactly as in the room. */
(function () {
  'use strict';
  if (window.__vpcStudio) return;

  /* ============================== state ============================== */
  var LS_KEY = 'vpc_studio_v1';
  var uid = 1;
  function nid(p) { return p + (uid++) + '_' + Date.now().toString(36); }

  var COLORS = { kick: '#5aa2ff', bass: '#57d977', pad: '#f59a3d', vox: '#b07fe8',
                 loop: '#f472b6', keys: '#ffd479', drums: '#5aa2ff' };
  var ICONS = {
    drums: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2"><circle cx="12" cy="13" r="7"/><path d="M5 4l6 6M19 3l-6 7"/></svg>',
    bass: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2"><path d="M9 18V6l10-2v11"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/></svg>',
    pad: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M11 5v14M15 5v14M19 5v14" opacity=".45"/></svg>',
    vox: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    loop: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2"><path d="M17 2l3 3-3 3"/><path d="M3 12v-1a5 5 0 0 1 5-5h12M7 22l-3-3 3-3"/><path d="M21 12v1a5 5 0 0 1-5 5H4"/></svg>'
  };
  function icon(kind, color) { return (ICONS[kind] || ICONS.loop).replace(/COLOR/g, color); }

  /* Drum voices the pads + sequencer play. All synthesized. */
  var DRUMS = ['kick', 'snare', 'clap', 'chat', 'ohat', 't808', 'tom', 'rim',
               'shaker', 'crash', 'kick2', 'snare2', 'ride', 'perc', 'fx', 'mute'];
  var SEQROWS = ['kick', 'snare', 'chat', 't808'];

  function defPattern(name) {
    var p = { kick: [], snare: [], chat: [], t808: [] };
    for (var i = 0; i < 16; i++) {
      p.kick.push(i % 4 === 0 ? 1 : 0);
      p.snare.push(i === 4 || i === 12 ? 1 : 0);
      p.chat.push(i % 2 === 0 ? 1 : 0);
      p.t808.push(0);
    }
    if (name === 'Trap Kit') {
      p.chat = [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,1,0];
      p.t808 = [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,1,0,0];
      p.kick = [1,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0];
    }
    return p;
  }

  function newTrack(kind, name, color) {
    return {
      id: nid('t'), kind: kind, name: name, color: color || COLORS.loop,
      gain: 0.8, pan: 0, eq: { lo: 0, mid: 0, hi: 0 }, comp: 0.25, echo: 0, verb: 0.12,
      mute: false, solo: false, armed: false,
      regions: [],            /* {id,start,len,bufKey,takeId,label,empty} beats */
      pattern: kind === 'drums' ? defPattern(name) : null,
      takes: []               /* voice: {id, bufKey, ts, name} */
    };
  }
  function newRegion(start, len, bufKey, label, extra) {
    var r = { id: nid('r'), start: start, len: len, bufKey: bufKey || null,
              takeId: null, label: label || '', empty: false };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }

  var P = null;               /* the project */
  function defaultProject() {
    var p = { name: 'Untitled Project', bpm: 95, key: 'C Minor', lenBars: 8, tracks: [] };
    var kick = newTrack('drums', 'Kick', COLORS.kick);
    kick.regions.push(newRegion(0, 32, null, 'Kick_01', { pattern: true }));
    var bass = newTrack('audio', 'Bass', COLORS.bass);
    bass.regions.push(newRegion(0, 32, 'crate-bass', 'Bass Loop'));
    var pad = newTrack('audio', 'Synth Pad', COLORS.pad);
    pad.regions.push(newRegion(0, 32, 'crate-pad', 'Synth Pad Cmin'));
    var vox = newTrack('voice', 'Vocals', COLORS.vox);
    vox.gain = 0.85; vox.verb = 0.22; vox.comp = 0.45;
    /* the picture's purple Vox Hook block: an empty take slot until
       he records into it — drawn, named, and silent on purpose. */
    vox.regions.push(newRegion(0, 32, null, 'Vox Hook — record your take', { empty: true }));
    p.tracks = [kick, bass, pad, vox];
    return p;
  }

  var ROW_H = 80;               /* timeline lane + header row height */
  var S = {
    sel: null,                  /* selected track id */
    selRegion: null,
    playing: false, playBeat: 0, playCtxT: 0,
    rec: null,                  /* recording session */
    pxBeat: 26,                 /* timeline zoom */
    drawer: 'paneStrip',
    master: 1, masterMuted: false,
    latencySec: 0.18,
    log: []
  };
  function log(s) { S.log.push(s); if (S.log.length > 80) S.log.shift(); try { console.log('VPC STUDIO: ' + s); } catch (e) {} }
  function trackById(id) { for (var i = 0; i < P.tracks.length; i++) if (P.tracks[i].id === id) return P.tracks[i]; return null; }
  function selTrack() { return trackById(S.sel) || P.tracks[0]; }
  function beatSec() { return 60 / P.bpm; }
  function projectBeats() { return P.lenBars * 4; }
  function anySolo() { return P.tracks.some(function (t) { return t.solo; }); }
  function audible(t) { return !t.mute && (!anySolo() || t.solo); }

  /* ============================== persistence ============================== */
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        var slim = { name: P.name, bpm: P.bpm, key: P.key, lenBars: P.lenBars,
          tracks: P.tracks.map(function (t) {
            return { id: t.id, kind: t.kind, name: t.name, color: t.color, gain: t.gain, pan: t.pan,
              eq: t.eq, comp: t.comp, echo: t.echo, verb: t.verb, mute: t.mute, solo: t.solo,
              pattern: t.pattern,
              regions: t.regions.map(function (r) {
                return { id: r.id, start: r.start, len: r.len, bufKey: r.bufKey, takeId: r.takeId, label: r.label, empty: r.empty, pattern: r.pattern };
              }),
              takes: t.takes.map(function (tk) { return { id: tk.id, bufKey: tk.bufKey, ts: tk.ts, name: tk.name }; }) };
          }) };
        localStorage.setItem(LS_KEY, JSON.stringify(slim));
      } catch (e) { log('save failed: ' + e.message); }
    }, 250);
  }
  function loadSaved() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || !p.tracks || !p.tracks.length) return null;
      p.tracks.forEach(function (t) { t.armed = false; });
      return p;
    } catch (e) { return null; }
  }
  function resetProject() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    P = defaultProject(); S.sel = P.tracks[0].id; S.selRegion = null;
    buildAll(); save(); toast('New project — the slate is clean');
  }

  /* IndexedDB for audio blobs (imports + takes) */
  var idb = null;
  function idbOpen() {
    return new Promise(function (res) {
      if (idb) return res(idb);
      var rq = indexedDB.open('vpc-studio', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('audio'); };
      rq.onsuccess = function () { idb = rq.result; res(idb); };
      rq.onerror = function () { res(null); };
    });
  }
  function idbPut(key, blob) {
    return idbOpen().then(function (db) {
      if (!db) return false;
      return new Promise(function (res) {
        var tx = db.transaction('audio', 'readwrite');
        tx.objectStore('audio').put(blob, key);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { res(false); };
      });
    });
  }
  function idbGet(key) {
    return idbOpen().then(function (db) {
      if (!db) return null;
      return new Promise(function (res) {
        var rq = db.transaction('audio', 'readonly').objectStore('audio').get(key);
        rq.onsuccess = function () { res(rq.result || null); };
        rq.onerror = function () { res(null); };
      });
    });
  }

  /* ============================== audio core ============================== */
  var AC = null, master = null, compNode = null;
  var buffers = {};             /* bufKey -> AudioBuffer */
  var chains = {};              /* trackId -> live chain nodes */
  var analysers = {};           /* trackId -> AnalyserNode (meters) */

  function ctx() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return AC; }
    var Ctor = window.AudioContext || window.webkitAudioContext;
    AC = new Ctor({ latencyHint: 'interactive' });
    master = AC.createGain();
    master.gain.value = S.masterMuted ? 0 : S.master;
    var masterComp = AC.createDynamicsCompressor();
    masterComp.threshold.value = -14; masterComp.ratio.value = 3;
    master.connect(masterComp); masterComp.connect(AC.destination);
    S.latencySec = (AC.outputLatency || 0) + (AC.baseLatency || 0) || 0.18;
    log('audio up — latency measured ' + Math.round(S.latencySec * 1000) + 'ms, takes auto-align by it');
    return AC;
  }
  function impulseBuf(c, dur, decay) {
    var rate = c.sampleRate, len = Math.floor(rate * dur);
    var buf = c.createBuffer(2, len, rate), d0 = buf.getChannelData(0), d1 = buf.getChannelData(1);
    for (var i = 0; i < len; i++) {
      var v = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      d0[i] = v; d1[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  /* one chain builder for live + offline render: source in, track out */
  function buildChain(c, dest, t, withAnalyser) {
    var inp = c.createGain();
    var lo = c.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 160; lo.gain.value = t.eq.lo;
    var mid = c.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.9; mid.gain.value = t.eq.mid;
    var hi = c.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 4200; hi.gain.value = t.eq.hi;
    var comp = c.createDynamicsCompressor();
    comp.threshold.value = -6 - t.comp * 26; comp.ratio.value = 1 + t.comp * 9; comp.knee.value = 18;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    var g = c.createGain(); g.gain.value = t.gain;
    var pan = (c.createStereoPanner) ? c.createStereoPanner() : null;
    if (pan) pan.pan.value = t.pan;
    var echo = c.createDelay(1.5); echo.delayTime.value = beatSec() * 0.75;
    var echoFb = c.createGain(); echoFb.gain.value = 0.34;
    var echoWet = c.createGain(); echoWet.gain.value = t.echo * 0.5;
    echo.connect(echoFb); echoFb.connect(echo); echo.connect(echoWet);
    var verb = c.createConvolver(); verb.buffer = impulseBuf(c, 1.9, 2.4);
    var verbWet = c.createGain(); verbWet.gain.value = t.verb * 0.55;
    verb.connect(verbWet);
    inp.connect(lo); lo.connect(mid); mid.connect(hi); hi.connect(comp); comp.connect(g);
    var tail = g;
    if (pan) { g.connect(pan); tail = pan; }
    tail.connect(dest);
    g.connect(echo); echoWet.connect(dest);
    g.connect(verb); verbWet.connect(dest);
    var an = null;
    if (withAnalyser && c.createAnalyser) { an = c.createAnalyser(); an.fftSize = 256; g.connect(an); }
    return { input: inp, lo: lo, mid: mid, hi: hi, comp: comp, gain: g, pan: pan, echoWet: echoWet, verbWet: verbWet, analyser: an };
  }
  function liveChain(t) {
    if (!chains[t.id]) {
      var ch = buildChain(AC, master, t, true);
      chains[t.id] = ch; analysers[t.id] = ch.analyser;
    }
    return chains[t.id];
  }
  function refreshChain(t) {
    var ch = chains[t.id]; if (!ch) return;
    ch.lo.gain.value = t.eq.lo; ch.mid.gain.value = t.eq.mid; ch.hi.gain.value = t.eq.hi;
    ch.comp.threshold.value = -6 - t.comp * 26; ch.comp.ratio.value = 1 + t.comp * 9;
    ch.gain.gain.value = t.gain; if (ch.pan) ch.pan.pan.value = t.pan;
    ch.echoWet.gain.value = t.echo * 0.5; ch.verbWet.gain.value = t.verb * 0.55;
  }

  /* -------- synthesized drums (ctx-param so offline render reuses) -------- */
  function drumHit(c, dest, name, when, vel) {
    vel = vel || 0.9;
    var t = when;
    function env(g, peak, dur) { g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); }
    function osc(type, f0, f1, dur, peak, destNode) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      env(g, peak, dur); o.connect(g); g.connect(destNode || dest); o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(dur, peak, fType, freq, q) {
      var len = Math.max(1, Math.floor(c.sampleRate * dur));
      var buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      var src = c.createBufferSource(); src.buffer = buf;
      var f = c.createBiquadFilter(); f.type = fType; f.frequency.value = freq; f.Q.value = q || 0.8;
      var g = c.createGain(); env(g, peak, dur);
      src.connect(f); f.connect(g); g.connect(dest); src.start(t); src.stop(t + dur + 0.05);
    }
    switch (name) {
      case 'kick': case 'kick2': osc('sine', name === 'kick' ? 150 : 120, 42, 0.24, vel); break;
      case 'snare': case 'snare2': noise(0.16, vel * 0.7, 'highpass', 1400); osc('triangle', name === 'snare' ? 190 : 170, 120, 0.09, vel * 0.5); break;
      case 'clap': noise(0.22, vel * 0.6, 'bandpass', 1500, 1.4); break;
      case 'chat': noise(0.05, vel * 0.42, 'highpass', 7500); break;
      case 'ohat': noise(0.3, vel * 0.4, 'highpass', 7200); break;
      case 't808': osc('sine', 96, 40, 0.5, vel); break;
      case 'tom': osc('sine', 210, 95, 0.22, vel * 0.8); break;
      case 'rim': osc('square', 1700, 1500, 0.04, vel * 0.3); noise(0.03, vel * 0.25, 'bandpass', 3200, 2); break;
      case 'shaker': noise(0.09, vel * 0.3, 'highpass', 5600); break;
      case 'crash': noise(0.7, vel * 0.4, 'highpass', 6000); break;
      case 'ride': osc('square', 4200, 4100, 0.25, vel * 0.1); noise(0.2, vel * 0.2, 'highpass', 8200); break;
      case 'perc': osc('sine', 640, 420, 0.1, vel * 0.5); break;
      case 'fx': osc('sawtooth', 300, 1400, 0.3, vel * 0.2); break;
      default: break; /* 'mute' pad: a rest you can tap */
    }
  }

  /* -------- built-in crate buffers, rendered offline at project BPM -------- */
  function noteFreq(n) { return 440 * Math.pow(2, (n - 69) / 12); }   /* midi -> Hz */
  function renderCrate() {
    var bpm = P.bpm, spb = 60 / bpm, total = spb * 32;
    var rate = 44100;
    function make(fn) {
      var oc = new OfflineAudioContext(2, Math.ceil(rate * total), rate);
      fn(oc);
      return oc.startRendering().then(function (buf) { return buf; });
    }
    /* Bass line — C minor groove: C2 C2 Eb2 C2 / C2 C2 G1 Bb1 … */
    var bassSeq = [36, 36, 39, 36, 36, 39, 41, 39, 36, 36, 39, 36, 43, 41, 39, 34,
                   36, 36, 39, 36, 36, 39, 41, 39, 44, 43, 41, 39, 36, 34, 31, 34];
    var bassP = make(function (oc) {
      for (var i = 0; i < 32; i++) {
        var o = oc.createOscillator(), f = oc.createBiquadFilter(), g = oc.createGain();
        o.type = 'sawtooth'; o.frequency.value = noteFreq(bassSeq[i]);
        f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 4;
        var t0 = i * spb / 2, dur = spb / 2 * 0.92;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        o.connect(f); f.connect(g); g.connect(oc.destination);
        o.start(t0); o.stop(t0 + dur + 0.05);
      }
    });
    /* Synth pad — Cm · Ab · Eb · Bb, 2 bars each, detuned triangles */
    var chords = [[48, 51, 55, 60], [44, 48, 51, 55], [51, 55, 58, 63], [46, 50, 53, 58]];
    var padP = make(function (oc) {
      chords.forEach(function (ch, ci) {
        var t0 = ci * spb * 8, dur = spb * 8;
        ch.forEach(function (n) {
          [-6, 5].forEach(function (det) {
            var o = oc.createOscillator(), g = oc.createGain(), f = oc.createBiquadFilter();
            o.type = 'triangle'; o.frequency.value = noteFreq(n); o.detune.value = det;
            f.type = 'lowpass'; f.frequency.value = 1500;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(0.075, t0 + spb * 1.5);
            g.gain.setValueAtTime(0.075, t0 + dur - spb * 1.5);
            g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
            o.connect(f); f.connect(g); g.connect(oc.destination);
            o.start(t0); o.stop(t0 + dur + 0.05);
          });
        });
      });
    });
    /* Keys pluck — sparse C-minor melody */
    var keysSeq = [72, 0, 75, 0, 79, 0, 75, 72, 0, 0, 70, 0, 72, 0, 0, 0,
                   72, 0, 75, 0, 82, 0, 79, 75, 74, 0, 75, 0, 0, 0, 0, 0];
    var keysP = make(function (oc) {
      for (var i = 0; i < 32; i++) {
        if (!keysSeq[i]) continue;
        var t0 = i * spb / 2;
        [0, 1205].forEach(function (det) {
          var o = oc.createOscillator(), g = oc.createGain();
          o.type = 'sine'; o.frequency.value = noteFreq(keysSeq[i]); o.detune.value = det === 0 ? 0 : -1195;
          var peak = det === 0 ? 0.22 : 0.06;
          g.gain.setValueAtTime(peak, t0);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + spb * 0.9);
          o.connect(g); g.connect(oc.destination); o.start(t0); o.stop(t0 + spb);
        });
      }
    });
    return Promise.all([bassP, padP, keysP]).then(function (r) {
      buffers['crate-bass'] = r[0]; buffers['crate-pad'] = r[1]; buffers['crate-keys'] = r[2];
      log('crate rendered at ' + bpm + ' BPM');
      drawAllWaveforms();
    });
  }

  /* ============================== transport ============================== */
  var schedTimer = null, liveSrcs = [], rafId = 0;
  function claimAudio() {
    try { if (window.top && window.top.__vpcMusic) window.top.__vpcMusic.stop(); } catch (e) {}
    try { if (window.__vpcMusic) window.__vpcMusic.stop(); } catch (e) {}
  }
  window.addEventListener('message', function (e) {
    if (e.data && e.data.vpc === 'music' && e.data.on && S.playing) {
      log('soundbar took the room — studio yields');
      stopPlayback();
    }
    if (e.data && e.data.type === 'vpc-mastervol') applyMaster(e.data.vol, e.data.muted);
  });

  function scheduleRegion(t, r, fromBeat, toBeat, when0) {
    /* drum-pattern region */
    if (r.pattern && t.pattern) {
      var spb = beatSec(), stepDur = spb / 4;
      var startBeat = Math.max(r.start, fromBeat), endBeat = Math.min(r.start + r.len, toBeat);
      for (var b = startBeat; b < endBeat; b += 0.25) {
        var idx = Math.round(b * 4) % 16, barOff = Math.floor((b - r.start) * 4) % 16;
        var when = when0 + (b - fromBeat) * spb;
        SEQROWS.forEach(function (voice) {
          if (t.pattern[voice] && t.pattern[voice][barOff]) {
            drumHit(AC, liveChain(t).input, voice, when, 0.95);
          }
        });
        void idx;
      }
      return;
    }
    var buf = r.bufKey && buffers[r.bufKey];
    if (!buf || r.empty) return;
    var spb2 = beatSec();
    var r0 = Math.max(r.start, fromBeat), r1 = Math.min(r.start + r.len, toBeat);
    if (r1 <= r0) return;
    var src = AC.createBufferSource(); src.buffer = buf; src.loop = false;
    src.connect(liveChain(t).input);
    var when = when0 + (r0 - fromBeat) * spb2;
    var off = (r0 - r.start) * spb2;
    var dur = (r1 - r0) * spb2;
    try { src.start(when, off % buf.duration, dur + 0.1); } catch (e) { return; }
    liveSrcs.push(src);
    src.onended = function () { var i = liveSrcs.indexOf(src); if (i >= 0) liveSrcs.splice(i, 1); };
  }
  function schedulerTick() {
    if (!S.playing) return;
    var ahead = 0.18;
    var nowBeat = S.playBeat + (AC.currentTime - S.playCtxT) / beatSec();
    var until = nowBeat + ahead / beatSec();
    if (S.schedUntil === undefined) S.schedUntil = nowBeat;
    if (until <= S.schedUntil) return;
    var from = S.schedUntil, to = Math.min(until, projectBeats());
    P.tracks.forEach(function (t) {
      if (!audible(t)) return;
      t.regions.forEach(function (r) {
        scheduleRegion(t, r, from, to, S.playCtxT + (from - S.playBeat) * beatSec());
      });
    });
    S.schedUntil = to;
    if (to >= projectBeats() && !S.loopAll) {
      var remain = (projectBeats() - nowBeat) * beatSec();
      setTimeout(function () { if (S.playing) stopPlayback(); }, Math.max(0, remain * 1000) + 120);
    }
  }
  function startPlayback(fromBeat) {
    ctx(); claimAudio();
    stopPlayback(true);
    P.tracks.forEach(function (t) { liveChain(t); refreshChain(t); });
    S.playing = true; S.playBeat = fromBeat || 0; S.playCtxT = AC.currentTime + 0.06;
    S.schedUntil = S.playBeat;
    schedTimer = setInterval(schedulerTick, 30);
    schedulerTick();
    document.getElementById('btnPlay').textContent = '⏸';
    rafLoop();
    log('playing from beat ' + S.playBeat);
  }
  function stopPlayback(silent) {
    S.playing = false;
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    liveSrcs.slice().forEach(function (s) { try { s.onended = null; s.stop(); } catch (e) {} });
    liveSrcs = [];
    var pb = document.getElementById('btnPlay'); if (pb) pb.textContent = '▶';
    if (!silent) { S.playBeat = 0; movePlayhead(0); setClock(0); }
  }
  function nowBeatFloat() {
    if (!S.playing || !AC) return S.playBeat;
    return Math.min(projectBeats(), S.playBeat + (AC.currentTime - S.playCtxT) / beatSec());
  }
  function rafLoop() {
    cancelAnimationFrame(rafId);
    function step() {
      var b = nowBeatFloat();
      movePlayhead(b); setClock(b);
      /* sequencer step highlight */
      if (S.playing) drawSeq(b);
      drawMeters();
      if (S.playing || S.rec) rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);
  }
  function movePlayhead(b) {
    var ph = document.getElementById('playhead');
    if (ph) ph.style.left = (b * S.pxBeat) + 'px';
    var lanes = document.getElementById('lanes');
    if (lanes && S.playing) {
      var x = b * S.pxBeat;
      if (x > lanes.scrollLeft + lanes.clientWidth - 60 || x < lanes.scrollLeft) lanes.scrollLeft = Math.max(0, x - 40);
    }
  }
  function setClock(b) {
    var sec = b * beatSec();
    var f = Math.floor((sec % 1) * 24), s = Math.floor(sec) % 60, m = Math.floor(sec / 60) % 60, hh = Math.floor(sec / 3600);
    document.getElementById('clock').textContent =
      String(hh).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + ':' + String(f).padStart(2, '0');
  }
  var meterData = new Uint8Array(64);
  function drawMeters() {
    P.tracks.forEach(function (t) {
      var an = analysers[t.id]; if (!an) return;
      an.getByteTimeDomainData(meterData);
      var peak = 0;
      for (var i = 0; i < meterData.length; i++) { var v = Math.abs(meterData[i] - 128) / 128; if (v > peak) peak = v; }
      var el = document.querySelector('.trk[data-id="' + t.id + '"] .meter i');
      if (el) el.style.width = Math.min(100, peak * 130) + '%';
    });
    if (S.rec && S.rec.analyser) {
      S.rec.analyser.getByteTimeDomainData(meterData);
      var pk = 0;
      for (var j = 0; j < meterData.length; j++) { var w = Math.abs(meterData[j] - 128) / 128; if (w > pk) pk = w; }
      var rm = document.getElementById('recMeterFill');
      if (rm) { rm.style.width = Math.min(100, pk * 130) + '%'; rm.style.background = pk > 0.92 ? '#ff5964' : ''; }
    }
  }
  function metronomeClick(when, accent) {
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = 'sine'; o.frequency.value = accent ? 1560 : 1040;
    g.gain.setValueAtTime(0.25, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.06);
    o.connect(g); g.connect(master); o.start(when); o.stop(when + 0.08);
  }

  /* ============================== recording ============================== */
  function armedTrack() { return P.tracks.filter(function (t) { return t.armed && t.kind === 'voice'; })[0] || null; }
  function startRecording() {
    var t = armedTrack();
    if (!t) { /* arm the first voice track, BandLab-style: record means voice */
      t = P.tracks.filter(function (x) { return x.kind === 'voice'; })[0];
      if (!t) { toast('Add a Voice track first — tap + Add Track'); return; }
      t.armed = true; renderRail();
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('No microphone path on this screen — the mic rides the PC app shell');
      return;
    }
    ctx(); claimAudio();
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } })
      .then(function (stream) { beginTake(t, stream); })
      .catch(function () { toast('Microphone unavailable — permission denied or no mic on this device'); });
  }
  function beginTake(t, stream) {
    stopPlayback();
    var src = AC.createMediaStreamSource(stream);
    var an = AC.createAnalyser(); an.fftSize = 512; src.connect(an);
    var rec = new MediaRecorder(stream);
    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    S.rec = { track: t, stream: stream, rec: rec, chunks: chunks, analyser: an, startBeat: 0, counting: true };
    /* count-in: 4 beats, big numbers, metronome — then the take rolls */
    var ci = document.getElementById('countIn');
    ci.style.display = 'flex';
    var spb = beatSec(), t0 = AC.currentTime + 0.08;
    for (var i = 0; i < 4; i++) metronomeClick(t0 + i * spb, i === 0);
    var n = 4;
    ci.textContent = n;
    var iv = setInterval(function () {
      n--;
      if (n <= 0) {
        clearInterval(iv); ci.style.display = 'none';
        S.rec.counting = false;
        S.rec.startBeat = Math.floor(nowBeatFloat() / 4) * 4;
        rec.start(200);
        document.getElementById('btnRec').classList.add('rec');
        startPlayback(S.rec.startBeat);   /* backing plays; only his voice is captured */
        S.rec.playingBacking = true;
        log('take rolling on "' + t.name + '" from bar ' + (S.rec.startBeat / 4 + 1));
      } else ci.textContent = n;
    }, spb * 1000);
    toast('Count-in… sing when it hits 1 — headphones keep the beat out of the mic');
    rafLoop();
  }
  function stopRecording() {
    var R = S.rec; if (!R) return;
    var t = R.track;
    var wasCounting = R.counting;
    S.rec = null;
    document.getElementById('btnRec').classList.remove('rec');
    document.getElementById('countIn').style.display = 'none';
    stopPlayback();
    if (wasCounting || !R.rec || R.rec.state === 'inactive') {
      R.stream.getTracks().forEach(function (tr) { tr.stop(); });
      return;
    }
    R.rec.onstop = function () {
      R.stream.getTracks().forEach(function (tr) { tr.stop(); });
      var blob = new Blob(R.chunks, { type: R.rec.mimeType || 'audio/webm' });
      finishTake(t, R, blob);
    };
    try { R.rec.stop(); } catch (e) { R.stream.getTracks().forEach(function (tr) { tr.stop(); }); }
  }
  function finishTake(t, R, blob) {
    var takeId = nid('take');
    var bufKey = 'take:' + takeId;
    idbPut(bufKey, blob).then(function () {
      return blob.arrayBuffer();
    }).then(function (ab) {
      return AC.decodeAudioData(ab);
    }).then(function (buf) {
      buffers[bufKey] = buf;
      var take = { id: takeId, bufKey: bufKey, ts: Date.now(), name: 'Take ' + (t.takes.length + 1) };
      t.takes.push(take);
      /* auto-align: shift the take earlier by the measured latency */
      var latBeats = S.latencySec / beatSec();
      var start = Math.max(0, Math.round((R.startBeat - latBeats) * 4) / 4);
      var lenBeats = Math.max(1, Math.round(buf.duration / beatSec()));
      /* the picture's empty Vox Hook slot is consumed by the first real take */
      t.regions = t.regions.filter(function (r) { return !r.empty; });
      var reg = newRegion(start, lenBeats, bufKey, take.name, { takeId: takeId });
      t.regions.push(reg);
      S.sel = t.id; S.selRegion = reg.id;
      save(); renderAll();
      log('take landed: ' + take.name + ', ' + buf.duration.toFixed(1) + 's, aligned -' + Math.round(S.latencySec * 1000) + 'ms');
      toast(take.name + ' is on the track — aligned to the beat');
    }).catch(function (e) {
      log('take decode failed: ' + e.message);
      toast('That take could not be read back — try once more');
    });
  }
  /* one-tap Clean Up: de-rumble + de-ess harshness + gentle leveling,
     rendered offline through real nodes; edge silence trimmed. */
  function cleanTake(t, take) {
    var buf = buffers[take.bufKey];
    if (!buf) { toast('That take is not loaded yet'); return Promise.resolve(false); }
    var oc = new OfflineAudioContext(1, buf.length, buf.sampleRate);
    var src = oc.createBufferSource(); src.buffer = buf;
    var hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85;
    var ls = oc.createBiquadFilter(); ls.type = 'lowshelf'; ls.frequency.value = 220; ls.gain.value = -4;
    var comp = oc.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    src.connect(hp); hp.connect(ls); ls.connect(comp); comp.connect(oc.destination);
    src.start(0);
    return oc.startRendering().then(function (out) {
      /* trim leading/trailing near-silence */
      var d = out.getChannelData(0), a = 0, b = d.length - 1, TH = 0.012;
      while (a < d.length && Math.abs(d[a]) < TH) a++;
      while (b > a && Math.abs(d[b]) < TH) b--;
      var pad = Math.floor(out.sampleRate * 0.05);
      a = Math.max(0, a - pad); b = Math.min(d.length - 1, b + pad);
      var nb = oc.createBuffer(1, Math.max(1, b + 1 - a), out.sampleRate);
      nb.getChannelData(0).set(d.subarray(a, b + 1));
      buffers[take.bufKey] = nb;
      /* refresh any region using this take so its length follows */
      t.regions.forEach(function (r) {
        if (r.takeId === take.id) r.len = Math.max(1, Math.round(nb.duration / beatSec()));
      });
      save(); renderAll();
      log('clean up done on ' + take.name);
      toast('Cleaned up — rumble out, level evened');
      return true;
    });
  }

  /* ============================== your music (soundbar contract) ============================== */
  var OFFICE = 'https://xmrmathx.github.io/agent-office/assets/';
  var FALLBACK_TRACKS = [
    { name: 'Dusty Vinyl', dur: '2:42', src: OFFICE + 'music-dusty-vinyl.mp3' },
    { name: 'This and That', dur: '2:12', src: OFFICE + 'music-this-and-that.mp3' },
    { name: 'Almost There', dur: '2:27', src: OFFICE + 'music-almost-there.mp3' },
    { name: 'AO', dur: '2:28', src: OFFICE + 'music-ao.mp3' },
    { name: '8bit Office', dur: '3:03', src: OFFICE + 'music-8bit-office.mp3' },
    { name: 'Nov 1 Remix', dur: '2:32', src: 'audio/nov1-remix.mp3' }
  ];
  function yourMusic() {
    try {
      var M = (window.top && window.top.__vpcMusic) || window.__vpcMusic;
      if (M && M.tracks && M.tracks.length) {
        var base = (window.top && window.top.location ? window.top.location.href : location.href);
        return M.tracks.map(function (t) {
          var src = t.src;
          try { src = new URL(t.src, base).href; } catch (e) {}
          return { name: t.name, dur: t.dur, src: src };
        });
      }
    } catch (e) {}
    return FALLBACK_TRACKS.map(function (t) {
      var src = t.src;
      try { src = new URL(t.src, (window.top && window.top.location ? window.top.location.href : location.href)).href; } catch (e) {}
      return { name: t.name, dur: t.dur, src: src };
    });
  }
  var CRATE = [
    { name: 'Bass Line — C Minor', dur: 'loop', bufKey: 'crate-bass', ic: '🎸' },
    { name: 'Synth Pad — C Minor', dur: 'loop', bufKey: 'crate-pad', ic: '🎹' },
    { name: 'Keys Pluck — C Minor', dur: 'loop', bufKey: 'crate-keys', ic: '🎵' },
    { name: 'Boom Bap Kit', dur: 'kit', kit: 'Boom Bap Kit', ic: '🥁' },
    { name: 'Trap Kit', dur: 'kit', kit: 'Trap Kit', ic: '🥁' }
  ];
  var importBusy = {};
  function importYourMusic(item, done) {
    ctx();
    var key = 'imp:' + item.src;
    if (buffers[key]) { placeImport(item, key); if (done) done(key); return; }
    if (importBusy[key]) return;
    importBusy[key] = true;
    toast('Bringing "' + item.name + '" in…');
    idbGet(key).then(function (blob) {
      if (blob) return blob.arrayBuffer();
      return fetch(item.src).then(function (r) {
        if (!r.ok) throw new Error('fetch ' + r.status);
        return r.blob().then(function (b) { idbPut(key, b); return b.arrayBuffer(); });
      });
    }).then(function (ab) {
      return AC.decodeAudioData(ab);
    }).then(function (buf) {
      buffers[key] = buf;
      delete importBusy[key];
      placeImport(item, key);
      if (done) done(key);
    }).catch(function (e) {
      delete importBusy[key];
      log('import failed for ' + item.name + ': ' + e.message);
      toast('"' + item.name + '" could not load here — check the connection');
      if (done) done(null);
    });
  }
  function placeImport(item, key) {
    var buf = buffers[key];
    var lenBeats = Math.max(4, Math.round(buf.duration / beatSec() / 4) * 4);
    var t = newTrack('audio', item.name, COLORS.loop);
    t.regions.push(newRegion(0, lenBeats, key, item.name));
    P.tracks.push(t);
    ensureLen(lenBeats);
    S.sel = t.id;
    save(); renderAll();
    toast('"' + item.name + '" is on the timeline');
    log('imported ' + item.name + ' (' + buf.duration.toFixed(1) + 's)');
  }
  function placeCrate(item) {
    if (item.kit) {
      var t = newTrack('drums', item.kit, COLORS.drums);
      t.pattern = defPattern(item.kit);
      t.regions.push(newRegion(0, projectBeats(), null, item.kit, { pattern: true }));
      P.tracks.push(t); S.sel = t.id; save(); renderAll();
      toast(item.kit + ' added — program it in PADS');
      return;
    }
    ctx();
    var buf = buffers[item.bufKey];
    if (!buf) { toast('The crate is still warming up — one second'); renderCrate().then(function () { placeCrate(item); }); return; }
    var t2 = newTrack('audio', item.name.split(' — ')[0], item.bufKey === 'crate-bass' ? COLORS.bass : (item.bufKey === 'crate-pad' ? COLORS.pad : COLORS.keys));
    t2.regions.push(newRegion(0, projectBeats(), item.bufKey, item.name));
    P.tracks.push(t2); S.sel = t2.id; save(); renderAll();
  }
  function ensureLen(beats) {
    var need = Math.ceil(beats / 4);
    if (need > P.lenBars) P.lenBars = need;
  }

  /* ============================== master volume contract ============================== */
  function applyMaster(vol, muted) {
    if (typeof vol === 'number' && !isNaN(vol)) S.master = Math.max(0, Math.min(1, vol));
    if (typeof muted === 'boolean') S.masterMuted = muted;
    if (master && AC) master.gain.setTargetAtTime(S.masterMuted ? 0 : S.master, AC.currentTime, 0.03);
    var sl = document.getElementById('master'), pc = document.getElementById('masterPct');
    if (sl) sl.value = Math.round(S.master * 100);
    if (pc) pc.textContent = S.masterMuted ? 'MUTE' : Math.round(S.master * 100) + '%';
  }
  window.__vpcApplyMasterVol = function () {
    var v = (typeof window.__vpcMasterVol === 'number') ? window.__vpcMasterVol : null;
    if (v !== null) applyMaster(v, v === 0 && S.master > 0 ? S.masterMuted : S.masterMuted);
    else readMasterLocal();
  };
  function readMasterLocal() {
    try {
      var sv = localStorage.getItem('vpc_master_vol');
      var mu = localStorage.getItem('vpc_master_muted') === '1';
      if (sv !== null && sv !== '') applyMaster(parseFloat(sv), mu);
    } catch (e) {}
  }
  function setMaster(v) {
    S.master = Math.max(0, Math.min(1, v));
    var done = false;
    try {
      if (window.top && typeof window.top.__vpcSetMasterVol === 'function') { window.top.__vpcSetMasterVol(S.master); done = true; }
    } catch (e) {}
    if (!done) {
      try {
        localStorage.setItem('vpc_master_vol', String(S.master));
        if (S.master > 0) localStorage.setItem('vpc_master_muted', '0');
        if (window.top) { window.top.__vpcMasterVol = S.master; }
        window.__vpcMasterVol = S.master;
        var ev = new CustomEvent('vpc-mastervol', { detail: { vol: S.master, muted: false } });
        try { window.top.dispatchEvent(ev); } catch (e) {}
        window.dispatchEvent(ev);
      } catch (e) {}
    }
    applyMaster(S.master, false);
    log('master set to ' + Math.round(S.master * 100) + '% via ' + (done ? 'the PC hub' : 'the shared level store'));
  }

  /* ============================== rendering ============================== */
  var $ = function (id) { return document.getElementById(id); };
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.style.display = 'block';
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.style.display = 'none'; }, 3400);
  }
  function renderRail() {
    var wrap = $('tracks'); wrap.innerHTML = '';
    P.tracks.forEach(function (t) {
      var d = document.createElement('div');
      d.className = 'trk' + (t.id === S.sel ? ' sel' : '') + (t.armed ? ' armed' : '');
      d.dataset.id = t.id;
      var nm = document.createElement('div'); nm.className = 'nm';
      nm.innerHTML = icon(t.kind === 'drums' ? 'drums' : t.kind === 'voice' ? 'vox' : t.kind === 'audio' && /bass/i.test(t.name) ? 'bass' : t.kind === 'audio' && /pad/i.test(t.name) ? 'pad' : 'loop', t.color) +
        '<span style="color:' + t.color + '">' + t.name + '</span>';
      d.appendChild(nm);
      var ms = document.createElement('div'); ms.className = 'ms';
      var bm = document.createElement('button'); bm.textContent = 'M'; bm.title = 'Mute';
      if (t.mute) bm.className = 'onM';
      bm.onclick = function (e) { e.stopPropagation(); t.mute = !t.mute; save(); renderRail(); };
      var bs = document.createElement('button'); bs.textContent = 'S'; bs.title = 'Solo';
      if (t.solo) bs.className = 'onS';
      bs.onclick = function (e) { e.stopPropagation(); t.solo = !t.solo; save(); renderRail(); };
      ms.appendChild(bm); ms.appendChild(bs); d.appendChild(ms);
      var vol = document.createElement('div'); vol.className = 'vol';
      var inp = document.createElement('input');
      inp.type = 'range'; inp.min = 0; inp.max = 100; inp.value = Math.round(t.gain * 100);
      inp.oninput = function () { t.gain = inp.value / 100; pc.textContent = inp.value + '%'; refreshChain(t); save(); };
      inp.onclick = function (e) { e.stopPropagation(); };
      var pc = document.createElement('span'); pc.className = 'pc'; pc.textContent = Math.round(t.gain * 100) + '%';
      vol.appendChild(inp); vol.appendChild(pc); d.appendChild(vol);
      var mt = document.createElement('div'); mt.className = 'meter';
      mt.innerHTML = '<i></i>'; d.appendChild(mt);
      d.onclick = function () { S.sel = t.id; S.selRegion = null; renderAll(); };
      wrap.appendChild(d);
    });
  }
  function drawRuler() {
    var cv = $('rulerCv'), wrap = $('ruler');
    var w = Math.max(wrap.clientWidth, projectBeats() * S.pxBeat), h = 26;
    cv.width = w; cv.height = h; cv.style.width = w + 'px';
    var g = cv.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#9aa3c7'; g.font = '600 9.5px system-ui'; g.textBaseline = 'top';
    for (var b = 0; b <= projectBeats(); b++) {
      var x = b * S.pxBeat;
      g.fillStyle = b % 4 === 0 ? '#454e86' : '#262c52';
      g.fillRect(x, b % 4 === 0 ? 12 : 18, 1, b % 4 === 0 ? 14 : 8);
      if (b % 4 === 0) { g.fillStyle = '#9aa3c7'; g.fillText(String(b / 4 + 1), x + 4, 3); }
    }
  }
  function regionColor(t) { return t.color; }
  function drawWave(canvas, buf, color) {
    var g = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    g.clearRect(0, 0, w, h);
    if (!buf) { /* pattern region: draw the step blocks */
      g.fillStyle = color;
      for (var i = 0; i < 16; i++) { g.globalAlpha = 0.25 + (i % 4 === 0 ? 0.5 : 0.2); g.fillRect(4 + i * (w - 8) / 16, h * 0.3, (w - 8) / 16 - 2, h * 0.4); }
      g.globalAlpha = 1; return;
    }
    var d = buf.getChannelData(0), step = Math.max(1, Math.floor(d.length / w));
    g.fillStyle = color;
    for (var x = 0; x < w; x++) {
      var mn = 0, mx = 0, base = x * step;
      for (var j = 0; j < step; j++) {
        var v = d[base + j] || 0;
        if (v < mn) mn = v; if (v > mx) mx = v;
      }
      var y0 = h / 2 - mx * (h / 2 - 3), y1 = h / 2 - mn * (h / 2 - 3);
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
  }
  function renderTimeline() {
    var grid = $('grid');
    grid.querySelectorAll('.region').forEach(function (el) { el.remove(); });
    grid.style.width = (projectBeats() * S.pxBeat + 30) + 'px';
    grid.style.height = (P.tracks.length * ROW_H) + 'px';
    /* grid background: beat lines via CSS gradient on the lanes element */
    var lanes = $('lanes');
    lanes.style.background =
      'repeating-linear-gradient(90deg, transparent 0 ' + (S.pxBeat * 4 - 1) + 'px, #262c52 ' + (S.pxBeat * 4 - 1) + 'px ' + (S.pxBeat * 4) + 'px),' +
      'repeating-linear-gradient(90deg, transparent 0 ' + (S.pxBeat - 1) + 'px, rgba(38,44,82,.4) ' + (S.pxBeat - 1) + 'px ' + S.pxBeat + 'px),' +
      'repeating-linear-gradient(0deg, transparent 0 ' + (ROW_H - 1) + 'px, #1b2145 ' + (ROW_H - 1) + 'px ' + ROW_H + 'px)';
    P.tracks.forEach(function (t, ti) {
      t.regions.forEach(function (r) {
        var el = document.createElement('div');
        el.className = 'region' + (r.id === S.selRegion ? ' sel' : '') + (r.empty ? ' empty' : '');
        el.dataset.rid = r.id; el.dataset.tid = t.id;
        el.style.left = (r.start * S.pxBeat) + 'px';
        el.style.width = Math.max(14, r.len * S.pxBeat - 2) + 'px';
        el.style.top = (ti * ROW_H + 5) + 'px';
        el.style.background = 'linear-gradient(180deg,' + t.color + '2e,' + t.color + '14)';
        var cv = document.createElement('canvas');
        cv.width = Math.max(20, Math.floor(r.len * S.pxBeat)); cv.height = 70;
        el.appendChild(cv);
        var lab = document.createElement('div'); lab.className = 'rlab'; lab.textContent = r.label || t.name;
        el.appendChild(lab);
        ['l', 'r'].forEach(function (side) {
          var e = document.createElement('div'); e.className = 'edge ' + side; e.dataset.side = side; el.appendChild(e);
        });
        el.addEventListener('pointerdown', function (ev) { regionPointer(ev, t, r, el); });
        grid.appendChild(el);
        drawWave(cv, r.pattern ? null : buffers[r.bufKey], t.color);
      });
    });
    drawRuler();
  }
  function drawAllWaveforms() { renderTimeline(); }
  function regionPointer(ev, t, r, el) {
    ev.preventDefault();
    S.sel = t.id; S.selRegion = r.id;
    var side = ev.target.dataset && ev.target.dataset.side;
    var mode = side === 'l' ? 'trimL' : side === 'r' ? 'trimR' : 'move';
    var x0 = ev.clientX, start0 = r.start, len0 = r.len;
    var lanes = $('lanes');
    function mv(e) {
      var db = Math.round((e.clientX - x0) / S.pxBeat);
      if (mode === 'move') {
        r.start = Math.max(0, start0 + db);
        ensureLen(r.start + r.len);
      } else if (mode === 'trimR') {
        r.len = Math.max(1, len0 + db);
        ensureLen(r.start + r.len);
      } else {
        var ns = Math.max(0, Math.min(start0 + len0 - 1, start0 + db));
        r.len = len0 + (start0 - ns); r.start = ns;
      }
      el.style.left = (r.start * S.pxBeat) + 'px';
      el.style.width = Math.max(14, r.len * S.pxBeat - 2) + 'px';
      void lanes;
    }
    function up() {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      save(); renderTimeline(); renderStrip();
    }
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    renderRail(); renderStrip();
  }
  function regionAt(t, beat) {
    return t.regions.filter(function (r) { return beat >= r.start && beat < r.start + r.len; })[0] || null;
  }

  /* -------- library -------- */
  function renderLibrary() {
    var list = $('libList'); list.innerHTML = '';
    var q = ($('libSearch').value || '').toLowerCase();
    function shelf(name) {
      var s = document.createElement('div'); s.className = 'shelf'; s.textContent = name; list.appendChild(s);
    }
    function rowElement(ic, name, dur, fn) {
      if (q && name.toLowerCase().indexOf(q) < 0) return;
      var r = document.createElement('div'); r.className = 'loopRow';
      r.innerHTML = '<span class="ic">' + ic + '</span><span class="nm"></span><span class="du"></span>';
      r.querySelector('.nm').textContent = name;
      r.querySelector('.du').textContent = dur;
      r.onclick = fn;
      list.appendChild(r);
    }
    shelf('YOUR MUSIC');
    yourMusic().forEach(function (item) {
      rowElement('♪', item.name, item.dur, function () { importYourMusic(item); });
    });
    shelf('STUDIO CRATE');
    CRATE.forEach(function (item) {
      rowElement(item.ic, item.name, item.dur, function () { placeCrate(item); });
    });
    /* the vertical layout's LOOPS pane mirrors the library */
    var pane = $('paneLoops'); pane.innerHTML = '';
    var clone = list.cloneNode(true);
    clone.removeAttribute('id');
    pane.appendChild(clone);
    /* rebind clicks in the clone by re-rendering rows there is overkill;
       the pane forwards taps to the hidden library rows by index */
    var srcRows = list.querySelectorAll('.loopRow'), dstRows = clone.querySelectorAll('.loopRow');
    dstRows.forEach(function (dr, i) { dr.onclick = function () { if (srcRows[i]) srcRows[i].click(); }; });
  }

  /* -------- track strip (mixer for the selected track) -------- */
  var PRESETS = {
    'Clean': { eq: { lo: 0, mid: 0, hi: 0 }, comp: 0.25, echo: 0, verb: 0.12 },
    'Warm Vocal': { eq: { lo: 2, mid: 1, hi: -1 }, comp: 0.5, echo: 0.08, verb: 0.3 },
    'Hard & Bright': { eq: { lo: -2, mid: 2, hi: 4 }, comp: 0.65, echo: 0.05, verb: 0.15 },
    'Big Room': { eq: { lo: 1, mid: 0, hi: 2 }, comp: 0.4, echo: 0.32, verb: 0.55 },
    'Lo-Fi': { eq: { lo: 3, mid: -3, hi: -6 }, comp: 0.55, echo: 0.18, verb: 0.2 }
  };
  function sliderCtl(label, min, max, val, fmt, fn) {
    var c = document.createElement('div'); c.className = 'ctl';
    var l = document.createElement('label'); l.textContent = label; c.appendChild(l);
    var i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = 'any'; i.value = val;
    var v = document.createElement('span'); v.className = 'v'; v.textContent = fmt(val);
    i.oninput = function () { fn(parseFloat(i.value)); v.textContent = fmt(parseFloat(i.value)); };
    c.appendChild(i); c.appendChild(v);
    return c;
  }
  function renderStrip() {
    var pane = $('paneStrip'); pane.innerHTML = '';
    var t = selTrack(); if (!t) return;
    var title = document.createElement('div'); title.id = 'stripTitle';
    title.innerHTML = '';
    title.appendChild(document.createTextNode(t.name));
    var tag = document.createElement('span'); tag.className = 'tag';
    tag.textContent = t.kind === 'voice' ? 'VOICE TRACK' : t.kind === 'drums' ? 'DRUM MACHINE' : 'AUDIO TRACK';
    title.appendChild(tag);
    pane.appendChild(title);
    var rowEl = document.createElement('div'); rowEl.className = 'srow';
    rowEl.appendChild(sliderCtl('VOLUME', 0, 1, t.gain, function (v) { return Math.round(v * 100) + '%'; },
      function (v) { t.gain = v; refreshChain(t); renderRailVol(t); save(); }));
    rowEl.appendChild(sliderCtl('PAN', -1, 1, t.pan, function (v) { return v === 0 ? 'CENTER' : v < 0 ? 'L' + Math.round(-v * 100) : 'R' + Math.round(v * 100); },
      function (v) { t.pan = v; refreshChain(t); save(); }));
    rowEl.appendChild(sliderCtl('BASS', -12, 12, t.eq.lo, function (v) { return (v > 0 ? '+' : '') + Math.round(v) + ' dB'; },
      function (v) { t.eq.lo = v; refreshChain(t); save(); }));
    rowEl.appendChild(sliderCtl('MID', -12, 12, t.eq.mid, function (v) { return (v > 0 ? '+' : '') + Math.round(v) + ' dB'; },
      function (v) { t.eq.mid = v; refreshChain(t); save(); }));
    rowEl.appendChild(sliderCtl('TREBLE', -12, 12, t.eq.hi, function (v) { return (v > 0 ? '+' : '') + Math.round(v) + ' dB'; },
      function (v) { t.eq.hi = v; refreshChain(t); save(); }));
    rowEl.appendChild(sliderCtl('COMPRESSOR', 0, 1, t.comp, function (v) { return Math.round(v * 100) + '%'; },
      function (v) { t.comp = v; refreshChain(t); save(); }));
    rowEl.appendChild(sliderCtl('ECHO', 0, 1, t.echo, function (v) { return Math.round(v * 100) + '%'; },
      function (v) { t.echo = v; refreshChain(t); save(); }));
    rowEl.appendChild(sliderCtl('REVERB', 0, 1, t.verb, function (v) { return Math.round(v * 100) + '%'; },
      function (v) { t.verb = v; refreshChain(t); save(); }));
    pane.appendChild(rowEl);
    /* presets + track actions */
    var row2 = document.createElement('div'); row2.className = 'srow'; row2.style.marginTop = '10px';
    var chips = document.createElement('div'); chips.className = 'chips';
    Object.keys(PRESETS).forEach(function (name) {
      var ch = document.createElement('button'); ch.className = 'chip'; ch.textContent = name;
      ch.onclick = function () {
        var p = PRESETS[name];
        t.eq = { lo: p.eq.lo, mid: p.eq.mid, hi: p.eq.hi }; t.comp = p.comp; t.echo = p.echo; t.verb = p.verb;
        refreshChain(t); save(); renderStrip();
        toast(name + ' on "' + t.name + '"');
      };
      chips.appendChild(ch);
    });
    row2.appendChild(chips);
    if (t.kind === 'voice') {
      var arm = document.createElement('button'); arm.className = 'abtn' + (t.armed ? ' red' : '');
      arm.textContent = t.armed ? '● ARMED — tap ● up top to record' : 'Arm for recording';
      arm.onclick = function () {
        var was = t.armed;
        P.tracks.forEach(function (x) { x.armed = false; });
        t.armed = !was;
        renderRail(); renderStrip();
      };
      row2.appendChild(arm);
      var meter = document.createElement('div');
      meter.className = 'ctl';
      meter.innerHTML = '<label>MIC LEVEL</label><div style="width:150px;height:9px;border-radius:5px;background:#05070f;overflow:hidden"><i id="recMeterFill" style="display:block;height:100%;width:0;background:linear-gradient(90deg,#3ddc74,#ffd479,#ff5964)"></i></div>';
      row2.appendChild(meter);
      if (t.takes.length) {
        var tk = document.createElement('div'); tk.className = 'chips';
        t.takes.forEach(function (take) {
          var b = document.createElement('button'); b.className = 'chip';
          b.textContent = '▶ ' + take.name;
          b.onclick = function () {
            var len = buffers[take.bufKey] ? Math.max(1, Math.round(buffers[take.bufKey].duration / beatSec())) : 8;
            t.regions = t.regions.filter(function (r) { return !r.takeId; });
            t.regions.push(newRegion(0, len, take.bufKey, take.name, { takeId: take.id }));
            save(); renderAll();
          };
          tk.appendChild(b);
          var cl = document.createElement('button'); cl.className = 'chip';
          cl.textContent = '✦ Clean Up ' + take.name;
          cl.onclick = function () { ctx(); cleanTake(t, take); };
          tk.appendChild(cl);
        });
        row2.appendChild(tk);
      }
    }
    var del = document.createElement('button'); del.className = 'abtn red'; del.textContent = 'Delete track';
    del.onclick = function () {
      if (P.tracks.length <= 1) { toast('The last track stays'); return; }
      stopPlayback();
      P.tracks = P.tracks.filter(function (x) { return x.id !== t.id; });
      delete chains[t.id];
      S.sel = P.tracks[0].id; save(); renderAll();
    };
    row2.appendChild(del);
    pane.appendChild(row2);
    renderRegionActions(pane, t);
  }
  function renderRailVol(t) {
    var pc = document.querySelector('.trk[data-id="' + t.id + '"] .vol .pc');
    var inp = document.querySelector('.trk[data-id="' + t.id + '"] .vol input');
    if (pc) pc.textContent = Math.round(t.gain * 100) + '%';
    if (inp) inp.value = Math.round(t.gain * 100);
  }
  function renderRegionActions(pane, t) {
    var r = t.regions.filter(function (x) { return x.id === S.selRegion; })[0];
    if (!r) return;
    var row = document.createElement('div'); row.className = 'srow'; row.style.marginTop = '8px';
    var lab = document.createElement('span');
    lab.style.cssText = 'font-size:11px;letter-spacing:1.4px;color:var(--gold);font-weight:800';
    lab.textContent = 'BLOCK: ' + (r.label || t.name);
    row.appendChild(lab);
    function act(name, fn) {
      var b = document.createElement('button'); b.className = 'abtn'; b.textContent = name;
      b.onclick = fn; row.appendChild(b);
    }
    act('Split at playhead', function () {
      var b = Math.round(nowBeatFloat());
      if (b <= r.start || b >= r.start + r.len) { toast('Move the playhead inside the block first (play, then pause)'); return; }
      var nr = newRegion(b, r.start + r.len - b, r.bufKey, r.label, { takeId: r.takeId, pattern: r.pattern });
      r.len = b - r.start;
      t.regions.push(nr); save(); renderAll();
    });
    act('Duplicate', function () {
      var nr = newRegion(r.start + r.len, r.len, r.bufKey, r.label, { takeId: r.takeId, pattern: r.pattern });
      ensureLen(nr.start + nr.len);
      t.regions.push(nr); S.selRegion = nr.id; save(); renderAll();
    });
    act('Delete block', function () {
      t.regions = t.regions.filter(function (x) { return x.id !== r.id; });
      S.selRegion = null; save(); renderAll();
    });
    pane.appendChild(row);
  }

  /* -------- pads + sequencer -------- */
  function renderPads() {
    var gEl = $('padGrid'); gEl.innerHTML = '';
    DRUMS.forEach(function (name) {
      var p = document.createElement('button'); p.className = 'pad'; p.textContent = name.toUpperCase();
      p.dataset.drum = name;
      p.onpointerdown = function (e) {
        e.preventDefault(); ctx();
        var dest = master;
        var st = selTrack();
        if (st && st.kind === 'drums') dest = liveChain(st).input;
        drumHit(AC, dest, name, AC.currentTime, 0.95);
        p.classList.add('hit'); setTimeout(function () { p.classList.remove('hit'); }, 130);
      };
      gEl.appendChild(p);
    });
    drawSeq(0);
  }
  function drawSeq(beatNow) {
    var wrap = $('seqWrap');
    var t = selTrack();
    if (!t || t.kind !== 'drums' || !t.pattern) {
      wrap.innerHTML = '<div style="color:var(--mut);font-size:11.5px;padding:2px">The step sequencer belongs to drum tracks — select Kick or add a kit from LOOPS.</div>';
      return;
    }
    if (!wrap.dataset.built) {
      wrap.innerHTML = '';
      SEQROWS.forEach(function (voice) {
        var rowEl = document.createElement('div'); rowEl.className = 'seqRow';
        var lb = document.createElement('span'); lb.className = 'sl'; lb.textContent = voice.toUpperCase();
        rowEl.appendChild(lb);
        for (var i = 0; i < 16; i++) {
          (function (idx) {
            var s = document.createElement('button'); s.className = 'step' + (idx % 4 === 0 ? ' bar' : '');
            s.dataset.voice = voice; s.dataset.step = idx;
            s.onclick = function () {
              t.pattern[voice][idx] = t.pattern[voice][idx] ? 0 : 1;
              s.classList.toggle('on', !!t.pattern[voice][idx]);
              if (t.pattern[voice][idx]) { ctx(); drumHit(AC, liveChain(t).input, voice, AC.currentTime, 0.9); }
              save();
            };
            rowEl.appendChild(s);
          })(i);
        }
        wrap.appendChild(rowEl);
      });
      wrap.dataset.built = '1';
    }
    var cur = S.playing ? Math.floor((beatNow * 4) % 16) : -1;
    wrap.querySelectorAll('.step').forEach(function (s) {
      var on = t.pattern[s.dataset.voice][+s.dataset.step];
      s.classList.toggle('on', !!on);
      s.classList.toggle('now', +s.dataset.step === cur);
    });
  }

  /* -------- mixer pane -------- */
  function renderMixer() {
    var pane = $('paneMixer'); pane.innerHTML = '';
    var rowEl = document.createElement('div'); rowEl.className = 'mrow';
    P.tracks.forEach(function (t) {
      var c = document.createElement('div'); c.className = 'mchan';
      var nm = document.createElement('div'); nm.className = 'mn'; nm.style.color = t.color; nm.textContent = t.name.toUpperCase();
      var f = document.createElement('input'); f.type = 'range'; f.min = 0; f.max = 100; f.value = Math.round(t.gain * 100);
      var v = document.createElement('div'); v.className = 'mv'; v.textContent = Math.round(t.gain * 100) + '%';
      f.oninput = function () { t.gain = f.value / 100; v.textContent = f.value + '%'; refreshChain(t); renderRailVol(t); save(); };
      c.appendChild(nm); c.appendChild(f); c.appendChild(v);
      rowEl.appendChild(c);
    });
    var mc = document.createElement('div'); mc.className = 'mchan';
    mc.innerHTML = '<div class="mn" style="color:var(--gold)">MASTER</div>';
    var mf = document.createElement('input'); mf.type = 'range'; mf.min = 0; mf.max = 100; mf.value = Math.round(S.master * 100);
    var mv = document.createElement('div'); mv.className = 'mv'; mv.textContent = Math.round(S.master * 100) + '%';
    mf.oninput = function () { setMaster(mf.value / 100); mv.textContent = mf.value + '%'; };
    mc.appendChild(mf); mc.appendChild(mv);
    rowEl.appendChild(mc);
    pane.appendChild(rowEl);
  }

  function renderAll() { renderRail(); renderTimeline(); renderLibrary(); renderStrip(); renderMixer(); drawSeq(0); }
  function buildAll() { renderAll(); }

  /* ============================== export ============================== */
  function renderMix(offline) {
    var totalBeats = projectBeats(), dur = totalBeats * beatSec() + 2.2;
    var rate = 44100;
    var oc = new OfflineAudioContext(2, Math.ceil(rate * dur), rate);
    var mGain = oc.createGain(); mGain.gain.value = S.masterMuted ? 0 : S.master;
    var mc = oc.createDynamicsCompressor(); mc.threshold.value = -14; mc.ratio.value = 3;
    mGain.connect(mc); mc.connect(oc.destination);
    P.tracks.forEach(function (t) {
      if (!audible(t)) return;
      var ch = buildChain(oc, mGain, t, false);
      t.regions.forEach(function (r) {
        if (r.pattern && t.pattern) {
          var spb = beatSec(), stepDur = spb / 4; void stepDur;
          for (var b = r.start; b < r.start + r.len; b += 0.25) {
            var barOff = Math.floor((b - r.start) * 4) % 16;
            SEQROWS.forEach(function (voice) {
              if (t.pattern[voice] && t.pattern[voice][barOff]) {
                drumHit(oc, ch.input, voice, b * spb, 0.95);
              }
            });
          }
          return;
        }
        var buf = r.bufKey && buffers[r.bufKey];
        if (!buf || r.empty) return;
        var reps = Math.ceil((r.len * beatSec()) / buf.duration);
        for (var k = 0; k < reps; k++) {
          var src = oc.createBufferSource(); src.buffer = buf;
          src.connect(ch.input);
          var startAt = r.start * beatSec() + k * buf.duration;
          var remain = (r.start + r.len) * beatSec() - startAt;
          if (remain <= 0) break;
          try { src.start(startAt, 0, Math.min(buf.duration, remain)); } catch (e) {}
        }
      });
    });
    return oc.startRendering();
  }
  function wavEncode(buf) {
    var nCh = Math.min(2, buf.numberOfChannels), rate = buf.sampleRate, len = buf.length;
    var bytes = 44 + len * nCh * 2;
    var ab = new ArrayBuffer(bytes), v = new DataView(ab);
    function wstr(off, s) { for (var i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); }
    wstr(0, 'RIFF'); v.setUint32(4, bytes - 8, true); wstr(8, 'WAVE'); wstr(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nCh, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * nCh * 2, true);
    v.setUint16(32, nCh * 2, true); v.setUint16(34, 16, true);
    wstr(36, 'data'); v.setUint32(40, len * nCh * 2, true);
    var chans = [];
    for (var c = 0; c < nCh; c++) chans.push(buf.getChannelData(c));
    var off = 44;
    for (var i = 0; i < len; i++) {
      for (var c2 = 0; c2 < nCh; c2++) {
        var s = Math.max(-1, Math.min(1, chans[c2][i]));
        v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
      }
    }
    return new Blob([ab], { type: 'audio/wav' });
  }
  function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function exportWav() {
    ctx(); toast('Mixing your song down…');
    return renderMix().then(function (buf) {
      var blob = wavEncode(buf);
      var name = (P.name || 'Untitled Project').replace(/[^\w\- ]+/g, '').trim() || 'song';
      downloadBlob(blob, name + '.wav');
      log('exported WAV: ' + buf.duration.toFixed(1) + 's, ' + blob.size + ' bytes');
      toast('Saved ' + name + '.wav — ' + buf.duration.toFixed(0) + ' seconds of your song');
      return { duration: buf.duration, bytes: blob.size };
    });
  }
  function exportMp3() {
    /* spec: MP3 is encoded in the page and handed to the Android
       shell, which saves to Downloads + opens the share sheet. The
       shipped shell (APK ≤ 1.11) exposes no file-save bridge, so
       until AllonShell.saveAudioFile lands this button says so
       plainly and does nothing else — no fake MP3. The exact hook
       is named in the lane report. */
    var sh = null;
    try { sh = (window.top && window.top.AllonShell) || window.AllonShell; } catch (e) {}
    if (sh && typeof sh.saveAudioFile === 'function') {
      ctx(); toast('Mixing your song down…');
      return renderMix().then(function (buf) {
        var blob = wavEncode(buf);
        var rd = new FileReader();
        rd.onload = function () {
          var b64 = String(rd.result).split(',')[1] || '';
          var name = (P.name || 'Untitled Project').replace(/[^\w\- ]+/g, '').trim() || 'song';
          try { sh.saveAudioFile(b64, name + '.mp3', 'audio/mpeg'); } catch (e) {}
          toast('Sent to the PC app — it saves to Downloads and opens share');
        };
        rd.readAsDataURL(blob);
      });
    }
    toast('MP3 rides the updated PC app — WAV export works right now');
    log('MP3 export held: AllonShell.saveAudioFile bridge not present in this shell');
    return Promise.resolve(null);
  }

  /* ============================== sheets / wiring ============================== */
  function openSheet(id) { $(id).style.display = 'flex'; }
  function closeSheets() { ['addSheet', 'regSheet', 'expSheet'].forEach(function (i) { $(i).style.display = 'none'; }); }
  document.querySelectorAll('.sheet').forEach(function (sh) {
    sh.addEventListener('pointerdown', function (e) { if (e.target === sh) closeSheets(); });
  });
  function opt(label, desc, fn) {
    var b = document.createElement('button'); b.className = 'opt';
    b.innerHTML = '<span></span>';
    b.firstChild.textContent = label;
    if (desc) { var d = document.createElement('span'); d.className = 'd'; d.textContent = desc; b.appendChild(d); }
    b.onclick = function () { closeSheets(); fn(); };
    return b;
  }
  function buildAddMenu() {
    var box = $('addOpts'); box.innerHTML = '';
    box.appendChild(opt('🎤 Voice / Mic', 'record yourself', function () {
      var t = newTrack('voice', 'Vocals ' + (P.tracks.filter(function (x) { return x.kind === 'voice'; }).length + 1), COLORS.vox);
      t.armed = true;
      P.tracks.forEach(function (x) { if (x !== t) x.armed = false; });
      P.tracks.push(t); S.sel = t.id; save(); renderAll();
    }));
    box.appendChild(opt('🥁 Drum Machine', 'pads + step sequencer', function () {
      var t = newTrack('drums', 'Drums', COLORS.drums);
      t.regions.push(newRegion(0, projectBeats(), null, 'Drums', { pattern: true }));
      P.tracks.push(t); S.sel = t.id; save(); renderAll(); setDrawer('panePads');
    }));
    box.appendChild(opt('🎹 Instruments', 'keys loop from the crate', function () { placeCrate(CRATE[2]); }));
    box.appendChild(opt('♪ My Music', 'his tracks, one tap', function () {
      var ym = yourMusic();
      importYourMusic(ym[ym.length - 1]);   /* the freshest: Nov 1 Remix */
    }));
    box.appendChild(opt('🔁 Loops', 'the library, right side', function () {
      if (document.body.classList.contains('vert')) setDrawer('paneLoops');
      else $('libSearch').focus();
    }));
    box.appendChild(opt('＋ New empty project', 'start over', function () { resetProject(); }));
  }
  function buildExportMenu() {
    var box = $('expOpts'); box.innerHTML = '';
    box.appendChild(opt('Export WAV', 'full quality, saves now', function () { exportWav(); }));
    box.appendChild(opt('Export MP3', 'for sharing — rides the PC app', function () { exportMp3(); }));
  }
  function setDrawer(pane) {
    S.drawer = pane;
    document.querySelectorAll('.dtab').forEach(function (b) { b.classList.toggle('on', b.dataset.pane === pane); });
    document.querySelectorAll('.dpane').forEach(function (p) { p.classList.toggle('on', p.id === pane); });
    if (pane === 'paneMixer') renderMixer();
    if (pane === 'panePads') drawSeq(0);
  }
  document.querySelectorAll('.dtab').forEach(function (b) {
    b.onclick = function () { setDrawer(b.dataset.pane); };
  });
  $('btnAdd').onclick = function () { buildAddMenu(); openSheet('addSheet'); };
  $('btnExport').onclick = function () { buildExportMenu(); openSheet('expSheet'); };
  $('libSearch').addEventListener('input', renderLibrary);
  $('btnPlay').onclick = function () {
    if (S.rec) return;
    if (S.playing) stopPlayback(); else startPlayback(0);
  };
  $('btnRew').onclick = function () { stopPlayback(); S.playBeat = 0; movePlayhead(0); setClock(0); };
  $('btnRec').onclick = function () {
    if (S.rec) stopRecording();
    else startRecording();
  };
  $('songName').addEventListener('change', function () {
    P.name = $('songName').value || 'Untitled Project';
    $('miniSong').textContent = P.name;
    save();
  });
  function setBpm(v) {
    P.bpm = Math.max(50, Math.min(180, v));
    $('bpmVal').textContent = P.bpm;
    $('songMeta').textContent = P.bpm + ' BPM · ' + P.key.replace(' Minor', ' MINOR').replace(' Major', ' MAJOR');
    save();
  }
  $('bpmDn').onclick = function () { setBpm(P.bpm - 1); };
  $('bpmUp').onclick = function () { setBpm(P.bpm + 1); };
  $('master').addEventListener('input', function () { setMaster($('master').value / 100); });
  $('btnBrother').onclick = function () {
    var sent = false;
    try {
      if (window.top && window.top.__vpcBrotherLink) { window.top.__vpcBrotherLink.openPanel(); sent = true; }
    } catch (e) {}
    if (!sent) {
      try { window.top.postMessage({ vpc: 'brotherlink', action: 'panel' }, '*'); sent = true; } catch (e) {}
    }
    toast(sent ? 'Brother link opening up top…' : 'Brother link lives in the room — tap the camera up there');
  };
  /* timeline zoom: pinch-in-screen == buttons + slider here */
  $('lanes').addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      S.pxBeat = Math.max(10, Math.min(64, S.pxBeat - Math.sign(e.deltaY) * 3));
      renderTimeline();
    }
  }, { passive: false });
  $('grid').addEventListener('pointerdown', function (e) {
    if (e.target === $('grid') || e.target === $('lanes')) {
      var lanes = $('lanes'), rc = $('grid').getBoundingClientRect();
      var beat = Math.max(0, Math.floor((e.clientX - rc.left) / S.pxBeat));
      var ti = Math.floor((e.clientY - rc.top) / ROW_H);
      var t = P.tracks[ti];
      S.playBeat = beat; movePlayhead(beat); setClock(beat);
      if (t) {
        S.sel = t.id;
        var r = regionAt(t, beat);
        S.selRegion = r ? r.id : null;
        renderAll();
      }
    }
  });

  /* ============================== layout modes ============================== */
  function applyLayout() {
    var w = window.innerWidth, h = window.innerHeight;
    var b = document.body;
    b.classList.remove('wide', 'vert', 'mini');
    if (w <= 620 && h <= 360) b.classList.add('mini');
    else if (h > w || w < 880) b.classList.add('vert');
    else b.classList.add('wide');
    drawRuler();
  }
  window.addEventListener('resize', applyLayout);

  /* ============================== public API (proof + PC) ============================== */
  window.__vpcStudio = {
    state: function () {
      return {
        project: P.name, bpm: P.bpm, bars: P.lenBars,
        tracks: P.tracks.map(function (t) {
          return { id: t.id, name: t.name, kind: t.kind, gain: t.gain, pan: t.pan, mute: t.mute, solo: t.solo,
                   armed: t.armed, regions: t.regions.length, takes: t.takes.length, eq: t.eq, comp: t.comp };
        }),
        playing: S.playing, recording: !!S.rec, sel: S.sel,
        master: S.master, masterMuted: S.masterMuted, latencyMs: Math.round(S.latencySec * 1000),
        layout: document.body.className, buffers: Object.keys(buffers),
        yourMusic: yourMusic().map(function (t) { return t.name; }),
        log: S.log.slice()
      };
    },
    play: function () { startPlayback(0); },
    stop: function () { stopPlayback(); if (S.rec) stopRecording(); },
    record: function () { if (S.rec) stopRecording(); else startRecording(); },
    importYourMusic: function (i) {
      return new Promise(function (res) {
        var item = yourMusic()[i];
        if (!item) return res(false);
        importYourMusic(item, function (key) { res(!!key); });
      });
    },
    placeCrate: function (i) { placeCrate(CRATE[i]); },
    addTrack: function (kind) {
      var t = newTrack(kind, kind === 'voice' ? 'Vocals' : kind === 'drums' ? 'Drums' : 'Audio',
        kind === 'voice' ? COLORS.vox : COLORS.loop);
      if (kind === 'drums') t.regions.push(newRegion(0, projectBeats(), null, 'Drums', { pattern: true }));
      P.tracks.push(t); S.sel = t.id; save(); renderAll();
      return t.id;
    },
    selectTrack: function (id) { S.sel = id; renderAll(); },
    setTrackGain: function (id, v) { var t = trackById(id); if (t) { t.gain = v; refreshChain(t); renderAll(); save(); } },
    setEq: function (id, band, v) { var t = trackById(id); if (t) { t.eq[band] = v; refreshChain(t); save(); } },
    hitPad: function (name) { ctx(); drumHit(AC, master, name, AC.currentTime, 0.95); },
    setStep: function (voice, step, on) {
      var t = selTrack(); if (t && t.pattern) { t.pattern[voice][step] = on ? 1 : 0; save(); drawSeq(0); }
    },
    setMaster: function (v) { setMaster(v); },
    exportWav: function () { return exportWav(); },
    cleanTake: function () {
      var t = selTrack();
      if (t && t.takes.length) { ctx(); return cleanTake(t, t.takes[t.takes.length - 1]); }
      return Promise.resolve(false);
    },
    project: function () { return P; },
    reset: function () { resetProject(); }
  };

  /* ============================== boot ============================== */
  function restoreBuffers() {
    var jobs = [];
    P.tracks.forEach(function (t) {
      t.regions.forEach(function (r) {
        if (r.bufKey && r.bufKey.indexOf('crate-') !== 0 && !buffers[r.bufKey]) {
          jobs.push(idbGet(r.bufKey).then(function (blob) {
            if (!blob) return;
            return blob.arrayBuffer().then(function (ab) {
              return ctx().decodeAudioData(ab).then(function (buf) { buffers[r.bufKey] = buf; });
            }).catch(function () {});
          }));
        }
      });
      t.takes.forEach(function (tk) {
        if (!buffers[tk.bufKey]) {
          jobs.push(idbGet(tk.bufKey).then(function (blob) {
            if (!blob) return;
            return blob.arrayBuffer().then(function (ab) {
              return ctx().decodeAudioData(ab).then(function (buf) { buffers[tk.bufKey] = buf; });
            }).catch(function () {});
          }));
        }
      });
    });
    return Promise.all(jobs);
  }
  function boot() {
    P = loadSaved() || defaultProject();
    S.sel = P.tracks[0].id;
    $('songName').value = P.name;
    $('miniSong').textContent = P.name;
    setBpm(P.bpm);
    renderAll(); renderPads();
    applyLayout();
    readMasterLocal();
    window.__vpcApplyMasterVol();
    renderCrate().then(function () { renderTimeline(); });
    restoreBuffers().then(function () { renderTimeline(); log('saved sounds restored'); });
    /* first tap arms the audio context (autoplay law) */
    document.addEventListener('pointerdown', function () { ctx(); }, { once: true });
    log('studio up — ' + P.tracks.length + ' tracks, project "' + P.name + '"');
  }
  boot();
})();
