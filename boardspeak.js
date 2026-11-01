/* boardspeak.js — THE BOARD SPEAKS (his order, 2026-11-01 ~16:58 CST:
   "I don't hear you guys talking at all… it's just mute. Thought y'all
   was going to be talking to each other.")

   The Babyboo<->ALLON board (board.md, the same feed Babyboo's glass
   renders and ALLON's green dot watches) has been text-only: the words
   showed, nothing said them. This page-layer watcher gives the board
   its voices:

   - It polls board.md and speaks NEW entries aloud, in order, one at
     a time — ALLON's lines in ALLON's own voice, Babyboo's in hers.
   - ALLON'S VOICE IS FROZEN (his standing order): this file reuses
     muse.html's exact speech configuration and nothing else — the
     native bridge (AllonShell.speak: the APK's picked male voice,
     pitch 1.0 / rate 1.0) when the bridge is present, otherwise the
     same web utterance muse.html builds (default voice, lang en-US,
     rate 1.02, pitch untouched). No substitution, no "improvement".
   - Babyboo speaks through speechSynthesis with a natural en-US
     female voice picked from the device's list (rate 1.0, pitch 1.0).
     If no distinct voice exists, she falls back to the shared voice
     and EVERY line is attributed by name instead.
   - First open after this ships: only the single latest exchange is
     spoken (the newest ALLON entry + the newest Babyboo entry, in
     board order) — never the whole history. After that, new lines
     only. Seen-state lives in localStorage.
   - Never talks over him: a live LIVE TALK call (the muse surface's
     mode), an active room gesture (drag), PC sleep (tracked from the
     command channel — sleep is only reachable through those commands
     in this build), or a hidden page all HOLD the queue. Held lines
     collapse to the latest line per agent — no backlog recital.
   - The mounts carry a stop/mute control (babyboo.html's board head,
     muse.html's corner chip): one tap stops current speech, clears
     the queue, and mutes board voices until tapped again. The mute
     lives in localStorage (vpc_boardspeak_muted) so both glasses and
     this watcher agree on it.
   - Speech is armed by his presence: the first tap/key anywhere in
     the room arms audio; before that, lines wait silently (the board
     and the green dot still show). */
