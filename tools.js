/* ALLON Virtual PC — Features 29/30: keyboard + mouse rise system.
   Page-layer panels. The engine arms a tool when its desk prop is
   tapped and claims the next screen tap as the target
   (window.__vpcToolTarget). While a panel is raised the whole view
   (canvas + tracked layers, all children of <body>) lifts by the
   panel height so every screen stays visible above it. */
(function () {
  'use strict';
  if (window.__vpcTools) return;
  window.__vpcTools = true;

  var S = {
    tool: '', screen: '', key: '', num: 0,
    uv: { x: 0.5, y: 0.5 }, locked: false, scrollTimer: null
  };

  var css = document.createElement('style');
  css.textContent = [
    '.vpc-panel{position:fixed;left:0;right:0;bottom:0;z-index:9990;background:rgba(10,10,18,.97);',
    'border-top:2px solid #00f0ff;box-shadow:0 -12px 44px rgba(0,0,0,.6);color:#f2f2f7;',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;user-select:none;-webkit-user-select:none;touch-action:none}',
    '.vpc-p-head{display:flex;align-items:center;gap:10px;padding:8px 12px 4px}',
    '.vpc-p-title{font-weight:800;font-size:14px;letter-spacing:1.5px;color:#7ee7ff;flex:1}',
    '.vpc-p-x{width:40px;height:40px;border-radius:11px;border:1.5px solid #ff5340;background:#1a0f14;color:#ff8296;',
    'font-size:19px;font-weight:900;cursor:pointer;flex:0 0 auto}',
    '.vpc-krow{display:flex;gap:5px;padding:3px 8px}',
    '.vpc-key{flex:1;height:52px;border-radius:9px;border:1px solid #2c2c3e;background:#17171f;color:#f2f2f7;',
    'font-size:19px;font-weight:600;cursor:pointer;padding:0}',
    '.vpc-key:active{background:#00f0ff;color:#04222a}',
    '.vpc-key.wide{flex:1.7;font-size:14px;font-weight:800;letter-spacing:1px}',
    '.vpc-key.space{flex:5}',
    '#vpc-ms-body{display:flex;gap:10px;padding:4px 12px 12px}',
    '#vpc-ms-pad{flex:1;height:150px;border-radius:13px;border:1.5px dashed #3a5a72;background:#0d1420;',
    'display:flex;align-items:center;justify-content:center;color:#5f7d94;font-size:13px;letter-spacing:1px;text-align:center}',
    '.vpc-ms-col{display:flex;flex-direction:column;gap:8px;width:86px}',
    '.vpc-ms-btn{flex:1;border-radius:11px;border:1.5px solid #2c2c3e;background:#17171f;color:#f2f2f7;',
    'font-size:13px;font-weight:800;letter-spacing:.5px;cursor:pointer;min-height:42px}',
    '.vpc-ms-btn.on{border-color:#ffb800;color:#ffd479}',
    '.vpc-ms-clicks{display:flex;gap:8px;padding:0 12px 12px}',
    '.vpc-ms-click{flex:1;height:48px;border-radius:11px;border:1.5px solid #2c2c3e;background:#17171f;',
    'color:#f2f2f7;font-size:14px;font-weight:800;cursor:pointer}',
    '#vpc-cursor{position:fixed;z-index:9985;width:30px;height:30px;margin:-3px 0 0 -3px;pointer-events:none;display:none}',
    '#vpc-cursor .tri{width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;',
    'border-bottom:16px solid #ffd479;filter:drop-shadow(0 0 5px rgba(255,184,0,.8));transform:rotate(-38deg)}',
    '#vpc-cursor .dot{position:absolute;left:11px;top:11px;width:7px;height:7px;border-radius:50%;background:#00f0ff}'
  ].join('');
  document.head.appendChild(css);

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function lift(px) {
    document.body.style.transform = px ? 'translateY(-' + px + 'px)' : '';
    document.body.style.transition = 'transform .28s ease';
  }
  function closeAll(reason) {
    ['vpc-kb', 'vpc-ms'].forEach(function (id) {
      var p = document.getElementById(id);
      if (p) p.remove();
    });
    var cur = document.getElementById('vpc-cursor');
    if (cur) cur.style.display = 'none';
    lift(0);
    stopScroll();
    window.__vpcMouseLock = '';
    window.__vpcToolClosed = reason || 'x';
    S.tool = ''; S.key = ''; S.screen = '';
  }

  /* ---------------- keyboard ---------------- */
  function focusField() {
    var T = window.__vpcTrack && window.__vpcTrack[S.key];
    if (!T || !T.f) return null;
    var doc;
    try { doc = T.f.contentDocument; } catch (e) { return null; }
    if (!doc) return null;
    var a = doc.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return { doc: doc, el: a };
    var inp = doc.querySelector('input[type="text"],input[type="search"],input:not([type]),textarea');
    if (inp) { inp.focus(); return { doc: doc, el: inp }; }
    return { doc: doc, el: null };
  }
  function sendKey(ch) {
    if (S.key) {
      var f = focusField();
      if (f && f.el) {
        var eld = f.el, doc = f.doc;
        eld.focus();
        if (ch === '\b') {
          if (typeof eld.selectionStart === 'number' && eld.setRangeText) {
            var s = eld.selectionStart, e2 = eld.selectionEnd;
            if (s === e2 && s > 0) eld.setRangeText('', s - 1, s, 'end');
            else eld.setRangeText('', s, e2, 'end');
            eld.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } else if (ch === '\n') {
          ['keydown', 'keypress', 'keyup'].forEach(function (t) {
            eld.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', bubbles: true }));
          });
        } else {
          var ok = false;
          try { ok = doc.execCommand('insertText', false, ch); } catch (e) { ok = false; }
          if (!ok && typeof eld.value === 'string') {
            eld.value += ch;
            eld.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        return;
      }
      if (f) return; /* page with no field: keys go nowhere, honestly */
    }
    /* native screen (or the cross-origin office): the PC command line */
    window.__vpcKeyIn = (window.__vpcKeyIn || '') + ch;
  }

  function openKeyboard() {
    closeAll('switch');
    window.__vpcToolClosed = '';
    var p = el('div', 'vpc-panel', document.documentElement);
    p.id = 'vpc-kb';
    var head = el('div', 'vpc-p-head', p);
    el('div', 'vpc-p-title', head, '⌨ KEYBOARD — SCREEN ' + (S.num || '') + (S.key ? ' · ' + S.key.toUpperCase() : ' · COMMAND LINE'));
    var x = el('button', 'vpc-p-x', head, '✕');
    x.onclick = function () { closeAll('keyboard'); };
    ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'].forEach(function (row, ri) {
      var r = el('div', 'vpc-krow', p);
      if (ri === 3) {
        var bk = el('button', 'vpc-key wide', r, '⌫');
        bk.onclick = function () { sendKey('\b'); };
      }
      row.split('').forEach(function (ch) {
        var k = el('button', 'vpc-key', r, ch);
        k.onclick = function () { sendKey(ch); };
      });
      if (ri === 2) {
        var en = el('button', 'vpc-key wide', r, '⏎');
        en.onclick = function () { sendKey('\n'); };
      }
    });
    var r2 = el('div', 'vpc-krow', p);
    var punct = el('button', 'vpc-key wide', r2, '.,?!');
    punct.onclick = function () { sendKey('.'); };
    var sp = el('button', 'vpc-key space', r2, 'SPACE');
    sp.onclick = function () { sendKey(' '); };
    var en2 = el('button', 'vpc-key wide', r2, 'ENTER');
    en2.onclick = function () { sendKey('\n'); };
    requestAnimationFrame(function () { lift(p.offsetHeight); });
  }

  /* ---------------- mouse ---------------- */
  function quadPoint() {
    var Q = window.__vpcQuads && window.__vpcQuads[S.key];
    if (!Q || !Q.vis || !Q.csv) return null;
    var cv = document.querySelector('canvas');
    if (!cv) return null;
    var rc = cv.getBoundingClientRect();
    var n = Q.csv.split(',').map(Number);
    var pts = [];
    for (var i = 0; i < 4; i++) pts.push({ x: rc.left + n[i * 2] * rc.width, y: rc.top + n[i * 2 + 1] * rc.height });
    var u = S.uv.x, v = S.uv.y;
    var top = { x: pts[0].x + (pts[1].x - pts[0].x) * u, y: pts[0].y + (pts[1].y - pts[0].y) * u };
    var bot = { x: pts[3].x + (pts[2].x - pts[3].x) * u, y: pts[3].y + (pts[2].y - pts[3].y) * u };
    return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
  }
  function drawCursor() {
    var cur = document.getElementById('vpc-cursor');
    if (!cur) {
      cur = el('div', '', document.documentElement);
      cur.id = 'vpc-cursor';
      el('div', 'tri', cur);
      el('div', 'dot', cur);
    }
    var pt = S.key ? quadPoint() : null;
    if (pt) {
      cur.style.display = 'block';
      cur.style.left = Math.round(pt.x) + 'px';
      cur.style.top = Math.round(pt.y) + 'px';
    } else {
      cur.style.display = 'none';
    }
  }
  function mouseClick(btn) {
    if (S.key) {
      var T = window.__vpcTrack && window.__vpcTrack[S.key];
      var doc = null;
      try { doc = T && T.f && T.f.contentDocument; } catch (e) { doc = null; }
      if (doc) {
        var w = (T.f.contentWindow), iw = T.f.clientWidth || 400, ih = T.f.clientHeight || 800;
        var px = Math.round(S.uv.x * iw), py = Math.round(S.uv.y * ih);
        var target = doc.elementFromPoint(px, py) || doc.body;
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (t) {
          target.dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: px, clientY: py, button: btn === 'right' ? 2 : 0 }));
        });
        return;
      }
    }
    window.__vpcMouseTap = JSON.stringify({ screen: S.screen, u: S.uv.x, v: S.uv.y, btn: btn });
  }
  function scrollStep() {
    if (S.key) {
      var T = window.__vpcTrack && window.__vpcTrack[S.key];
      try {
        var w = T && T.f && T.f.contentWindow, doc = T && T.f && T.f.contentDocument;
        if (w && doc) {
          w.scrollBy(0, 130);
          var t = doc.elementFromPoint(Math.round(S.uv.x * T.f.clientWidth), Math.round(S.uv.y * T.f.clientHeight)) || doc.documentElement;
          t.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 130 }));
          return;
        }
      } catch (e) { /* fall through to engine note */ }
    }
    window.__vpcMouseScroll = JSON.stringify({ screen: S.screen, dy: 130 });
  }
  function stopScroll() {
    if (S.scrollTimer) { clearInterval(S.scrollTimer); S.scrollTimer = null; }
  }

  function openMouse() {
    closeAll('switch');
    window.__vpcToolClosed = '';
    S.uv = { x: 0.5, y: 0.5 };
    var p = el('div', 'vpc-panel', document.documentElement);
    p.id = 'vpc-ms';
    p.style.borderTopColor = '#ffb800';
    var head = el('div', 'vpc-p-head', p);
    el('div', 'vpc-p-title', head, '🖱 MOUSE — SCREEN ' + (S.num || '') + (S.key ? ' · ' + S.key.toUpperCase() : ' · NATIVE'));
    var body = el('div', '', p); body.id = 'vpc-ms-body';
    var pad = el('div', '', body, 'HOLD + DRAG — THE CURSOR LANDS WHERE YOU LAND');
    pad.id = 'vpc-ms-pad';
    var col = el('div', 'vpc-ms-col', body);
    var scr = el('button', 'vpc-ms-btn', col, 'SCROLL ▼');
    var lock = el('button', 'vpc-ms-btn', col, '🔓 LOCK');
    var x = el('button', 'vpc-ms-btn', col, '✕ DROP');
    x.style.borderColor = '#ff5340'; x.style.color = '#ff8296';
    var clicks = el('div', 'vpc-ms-clicks', p);
    var lb = el('button', 'vpc-ms-click', clicks, 'LEFT TAP');
    var rb = el('button', 'vpc-ms-click', clicks, 'RIGHT TAP');
    lb.onclick = function () { mouseClick('left'); };
    rb.onclick = function () { mouseClick('right'); };
    scr.addEventListener('pointerdown', function (e) { e.preventDefault(); scrollStep(); S.scrollTimer = setInterval(scrollStep, 110); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (t) { scr.addEventListener(t, stopScroll); });
    lock.onclick = function () {
      S.locked = !S.locked;
      window.__vpcMouseLock = S.locked ? '1' : '';
      lock.textContent = S.locked ? '🔒 LOCKED' : '🔓 LOCK';
      lock.classList.toggle('on', S.locked);
    };
    x.onclick = function () { closeAll('mouse'); };
    var drag = null;
    pad.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY };
      pad.setPointerCapture(e.pointerId);
    });
    pad.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var r = pad.getBoundingClientRect();
      S.uv.x = Math.min(1, Math.max(0, S.uv.x + (e.clientX - drag.x) / r.width * 1.15));
      S.uv.y = Math.min(1, Math.max(0, S.uv.y + (e.clientY - drag.y) / r.height * 1.15));
      drag = { x: e.clientX, y: e.clientY };
      drawCursor();
    });
    ['pointerup', 'pointercancel'].forEach(function (t) { pad.addEventListener(t, function () { drag = null; }); });
    requestAnimationFrame(function () { lift(p.offsetHeight); drawCursor(); });
  }

  /* engine -> panels */
  var lastJson = '';
  setInterval(function () {
    var t = null;
    try { t = window.__vpcToolTarget; } catch (e) { t = null; }
    if (!t) return;
    var j = JSON.stringify(t);
    if (j === lastJson) return;
    lastJson = j;
    S.tool = t.tool; S.screen = t.screen; S.key = t.key || ''; S.num = t.num || 0;
    if (t.tool === 'keyboard') openKeyboard();
    else if (t.tool === 'mouse') openMouse();
    window.__vpcToolTarget = null;
    lastJson = '';
  }, 300);
  setInterval(drawCursor, 700);
})();

