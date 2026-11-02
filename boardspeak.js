/* boardspeak.js — THE BOARD SPEAKS (his order, 2026-11-01 ~16:58 CST:
   "I don't hear you guys talking at all… it's just mute. Thought y'all
   was going to be talking to each other.")

   The Babyboo<->ALLON board (board.md, the same feed Babyboo's glass
   renders and ALLON's green dot watches) has been text-only: the words
   showed, nothing said them. This page-layer watcher gives the board
   its voices:

   - It polls board.md and speaks NEW entries aloud, in order, one at
     a time — ALLON's lines in ALLON's own voice, Babyboo's in hers.
   - ALLON'S VOICE IS A MAN'S (his direct order, 2026-11-01 ~21:35
     CST, superseding the frozen-voice note: "both of them got a
     girl's voice and I can't tell the difference — ALLON needs to
     have a male voice"). Native first: the bridge (AllonShell.speak;
     APK 1.13's shell picker takes a catalogued-MALE voice by
     identity, pitch 1.0 / rate 1.0 — before 1.13 its scoring could
     crown a high-quality female voice on Samsung-engine phones,
     and nobody could tell the two agents apart). When the shell is
     absent his web utterance keeps muse.html's shape (lang en-US,
     rate 1.02). His web FALLBACK voice below is held to the same
     standard: a positively male-named synth voice, or a decisive
     0.7 pitch — never a woman's voice at a near-natural pitch
     passed off as him.
   - Babyboo has her OWN native channel (APK 1.11): inside the shell
     her lines route to AllonShell.speakBaby — a separate TTS instance
     with its own voice and its own speakdone mailbox. The voice is
     deliberately generic (his simplification order): any clear second
     voice that is not ALLON's, pitch/rate-shifted if the device has
     no clean second voice. She NEVER comes out in his exact voice:
     if her channel is missing (pre-1.11 shell) or not ready, her
     line WAITS — it is never rerouted to his speak(). Outside the
     shell only, speechSynthesis remains her last resort (female pick
     from the device list, else the web default pitched up).
   - ALLON'S CHANNEL MUST PROVE ITSELF TOO (his report, 2026-11-01
     ~20:44 CST: "i still don't hear him talking back and forth —
     it's just Muse talking now, instead of ALLON"). The mirror
     defect of the 17:55 one: her channel got a status door and a
     wait-never-reroute discipline in 1.11, his never did — and in
     the shell a failed TTS init (or a voice that errors before it
     starts) still emits a speakdone, so his lines were counted
     spoken while he said nothing. Now: APK 1.12 gives him
     voiceStatus() (init / none / error:<voice> / ready:<voice>,
     and the shell recreates a dead engine, bounded); this watcher
     routes his line natively only while the channel proves alive,
     and otherwise degrades the line to his web fallback voice (a
     man's generic synth pick, never hers). On pre-1.12 shells a
     completion tripwire judges the channel: a speakdone arriving
     faster than speech can physically happen is a fake — struck
     twice, the channel is judged dead and the fallback takes his
     lines until a real completion revives it. (That fix was the
     channel's plumbing; the voice-identity fix is APK 1.13's —
     see the male-voice bullet above.)
   - EVERY OPEN SPEAKS (his reliability order, 2026-11-01 ~17:58):
     on every app open the watcher speaks the CURRENT latest exchange
     (the freshest entry per agent, in board order) — not just on the
     first open after a ship. Inside the shell there is NO tap-gate:
     native TTS needs no browser gesture, the app open is his act.
     Tap-arming survives only for the pure-web synth fallback. An
     entry counts as spoken only when its utterance actually
     completes; a failed attempt stays queued and retries (short
     interval, next interaction, and a ~20s watchdog) — a line is
     never lost to unlucky timing.
   - THE CAMERA IS THE VOICE SWITCH (his order, ~17:56): tapping the
     camera above the middle top screen toggles the master voice
     latch (localStorage vpc_voice_latch, persisted — a shut-up room
     boots shut up). Latch off stops the current line mid-utterance,
     clears the queue, and silences ALL agent speech (the board here,
     ALLON's talk in muse.html reads the same latch) until the camera
     is tapped again; closing the camera view never toggles it. The
     latch overrides the mute chips and every retry — his silences
     are his, and only his.
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
   - Arming: inside the shell the native bridge needs no gesture —
     speech is available from the moment the app opens. On the pure
     web fallback, the first tap/key anywhere in the room arms audio
     (autoplay law); before that, lines wait silently (the board and
     the green dot still show).
   - AN ENTRY THAT STARTS IS READ TO ITS LAST WORD (his report,
     2026-11-01 ~22:09 CST: the voices read what's in the folder
     "and not finishing" — an entry would start, then stop, and the
     talk never continued). Two holes closed. (a) UTTERANCE SIZE:
     chunks are built from whole sentences under a ~150-char cap
     (~10s of speech each); the old merger packed up to ~230 chars
     (~15-18s) into ONE utterance — the size real engines truncate
     mid-utterance (the WebView synth above all), so entries lost
     their tails chunk by chunk. A sentence longer than the cap is
     split at clause edges, never merged into a bigger chunk.
     (b) THE COLLAPSE ATE STARTED LINES: any room block (his drag,
     the page hiding while he switched apps to install an update)
     parks a speaking entry mid-entry as "held" — and the held-line
     collapse then DROPPED it for good if a fresher line from the
     same agent had queued meanwhile; its remaining chunks were
     never read, never marked, just gone (proven in the battery:
     227 of 2,279 chars read, then silence). Collapse now applies
     ONLY to lines that never started; a started line parks,
     resumes, and finishes, and fresher lines wait behind it. */
