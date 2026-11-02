/* brotherlink.js — BROTHER LINK for the Virtual PC (his design,
   2026-11-01 ~18:42-18:46 CST, Addendums 1-3 of the Studio spec):

   1. CAMERA = THE DOOR. Tapping the camera above the middle top
      screen opens the camera with a CHOICE, every time:
      "Invite James" or "Use it regular". Inviting is never forced.
      The choice panel rides the existing camera-open signal
      (window.__vpcCamOpen, set by tools.js) and NEVER touches the
      camera VOICE LATCH — tools.js flips the latch on the same tap
      exactly as before; this module reads nothing and writes
      nothing about voices.
   2. INVITE -> VIDEO CHAT. Invite rings James's PC: a session node
      on the brothers' existing realtime backend (Firebase project
      cre8tor-vibez-hq, the Agent Office's project) under the
      clearly-named node "brotherlink/". James's side (this same
      module, running on his PC) shows a NOTIFICATION card; on Join
      the two PCs connect WebRTC — each brother in his own PC —
      for plain talking, in the room AND inside the Studio (this
      module lives on the top window, above every surface).
   3. TEAM CAM (Ready or Not helmet-cam pattern). During a
      connection, either brother can share his PC (the room canvas —
      his screens as they run) or ask to see the other's. The OTHER
      brother always gets the prompt — "your brother is trying to
      share his screen" / "wants to see your screen" — and HIS
      ALLOW IS THE GATE. On allow, the corner PiP pops up
      automatically. Consent is per-direction and revocable: stop
      sharing closes his window on the other side.

   IDENTITY: this PC's brother is localStorage 'vpc_brother_id'
   ('craig' here; James's PC carries 'james' — the blank template
   sets it on first run). The listener half is generic: any PC
   signed as James receives Craig's invites and vice versa.

   TRANSPORT: Firebase RTDB REST (PUT/GET/PATCH/POST on .json) —
   the same access pattern verified against the live project. The
   base URL is overridable via window.__vpcBrotherLinkDb so the
   proof harness can run the identical code against a local shim;
   production never sets it.

   HONEST FENCES: WebRTC uses a public STUN server and no TURN —
   most home networks connect directly; a hostile NAT can refuse,
   and the card says "still connecting" rather than faking a feed.
   The PC-view share streams the room's canvas element; if a
   device cannot capture it, the share says so and nothing fakes. */