/* ---- v5 final block: LED colour panel (Feature 31) + camera screen
   (stacked above the status board; subject tracking while open). ---- */
(function () {
  'use strict';
  if (window.__vpcFinalTools) return;
  window.__vpcFinalTools = true;

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  var css = document.createElement('style');
  css.textContent = [
    '#vpc-led{position:fixed;left:10px;bottom:10px;z-index:9991;width:min(94vw,400px);',
    'background:rgba(8,8,16,.97);border:2px solid #d9a441;border-radius:16px;color:#f2f2f7;',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 14px 44px rgba(0,0,0,.65);padding:10px 12px 12px}',
    '#vpc-led h3{margin:2px 0 8px;font-size:13px;letter-spacing:2px;color:#ffd479;font-weight:800}',
    '.vpc-led-row{display:flex;align-items:center;gap:10px;width:100%;margin:5px 0;padding:9px 10px;',
    'border-radius:11px;border:1.5px solid #2c2c3e;background:#14141f;color:#f2f2f7;cursor:pointer;text-align:left}',
    '.vpc-led-row:active{border-color:#ffd479}',
    '.vpc-led-sw{width:22px;height:22px;border-radius:50%;flex:0 0 auto;border:2px solid rgba(255,255,255,.35)}',
    '.vpc-led-tx{font-size:14px;font-weight:700;letter-spacing:.3px}',
    '#vpc-led-x{float:right;width:34px;height:34px;border-radius:10px;border:1.5px solid #ff5340;',
    'background:#1a0f14;color:#ff8296;font-size:16px;font-weight:900;cursor:pointer}',
    '#vpc-camwrap{position:fixed;left:0;top:0;z-index:46;pointer-events:none;transform-origin:0 0;',
    'display:none;background:#04050a;border:2px solid rgba(125,255,154,.55);border-radius:6px;overflow:hidden}',
    '#vpc-camwrap video{width:100%;height:100%;object-fit:cover;display:block;will-change:transform}',
    '#vpc-cam-bar{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:8px;',
    'padding:6px 8px;background:linear-gradient(rgba(0,0,0,.72),transparent);color:#b8ffc4;',
    'font:800 12px system-ui;letter-spacing:2px;pointer-events:none}',
    '#vpc-cam-dot{width:9px;height:9px;border-radius:50%;background:#ff4040;box-shadow:0 0 8px #ff4040}',
    '#vpc-cam-x{position:absolute;top:6px;right:6px;width:34px;height:34px;border-radius:9px;',
    'border:1.5px solid #ff5340;background:rgba(26,15,20,.9);color:#ff8296;font-size:16px;font-weight:900;cursor:pointer;pointer-events:auto}',
    '#vpc-cam-msg{position:absolute;inset:0;display:none;align-items:center;justify-content:center;',
    'color:#ffd479;font:600 15px system-ui;text-align:center;padding:16px;background:#07070d}'
  ].join('');
  document.head.appendChild(css);

  /* ---------------- LED panel ---------------- */
  var ledV = 0;
  function renderLed(data) {
    var p = document.getElementById('vpc-led');
    if (!p) {
      p = el('div', '', document.documentElement);
      p.id = 'vpc-led';
    }
    p.innerHTML = '';
    var x = el('button', '', p, '✕'); x.id = 'vpc-led-x';
    x.onclick = function () { p.remove(); window.__vpcLedPanel = null; ledV = 0; };
    el('h3', '', p, '💡 SCREEN LIGHTS — TAP TO CHANGE COLOUR');
    (data.screens || []).forEach(function (s) {
      var b = el('button', 'vpc-led-row', p);
      var sw = el('span', 'vpc-led-sw', b);
      sw.style.background = s.hex;
      sw.style.boxShadow = '0 0 10px ' + s.hex;
      el('span', 'vpc-led-tx', b, s.num + ' · ' + s.name);
      b.onclick = function () { window.__vpcLedCycle = s.id; };
    });
  }
  setInterval(function () {
    var d = null;
    try { d = window.__vpcLedPanel; } catch (e) { d = null; }
    if (d && d.v && d.v !== ledV) { ledV = d.v; renderLed(d); }
  }, 300);

  /* ---------------- camera screen + subject tracking ---------------- */
  var cam = { open: false, stream: null, sx: 0.5, sy: 0.5, tx: 0.5, ty: 0.5, prev: null, raf: 0, tick: 0 };
  window.__vpcCamCrop = { x: 0.5, y: 0.5, tx: 0, ty: 0, tracking: false };
  function camEls() {
    var w = document.getElementById('vpc-camwrap');
    if (w) return w;
    w = el('div', '', document.documentElement);
    w.id = 'vpc-camwrap';
    var v = el('video', '', w);
    v.id = 'vpc-cam-video';
    v.autoplay = true; v.muted = true; v.playsInline = true;
    var bar = el('div', '', w); bar.id = 'vpc-cam-bar';
    el('span', '', bar).id = 'vpc-cam-dot';
    el('span', '', bar, 'CAMERA — FOLLOWING YOU');
    var msg = el('div', '', w, ''); msg.id = 'vpc-cam-msg';
    var x = el('button', '', w, '✕'); x.id = 'vpc-cam-x';
    x.onclick = function () { closeCam(); };
    return w;
  }
  function positionCam() {
    var w = document.getElementById('vpc-camwrap');
    if (!w || !cam.open) return;
    var Q = window.__vpcQuads && window.__vpcQuads.camera;
    if (!Q || !Q.vis || !Q.csv || !window.__vpcHomo) { w.style.transform = 'translate3d(-10000px,-10000px,0)'; return; }
    var cv = document.querySelector('canvas');
    if (!cv) return;
    var rc = cv.getBoundingClientRect();
    var n = Q.csv.split(',').map(Number);
    var d = [];
    for (var i = 0; i < 4; i++) { d.push(rc.left + n[i * 2] * rc.width); d.push(rc.top + n[i * 2 + 1] * rc.height); }
    w.style.width = '680px'; w.style.height = '484px';
    w.style.transform = window.__vpcHomo(680, 484, d);
  }
  function applyCrop() {
    var v = document.getElementById('vpc-cam-video');
    if (!v) return;
    var Z = 1.55, lim = (Z - 1) / 2;
    var tx = Math.max(-lim, Math.min(lim, -(cam.sx - 0.5) * Z)) * 100;
    var ty = Math.max(-lim, Math.min(lim, -(cam.sy - 0.5) * Z)) * 100;
    v.style.transform = 'translate(' + tx.toFixed(2) + '%,' + ty.toFixed(2) + '%) scale(' + Z + ')';
    window.__vpcCamCrop = { x: +cam.sx.toFixed(3), y: +cam.sy.toFixed(3), tx: +tx.toFixed(2), ty: +ty.toFixed(2), tracking: true };
  }
  var scanC = document.createElement('canvas');
  scanC.width = 160; scanC.height = 114;
  function sense() {
    var v = document.getElementById('vpc-cam-video');
    if (!v || !v.videoWidth) return;
    /* FaceDetector where the platform offers it */
    if (window.FaceDetector && !sense.fdBusy) {
      sense.fdBusy = true;
      try {
        var det = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        det.detect(v).then(function (faces) {
          sense.fdBusy = false;
          if (faces && faces.length && faces[0].boundingBox) {
            var b = faces[0].boundingBox;
            cam.tx = (b.x + b.width / 2) / v.videoWidth;
            cam.ty = (b.y + b.height / 2) / v.videoHeight;
          }
        }).catch(function () { sense.fdBusy = false; });
      } catch (e) { sense.fdBusy = false; }
    }
    /* motion centroid fallback / supplement */
    try {
      var ctx = scanC.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(v, 0, 0, 160, 114);
      var img = ctx.getImageData(0, 0, 160, 114).data;
      var gray = new Float32Array(160 * 114);
      for (var i = 0; i < gray.length; i++) gray[i] = img[i * 4] * 0.3 + img[i * 4 + 1] * 0.5 + img[i * 4 + 2] * 0.2;
      if (cam.prev) {
        var sw = 0, ax = 0, ay = 0;
        for (var y = 0; y < 114; y++) for (var xx = 0; xx < 160; xx++) {
          var j = y * 160 + xx, df = Math.abs(gray[j] - cam.prev[j]);
          if (df > 22) { sw += df; ax += xx * df; ay += y * df; }
        }
        if (sw > 4000) { cam.tx = (ax / sw) / 160; cam.ty = (ay / sw) / 114; }
      }
      cam.prev = gray;
    } catch (e) { /* stream not readable yet */ }
  }
  function trackLoop() {
    if (!cam.open) return;
    cam.tick++;
    if (cam.tick % 11 === 0) sense();
    cam.sx += (cam.tx - cam.sx) * 0.06;
    cam.sy += (cam.ty - cam.sy) * 0.06;
    applyCrop();
    positionCam();
    cam.raf = requestAnimationFrame(trackLoop);
  }
  function openCam() {
    var w = camEls();
    cam.open = true;
    cam.sx = cam.tx = 0.5; cam.sy = cam.ty = 0.5; cam.prev = null;
    w.style.display = 'block';
    window.__vpcCamOpen = '1';
    var v = document.getElementById('vpc-cam-video');
    var msg = document.getElementById('vpc-cam-msg');
    msg.style.display = 'none';
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then(function (stream) {
        cam.stream = stream;
        v.srcObject = stream;
        var pr = v.play();
        if (pr && pr.catch) pr.catch(function () {});
      }).catch(function () {
        msg.textContent = 'Camera unavailable — permission denied or no camera on this device.';
        msg.style.display = 'flex';
      });
    } else {
      msg.textContent = 'Camera unavailable — permission denied or no camera on this device.';
      msg.style.display = 'flex';
    }
    cancelAnimationFrame(cam.raf);
    trackLoop();
  }
  function closeCam() {
    cam.open = false;
    cancelAnimationFrame(cam.raf);
    if (cam.stream) { cam.stream.getTracks().forEach(function (t) { t.stop(); }); cam.stream = null; }
    var w = document.getElementById('vpc-camwrap');
    if (w) w.style.display = 'none';
    window.__vpcCamOpen = '';
  }
  window.__vpcCloseCam = closeCam;
  setInterval(function () {
    var f = '';
    try { f = window.__vpcCameraPop || ''; } catch (e) { f = ''; }
    if (f === 'open') { window.__vpcCameraPop = ''; openCam(); }
    else if (f === 'close') { window.__vpcCameraPop = ''; closeCam(); }
  }, 250);
})();