(function () {
  'use strict';
  if (window.__vpcBoardSpeak) return;

  var POLL_MS = 15000;      /* board.md poll */
  var TICK_MS = 350;        /* pump tick */
  var LS_SEEN = 'vpc_boardspeak_seen_v1';
  var LS_MUTE = 'vpc_boardspeak_muted';
  var LS_SPK = 'vpc_boardspeak_lastspk';
  var LS_LATCH = 'vpc_voice_latch';

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
    allonVoice: null,       /* picked MALE SpeechSynthesisVoice (his fallback) */
    allonVoiceName: '',
    allonFakes: 0,          /* native completions too fast to be speech */
    allonNativeSuspect: false, /* his native channel judged dead this session */
    allonInitSince: 0,      /* when his channel first read 'init' with a line waiting */
    voicesReady: false,
    lastCmd: null,          /* last __vpcMuseCmd value seen (sleep watch) */
    nativeWait: null,       /* {seq0, since, timer} while a bridge line plays */
    synthWait: null,        /* {done} guard for the live utterance */
    latchOff: false,        /* camera voice latch: true = both agents silent */
    boardLive: false,       /* this session has read the board once (open catch-up done) */
    openedAt: Date.now(),   /* session start (watchdog reference) */
    lastProgress: Date.now(), /* last enqueue / completed entry (watchdog reference) */
    retryAt: 0,             /* next retry instant for a failed/waiting line */
    spokenFps: [],          /* fingerprints of entries whose utterance COMPLETED */
    log: []
  };
  function log(s) {
    S.log.push(s); if (S.log.length > 80) S.log.shift();
    try { console.log('VPC BOARDSPEAK: ' + s); } catch (e) {}
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  S.muted = lsGet(LS_MUTE) === '1';
  S.latchOff = lsGet(LS_LATCH) === 'off';
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
  /* Sentence-built chunks, ~150 chars max (~10s of speech each).
     One utterance per chunk, chained on completion — an entry is a
     queue of short utterances, never one long one: real engines
     (the WebView speechSynthesis first among them) truncate long
     utterances mid-flight, which is how entries used to lose their
     tails. Whole sentences merge only while the chunk stays under
     the cap; a sentence longer than the cap is flushed out of the
     merge and split at clause edges into its own pieces. */
  var CHUNK_MAX = 150;
  function chunkText(text) {
    var sents = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
    var chunks = [], buf = '';
    function pushBuf() { if (buf.trim()) chunks.push(buf.trim()); buf = ''; }
    sents.forEach(function (s) {
      s = s.trim(); if (!s) return;
      if (s.length > CHUNK_MAX) {
        pushBuf();
        while (s.length > CHUNK_MAX) {   /* split a long sentence at a clause edge */
          var cut = Math.max(s.lastIndexOf(', ', CHUNK_MAX), s.lastIndexOf('; ', CHUNK_MAX),
                             s.lastIndexOf(' — ', CHUNK_MAX), s.lastIndexOf(' ', CHUNK_MAX));
          if (cut < 60) cut = CHUNK_MAX;
          chunks.push(s.slice(0, cut + 1).trim());
          s = s.slice(cut + 1).trim();
        }
        if (s) chunks.push(s);
        return;
      }
      if ((buf + ' ' + s).trim().length > CHUNK_MAX) pushBuf();
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
  /* Babyboo's own bridge door (APK 1.11+). Absent on older shells —
     and on those shells her lines WAIT for her channel rather than
     ever being read in ALLON's voice (the one-voice defect). */
  function shellBaby() {
    var a = window.AllonShell;
    return (a && typeof a.speakBaby === 'function' && typeof a.babyVoiceStatus === 'function') ? a : null;
  }
  function babyStatus() {
    var a = shellBaby();
    if (!a) return 'absent';
    try { return String(a.babyVoiceStatus() || 'init'); } catch (e) { return 'init'; }
  }
  function babyReady() {
    var s = babyStatus();
    return s.indexOf('ready:') === 0 || s.indexOf('pitch:') === 0;
  }
  /* ALLON's bridge door (APK 1.12+): the truth about HIS channel,
     the mirror of babyVoiceStatus. Absent on older shells — those
     report 'legacy' and his lines are guarded by the completion
     tripwire in speakNative instead. Reading it KICKS his TTS init
     natively, exactly like hers. */
  function shellAllon() {
    var a = window.AllonShell;
    return (a && typeof a.voiceStatus === 'function') ? a : null;
  }
  function allonStatus() {
    var a = shellAllon();
    if (!a) return 'legacy';
    try { return String(a.voiceStatus() || 'init'); } catch (e) { return 'init'; }
  }
  function allonReady() {
    var s = allonStatus();
    return s.indexOf('ready:') === 0;
  }
  var FEMALE = ['zira', 'samantha', 'aria', 'jenny', 'amber', 'allison', 'ava',
    'catherine', 'elizabeth', 'emma', 'fiona', 'hazel', 'joana', 'karen', 'kate',
    'laura', 'linda', 'mary', 'michelle', 'moira', 'olivia', 'salli', 'sarah',
    'serena', 'susan', 'tessa', 'victoria', 'veena', 'female', 'woman',
    'google us english', 'uk english female'];
  var MALE = ['david', 'daniel', 'alex', 'fred', 'george', 'guy', 'christopher',
    'james', 'john', 'mark', 'michael', 'paul', 'richard', 'thomas', 'male',
    'uk english male', 'ralph', 'bruce', 'smtm', 'iom'];
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
  /* His fallback pick — the mirror of pickFemale: a man's voice,
     never her voice object, never a female-signalled one. Used ONLY
     when his native channel is down (see speakChunk): the line is
     still said aloud, in a man's voice, instead of being counted
     spoken while he stayed silent (the silent-ALLON defect,
     2026-11-01 ~20:44 CST: only Babyboo heard, back and forth).
     HONESTY RULE (his order, ~21:35 CST — both agents sounded like
     girls to him): a voice object is returned ONLY when its name
     positively identifies it as a man's (a MALE token and no FEMALE
     token). A neutrally-named voice is NOT assumed male — on the
     thin device lists this fallback sees, unmarked voices are
     women's as often as not, and the old scoring handed him exactly
     such a voice at natural pitch. No positive ID -> null, and
     speakAllonFallback drops the pitch decisively instead. */
  function pickMale() {
    if (!window.speechSynthesis) return null;
    var vs = [];
    try { vs = window.speechSynthesis.getVoices() || []; } catch (e) {}
    if (!vs.length) return null;
    var best = null, bestScore = -1;
    vs.forEach(function (v) {
      if (S.babyVoice && v === S.babyVoice) return;   /* never her voice */
      var name = (v.name || '').toLowerCase(), lang = (v.lang || '').toLowerCase();
      var maleHit = false, femaleHit = false;
      MALE.forEach(function (h) { if (name.indexOf(h) >= 0) maleHit = true; });
      FEMALE.forEach(function (h) { if (name.indexOf(h) >= 0) femaleHit = true; });
      if (!maleHit || femaleHit) return;   /* only a positively-named man */
      var score = 0;
      if (/^en[-_]us/.test(lang)) score += 30; else if (/^en/.test(lang)) score += 10; else score -= 40;
      if (v.default) score += 5;
      if (score > bestScore) { bestScore = score; best = v; }
    });
    return best;
  }
  function refreshVoices() {
    var v = pickFemale();
    if (v) { S.babyVoice = v; S.babyVoiceName = v.name; }
    var mv = pickMale();
    if (mv) { S.allonVoice = mv; S.allonVoiceName = mv.name; }
  }
  if (window.speechSynthesis) {
    refreshVoices();
    try { window.speechSynthesis.onvoiceschanged = refreshVoices; } catch (e) {}
  }
  /* ALLON's engine: the bridge when present (his call voice, untouched),
     else the web synth with muse.html's exact utterance shape. */
  function allonEngine() { return shell() ? 'native' : (window.speechSynthesis ? 'synth' : 'none'); }
  function babyEngine() {
    if (shellBaby()) { var s = babyStatus(); return babyReady() ? 'native-baby' : 'native-baby-' + s; }
    if (shell()) return 'waiting';   /* shell predates her channel: she waits, never his voice */
    if (window.speechSynthesis && S.babyVoice) return 'synth-female';
    if (window.speechSynthesis) return 'synth';
    return 'none';
  }
  function voicesDistinct() {
    var a = allonEngine(), b = babyEngine();
    if (a === 'none' || b === 'none' || b === 'waiting' || b.indexOf('native-baby-') === 0) return false;
    if (a !== b) return true;
    if (a === 'synth') return !!S.babyVoice;   /* same engine: distinct iff she has her own voice */
    return false;                              /* both on one channel = one voice */
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
    if (S.latchOff) return 'latch';
    if (S.muted) return 'muted';
    if (!S.armed && !shell()) return 'unarmed';   /* tap-gate is web-fallback only; the shell needs no gesture */
    if (document.hidden) return 'hidden';
    if (S.asleep) return 'asleep';
    if (callActive()) return 'call';
    if (gestureActive()) return 'gesture';
    return '';
  }
  function armedOk() { return S.armed || !!shell(); }

  /* ---------------- the camera voice latch ---------------------------
     The latch state lives in localStorage (vpc_voice_latch) so every
     surface agrees and it survives restarts. tools.js flips it when
     the camera prop is tapped open and calls _latch(); this watcher
     also reconciles from localStorage on every pump tick, so load
     order can never lose a flip. Latch OFF is total: the current line
     stops mid-utterance and the queue clears — nothing resumes on
     its own; only the next camera tap (latch on) lets voices back. */
  function applyLatch(off, why) {
    if (off === S.latchOff) return;
    S.latchOff = off;
    lsSet(LS_LATCH, off ? 'off' : 'on');
    try { window.__vpcVoiceLatch = off ? 'off' : 'on'; } catch (e) {}
    if (off) {
      stopAll();
      log('VOICE LATCH OFF (' + why + ') — both agents silent until the camera tap');
    } else {
      log('VOICE LATCH ON (' + why + ') — agents may speak');
    }
  }
  function watchLatch() {
    var off = lsGet(LS_LATCH) === 'off';
    if (off !== S.latchOff) applyLatch(off, 'camera');
  }

  /* ---------------- speech engines ----------------------------------- */
  function mailboxSeqOf(varName) {
    try {
      var raw = String(window[varName] || '');
      if (!raw) return -1;
      var m = JSON.parse(raw);
      return (m && typeof m.seq === 'number' && m.type === 'speakdone') ? m.seq : -2;
    } catch (e) { return -1; }
  }
  function mailboxSeq() { return mailboxSeqOf('__vpcMuseNativeSay'); }
  function babyMailboxSeq() { return mailboxSeqOf('__vpcBabyNativeSay'); }
  /* One native utterance over a speakdone mailbox.
     done(res): true = the utterance COMPLETED (its speakdone was
     observed) — only then may a line count as spoken; false = it
     FAILED (the call threw, or no speakdone arrived inside the
     window) and the line must retry, never be marked spoken;
     'cancelled' = a stop voided it (the pump has already moved on). */
  function speakViaMailbox(varName, speakFn, text, done, onArrive) {
    var base = -1;
    try { var raw0 = JSON.parse(String(window[varName] || 'null')); if (raw0 && typeof raw0.seq === 'number') base = raw0.seq; } catch (e) {}
    var started = Date.now();
    var wait = { finished: false };
    var arrived = false;
    var finish = function (res) {
      if (wait.finished) return; wait.finished = true;
      if (S.nativeWait === wait) S.nativeWait = null;
      done(res);
    };
    wait.cancel = function () { finish('cancelled'); };
    var iv = setInterval(function () {
      if (mailboxSeqOf(varName) > base) {
        if (onArrive && !arrived) { arrived = true; onArrive(Date.now() - started); }
        if (Date.now() - started > 500) { clearInterval(iv); finish(true); }
      }
    }, 200);
    setTimeout(function () { clearInterval(iv); finish(mailboxSeqOf(varName) > base); }, Math.min(60000, 6000 + text.length * 120));
    try { speakFn(text); } catch (e) { clearInterval(iv); finish(false); }
    return wait;
  }
  /* CHATTER VOLUME (his order, 2026-11-01 ~22:21 CST): a dedicated
     level for THIS conversation — the board voices only. Turning it
     down makes the agents background; it never stops, holds, or
     drops a line. The level lives in the tools.js hub
     (window.__vpcChatterVol, persisted page-side). Native lines
     pass it to the shell as a second argument; a shell that
     predates the volume argument throws on the call, which is
     remembered once and the line retried plain in the same breath
     (the APK follow-up adds the accepting overload — until then a
     supporting shell obeys, an old shell speaks at full, and no
     line is ever lost to the probe). Synth lines fold the level
     into the utterance volume together with the master gain. */
  function chatterVol() {
    var v = (typeof window.__vpcChatterVol === 'number') ? window.__vpcChatterVol : 1;
    return Math.max(0, Math.min(1, v));
  }
  var nativeVolOk = null;   /* null = unprobed; false = shell takes no volume arg */
  function bridgeSpeak(a, fn, text) {
    var vol = chatterVol();
    if (nativeVolOk === false || vol >= 0.999) { a[fn](text); return; }
    try { a[fn](text, vol); nativeVolOk = true; }
    catch (e) { nativeVolOk = false; a[fn](text); }
  }
  function speakNative(text, done) {
    var a = shell();
    if (!a) { done(false); return; }
    var arriveMs = -1;
    S.nativeWait = speakViaMailbox('__vpcMuseNativeSay', function (t) { bridgeSpeak(a, 'speak', t); }, text, function (res) {
      /* A completion that ARRIVED faster than speech can physically
         happen is a fake speakdone — a dead channel unblocking the
         queue without a sound (a failed TTS init emits one, and so
         does an utterance that errors before it starts). It must
         never count as spoken: report 'fake' so the caller degrades
         the line to his fallback voice. Genuine speech takes real
         time — even the shortest chunk is ~half a second of audio —
         and arrivals are observed on a 200ms poll, so a sub-400ms
         arrival cannot be a voice. */
      if (res === true && arriveMs >= 0 && arriveMs < 400) { done('fake'); return; }
      done(res);
    }, function (ms) { arriveMs = ms; });
  }
  /* His line, said by the WEB fallback because his native channel
     is down: a positively male-named synth voice (never hers),
     muse.html's rate. If the device list names no man at all, the
     line rides the default voice at pitch 0.7 — decisively a man's
     register. (The old 0.85 was judged by his ear, ~21:35 CST:
     still a girl's voice.) The line is genuinely attempted aloud —
     completion is the synth utterance's own onend, error its
     onerror — never a mark on faith. If the web has no synth
     either, the attempt reports failure and the line stays queued
     (never marked, never dropped); the watchdog keeps prodding his
     native channel meanwhile. */
  function speakAllonFallback(text, done, why) {
    if (!window.speechSynthesis) { done(false); return; }
    if (!S.allonFbLogged) {
      S.allonFbLogged = true;
      log('ALLON line via his web fallback voice — native channel ' + why);
    }
    var v = S.allonVoice || pickMale();
    if (v) { speakSynth(text, { voice: v, rate: 1.02 }, done); return; }
    speakSynth(text, { rate: 1.02, pitch: 0.7 }, done);
  }
  function speakNativeBaby(text, done) {
    var a = shellBaby();
    if (!a) { done(false); return; }
    S.nativeWait = speakViaMailbox('__vpcBabyNativeSay', function (t) { bridgeSpeak(a, 'speakBaby', t); }, text, done);
  }
  function speakSynth(text, opts, done) {
    if (!window.speechSynthesis) { done(false); return; }
    var wait = { finished: false };
    S.synthWait = wait;
    var finish = function (res) {
      if (wait.finished) return; wait.finished = true;
      if (S.synthWait === wait) S.synthWait = null;
      done(res);
    };
    wait.cancel = function () { finish('cancelled'); };
    var u;
    try { u = new SpeechSynthesisUtterance(text); } catch (e) { finish(false); return; }
    u.lang = 'en-US';
    /* Board voices ride the master gain folded with the CHATTER
       level: the master sets the room, the chatter slider sets how
       far back this conversation sits in it. */
    try {
      var mv = (typeof window.__vpcMasterVol === 'number') ? window.__vpcMasterVol : 1;
      u.volume = Math.max(0, Math.min(1, mv * chatterVol()));
    } catch (e) {}
    if (opts.voice) u.voice = opts.voice;
    if (opts.rate) u.rate = opts.rate;
    if (opts.pitch) u.pitch = opts.pitch;
    u.onend = function () { finish(true); };
    u.onerror = function () { finish(false); };
    /* some WebViews never fire onend on long lines — never wedge:
       an unconfirmed utterance counts as FAILED, so the line stays
       queued and retries instead of being marked spoken unheard */
    setTimeout(function () { finish(false); }, Math.min(70000, 5000 + text.length * 130));
    try { window.speechSynthesis.speak(u); } catch (e) { finish(false); }
  }
  function speakChunk(entry, chunk, done) {
    var prefix = '';
    if (entry.idx === 0 && entry.attr) prefix = entry.attr + '. ';
    var text = prefix + chunk;
    log('speak[' + entry.speaker + '/' + (entry.speaker === 'ALLON' ? allonEngine() : babyEngine()) + '] ' + text.slice(0, 90));
    if (entry.speaker === 'ALLON') {
      /* his voice, exactly as muse.html speaks — bridge first, else
         the identical web utterance (default voice, rate 1.02). The
         bridge is trusted only while it proves alive: a channel
         that reports itself dead (APK 1.12 status: 'none' / an
         errored-never-completed voice), one stuck at init, or one
         answering with completions too fast to be speech (older
         shells, judged by the tripwire) degrades the line to his
         web fallback voice. A line is said aloud or it stays
         queued — never counted spoken unheard. That silence is
         the defect he reported at 20:44: only Babyboo heard. */
      if (shell()) {
        var st = allonStatus();
        if (st === 'none' || st.indexOf('error:') === 0) { speakAllonFallback(text, done, 'reports ' + st); return; }
        if (st === 'init') {
          if (!S.allonInitSince) S.allonInitSince = Date.now();
          if (Date.now() - S.allonInitSince > 12000) { speakAllonFallback(text, done, 'stuck at init'); return; }
          if (!entry.allonWaitLogged) { entry.allonWaitLogged = true; log('ALLON line waits — his channel is still coming up'); }
          done('wait'); return;
        }
        if (st.indexOf('ready:') === 0) S.allonInitSince = 0;
        if (S.allonNativeSuspect) { speakAllonFallback(text, done, 'judged dead (fake completions)'); return; }
        speakNative(text, function (res) {
          if (res === 'fake') {
            S.allonFakes++;
            log('ALLON native completion too fast to be speech (strike ' + S.allonFakes + ') — not counted as spoken');
            if (S.allonFakes >= 2) {
              S.allonNativeSuspect = true;
              log('ALLON native channel judged dead — his lines fall back until a real completion revives it');
            }
            done(false); return;
          }
          if (res === true) { S.allonFakes = 0; S.allonInitSince = 0; S.allonNativeSuspect = false; }
          done(res);
        });
        return;
      }
      speakSynth(text, { rate: 1.02 }, done); return;
    }
    /* Babyboo — her own channel, or her line WAITS. The pre-1.11
       fallthrough that read her lines through ALLON's speak() is the
       one-voice defect and it is gone: nothing in this branch can
       reach his channel. */
    if (shellBaby()) {
      if (babyReady()) { speakNativeBaby(text, done); return; }
      if (!entry.waitLogged) { entry.waitLogged = true; log('Babyboo line waits — her channel is ' + babyStatus()); }
      done('wait'); return;
    }
    if (shell()) {
      if (!entry.waitLogged) { entry.waitLogged = true; log('Babyboo line waits — this shell has no channel for her (pre-1.11)'); }
      done('wait'); return;
    }
    if (window.speechSynthesis && S.babyVoice) { speakSynth(text, { voice: S.babyVoice, rate: 1.0, pitch: 1.0 }, done); return; }
    if (window.speechSynthesis) { speakSynth(text, { rate: 1.0, pitch: 1.12 }, done); return; }
    done('wait');
  }
  function stopEngines() {
    if (S.nativeWait && S.nativeWait.cancel) S.nativeWait.cancel();
    if (S.synthWait && S.synthWait.cancel) S.synthWait.cancel();
    if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
    var a = shell();
    if (a && typeof a.stopSpeaking === 'function') { try { a.stopSpeaking(); } catch (e) {} }
    if (a && typeof a.stopBaby === 'function') { try { a.stopBaby(); } catch (e) {} }
    S.speaking = false;
  }

  /* ---------------- the pump ------------------------------------------ */
  function enqueue(entry, pinned) {
    var e = { speaker: entry.speaker, stamp: entry.stamp, fp: entry.fp,
              chunks: chunkText(entry.text), idx: 0, fails: 0, started: false,
              held: !!blocked(), pinned: !!pinned, attr: '' };
    if (!e.chunks.length) return;
    S.queue.push(e);
    S.lastProgress = Date.now();
    log('queued ' + e.speaker + ' (' + e.chunks.length + ' chunks' + (e.held ? ', held' : '') + ')');
  }
  function dequeue() {
    while (S.queue.length) {
      var e = S.queue.shift();
      /* held lines collapse to the freshest per agent — no backlog.
         ONLY lines that never started may collapse: a line that has
         begun speaking (even one parked mid-entry by a room block)
         is read to its last word; fresher lines wait behind it. */
      if (e.held && !e.pinned && !e.started) {
        var later = S.queue.some(function (q) { return q.speaker === e.speaker; });
        if (later) { log('collapse: fresher ' + e.speaker + ' line held — older held line dropped'); continue; }
      }
      return e;
    }
    return null;
  }
  function startEntry(e) {
    e.started = true;   /* from here the entry is collapse-proof: it finishes */
    var distinct = voicesDistinct();
    e.attr = (e.speaker !== S.lastSpoken || !distinct) ? (e.speaker === 'ALLON' ? 'Allon' : 'Babyboo') : '';
    S.lastSpoken = e.speaker; lsSet(LS_SPK, e.speaker);
    S.current = e;
  }
  function pump() {
    watchCommands();
    watchLatch();
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
    if (S.retryAt && Date.now() < S.retryAt) return;   /* a failed/waiting line's retry fuse */
    if (!S.current) {
      var e = dequeue();
      if (!e) return;
      startEntry(e);
    }
    var cur = S.current;
    if (cur.idx >= cur.chunks.length) { S.current = null; return; }
    S.speaking = true;
    speakChunk(cur, cur.chunks[cur.idx], function (res) {
      S.speaking = false;
      if (S.current !== cur) return;          /* stopped / parked meanwhile */
      if (res === 'cancelled') return;
      if (res === 'wait') {
        /* her channel isn't ready — the line stays exactly here and
           retries on the fuse; never rerouted, never dropped */
        S.retryAt = Date.now() + 2000;
        return;
      }
      if (res !== true) {
        /* a FAILED attempt: the line was not heard, so it is NOT
           marked spoken and NOT dropped — retry on a short fuse,
           then park it for the watchdog / his next tap to revive */
        cur.fails = (cur.fails || 0) + 1;
        if (cur.fails >= 4) {
          cur.held = true; cur.fails = 0;
          S.current = null;
          S.queue.unshift(cur);
          S.retryAt = Date.now() + 8000;
          log('speak keeps failing — line parked for retry (never dropped, never marked spoken)');
        } else {
          S.retryAt = Date.now() + 1500;
          log('speak attempt failed — the line retries');
        }
        return;
      }
      cur.fails = 0;
      cur.idx++;
      S.lastProgress = Date.now();
      if (cur.idx >= cur.chunks.length) {
        /* only NOW — utterance complete — has the entry been spoken */
        S.spokenFps.push(cur.fp);
        if (S.spokenFps.length > 60) S.spokenFps.shift();
        S.current = null;
      }
      pump();   /* chain straight into the next chunk — no dead air */
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
    if (!S.boardLive) {
      /* EVERY open speaks: the current latest exchange (freshest
         entry per agent, board order) — a reopen is never a silent
         room, whether or not anything new landed while he was away.
         Everything else on the board is history and stays unspoken;
         the seen baseline is set here so only genuinely new lines
         queue from the next poll on. */
      S.boardLive = true;
      var lastBB = null, lastAL = null;
      entries.forEach(function (e) { if (e.speaker === 'Babyboo') lastBB = e; else lastAL = e; });
      var pair = entries.filter(function (e) { return e === lastBB || e === lastAL; });
      pair.forEach(function (e) { enqueue(e, true); });
      log('open: latest exchange queued (' + pair.length + ' lines)');
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
    S.retryAt = 0;   /* his interaction revives a parked/waiting line at once */
  }
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, arm, { capture: true, passive: true });
  });

  /* ---------------- the every-time watchdog ------------------------
     If speech is expected (lines pending, room awake) and nothing
     has been heard ~20s after the last sign of progress, kick the
     machinery once: clear the retry fuse, re-kick her channel's
     init, and pump. His own silences are absolute — the latch and
     the mute chips win over the watchdog every time, and the pure
     web fallback stays tap-armed (a watchdog cannot mint a gesture). */
  function watchdog() {
    if (S.latchOff || S.muted || S.asleep) return;
    if (!shell() && !shellBaby()) return;
    if (!S.queue.length && !S.current) return;
    if (Date.now() - S.lastProgress < 20000) return;
    log('watchdog: speech expected but silent — re-arming and retrying');
    S.retryAt = 0;
    if (shellBaby()) babyStatus();   /* kicks her TTS init if it never started */
    if (shellAllon()) allonStatus(); /* kicks his TTS init if it never started */
    S.lastProgress = Date.now();     /* one kick per window, never a storm */
    pump();
  }

  window.__vpcBoardSpeak = {
    state: function () {
      return { armed: armedOk(), muted: S.muted, asleep: S.asleep,
               latch: S.latchOff ? 'off' : 'on',
               blocked: blocked(), queue: S.queue.length,
               speaking: S.speaking,
               current: S.current ? S.current.speaker : '',
               lastSpoken: S.lastSpoken,
               seen: S.seen ? S.seen.count : 0,
               spoken: S.spokenFps.length,
               spokenFps: S.spokenFps.slice(),
               distinct: voicesDistinct(),
               allonEngine: allonEngine(), babyEngine: babyEngine(),
               allonStatus: shell() ? allonStatus() : 'n/a',
               allonVoice: S.allonVoiceName || '',
               allonSuspect: !!S.allonNativeSuspect,
               babyStatus: shellBaby() ? babyStatus() : 'absent',
               babyVoice: S.babyVoiceName || '',
               log: S.log.slice(-12) };
    },
    toggle: toggle,
    stop: function () { stopAll(); setMuted(true); },
    unmute: function () { setMuted(false); },
    arm: arm,
    pollNow: function () { poll(); },
    _latch: function (v) { applyLatch(v === 'off', 'camera'); },
    _poke: function () { S.lastProgress = 0; watchdog(); },   /* proof seam: run the watchdog now */
    _enqueueText: function (speaker, text) {   /* proof seam: same door the board uses */
      enqueue({ speaker: speaker, stamp: '', text: text, fp: 'test' }, false);
    }
  };

  poll();
  setInterval(poll, POLL_MS);
  setInterval(pump, TICK_MS);
  setInterval(watchdog, 1000);
  log('board voices live — ALLON via ' + allonEngine() + ', Babyboo via ' + babyEngine());
})();
