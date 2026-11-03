/* musicbar.js — INTRO BEAT + SOUNDBAR (his orders, 2026-11-01 ~18:35 CST:
   "Add this beat to the intro — when the intro is coming on, it takes
   a little bit to load up, put that on there. And put a soundbar at
   the top — when you tap it you can go through music. Add all the
   music that I have on the office, and then add this one.")

   Two pieces, both page-layer (this file is loaded by index.html
   itself, BEFORE the engine — tools.js only arrives at the end of
   boot, which is too late for an intro):

   1. INTRO BEAT — his Nov 1 Remix plays while the PC loads: from
      page start until the room is up (the engine's tracking layer,
      window.__vpcTrack, only appears in _finish_boot — its arrival
      IS the "room interactive" signal page-side), then it fades and
      stops. In the APK shell the WebView is built with
      mediaPlaybackRequiresUserGesture=false, so the beat starts with
      the intro on its own. On the pure-web path a browser may hold
      autoplay until his first tap: the beat then starts on that tap
      if the room is still loading, and never pretends otherwise —
      state() reports 'blocked' until sound actually starts.
      The beat yields instantly to anything deliberate: a tap on the
      soundbar, a library track starting, or a screen's media going
      full-view/stage.

   2. SOUNDBAR — a slim strip pinned across the TOP of the PC view.
      Tap it and the music library opens: the office's own tracks
      (the Agent Office's TRACKS list, streamed from the office's own
      hosted files — the same ones its music player plays) with his
      Nov 1 Remix added last, per his words. A picked track keeps
      playing while he uses the room; tapping another switches;
      a track's end rolls into the next, like the office loop.

   ONE AUDIO AT A TIME (the standing audio law): this module's two
   channels (intro beat, library) never overlap — starting one stops
   the other. Starting a library track also yields the room's
   surfaces best-effort at this layer: every tracked frame gets a
   {vpc:'music', on:true} note, and same-origin surfaces get a real
   pauseVideo command posted into any YouTube embed they host (the
   Shortz/YouTube surfaces are YouTube embeds; a cross-origin frame
   cannot be reached further than the note — stated, not faked).
   The other direction is hard: when a screen's media goes full-view
   (the projector stage mode, or a promoted full-view app), the
   library stops — a video he deliberately blew up takes the room's
   audio over from his background music.

   TOP-STRIP GEOMETRY (the mounts' law): the drop-down mounts ride
   slim DOM tabs at the top edge of the view (tools.js, z 9980).
   This strip (36px, z 9981) is the topmost chrome; the rule below
   (#vpc-mtab-l/r, ID specificity beats the tabs' own class rule)
   docks those tabs directly beneath the strip, so the two never
   overlap — soundbar on top, mount tabs under it, room below. */