/* gesture lock: while the engine holds a drag (mount pull / carry), the
   tracked iframes go pointer-transparent so the gesture's move + release
   keep reaching the canvas even when the finger crosses a live app. */
(function () {
  'use strict';
  var locked = false;
  setInterval(function () {
    var on = false;
    try { on = window.__vpcGestureLock === '1'; } catch (e) { on = false; }
    if (on === locked) return;
    locked = on;
    var T = window.__vpcTrack || {};
    Object.keys(T).forEach(function (k) {
      if (T[k] && T[k].f) T[k].f.style.pointerEvents = on ? 'none' : (T[k].mode === 'zoom' ? 'auto' : 'none');
    });
    var F = window.__vpcFrames || {};
    Object.keys(F).forEach(function (i) {
      if (F[i] && F[i].f) F[i].f.style.pointerEvents = on ? 'none' : 'auto';
    });
  }, 120);
})();

/* ---- v5.1 Feature 33: tap-a-screen app switcher. Room level only:
   the engine raises window.__vpcSwitcher for the tapped screen; a pick
   lands via window.__vpcSwitchTo and everything picked lives INSIDE
   the glass (PC contents swap; apps load in their web form). ---- */
(function () {
  'use strict';
  if (window.__vpcSwitcherUi) return;
  window.__vpcSwitcherUi = true;
  var css = document.createElement('style');
  css.textContent = [
    '#vpc-switch{position:fixed;left:0;right:0;bottom:0;z-index:9992;max-height:74vh;overflow-y:auto;',
    'background:rgba(8,8,16,.97);border-top:2px solid #00f0ff;box-shadow:0 -14px 44px rgba(0,0,0,.65);',
    'color:#f2f2f7;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:12px 14px 16px}',
    '#vpc-switch h3{margin:2px 0 4px;font-size:13px;letter-spacing:2px;color:#7ee7ff;font-weight:800}',
    '#vpc-switch .grp{margin:12px 0 4px;font-size:11px;letter-spacing:2px;color:#9a9aad;font-weight:800}',
    '.vpc-sw-row{display:flex;align-items:center;gap:10px;width:100%;margin:5px 0;padding:12px;',
    'border-radius:11px;border:1.5px solid #2c2c3e;background:#14141f;color:#f2f2f7;cursor:pointer;text-align:left;font-size:15px;font-weight:700}',
    '.vpc-sw-row:active{border-color:#00f0ff}',
    '.vpc-sw-row .tag{margin-left:auto;font-size:11px;color:#9a9aad;font-weight:600;letter-spacing:.5px;flex:0 0 auto}',
    '.vpc-sw-row.keep{border-color:rgba(255,184,0,.5);color:#ffd479}'
  ].join('');
  document.head.appendChild(css);
  var openFor = '';
  function close() {
    var p = document.getElementById('vpc-switch');
    if (p) p.remove();
    openFor = '';
    try { window.__vpcSwitcher = null; } catch (e) {}
  }
  function pick(payload) {
    try { window.__vpcSwitchTo = JSON.stringify(payload); } catch (e) {}
    close();
  }
  function row(parent, label, tag, fn) {
    var b = document.createElement('button');
    b.className = 'vpc-sw-row';
    b.textContent = label;
    if (tag) {
      var sp = document.createElement('span');
      sp.className = 'tag'; sp.textContent = tag; b.appendChild(sp);
    }
    b.onclick = fn;
    parent.appendChild(b);
    return b;
  }
  var WEB_APPS = [
    { name: 'YouTube', webUrl: 'https://www.youtube.com' },
    { name: 'Facebook', webUrl: 'https://www.facebook.com' },
    { name: 'Instagram', webUrl: 'https://www.instagram.com' },
    { name: 'X', webUrl: 'https://x.com' },
    { name: 'TikTok', webUrl: 'https://www.tiktok.com' },
    { name: 'Spotify', webUrl: 'https://open.spotify.com' }
  ];
  function renderApps(p, screen) {
    var g = document.createElement('div');
    g.className = 'grp'; g.textContent = 'MY APPS'; p.appendChild(g);
    var list = null;
    try {
      if (window.AllonShell && typeof window.AllonShell.listApps === 'function') list = window.AllonShell.listApps();
    } catch (e) { list = null; }
    if (typeof list === 'string') { try { list = JSON.parse(list); } catch (e) { list = null; } }
    function draw(apps) {
      (apps || []).forEach(function (a) {
        if (!a || !a.webUrl) return;
        row(p, a.name || a.webUrl, 'web app', function () { pick({ screen: screen, webUrl: a.webUrl }); });
      });
    }
    if (list && typeof list.then === 'function') {
      list.then(function (apps) { draw(apps); }).catch(function () { draw(WEB_APPS); });
    } else if (list) draw(list);
    else draw(WEB_APPS);
  }
  function render(data) {
    close();
    openFor = data.screen;
    var p = document.createElement('div');
    p.id = 'vpc-switch';
    document.documentElement.appendChild(p);
    var h = document.createElement('h3');
    h.textContent = 'SCREEN ' + (data.num || '') + ' \u2014 ' + (data.name || '') + ' \u00b7 SWITCH TO';
    p.appendChild(h);
    var g = document.createElement('div');
    g.className = 'grp'; g.textContent = 'IN THIS PC'; p.appendChild(g);
    (data.contents || []).forEach(function (c) {
      if (!c || !c.content) return;
      var here = c.where === data.screen;
      row(p, c.name, here ? 'already here' : (c.where ? 'on another screen' : ''), function () {
        if (!here) pick({ screen: data.screen, content: c.content });
      });
    });
    renderApps(p, data.screen);
    var k = row(p, "Keep what's here", '', function () { close(); });
    k.classList.add('keep');
  }
  setInterval(function () {
    var d = null;
    try { d = window.__vpcSwitcher; } catch (e) { d = null; }
    if (d && d.screen && d.screen !== openFor) render(d);
    if (!d && openFor) close();
  }, 250);
  document.addEventListener('pointerdown', function (e) {
    var p = document.getElementById('vpc-switch');
    if (p && openFor && !p.contains(e.target)) close();
  }, true);
})();