(function () {
  'use strict';
  if (window.__vpcBrotherLink) return;

  var DB = (window.__vpcBrotherLinkDb || 'https://cre8tor-vibez-hq-default-rtdb.firebaseio.com').replace(/\/$/, '');
  var ME = 'craig', NAMES = { craig: 'Craig', james: 'James' };
  try { ME = localStorage.getItem('vpc_brother_id') || 'craig'; } catch (e) {}
  if (ME !== 'craig' && ME !== 'james') ME = 'craig';
  var BRO = ME === 'craig' ? 'james' : 'craig';

  var S = {
    session: null,          /* the shared session node (server copy) */
    phase: 'idle',          /* idle | ringing-out | ringing-in | live */
    panelOpen: false,
    pc: null,               /* RTCPeerConnection */
    localStream: null,      /* camera+mic */
    pcStream: null,         /* room canvas stream (when sharing) */
    pcSender: null,
    makingOffer: false, ignoreOffer: false, isSettingRemote: false,
    seenSig: {}, lastShareBro: 'off', lastShareMe: 'off',
    brotherOnline: false,
    log: []
  };
  function log(s) { S.log.push(s); if (S.log.length > 60) S.log.shift(); try { console.log('VPC BROTHER: ' + s); } catch (e) {} }
  function now() { return Date.now(); }
  function sidNew() { return 's' + now().toString(36) + Math.floor(Math.random() * 1e5).toString(36); }

  /* ---------------- transport (RTDB REST) ---------------- */
  function req(method, path, body) {
    var opt = { method: method, headers: {} };
    if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
    return fetch(DB + path + '.json', opt).then(function (r) {
      if (!r.ok) throw new Error(method + ' ' + path + ' -> ' + r.status);
      return r.json();
    });
  }
  var get = function (p) { return req('GET', p); };
  var put = function (p, v) { return req('PUT', p, v); };
  var patch = function (p, v) { return req('PATCH', p, v); };
  var push = function (p, v) { return req('POST', p, v); };
  var del = function (p) { return req('DELETE', p); };
  var SES = '/brotherlink/sessions/current';

  /* ---------------- DOM ---------------- */
  var css = document.createElement('style');
  css.textContent = [
    '.bl-card{position:fixed;z-index:9986;background:rgba(8,9,18,.97);border:1.5px solid #b9975b;border-radius:15px;',
    'box-shadow:0 16px 44px rgba(0,0,0,.62);color:#f2f2f7;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
    'padding:13px 14px;user-select:none;-webkit-user-select:none}',
    '.bl-card h4{font-size:11px;letter-spacing:2px;color:#e9c979;font-weight:800;margin:0 0 7px}',
    '.bl-card .tx{font-size:14px;font-weight:600;line-height:1.45}',
    '.bl-card .sm{font-size:11.5px;color:#9aa3c7;margin-top:4px;line-height:1.4}',
    '.bl-row{display:flex;gap:8px;margin-top:11px;flex-wrap:wrap}',
    '.bl-btn{flex:1;min-width:104px;height:40px;border-radius:10px;border:1.5px solid #2c2c3e;background:#171724;',
    'color:#f2f2f7;font-size:13.5px;font-weight:700;cursor:pointer;padding:0 10px}',
    '.bl-btn:active{border-color:#e9c979}',
    '.bl-btn.gold{background:#3a2f14;border-color:#b9975b;color:#ffd479}',
    '.bl-btn.red{border-color:rgba(255,90,110,.55);color:#ff9aa4}',
    '#bl-panel{top:46px;left:50%;transform:translateX(-50%);width:min(430px,92vw);display:none}',
    '#bl-invite{top:46px;right:10px;width:min(330px,88vw);display:none;border-color:#ffd479}',
    '#bl-shareprompt{top:46px;right:10px;width:min(330px,88vw);display:none}',
    '#bl-call{right:10px;bottom:10px;width:302px;display:none;z-index:9984}',
    '#bl-call video.rv{width:100%;height:196px;object-fit:cover;border-radius:10px;background:#000;display:block}',
    '#bl-call .svwrap{position:absolute;top:8px;right:8px;width:82px;height:60px;border-radius:8px;overflow:hidden;border:1.5px solid #2c2c3e}',
    '#bl-call video.sv{width:100%;height:100%;object-fit:cover;background:#111}',
    '#bl-pip{position:fixed;top:46px;right:10px;width:264px;z-index:9983;display:none;',
    'background:rgba(8,9,18,.97);border:1.5px solid #3d9bd6;border-radius:13px;overflow:hidden;',
    'box-shadow:0 14px 40px rgba(0,0,0,.6);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#f2f2f7}',
    '#bl-pip .ph{display:flex;align-items:center;gap:6px;padding:6px 9px;font-size:10.5px;font-weight:800;letter-spacing:1.4px;color:#aee6ff}',
    '#bl-pip .ph .liv{width:8px;height:8px;border-radius:50%;background:#ff5964;box-shadow:0 0 8px #ff5964;animation:blblink 1.2s infinite}',
    '@keyframes blblink{50%{opacity:.35}}',
    '#bl-pip video{width:100%;height:158px;object-fit:cover;background:#000;display:block}',
    '#bl-sharechip{position:fixed;left:10px;bottom:10px;z-index:9985;display:none;align-items:center;gap:9px;',
    'background:rgba(58,47,20,.96);border:1.5px solid #b9975b;color:#ffd479;border-radius:11px;padding:8px 11px;',
    'font-family:system-ui,sans-serif;font-size:12px;font-weight:700}',
    '#bl-sharechip button{height:28px;padding:0 10px;border-radius:8px;border:1.5px solid #b9975b;background:#171724;color:#ffd479;font-weight:700;cursor:pointer}'
  ].join('');
  document.head.appendChild(css);

  function el(tag, cls, parent, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text !== undefined) d.textContent = text;
    if (parent) parent.appendChild(d);
    return d;
  }
  function card(id) {
    var c = document.getElementById(id);
    if (c) return c;
    c = el('div', 'bl-card', document.body);
    c.id = id;
    return c;
  }
  function btn(parent, label, cls, fn) {
    var b = el('button', 'bl-btn' + (cls ? ' ' + cls : ''), parent, label);
    b.onclick = fn;
    return b;
  }

  /* ---------------- the camera choice panel ---------------- */
  function openPanel() {
    S.panelOpen = true;
    var p = card('bl-panel');
    p.innerHTML = '';
    el('h4', '', p, 'CAMERA');
    if (S.phase === 'live') {
      el('div', 'tx', p, 'You and ' + NAMES[BRO] + ' are connected.');
      el('div', 'sm', p, 'The call card (bottom right) carries share and hang-up. Closing the camera view leaves the call — and the voice switch — exactly as they are.');
      var r0 = el('div', 'bl-row', p);
      btn(r0, 'Close', '', function () { closePanel(); });
    } else if (S.phase === 'ringing-out') {
      el('div', 'tx', p, 'Calling ' + NAMES[BRO] + '…');
      el('div', 'sm', p, S.brotherOnline ? NAMES[BRO] + "'s PC is on — he is getting the invite now." : NAMES[BRO] + "'s PC looks off right now — the invite waits for him there.");
      var r1 = el('div', 'bl-row', p);
      btn(r1, 'Cancel the call', 'red', function () { endSession(true); closePanel(); });
      btn(r1, 'Close', '', function () { closePanel(); });
    } else {
      el('div', 'tx', p, 'Invite ' + NAMES[BRO] + ' to video chat, or just use the camera regular?');
      el('div', 'sm', p, 'Inviting is your call, every time. Regular = your camera, your room, nobody else.');
      var r = el('div', 'bl-row', p);
      btn(r, '🎥 Invite ' + NAMES[BRO], 'gold', function () { closePanel(); invite(); });
      btn(r, 'Use it regular', '', function () { closePanel(); log('camera used regular — no invite'); });
    }
    p.style.display = 'block';
  }
  function closePanel() { S.panelOpen = false; var p = document.getElementById('bl-panel'); if (p) p.style.display = 'none'; }

  /* camera-open signal: tools.js sets __vpcCamOpen='1' on open.
     Rising edge -> the choice appears. The voice latch is flipped
     by tools.js on the same tap — we do not read or write it. */
  var lastCamOpen = '';
  setInterval(function () {
    var v = '';
    try { v = window.__vpcCamOpen || ''; } catch (e) {}
    if (v === '1' && lastCamOpen !== '1') { log('camera opened — choice panel up'); openPanel(); }
    if (v !== '1' && S.panelOpen && S.phase !== 'ringing-out') closePanel();
    lastCamOpen = v;
  }, 250);
  /* the Studio's BROTHER button lands here too */
  window.addEventListener('message', function (e) {
    if (e.data && e.data.vpc === 'brotherlink' && e.data.action === 'panel') openPanel();
  });

  /* ---------------- presence ---------------- */
  function heartbeat() {
    put('/brotherlink/presence/' + ME, { ts: now(), pc: 'virtual-pc' }).catch(function () {});
    get('/brotherlink/presence/' + BRO).then(function (v) {
      S.brotherOnline = !!(v && v.ts && now() - v.ts < 30000);
    }).catch(function () {});
  }
  heartbeat(); setInterval(heartbeat, 10000);

  /* ---------------- session lifecycle ---------------- */
  function invite() {
    if (S.phase === 'ringing-out' || S.phase === 'live') return;
    var ses = {
      sid: sidNew(), from: ME, to: BRO, state: 'ringing', ts: now(),
      share: { craig: { st: 'off' }, james: { st: 'off' } }
    };
    put(SES, ses).then(function () {
      S.session = ses; S.phase = 'ringing-out';
      log('invite sent to ' + BRO + ' (session ' + ses.sid + ')');
      openPanel();
    }).catch(function (e) { log('invite failed: ' + e.message); });
  }
  function acceptInvite() {
    if (!S.session || S.session.state !== 'ringing') return;
    patch(SES, { state: 'live', acceptedAt: now() }).then(function () {
      log('accepted — joining the call');
      hideInvite();
      startCall(false);
    }).catch(function (e) { log('accept failed: ' + e.message); });
  }
  function declineInvite() {
    if (!S.session) return;
    patch(SES, { state: 'declined', ts: now() }).then(function () {
      hideInvite(); S.session = null; S.phase = 'idle';
      log('invite declined on this side');
    }).catch(function () {});
  }
  function endSession(local) {
    stopCall();
    S.phase = 'idle';
    hideInvite(); hideSharePrompt(); hideCallCard(); stopSharing(true);
    if (S.session) {
      var sid = S.session.sid;
      patch(SES, { state: 'ended', ts: now() }).then(function () {
        setTimeout(function () {
          get(SES).then(function (v) { if (v && v.sid === sid) del(SES).catch(function () {}); }).catch(function () {});
        }, 2500);
      }).catch(function () {});
      S.session = null;
    }
    if (local) log('call ended from this side');
  }

  /* ---------------- invite + share prompt cards ---------------- */
  function showInvite(from) {
    var c = card('bl-invite');
    c.innerHTML = '';
    el('h4', '', c, 'VIDEO CHAT');
    el('div', 'tx', c, NAMES[from] + ' is inviting you to video chat');
    el('div', 'sm', c, 'Join and you are face to face — him in his PC, you in yours.');
    var r = el('div', 'bl-row', c);
    btn(r, 'Join', 'gold', acceptInvite);
    btn(r, 'Not now', '', declineInvite);
    c.style.display = 'block';
  }
  function hideInvite() { var c = document.getElementById('bl-invite'); if (c) c.style.display = 'none'; }

  function showSharePrompt(ownerEntry) {
    var c = card('bl-shareprompt');
    c.innerHTML = '';
    el('h4', '', c, 'SCREEN SHARE');
    var mine = ownerEntry.want === 'request';
    el('div', 'tx', c, mine
      ? NAMES[BRO] + ' wants to see your screen'
      : NAMES[BRO] + ' is trying to share his screen');
    el('div', 'sm', c, mine
      ? 'If you share, he sees your PC — your screens as they run — in a corner window on his side. You can stop any time.'
      : 'If you allow it, his PC pops up in a corner window on your side — what he is doing on his screens, live.');
    var r = el('div', 'bl-row', c);
    btn(r, mine ? 'Share mine' : 'Allow', 'gold', function () { allowShare(); });
    btn(r, 'No', 'red', function () { denyShare(); });
    c.style.display = 'block';
  }
  function hideSharePrompt() { var c = document.getElementById('bl-shareprompt'); if (c) c.style.display = 'none'; }

  /* ---------------- share (team cam) ---------------- */
  function shareMine() {
    if (S.phase !== 'live' || !S.session) return;
    var sh = {}; sh['share/' + ME] = { st: 'pending', want: 'offer', by: ME, ts: now() };
    patch(SES, sh).then(function () { log('offered my PC — waiting on his allow'); }).catch(function () {});
  }
  function askHis() {
    if (S.phase !== 'live' || !S.session) return;
    var sh = {}; sh['share/' + BRO] = { st: 'pending', want: 'request', by: ME, ts: now() };
    patch(SES, sh).then(function () { log('asked to see his PC — his call'); }).catch(function () {});
  }
  function allowShare() {
    if (!S.session) return;
    /* which entry is pending decides whose gate this is */
    var broE = S.session.share && S.session.share[BRO];
    var meE = S.session.share && S.session.share[ME];
    var jobs = [];
    if (broE && broE.st === 'pending' && broE.want === 'offer') {
      var p1 = {}; p1['share/' + BRO + '/st'] = 'live';
      jobs.push(patch(SES, p1));
      log('allowed — his PC will pop up here');
    }
    if (meE && meE.st === 'pending' && meE.want === 'request') {
      var p2 = {}; p2['share/' + ME + '/st'] = 'live';
      jobs.push(patch(SES, p2));
      log('sharing mine — he asked, I allowed');
    }
    Promise.all(jobs).then(function () { hideSharePrompt(); }).catch(function () {});
  }
  function denyShare() {
    if (!S.session) return;
    var jobs = [];
    ['share/' + BRO, 'share/' + ME].forEach(function (k) {
      var e = k === 'share/' + BRO ? (S.session.share || {})[BRO] : (S.session.share || {})[ME];
      if (e && e.st === 'pending') {
        var p = {}; p[k + '/st'] = 'off';
        jobs.push(patch(SES, p));
      }
    });
    Promise.all(jobs).then(function () { hideSharePrompt(); log('share not allowed'); }).catch(function () {});
  }
  function stopSharing(silent) {
    if (S.pcStream) {
      S.pcStream.getTracks().forEach(function (t) { t.stop(); });
      S.pcStream = null;
    }
    if (S.pcSender && S.pc) {
      try { S.pc.removeTrack(S.pcSender); } catch (e) {}
      S.pcSender = null;
      renegotiate();
    }
    var chip = document.getElementById('bl-sharechip');
    if (chip) chip.style.display = 'none';
    if (!silent && S.session && S.phase === 'live') {
      var p = {}; p['share/' + ME + '/st'] = 'off';
      patch(SES, p).catch(function () {});
      log('stopped sharing my PC');
    }
  }
  function startSharing() {
    /* my share entry went live (he allowed / I allowed his ask):
       stream the room canvas — my PC as it runs. */
    var cv = null, best = 0;
    document.querySelectorAll('canvas').forEach(function (c) {
      var a = (c.width || 0) * (c.height || 0);
      if (a > best) { best = a; cv = c; }
    });
    if (!cv || !cv.captureStream) {
      log('PC share unavailable: no capturable room canvas on this device');
      var p = {}; p['share/' + ME + '/st'] = 'off';
      patch(SES, p).catch(function () {});
      return;
    }
    try {
      S.pcStream = cv.captureStream(12);
    } catch (e) {
      log('PC share capture failed: ' + e.message);
      return;
    }
    var track = S.pcStream.getVideoTracks()[0];
    if (!track || !S.pc) { log('PC share: no track or no call'); return; }
    S.pcSender = S.pc.addTrack(track, S.pcStream);
    var chip = document.getElementById('bl-sharechip');
    if (!chip) {
      chip = el('div', '', document.body); chip.id = 'bl-sharechip';
      el('span', '', chip, '● YOUR PC IS BEING SHARED');
      var b = el('button', '', chip, 'Stop');
      b.onclick = function () { stopSharing(false); };
    }
    chip.style.display = 'flex';
    log('sharing my PC — his corner window has it live');
    renegotiate();
  }
  function showPip() {
    var p = document.getElementById('bl-pip');
    if (!p) {
      p = el('div', '', document.body); p.id = 'bl-pip';
      var h = el('div', 'ph', p);
      el('span', 'liv', h);
      el('span', '', h, NAMES[BRO].toUpperCase() + "'S PC — LIVE");
      var v = el('video', '', p);
      v.id = 'bl-pip-video'; v.autoplay = true; v.playsInline = true; v.muted = true;
    }
    p.style.display = 'block';
  }
  function hidePip() { var p = document.getElementById('bl-pip'); if (p) p.style.display = 'none'; }

  /* ---------------- call card ---------------- */
  function showCallCard() {
    var c = card('bl-call');
    if (!c.dataset.built) {
      c.dataset.built = '1';
      c.style.position = 'fixed';
      var wrap = el('div', '', c); wrap.style.position = 'relative';
      var rv = el('video', 'rv', wrap); rv.id = 'bl-remote-video'; rv.autoplay = true; rv.playsInline = true;
      var svw = el('div', 'svwrap', wrap);
      var sv = el('video', 'sv', svw); sv.id = 'bl-self-video'; sv.autoplay = true; sv.playsInline = true; sv.muted = true;
      var st = el('div', 'sm', c, ''); st.id = 'bl-call-status'; st.textContent = 'Connecting…';
      var r = el('div', 'bl-row', c);
      btn(r, 'Share my PC', 'gold', function () { shareMine(); });
      btn(r, 'See his PC', '', function () { askHis(); });
      var r2 = el('div', 'bl-row', c);
      btn(r2, 'Hang up', 'red', function () { endSession(true); });
    }
    c.style.display = 'block';
  }
  function hideCallCard() { var c = document.getElementById('bl-call'); if (c) c.style.display = 'none'; }
  function callStatus(t) { var s = document.getElementById('bl-call-status'); if (s) s.textContent = t; }

  /* ---------------- WebRTC ---------------- */
  var ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  var isHost = false;
  function startCall(host) {
    isHost = host;
    S.phase = 'live';
    showCallCard();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      callStatus('No camera/mic path on this device — the call cannot start here.');
      log('getUserMedia unavailable');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
      .then(function (stream) {
        S.localStream = stream;
        var sv = document.getElementById('bl-self-video');
        if (sv) sv.srcObject = stream;
        buildPeer();
        stream.getTracks().forEach(function (t) { S.pc.addTrack(t, stream); });
        if (isHost) renegotiate();
        pollSig();
        callStatus('Connected to ' + NAMES[BRO] + ' — say hello');
        log('call media up (' + (isHost ? 'host' : 'guest') + ')');
      })
      .catch(function (e) {
        callStatus('Camera/mic unavailable — permission denied or no camera on this device.');
        log('call media failed: ' + e.message);
      });
  }
  function buildPeer() {
    var pc = new RTCPeerConnection(ICE);
    S.pc = pc;
    var videoCount = 0;
    pc.ontrack = function (ev) {
      var track = ev.track;
      if (track.kind !== 'video') return;
      videoCount++;
      var stream = (ev.streams && ev.streams[0]) || null;
      if (videoCount === 1) {
        var rv = document.getElementById('bl-remote-video');
        if (rv) { rv.srcObject = stream || new MediaStream([track]); }
        callStatus('Connected to ' + NAMES[BRO] + ' — say hello');
      } else {
        showPip();
        var pv = document.getElementById('bl-pip-video');
        if (pv) pv.srcObject = stream || new MediaStream([track]);
        log('his PC is in the corner — team cam live');
      }
      track.onmute = track.onended = function () {};
    };
    pc.onicecandidate = function (ev) {
      if (ev.candidate) sendSig({ kind: 'ice', cand: ev.candidate.toJSON() });
    };
    pc.onnegotiationneeded = function () { if (!isHost) renegotiate(); };
    pc.onconnectionstatechange = function () {
      if (!S.pc) return;
      if (pc.connectionState === 'connected') callStatus('Connected to ' + NAMES[BRO] + ' — say hello');
      if (pc.connectionState === 'failed') callStatus('The connection could not get through these networks — still trying is all we can honestly say.');
      if (pc.connectionState === 'disconnected') callStatus('Connection wobbling…');
    };
  }
  function renegotiate() {
    if (!S.pc || S.makingOffer) return;
    S.makingOffer = true;
    S.pc.createOffer().then(function (off) {
      return S.pc.setLocalDescription(off);
    }).then(function () {
      sendSig({ kind: 'desc', desc: S.pc.localDescription.toJSON() });
      S.makingOffer = false;
    }).catch(function (e) { S.makingOffer = false; log('offer failed: ' + e.message); });
  }
  function sendSig(msg) {
    if (!S.session) return;
    msg.from = ME; msg.ts = now(); msg.sid = S.session.sid;
    push(SES + '/sig', msg).catch(function (e) { log('sig send failed: ' + e.message); });
  }
  var sigTimer = null;
  function pollSig() {
    if (sigTimer) return;
    sigTimer = setInterval(function () {
      if (!S.pc && S.phase !== 'live') { clearInterval(sigTimer); sigTimer = null; return; }
      get(SES + '/sig').then(function (v) {
        if (!v || !S.pc) return;
        Object.keys(v).sort().forEach(function (k) {
          if (S.seenSig[k]) return;
          var m = v[k];
          if (!m || m.from === ME) { S.seenSig[k] = 1; return; }
          S.seenSig[k] = 1;
          handleSig(m);
        });
      }).catch(function () {});
    }, 800);
  }
  function handleSig(m) {
    if (!S.pc || !m) return;
    if (m.kind === 'ice') {
      S.pc.addIceCandidate(new RTCIceCandidate(m.cand)).catch(function () {});
    } else if (m.kind === 'desc' && m.desc) {
      var desc = new RTCSessionDescription(m.desc);
      if (desc.type === 'offer') {
        /* glare: the host is polite and rolls back */
        var collision = S.makingOffer || S.pc.signalingState !== 'stable';
        if (collision && !isHost) { log('glare — guest holds its offer'); return; }
        var chain = collision && isHost
          ? S.pc.setLocalDescription({ type: 'rollback' }).then(function () { return S.pc.setRemoteDescription(desc); })
          : S.pc.setRemoteDescription(desc);
        chain.then(function () {
          return S.pc.createAnswer();
        }).then(function (ans) {
          return S.pc.setLocalDescription(ans);
        }).then(function () {
          sendSig({ kind: 'desc', desc: S.pc.localDescription.toJSON() });
        }).catch(function (e) { log('answer failed: ' + e.message); });
      } else if (desc.type === 'answer') {
        if (S.pc.signalingState !== 'stable') {
          S.pc.setRemoteDescription(desc).catch(function (e) { log('setRemote answer failed: ' + e.message); });
        }
      }
    }
  }
  function stopCall() {
    if (sigTimer) { clearInterval(sigTimer); sigTimer = null; }
    if (S.pc) { try { S.pc.close(); } catch (e) {} S.pc = null; }
    if (S.localStream) { S.localStream.getTracks().forEach(function (t) { t.stop(); }); S.localStream = null; }
    hidePip();
  }

  /* ---------------- session watch ---------------- */
  setInterval(function () {
    get(SES).then(function (v) {
      if (!v) {
        if (S.phase === 'live' || S.phase === 'ringing-out') { log('session vanished — tearing down'); endSession(false); }
        S.session = null;
        return;
      }
      var prevState = S.session && S.session.state;
      S.session = v;
      if (v.state === 'ringing' && v.to === ME && v.from === BRO) {
        if (S.phase !== 'ringing-in') { S.phase = 'ringing-in'; showInvite(v.from); log('invite ringing in from ' + v.from); }
      }
      if (v.state === 'live') {
        hideInvite();
        if (S.phase === 'ringing-out') { S.phase = 'live'; closePanel(); startCall(true); }
        if (S.phase === 'ringing-in' && !S.pc && !S.localStream) { /* accepted path starts it */ }
        if (S.phase === 'idle') { S.phase = 'live'; }
      }
      if ((v.state === 'declined' || v.state === 'ended') && prevState !== v.state) {
        if (S.phase !== 'idle') {
          log('session ' + v.state + ' by the other side');
          endSession(false);
          S.session = null;
        }
      }
      /* share transitions */
      var sh = v.share || {};
      var broE = sh[BRO] || { st: 'off' }, meE = sh[ME] || { st: 'off' };
      if (broE.st === 'pending' && broE.want === 'offer') showSharePrompt(broE);
      if (meE.st === 'pending' && meE.want === 'request' && meE.by === BRO) showSharePrompt(meE);
      if (broE.st !== 'pending' && meE.st !== 'pending') hideSharePrompt();
      if (meE.st === 'live' && S.lastShareMe !== 'live' && S.phase === 'live') startSharing();
      if (meE.st !== 'live' && S.lastShareMe === 'live' && S.pcStream) stopSharing(true);
      if (broE.st !== 'live' && S.lastShareBro === 'live') hidePip();
      S.lastShareBro = broE.st; S.lastShareMe = meE.st;
    }).catch(function () {});
  }, 1400);

  /* ---------------- public API ---------------- */
  window.__vpcBrotherLink = {
    state: function () {
      return {
        me: ME, brother: BRO, phase: S.phase, brotherOnline: S.brotherOnline,
        session: S.session ? { sid: S.session.sid, state: S.session.state, from: S.session.from, share: S.session.share } : null,
        sharing: !!S.pcStream, panel: S.panelOpen,
        pip: !!(document.getElementById('bl-pip') && document.getElementById('bl-pip').style.display !== 'none'),
        callCard: !!(document.getElementById('bl-call') && document.getElementById('bl-call').style.display !== 'none'),
        log: S.log.slice()
      };
    },
    openPanel: openPanel,
    closePanel: closePanel,
    invite: invite,
    accept: acceptInvite,
    decline: declineInvite,
    end: function () { endSession(true); },
    shareMine: shareMine,
    askHis: askHis,
    allowShare: allowShare,
    denyShare: denyShare,
    stopShare: function () { stopSharing(false); }
  };
  log('brother link up — this PC is ' + ME + ', brother is ' + BRO);
})();