(function () {
  'use strict';
  if (window.__vpcBoardSpeak) return;

  var POLL_MS = 15000;      /* board.md poll */
  var TICK_MS = 350;        /* pump tick */
  var LS_SEEN = 'vpc_boardspeak_seen_v1';
  var LS_MUTE = 'vpc_boardspeak_muted';
  var LS_SPK = 'vpc_boardspeak_lastspk';

  var S = {
    armed: false,
    muted: false,
    asleep: false,
    seen: null,             /* {count, fp} once the board has been read */
    queue: [],              /* entries waiting: {speaker, stamp, chunks, idx, held, pinned} */
    current: null,          /* entry being spoken */
    speaking: false,        /* an utterance is physically playing */
    lastSpoken: '',         /* speaker of the last entry STARTED */
    babyVoice: null,        /* picked SpeechSynthesisVoice or null */
    babyVoiceName: '',
    voicesReady: false,
    lastCmd: null,          /* last __vpcMuseCmd value seen (sleep watch) */
    nativeWait: null,       /* {seq0, since, timer} while a bridge line plays */
    synthWait: null,        /* {done} guard for the live utterance */
    log: []
  };
  function log(s) {
    S.log.push(s); if (S.log.length > 80) S.log.shift();
    try { console.log('VPC BOARDSPEAK: ' + s); } catch (e) {}
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  S.muted = lsGet(LS_MUTE) === '1';
  S.lastSpoken = lsGet(LS_SPK) || '';
  try { S.seen = JSON.parse(lsGet(LS_SEEN) || 'null'); } catch (e) { S.seen = null; }

  /* ---------------- board parsing (the glass's own grammar) ---------- */
  function hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return 'h' + (h >>> 0).toString(36) + ':' + s.length;
  }
  function cleanText(raw) {
    var t = raw.replace(/\r/g, '');
    /* trailing signature ("… Over. — ALLON", or a "— Babyboo" last line) */
    t = t.replace(/\s*[—–-]\s*(Babyboo|ALLON)\s*$/, '');
    t = t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
    t = t.replace(/`([^`]+)`/g, '$1');
    t = t.replace(/^#{1,6}\s+/gm, '');
    t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    return t.replace(/\s+/g, ' ').trim();
  }
  function parseEntries(md) {
    var lines = md.split('\n'), entries = [], cur = null;
    function push() { if (cur && cur.body.join('').trim()) entries.push(cur); cur = null; }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = line.match(/^\*\*Entry\s+\d+\s+—\s+(.+?)\*\*\s*$/) || line.match(/^###\s+(.+?)\s*$/);
      if (m) { push(); cur = { head: m[1].trim(), body: [] }; continue; }
      if (cur) {
        if (line.trim() === '---') { push(); continue; }
        cur.body.push(line);
      }
    }
    push();
    return entries.map(function (e) {
      var head = e.head, speaker = '', stamp = '';
      var dm = head.match(/(\d{4}-\d{2}-\d{2})\s*~?\s*(\d{1,2}:\d{2})?\s*CST/);
      if (dm) stamp = dm[1] + (dm[2] ? ' ' + dm[2] : '');
      if (/^\d{4}-/.test(head)) {
        var sm = head.match(/—\s*([A-Za-z]+)/); speaker = sm ? sm[1] : '';
      } else {
        speaker = head.split(',')[0].trim();
      }
      if (/allon/i.test(speaker)) speaker = 'ALLON';
      if (/babyboo/i.test(speaker)) speaker = 'Babyboo';
      var text = cleanText(e.body.join('\n'));
      return { speaker: speaker, stamp: stamp, text: text,
               fp: hash(speaker + '|' + stamp + '|' + text.slice(0, 100)) };
    }).filter(function (e) { return e.text && (e.speaker === 'ALLON' || e.speaker === 'Babyboo'); });
  }
  function chunkText(text) {
    var sents = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
    var chunks = [], buf = '';
    function pushBuf() { if (buf.trim()) chunks.push(buf.trim()); buf = ''; }
    sents.forEach(function (s) {
      s = s.trim(); if (!s) return;
      while (s.length > 230) {           /* split a long sentence at a clause edge */
        var cut = Math.max(s.lastIndexOf(', ', 230), s.lastIndexOf(' — ', 230), s.lastIndexOf(' ', 230));
        if (cut < 60) cut = 230;
        buf += (buf ? ' ' : '') + s.slice(0, cut + 1).trim(); pushBuf();
        s = s.slice(cut + 1).trim();
      }
      if ((buf + ' ' + s).trim().length > 230) pushBuf();
      buf += (buf ? ' ' : '') + s;
    });
    pushBuf();
    return chunks;
  }

  /* ---------------- voices ------------------------------------------- */
  function shell() {
    var a = window.AllonShell;
    return (a && typeof a.speak === 'function') ? a : null;
  }
  var FEMALE = ['zira', 'samantha', 'aria', 'jenny', 'amber', 'allison', 'ava',
    'catherine', 'elizabeth', 'emma', 'fiona', 'hazel', 'joana', 'karen', 'kate',
    'laura', 'linda', 'mary', 'michelle', 'moira', 'olivia', 'salli', 'sarah',
    'serena', 'susan', 'tessa', 'victoria', 'veena', 'female', 'woman',
    'google us english', 'uk english female'];
  var MALE = ['david', 'daniel', 'alex', 'fred', 'george', 'guy', 'christopher',
    'james', 'john', 'mark', 'michael', 'paul', 'richard', 'thomas', 'male',
    'uk english male', 'ralph', 'bruce'];
  function pickFemale() {
    if (!window.speechSynthesis) return null;
    var vs = [];
    try { vs = window.speechSynthesis.getVoices() || []; } catch (e) {}
    if (!vs.length) return null;
    S.voicesReady = true;
    var best = null, bestScore = -60;
    vs.forEach(function (v) {
      var name = (v.name || '').toLowerCase(), lang = (v.lang || '').toLowerCase();
      var score = 0;
      if (/^en[-_]us/.test(lang)) score += 30; else if (/^en/.test(lang)) score += 10; else score -= 40;
      if (v.default) score += 5;
      FEMALE.forEach(function (h) { if (name.indexOf(h) >= 0) score += 120; });
      MALE.forEach(function (h) { if (name.indexOf(h) >= 0) score -= 200; });
      if (score > bestScore) { bestScore = score; best = v; }
    });
    return bestScore > -60 ? best : null;
  }
  function refreshVoices() {
    var v = pickFemale();
    if (v) { S.babyVoice = v; S.babyVoiceName = v.name; }
  }
  if (window.speechSynthesis) {
    refreshVoices();
    try { window.speechSynthesis.onvoiceschanged = refreshVoices; } catch (e) {}
  }
  /* ALLON's engine: the bridge when present (his call voice, untouched),
     else the web synth with muse.html's exact utterance shape. */
  function allonEngine() { return shell() ? 'native' : (window.speechSynthesis ? 'synth' : 'none'); }
  function babyEngine() {
    if (window.speechSynthesis && S.babyVoice) return 'synth-female';
    if (shell()) return 'native';
    if (window.speechSynthesis) return 'synth';
    return 'none';
  }
  function voicesDistinct() {
    var a = allonEngine(), b = babyEngine();
    if (a === 'none' || b === 'none') return false;
    if (a !== b) return true;
    if (a === 'synth') return !!S.babyVoice;   /* same engine: distinct iff she has her own voice */
    return false;                              /* both on the bridge = one voice */
  }

  /* ---------------- room state (deferral) ---------------------------- */
  function callActive() {
    try {
      var T = window.__vpcTrack || {};
      for (var k in T) {
        var w = T[k] && T[k].f && T[k].f.contentWindow;
        if (!w) continue;
        var v = null;
        try { v = w.__vpcMuseVoice; } catch (e) {}
        if (v && v.mode === 'live') return true;
        try { if (w.__vpcMuseState && w.__vpcMuseState().mode === 'live') return true; } catch (e) {}
      }
    } catch (e) {}
    return false;
  }
  function gestureActive() {
    try { return !!window.__vpcGestureLock; } catch (e) { return false; }
  }
  /* Sleep is only reachable through the command channel in this build
     ("computer sleep" and family), so the watcher tracks that channel:
     a sleep command puts board speech to hold; a wake phrase — or a
     live call, which he can only start awake — clears it. */
  var SLEEP_RE = /^(computer sleep|computer go to sleep|go to sleep|go to sleep jarvis|jarvis go to sleep|sleep now|sleep jarvis|sleep)$/;
  var WAKE_RE = /^(hey computer wake|hey jarvis wake|computer wake|wake up|wake)$/;
  function watchCommands() {
    var c = '';
    try { c = String(window.__vpcMuseCmd || ''); } catch (e) {}
    if (S.lastCmd === null) { S.lastCmd = c; return; }
    if (c === S.lastCmd) return;
    S.lastCmd = c;
    var clean = c.toLowerCase().replace(/[.!?,]/g, '').trim();
    if (SLEEP_RE.test(clean)) { S.asleep = true; log('PC asleep — board speech holds'); }
    else if (WAKE_RE.test(clean)) { S.asleep = false; log('PC awake — board speech resumes'); }
  }
  function blocked() {
    if (S.muted) return 'muted';
    if (!S.armed) return 'unarmed';
    if (document.hidden) return 'hidden';
    if (S.asleep) return 'asleep';
    if (callActive()) return 'call';
    if (gestureActive()) return 'gesture';
    return '';
  }

  /* ---------------- speech engines ----------------------------------- */
  function mailboxSeq() {
    try {
      var raw = String(window.__vpcMuseNativeSay || '');
      if (!raw) return -1;
      var m = JSON.parse(raw);
      return (m && typeof m.seq === 'number' && m.type === 'speakdone') ? m.seq : -2;
    } catch (e) { return -1; }
  }
  function speakNative(text, done) {
    var a = shell();
    if (!a) { done(); return; }
    var base = -1;
    try { var raw0 = JSON.parse(String(window.__vpcMuseNativeSay || 'null')); if (raw0 && typeof raw0.seq === 'number') base = raw0.seq; } catch (e) {}
    var started = Date.now();
    var wait = { finished: false };
    S.nativeWait = wait;
    var finish = function () {
      if (wait.finished) return; wait.finished = true;
      if (S.nativeWait === wait) S.nativeWait = null;
      done();
    };
    wait.cancel = finish;
    var iv = setInterval(function () {
      var s = mailboxSeq();
      if (s > base && Date.now() - started > 500) { clearInterval(iv); finish(); }
    }, 200);
    setTimeout(function () { clearInterval(iv); finish(); }, Math.min(60000, 6000 + text.length * 120));
    try { a.speak(text); } catch (e) { clearInterval(iv); finish(); }
  }
  function speakSynth(text, opts, done) {
    if (!window.speechSynthesis) { done(); return; }
    var wait = { finished: false };
    S.synthWait = wait;
    var finish = function () {
      if (wait.finished) return; wait.finished = true;
      if (S.synthWait === wait) S.synthWait = null;
      done();
    };
    wait.cancel = finish;
    var u;
    try { u = new SpeechSynthesisUtterance(text); } catch (e) { finish(); return; }
    u.lang = 'en-US';
    if (opts.voice) u.voice = opts.voice;
    if (opts.rate) u.rate = opts.rate;
    if (opts.pitch) u.pitch = opts.pitch;
    u.onend = finish; u.onerror = finish;
    /* some WebViews never fire onend on long lines — never wedge */
    setTimeout(finish, Math.min(70000, 5000 + text.length * 130));
    try { window.speechSynthesis.speak(u); } catch (e) { finish(); }
  }
  function speakChunk(entry, chunk, done) {
    var prefix = '';
    if (entry.idx === 0 && entry.attr) prefix = entry.attr + '. ';
    var text = prefix + chunk;
    log('speak[' + entry.speaker + '/' + (entry.speaker === 'ALLON' ? allonEngine() : babyEngine()) + '] ' + text.slice(0, 90));
    if (entry.speaker === 'ALLON') {
      /* his voice, exactly as muse.html speaks — bridge first, else
         the identical web utterance (default voice, rate 1.02) */
      if (shell()) { speakNative(text, done); return; }
      speakSynth(text, { rate: 1.02 }, done); return;
    }
    if (window.speechSynthesis && S.babyVoice) { speakSynth(text, { voice: S.babyVoice, rate: 1.0, pitch: 1.0 }, done); return; }
    if (shell()) { speakNative(text, done); return; }
    speakSynth(text, { rate: 1.0, pitch: 1.0 }, done);
  }
  function stopEngines() {
    if (S.nativeWait && S.nativeWait.cancel) S.nativeWait.cancel();
    if (S.synthWait && S.synthWait.cancel) S.synthWait.cancel();
    if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
    var a = shell();
    if (a && typeof a.stopSpeaking === 'function') { try { a.stopSpeaking(); } catch (e) {} }
    S.speaking = false;
  }

  /* ---------------- the pump ------------------------------------------ */
  function enqueue(entry, pinned) {
    var e = { speaker: entry.speaker, stamp: entry.stamp, fp: entry.fp,
              chunks: chunkText(entry.text), idx: 0,
              held: !!blocked(), pinned: !!pinned, attr: '' };
    if (!e.chunks.length) return;
    S.queue.push(e);
    log('queued ' + e.speaker + ' (' + e.chunks.length + ' chunks' + (e.held ? ', held' : '') + ')');
  }
  function dequeue() {
    while (S.queue.length) {
      var e = S.queue.shift();
      /* held lines collapse to the freshest per agent — no backlog */
      if (e.held && !e.pinned) {
        var later = S.queue.some(function (q) { return q.speaker === e.speaker; });
        if (later) { log('collapse: fresher ' + e.speaker + ' line held — older held line dropped'); continue; }
      }
      return e;
    }
    return null;
  }
  function startEntry(e) {
    var distinct = voicesDistinct();
    e.attr = (e.speaker !== S.lastSpoken || !distinct) ? (e.speaker === 'ALLON' ? 'Allon' : 'Babyboo') : '';
    S.lastSpoken = e.speaker; lsSet(LS_SPK, e.speaker);
    S.current = e;
  }
  function pump() {
    watchCommands();
    if (callActive() && S.asleep) S.asleep = false;
    var why = blocked();
    if (why) {
      if (S.speaking && S.current) {
        /* the room needs the floor NOW: park the line mid-entry —
           it resumes from the interrupted chunk when the room is
           quiet. Detach BEFORE stopping the engines so the stopped
           utterance's completion callback can't advance it. */
        var cur0 = S.current;
        S.current = null;
        cur0.held = true;
        S.queue.unshift(cur0);
        stopEngines();
        log('interrupted (' + why + ') — line parked');
      }
      return;
    }
    if (S.speaking) return;
    if (!S.current) {
      var e = dequeue();
      if (!e) return;
      startEntry(e);
    }
    var cur = S.current;
    if (cur.idx >= cur.chunks.length) { S.current = null; return; }
    S.speaking = true;
    speakChunk(cur, cur.chunks[cur.idx], function () {
      S.speaking = false;
      if (S.current === cur) {
        cur.idx++;
        if (cur.idx >= cur.chunks.length) S.current = null;
        pump();   /* chain straight into the next chunk — no dead air */
      }
    });
  }

  /* ---------------- board watch --------------------------------------- */
  function saveSeen(entries) {
    if (!entries.length) return;
    S.seen = { count: entries.length, fp: entries[entries.length - 1].fp };
    lsSet(LS_SEEN, JSON.stringify(S.seen));
  }
  function onBoard(md) {
    var entries = parseEntries(md);
    if (!entries.length) return;
    if (!S.seen) {
      /* first open with voices: the single latest exchange only */
      var lastBB = null, lastAL = null;
      entries.forEach(function (e) { if (e.speaker === 'Babyboo') lastBB = e; else lastAL = e; });
      var pair = entries.filter(function (e) { return e === lastBB || e === lastAL; });
      pair.forEach(function (e) { enqueue(e, true); });
      log('catch-up: latest exchange queued (' + pair.length + ' lines)');
      saveSeen(entries);
      return;
    }
    if (entries.length > S.seen.count &&
        entries[S.seen.count - 1] && entries[S.seen.count - 1].fp === S.seen.fp) {
      for (var i = S.seen.count; i < entries.length; i++) enqueue(entries[i], false);
      saveSeen(entries);
      return;
    }
    if (entries.length !== S.seen.count ||
        (entries.length && entries[entries.length - 1].fp !== S.seen.fp)) {
      /* the board was rebuilt under us — resync silently, never
         re-speak history */
      saveSeen(entries);
    }
  }
  function poll() {
    /* the mute can also be flipped from a glass fallback — stay in sync */
    S.muted = lsGet(LS_MUTE) === '1';
    try {
      fetch('board.md?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('board ' + r.status);
        return r.text();
      }).then(onBoard).catch(function () { /* keep last known state */ });
    } catch (e) { /* keep last known state */ }
  }

  /* ---------------- controls ------------------------------------------ */
  function setMuted(m) {
    S.muted = m;
    lsSet(LS_MUTE, m ? '1' : '0');
  }
  function stopAll() {
    S.current = null;
    S.queue.length = 0;
    stopEngines();
    log('stopped — queue cleared');
  }
  function toggle() {
    if (S.muted) { setMuted(false); log('board voices on'); return; }
    stopAll();
    setMuted(true);
    log('board voices muted');
  }
  function arm() {
    if (!S.armed) { S.armed = true; log('audio armed by his tap'); }
  }
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, arm, { capture: true, passive: true });
  });

  window.__vpcBoardSpeak = {
    state: function () {
      return { armed: S.armed, muted: S.muted, asleep: S.asleep,
               blocked: blocked(), queue: S.queue.length,
               speaking: S.speaking,
               current: S.current ? S.current.speaker : '',
               lastSpoken: S.lastSpoken,
               seen: S.seen ? S.seen.count : 0,
               distinct: voicesDistinct(),
               allonEngine: allonEngine(), babyEngine: babyEngine(),
               babyVoice: S.babyVoiceName || '',
               log: S.log.slice(-12) };
    },
    toggle: toggle,
    stop: function () { stopAll(); setMuted(true); },
    unmute: function () { setMuted(false); },
    arm: arm,
    pollNow: function () { poll(); },
    _enqueueText: function (speaker, text) {   /* proof seam: same door the board uses */
      enqueue({ speaker: speaker, stamp: '', text: text, fp: 'test' }, false);
    }
  };

  poll();
  setInterval(poll, POLL_MS);
  setInterval(pump, TICK_MS);
  log('board voices live — ALLON via ' + allonEngine() + ', Babyboo via ' + babyEngine());
})();