/* ---- Defect 14: tracked-app preservation + sign-in presentation ----
   (A) PRESERVATION LAW: a tracked iframe, once created and loaded, is
   NEVER destroyed, recreated or src-reset by a room operation. Swaps,
   splits, switcher picks, underlay refreshes, deploy/stow, zoom and
   pan only MOVE and re-clip the existing element (TrackSet). The audit
   behind this block found the src attribute is assigned exactly once,
   at creation (__vpcTrackMake), and no code path replaces a tracked
   element — this guard snapshots every tracked iframe (element +
   entry + src) and heals + logs any violation, so the law is enforced,
   not just intended.
   (B) SIGN-IN: Google's sign-in page sends X-Frame-Options: DENY
   (measured with curl, 2026-11-01), so it can NEVER render inside a
   screen, and Google OAuth from a WebView UA ("; wv") is refused with
   its branded 403 (the APK sets no UA override — the 1.2 APK fix is
   specced in the Defect 14 report). The office's signInWithRedirect
   therefore destroys the in-glass office document and strands the
   user on a 403. SURVIVING ROUTE (the FULL APP pill/mode was removed
   by Defect 20 — this fix does not use it): a shell-handled SIGN-IN
   TRIP. When a tracked app tries to start sign-in, the guard leaves
   the in-glass document untouched and offers one deliberate tap that
   navigates THIS view, top-level, to the app's own standalone URL —
   the app becomes the whole view inside the same app/browser, runs
   its own redirect sign-in there, and the back button returns here,
   where the in-glass copy boots signed-in from the shared Firebase
   persistence. If an app ever escapes off-origin anyway, the shell
   says so and offers the same trip + a one-tap restore of the SAME
   iframe element. */