(function () {
  'use strict';
  if (window.__vpcMusicBar) return;
  window.__vpcMusicBar = true;

  var OFFICE = 'https://xmrmathx.github.io/agent-office/assets/';
  var TRACKS = [
    { name: 'Dusty Vinyl', dur: '2:42', src: OFFICE + 'music-dusty-vinyl.mp3' },
    { name: 'This and That', dur: '2:12', src: OFFICE + 'music-this-and-that.mp3' },
    { name: 'Almost There', dur: '2:27', src: OFFICE + 'music-almost-there.mp3' },
    { name: 'AO', dur: '2:28', src: OFFICE + 'music-ao.mp3' },
    { name: '8bit Office', dur: '3:03', src: OFFICE + 'music-8bit-office.mp3' },
    { name: 'Nov 1 Remix', dur: '2:32', src: 'audio/nov1-remix.mp3' }
  ];
  var BEAT = 'audio/nov1-remix.mp3';
  var BAR_H = 36;
  var FAILSAFE_MS = 240000;

  var S = {
    phase: 'boot',          /* 'boot' | 'done' */
    bootAt: 0,              /* when tracking first appeared */
    introState: 'init',     /* init|starting|playing|blocked|fading|stopped|ended|yielded */
    introAttempts: 0,
    idx: -1,                /* library track index, -1 = none */
    playing: false,
    panelOpen: false,
    log: []
  };
  function log(s) {
    S.log.push(s); if (S.log.length > 60) S.log.shift();
    try { console.log('VPC MUSIC: ' + s); } catch (e) {}
  }

  /* ---------------- the two audio channels -------------------------- */
  var intro = new Audio();
  intro.preload = 'auto';
  intro.src = BEAT;
  var player = new Audio();
  player.preload = 'none';

  function bootDone() {
    try {
      var T = window.__vpcTrack;
      return !!(T && Object.keys(T).length > 0);
    } catch (e) { return false; }
  }

  var fadeTimer = null;
  function stopIntro(why) {
    if (S.introState === 'stopped' || S.introState === 'ended') return;
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
    var was = S.introState;
    S.introState = (why === 'yield') ? 'yielded' : 'fading';
    log('intro beat stops (' + why + ', was ' + was + ')');
    var steps = 0;
    fadeTimer = setInterval(function () {
      steps++;
      try { intro.volume = Math.max(0, 1 - steps / 8); } catch (e) {}
      if (steps >= 8) {
        clearInterval(fadeTimer); fadeTimer = null;
        try { intro.pause(); } catch (e) {}
        if (S.introState === 'fading') S.introState = 'stopped';
        refreshBar();
      }
    }, 60);
    refreshBar();
  }

  function tryIntro() {
    if (S.phase !== 'boot' || S.introState === 'playing' ||
        S.introState === 'starting' || S.introState === 'ended') return;
    S.introAttempts++;
    S.introState = 'starting';
    var p = null;
    try { p = intro.play(); } catch (e) { p = null; }
    if (p && p.then) {
      p.then(function () {
        if (S.introState === 'starting') {
          S.introState = 'playing';
          log('intro beat playing (attempt ' + S.introAttempts + ')');
          refreshBar();
        } else if (S.introState === 'fading' || S.introState === 'yielded' ||
                   S.phase === 'done' || S.idx >= 0) {
          /* a stop (or a library pick) landed while the start was in
             flight — stay stopped. ('playing' alone is NOT this case:
             the element's own 'playing' event latches that state
             first, and pausing here would kill a healthy start.) */
          try { intro.pause(); } catch (e) {}
        }
      }).catch(function () {
        if (S.introState === 'starting') {
          S.introState = 'blocked';
          log('intro beat held by autoplay policy — starts on his first tap while the room loads');
          refreshBar();
        }
      });
    } else {
      /* very old engines: no promise — trust the element's events */
      S.introState = 'playing';
      refreshBar();
    }
  }
  intro.addEventListener('playing', function () {
    if (S.introState === 'starting' || S.introState === 'blocked') {
      S.introState = 'playing'; refreshBar();
    } else if (S.introState === 'fading' || S.introState === 'yielded' || S.phase === 'done') {
      try { intro.pause(); } catch (e) {}   /* a stop already owns this channel */
    }
  });
  intro.addEventListener('ended', function () {
    if (S.phase === 'boot') { S.introState = 'ended'; log('intro beat ended on its own'); refreshBar(); }
  });
  intro.addEventListener('error', function () {
    log('intro beat failed to load/decode: ' + (intro.error ? intro.error.code : '?'));
  });

  /* first tap anywhere: the web path's autoplay key (boot only) */
  function armTap() { tryIntro(); }
  document.addEventListener('pointerdown', armTap, true);
  document.addEventListener('keydown', armTap, true);

  /* ---------------- the audio law ----------------------------------- */
  function yieldSurfaces() {
    var T = {};
    try { T = window.__vpcTrack || {}; } catch (e) {}
    Object.keys(T).forEach(function (k) {
      var fr = T[k] && T[k].f;
      if (!fr) return;
      try { fr.contentWindow.postMessage({ vpc: 'music', on: true }, '*'); } catch (e) {}
      var doc = null;
      try { doc = fr.contentDocument; } catch (e) { doc = null; }
      if (!doc) return;   /* cross-origin: the note above is what reaches it */
      var embeds = doc.querySelectorAll('iframe');
      for (var i = 0; i < embeds.length; i++) {
        var s = embeds[i].src || '';
        if (/youtube(-nocookie)?\.com\/embed/.test(s)) {
          try {
            embeds[i].contentWindow.postMessage(
              JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
          } catch (e) {}
        }
      }
    });
  }
  function fullViewMedia() {
    try { if (window.__vpcPromoted) return true; } catch (e) {}
    var T = {};
    try { T = window.__vpcTrack || {}; } catch (e) {}
    for (var k in T) { if (T[k] && T[k].mode === 'stage') return true; }
    return false;
  }

  /* ---------------- library playback -------------------------------- */
  function playTrack(i, why) {
    if (i < 0 || i >= TRACKS.length) return;
    stopIntro('yield');
    yieldSurfaces();
    S.idx = i;
    try {
      if (player.src !== new URL(TRACKS[i].src, location.href).href) player.src = TRACKS[i].src;
    } catch (e) { player.src = TRACKS[i].src; }
    var p = null;
    try { p = player.play(); } catch (e) { p = null; }
    if (p && p.catch) p.catch(function () {
      S.playing = false;
      log('track "' + TRACKS[i].name + '" could not start here (' + (why || 'tap') + ')');
      refreshBar(); renderPanel();
    });
    S.playing = true;
    log('track ' + (i + 1) + '/' + TRACKS.length + ': ' + TRACKS[i].name);
    refreshBar(); renderPanel();
  }
  function pauseTrack() {
    try { player.pause(); } catch (e) {}
    S.playing = false;
    refreshBar(); renderPanel();
  }
  function stopAll() {
    pauseTrack();
    S.idx = -1;
    stopIntro('yield');
    log('music stopped');
    refreshBar(); renderPanel();
  }
  player.addEventListener('playing', function () { S.playing = true; refreshBar(); renderPanel(); });
  player.addEventListener('pause', function () { if (S.playing && player.ended !== true) { /* external pause */ } });
  player.addEventListener('ended', function () {
    if (S.idx >= 0) playTrack((S.idx + 1) % TRACKS.length, 'advance');
  });
  player.addEventListener('error', function () {
    if (S.idx >= 0) log('track "' + TRACKS[S.idx].name + '" hit a load error');
  });

  /* ---------------- the bar ------------------------------------------ */
  var css = document.createElement('style');
  css.textContent = [
    /* the mounts' view tabs dock directly beneath this strip */
    '#vpc-mtab-l,#vpc-mtab-r{top:' + BAR_H + 'px}',
    '#vpc-soundbar{position:fixed;top:0;left:0;right:0;height:' + BAR_H + 'px;z-index:9981;',
    'display:flex;align-items:center;gap:9px;padding:0 10px;box-sizing:border-box;',
    'background:rgba(8,10,18,.88);border-bottom:1.5px solid #2c2c3e;color:#f2f2f7;',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
    'user-select:none;-webkit-user-select:none;touch-action:manipulation;cursor:pointer}',
    '#vpc-soundbar .ic{color:#e9c979;font-size:17px;line-height:1;flex:0 0 auto}',
    '#vpc-soundbar .lb{flex:1;font-size:12.5px;font-weight:800;letter-spacing:1.4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#vpc-soundbar .lb .sub{color:#8b93a7;font-weight:600;letter-spacing:.6px}',
    '#vpc-soundbar .stop{flex:0 0 auto;width:28px;height:28px;border-radius:8px;border:1.5px solid #2c2c3e;',
    'background:#14141f;color:#ff8296;font-size:12px;cursor:pointer;display:none;align-items:center;justify-content:center}',
    '#vpc-soundbar .car{color:#8b93a7;font-size:12px;flex:0 0 auto}',
    '#vpc-music-panel{position:fixed;top:' + BAR_H + 'px;left:0;right:0;z-index:9991;display:none;',
    'max-height:56vh;overflow-y:auto;background:rgba(8,9,16,.97);border-bottom:2px solid #b9975b;',
    'box-shadow:0 18px 44px rgba(0,0,0,.6);color:#f2f2f7;',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;user-select:none;-webkit-user-select:none}',
    '#vpc-music-panel .hd{display:flex;align-items:center;padding:10px 14px 6px;font-size:12px;',
    'font-weight:800;letter-spacing:2px;color:#e9c979}',
    '#vpc-music-panel .hd span{flex:1}',
    '#vpc-music-panel .row{display:flex;align-items:center;gap:11px;padding:12px 14px;cursor:pointer;border-top:1px solid #1d1d2b}',
    '#vpc-music-panel .row:active{background:#171724}',
    '#vpc-music-panel .row .st{width:22px;text-align:center;color:#e9c979;font-size:13px;flex:0 0 auto}',
    '#vpc-music-panel .row .nm{flex:1;font-size:15px;font-weight:600}',
    '#vpc-music-panel .row .du{color:#8b93a7;font-size:12.5px}',
    '#vpc-music-panel .row.on .nm{color:#ffd479}'
  ].join('');
  document.head.appendChild(css);

  var bar = null, barLabel = null, barStop = null, barCaret = null, panel = null, panelList = null;

  function refreshBar() {
    if (!bar) return;
    var txt;
    if (S.idx >= 0) {
      txt = TRACKS[S.idx].name.toUpperCase() + (S.playing ? '' : ' <span class="sub">· PAUSED</span>');
    } else if (S.introState === 'playing' || S.introState === 'starting') {
      txt = 'NOV 1 REMIX <span class="sub">· INTRO</span>';
    } else if (S.introState === 'blocked' && S.phase === 'boot') {
      txt = 'MUSIC <span class="sub">· TAP FOR SOUND</span>';
    } else {
      txt = 'MUSIC';
    }
    barLabel.innerHTML = '♪ ' + txt;
    barStop.style.display = (S.idx >= 0 || S.introState === 'playing') ? 'flex' : 'none';
    barCaret.textContent = S.panelOpen ? '▴' : '▾';
  }

  function renderPanel() {
    if (!panelList) return;
    panelList.innerHTML = '';
    TRACKS.forEach(function (t, i) {
      var r = document.createElement('div');
      r.className = 'row' + (i === S.idx ? ' on' : '');
      var st = document.createElement('div');
      st.className = 'st';
      st.textContent = (i === S.idx) ? (S.playing ? '▶' : '❚❚') : '♪';
      var nm = document.createElement('div');
      nm.className = 'nm'; nm.textContent = t.name;
      var du = document.createElement('div');
      du.className = 'du'; du.textContent = t.dur;
      r.appendChild(st); r.appendChild(nm); r.appendChild(du);
      r.addEventListener('pointerdown', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        if (i === S.idx && S.playing) pauseTrack();
        else playTrack(i, 'tap');
      });
      panelList.appendChild(r);
    });
  }

  function setPanel(open) {
    S.panelOpen = !!open;
    if (panel) panel.style.display = open ? 'block' : 'none';
    if (open) renderPanel();
    refreshBar();
  }

  function buildBar() {
    if (bar || !document.body) return;
    bar = document.createElement('div');
    bar.id = 'vpc-soundbar';
    var ic = document.createElement('span');
    ic.className = 'ic'; ic.textContent = '♪';
    barLabel = document.createElement('div');
    barLabel.className = 'lb';
    barStop = document.createElement('button');
    barStop.className = 'stop'; barStop.textContent = '■';
    barStop.setAttribute('aria-label', 'Stop music');
    barCaret = document.createElement('span');
    barCaret.className = 'car'; barCaret.textContent = '▾';
    bar.appendChild(ic); bar.appendChild(barLabel); bar.appendChild(barStop); bar.appendChild(barCaret);
    document.body.appendChild(bar);

    panel = document.createElement('div');
    panel.id = 'vpc-music-panel';
    var hd = document.createElement('div');
    hd.className = 'hd';
    /* T1c (his report, 2026-11-02 ~11:26 CST): the exit of an opened
       surface belongs at the TOP LEFT — the ✕ leads the header, so
       the music surface's close sits at its top-left corner, below
       the strip (the panel docks at top:BAR_H), fully visible and
       tappable. It used to trail the title at the right. */
    var hx = document.createElement('div');
    hx.id = 'vpc-music-x';
    hx.textContent = '✕'; hx.style.cursor = 'pointer'; hx.style.padding = '2px 6px';
    hx.addEventListener('pointerdown', function (ev) {
      ev.preventDefault(); ev.stopPropagation(); setPanel(false);
    });
    hd.appendChild(hx);
    var hdt = document.createElement('span');
    hdt.textContent = 'MUSIC — FROM THE OFFICE + YOUR LATEST';
    hd.appendChild(hdt);
    panel.appendChild(hd);
    panelList = document.createElement('div');
    panel.appendChild(panelList);
    document.body.appendChild(panel);

    bar.addEventListener('pointerdown', function (ev) {
      /* any tap on the bar is deliberate: the intro beat yields */
      stopIntro('yield');
      if (ev.target === barStop) return;
      ev.preventDefault(); ev.stopPropagation();
      setPanel(!S.panelOpen);
    });
    barStop.addEventListener('pointerdown', function (ev) {
      ev.preventDefault(); ev.stopPropagation(); stopAll();
    });
    document.addEventListener('pointerdown', function (e) {
      if (!S.panelOpen) return;
      if (bar.contains(e.target) || panel.contains(e.target)) return;
      setPanel(false);
    }, true);
    refreshBar();
    log('soundbar up — ' + TRACKS.length + ' tracks');
  }
  if (document.body) buildBar();
  else document.addEventListener('DOMContentLoaded', buildBar);

  /* ---------------- boot watch + takeover watch --------------------- */
  var bornAt = Date.now();
  setInterval(function () {
    if (S.phase === 'boot') {
      if (bootDone()) {
        S.phase = 'done';
        S.bootAt = Date.now();
        stopIntro('boot');
        log('room is up — intro beat done');
      } else if (Date.now() - bornAt > FAILSAFE_MS) {
        S.phase = 'done';
        stopIntro('failsafe');
        log('intro failsafe stop (boot signal never arrived)');
      }
    }
    if (fullViewMedia()) {
      if (S.introState === 'playing' || S.introState === 'starting') stopIntro('yield');
      if (S.idx >= 0 && S.playing) {
        log('full-view media takes the room — library yields');
        pauseTrack();
        S.idx = -1;
        refreshBar(); renderPanel();
      }
    }
  }, 250);

  tryIntro();

  window.__vpcMusic = {
    state: function () {
      return {
        phase: S.phase,
        intro: S.introState,
        introAttempts: S.introAttempts,
        introPlaying: S.introState === 'playing' && !intro.paused,
        introTime: intro.currentTime || 0,
        idx: S.idx,
        playing: S.playing && !player.paused,
        track: S.idx >= 0 ? TRACKS[S.idx].name : null,
        trackTime: player.currentTime || 0,
        panel: S.panelOpen,
        tracks: TRACKS.map(function (t) { return { name: t.name, dur: t.dur, src: t.src }; }),
        log: S.log.slice()
      };
    },
    play: function (i) { playTrack(i, 'api'); },
    stop: function () { stopAll(); },
    togglePanel: function (open) { setPanel(open === undefined ? !S.panelOpen : open); },
    tracks: TRACKS
  };
  log('musicbar loaded — intro beat first');
})();
