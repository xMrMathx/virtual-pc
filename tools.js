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
      if (T[k] && T[k].f) T[k].f.style.pointerEvents = on ? 'none' : 'auto';
    });
    var F = window.__vpcFrames || {};
    Object.keys(F).forEach(function (i) {
      if (F[i] && F[i].f) F[i].f.style.pointerEvents = on ? 'none' : 'auto';
    });
  }, 120);
})();