(function () {
  'use strict';
  if (window.__vpcGuard14) return;
  window.__vpcGuard14 = true;

  var HOME = {
    hq: 'https://xmrmathx.github.io/agent-office/',
    shortz: 'https://xmrmathx.github.io/shortz-tv/',
    browser: 'browser.html',
    youtube: 'youtube.html',
    muse: 'muse.html'
  };
  var NAMES = { hq: 'YOUR OFFICE', shortz: 'SHORTZ', browser: 'THE BROWSER', youtube: 'YOUTUBE', muse: 'MUSE' };
  var reg = {};      /* key -> {entry, f, src, readable, escaped} */
  var authKey = '';
  var authEscaped = false;

  var css = document.createElement('style');
  css.textContent = [
    '#vpc-auth{position:fixed;left:0;right:0;bottom:0;z-index:9995;',
    'background:rgba(8,8,16,.97);border-top:2px solid #ffb800;box-shadow:0 -14px 44px rgba(0,0,0,.65);',
    'color:#f2f2f7;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:14px 16px 18px}',
    '#vpc-auth h3{margin:2px 0 6px;font-size:13px;letter-spacing:2px;color:#ffd479;font-weight:800}',
    '#vpc-auth p{margin:0 0 12px;font-size:14px;line-height:1.45;color:#d8d8e4}',
    '#vpc-auth .row{display:flex;gap:10px;flex-wrap:wrap}',
    '.vpc-auth-btn{flex:1;min-width:140px;padding:13px;border-radius:11px;border:1.5px solid #2c2c3e;',
    'background:#14141f;color:#f2f2f7;cursor:pointer;font-size:15px;font-weight:700}',
    '.vpc-auth-btn.main{border-color:#ffb800;color:#ffd479}',
    '.vpc-auth-btn:active{border-color:#00f0ff}'
  ].join('');
  document.head.appendChild(css);

  /* The sign-in trip: this view goes top-level to the app's own
     standalone URL. Inside the APK that stays inside the same WebView
     (https loads in-view); in a browser it is a same-tab navigation.
     Either way the back button returns to the PC, and a marker lets
     the returning PC know a trip happened. */
  function authTrip(key) {
    if (!HOME[key]) return false;
    try { localStorage.setItem('vpc_auth_return', JSON.stringify({ key: key, t: Date.now() })); } catch (e) {}
    console.log('VPC AUTH: sign-in trip — ' + key + ' becomes the whole view (top-level, same view)');
    window.location.href = HOME[key];
    return true;
  }

  function hideAuth() {
    var p = document.getElementById('vpc-auth');
    if (p) p.remove();
    authKey = '';
    authEscaped = false;
  }

  function showAuth(key, escaped) {
    authKey = key;
    authEscaped = !!escaped;
    var p = document.getElementById('vpc-auth');
    if (!p) {
      p = document.createElement('div');
      p.id = 'vpc-auth';
      document.documentElement.appendChild(p);
    }
    p.innerHTML = '';
    var h = document.createElement('h3');
    h.textContent = 'SIGN-IN NEEDS THE WHOLE VIEW';
    p.appendChild(h);
    var t = document.createElement('p');
    t.textContent = escaped
      ? (NAMES[key] || 'THIS APP') + ' tried to sign in and Google refused it inside the screen — Google never allows sign-in inside another app. Take the sign-in trip below, or put the app back on this screen.'
      : 'Google never allows sign-in inside another app\u2019s screen, so ' + (NAMES[key] || 'this app') + ' stays right here, untouched. Take the sign-in trip: it becomes the whole view, you sign in there, and your back button brings you straight back to this PC — signed in.';
    p.appendChild(t);
    var row = document.createElement('div');
    row.className = 'row';
    p.appendChild(row);
    var b1 = document.createElement('button');
    b1.className = 'vpc-auth-btn main';
    b1.textContent = 'TAKE ME TO SIGN IN \u2192';
    b1.onclick = function () { authTrip(key); };
    row.appendChild(b1);
    if (escaped) {
      var b2 = document.createElement('button');
      b2.className = 'vpc-auth-btn';
      b2.textContent = 'PUT IT BACK ON THIS SCREEN';
      b2.onclick = function () { restoreFrame(key); hideAuth(); };
      row.appendChild(b2);
    }
    var b3 = document.createElement('button');
    b3.className = 'vpc-auth-btn';
    b3.textContent = 'NOT NOW';
    b3.onclick = function () { hideAuth(); };
    row.appendChild(b3);
  }

  /* The app itself navigated its iframe away (the escape). Putting the
     SAME element back on its home URL is a user-commanded recovery,
     not a room operation. */
  function restoreFrame(key) {
    var r = reg[key];
    if (!r || !r.f) return;
    try { r.f.setAttribute('src', r.src); } catch (e) {}
    r.escaped = false;
    r.readable = false;
    console.log('VPC AUTH: ' + key + ' restored to its screen (same iframe element)');
  }

  window.__vpcAuthPresent = function (key) {
    showAuth(key, false);
  };
  window.__vpcAuthState = function () {
    return { key: authKey, escaped: authEscaped, open: !!document.getElementById('vpc-auth') };
  };

  /* Same-origin apps: wrap their sign-in entry point so the in-glass
     document NEVER navigates to an auth host. The office exposes a
     global googleSignIn() (Firebase signInWithRedirect) — that call is
     what destroyed the office document and produced the 403. */
  function hookApp(key, T) {
    try {
      var w = T.f.contentWindow;
      if (!w || !w.document) return;
      if (key === 'hq' && typeof w.googleSignIn === 'function' && !w.__vpcSigninHooked) {
        w.__vpcSigninHooked = true;
        w.googleSignIn = function () {
          try { window.__vpcAuthPresent('hq'); } catch (e) {}
        };
        console.log('VPC AUTH: office sign-in routed to the sign-in trip — in-glass document preserved');
      }
    } catch (e) { /* cross-origin right now: the escape watch covers it */ }
  }

  function register(key, T) {
    if (!T || !T.f || reg[key]) return;
    reg[key] = { entry: T, f: T.f, src: T.f.getAttribute('src') || '', readable: false, escaped: false };
    console.log('VPC GUARD: registered ' + key + ' — iframe element + src frozen from creation');
  }

  function verify(key) {
    var r = reg[key];
    if (!r) return;
    var T = window.__vpcTrack && window.__vpcTrack[key];
    if (!T || T !== r.entry || T.f !== r.f) {
      window.__vpcTrack[key] = r.entry;
      if (r.entry.clip && !r.entry.clip.isConnected) document.body.appendChild(r.entry.clip);
      console.log('VPC GUARD: tracked entry for ' + key + ' was replaced — original iframe restored');
      T = r.entry;
    }
    if (!r.f.isConnected && r.entry.clip && r.entry.clip.isConnected) {
      r.entry.clip.appendChild(r.entry.wrap);
      console.log('VPC GUARD: re-seated ' + key + ' wrap in its clip');
    }
    var nowSrc = '';
    try { nowSrc = r.f.getAttribute('src') || ''; } catch (e) {}
    if (nowSrc !== r.src) {
      try { r.f.setAttribute('src', r.src); } catch (e) {}
      console.log('VPC GUARD: src reset blocked for ' + key + ' (creation src restored)');
    }
  }

  function watch(key, T) {
    var r = reg[key];
    if (!r || !T || !T.f) return;
    var href = null;
    try { href = T.f.contentWindow.location.href; } catch (e) { href = null; }
    if (href !== null) {
      r.readable = true;
      if (r.escaped) r.escaped = false;
      hookApp(key, T);
    } else if (r.readable && !r.escaped) {
      /* Was readable on our origins, now answers to a foreign origin:
         the app navigated its own frame away (auth escape). */
      r.escaped = true;
      console.log('VPC AUTH: ' + key + ' left its screen (off-origin navigation) — offering the sign-in trip');
      showAuth(key, true);
    }
  }

  try {
    var ret = localStorage.getItem('vpc_auth_return');
    if (ret) {
      localStorage.removeItem('vpc_auth_return');
      console.log('VPC AUTH: back from a sign-in trip (' + ret + ') — apps pick the session up from their own persistence');
    }
  } catch (e) {}

  setInterval(function () {
    var T = window.__vpcTrack || {};
    Object.keys(T).forEach(function (k) { register(k, T[k]); });
    Object.keys(reg).forEach(function (k) {
      var Tk = window.__vpcTrack && window.__vpcTrack[k];
      if (Tk) { verify(k); watch(k, Tk); }
    });
  }, 400);
})();
