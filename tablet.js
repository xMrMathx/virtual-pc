/* THE TABLET — arrangement console (his design, 2026-11-01 ~14:40 CST;
   master volume added ~18:36 CST; per-screen volume + board chatter
   slider added ~22:21 CST).

   The desk prop's tap reaches us through the engine's
   window.__vpcTabletPop = 'open' (the camera-pop pattern). The
   console rises as a sheet in the same language as the switcher:
   a map of the whole wall — every slot a tile showing what's on it.

   - Drag a tile onto another slot = swap. Tap a tile = a picker to
     reassign that slot. Both ride the engine's proven placement
     functions via window.__vpcTabletCmd (swap_screens /
     _apply_switch), so identity travels, content re-fits its host,
     power names stay positional, and the persistence snapshot saves
     the new arrangement like any other placement. Changes apply
     LIVE — there is no Apply button.
   - The projector's tile is display-only: the projector is never a
     swap party (standing law).
   - MASTER VOLUME: one slider + mute driving the top window's
     master gain (tools.js hub: window.__vpcSetMasterVol /
     __vpcSetMasterMuted) that every screen's audio obeys.
   - PER-SCREEN VOLUME: every tile carries its own slider — the
     volume of THAT screen. It applies instantly page-side through
     the hub (__vpcSetSlotVol: the surface on the screen hears
     master x screen) and records through the engine
     ({cmd:'vol'}), whose layout snapshot persists it with the
     arrangement and reports it back on every payload ('vol').
   - BOARD CHATTER: one slider for the Babyboo ⇄ ALLON board
     conversation (hub: __vpcSetChatterVol). Down = the agents talk
     in the background; it never stops, holds, or drops the talk.
   - X stows the console; the room already shows the new arrangement.

   Engine truth arrives on window.__vpcTabletState (pushed on open,
   on every console command, and on any layout change). */

(function () {
  'use strict';
  if (window.__vpcTabletUi) return;
  window.__vpcTabletUi = true;

  var css = document.createElement('style');
  css.textContent = [
    '#vpc-tab{position:fixed;inset:0;z-index:90;display:none;align-items:flex-end;justify-content:center;',
    'background:rgba(2,6,14,.55);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '#vpc-tab.open{display:flex}',
    '#vpc-tab-panel{width:min(96vw,440px);max-height:94vh;overflow-y:auto;background:linear-gradient(180deg,#0a1420,#050a12);',
    'border:1.5px solid rgba(89,215,255,.55);border-bottom:none;border-radius:20px 20px 0 0;',
    'box-shadow:0 -12px 44px rgba(0,0,0,.65),0 0 22px rgba(89,215,255,.18) inset;color:#dfeeff;',
    'padding:12px 12px 18px;transform:translateY(46px) scale(.97);opacity:0;transition:transform .38s cubic-bezier(.2,.9,.25,1),opacity .3s}',
    '#vpc-tab.open #vpc-tab-panel{transform:none;opacity:1}',
    '#vpc-tab-head{display:flex;align-items:center;gap:8px;margin:2px 2px 10px}',
    '#vpc-tab-title{font-size:14px;font-weight:800;letter-spacing:.14em;color:#9adcff;flex:1}',
    '#vpc-tab-x{appearance:none;border:1px solid rgba(159,220,255,.4);background:rgba(20,40,64,.85);color:#eaf7ff;',
    'width:34px;height:34px;border-radius:50%;font-size:16px;line-height:1;cursor:pointer}',
    '#vpc-tab-grid{display:grid;grid-template-columns:1fr 1.25fr 1fr;gap:7px}',
    '.vpc-tile{position:relative;border:1.2px solid rgba(120,180,255,.35);border-radius:11px;background:rgba(16,30,50,.85);',
    'padding:7px 8px 6px;min-height:52px;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}',
    '.vpc-tile .cn{font-size:12.5px;font-weight:800;color:#eaf7ff;line-height:1.15;letter-spacing:.02em}',
    '.vpc-tile .ps{font-size:9px;font-weight:700;letter-spacing:.09em;color:#7fb6d9;margin-top:2px}',
    '.vpc-tile .st{position:absolute;top:6px;right:7px;width:8px;height:8px;border-radius:50%;background:#39e07a;box-shadow:0 0 6px #39e07a}',
    '.vpc-tile.off{opacity:.55}.vpc-tile.off .st{background:#5a6a7a;box-shadow:none}',
    '.vpc-tile .mt{font-size:8.5px;font-weight:800;letter-spacing:.08em;color:#ffd76a;margin-top:2px}',
    '.vpc-tile.proj{grid-column:1/4;cursor:default;border-style:dashed;text-align:center;min-height:38px}',
    '.vpc-tile.spacer{border:none;background:transparent;cursor:default;min-height:20px}',
    '.vpc-tile.dragging{opacity:.35}',
    '.vpc-tile.drop{border-color:#ffd76a;box-shadow:0 0 0 2px rgba(255,215,106,.5)}',
    '#vpc-tab-ghost{position:fixed;z-index:99;pointer-events:none;border:1.2px solid #ffd76a;border-radius:11px;',
    'background:rgba(24,42,70,.94);color:#eaf7ff;padding:7px 10px;font-size:12.5px;font-weight:800;display:none;box-shadow:0 8px 24px rgba(0,0,0,.6)}',
    '#vpc-tab-pick{display:none;margin-top:10px;border-top:1px solid rgba(120,180,255,.22);padding-top:9px}',
    '#vpc-tab-pick.show{display:block}',
    '#vpc-tab-pick .ph{font-size:10.5px;font-weight:800;letter-spacing:.12em;color:#9adcff;margin:0 2px 7px}',
    '#vpc-tab-chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.vpc-chip{appearance:none;border:1px solid rgba(120,180,255,.4);background:rgba(18,36,60,.9);color:#dfeeff;',
    'border-radius:999px;padding:6px 10px;font-size:11.5px;font-weight:700;cursor:pointer}',
    '.vpc-chip small{color:#7fb6d9;font-weight:700}',
    '.vpc-chip.here{border-color:#39e07a;color:#b9ffd2}',
    '#vpc-tab-vol{margin-top:12px;border-top:1px solid rgba(120,180,255,.22);padding-top:10px}',
    '#vpc-tab-vol .vh{display:flex;align-items:center;gap:8px;margin:0 2px 6px}',
    '#vpc-tab-vol .vt{font-size:10.5px;font-weight:800;letter-spacing:.12em;color:#ffd76a;flex:1}',
    '#vpc-tab-volpct{font-size:12px;font-weight:800;color:#eaf7ff;min-width:40px;text-align:right}',
    '#vpc-tab-mute{appearance:none;border:1px solid rgba(255,215,106,.55);background:rgba(52,40,8,.85);color:#ffd76a;',
    'border-radius:999px;padding:6px 12px;font-size:11.5px;font-weight:800;cursor:pointer}',
    '#vpc-tab-mute.muted{background:rgba(90,16,16,.9);border-color:rgba(255,110,110,.7);color:#ffb3b3}',
    '#vpc-tab-slider{width:100%;accent-color:#ffd76a;height:28px;cursor:pointer}',
    '.vpc-tile .vv{display:flex;align-items:center;gap:5px;margin-top:5px}',
    '.vpc-tile .vv .vi{font-size:9px;line-height:1}',
    '.vpc-tile .vv .vs{flex:1;height:16px;accent-color:#59d7ff;cursor:pointer;min-width:0}',
    '.vpc-tile .vv .vp{font-size:9px;font-weight:800;color:#9adcff;min-width:26px;text-align:right}',
    '#vpc-tab-chat{margin-top:12px;border-top:1px solid rgba(120,180,255,.22);padding-top:10px}',
    '#vpc-tab-chat .vh{display:flex;align-items:center;gap:8px;margin:0 2px 6px}',
    '#vpc-tab-chat .vt{font-size:10.5px;font-weight:800;letter-spacing:.12em;color:#c9a7ff;flex:1}',
    '#vpc-tab-chatpct{font-size:12px;font-weight:800;color:#eaf7ff;min-width:40px;text-align:right}',
    '#vpc-tab-chatslider{width:100%;accent-color:#c9a7ff;height:28px;cursor:pointer}',
    '#vpc-tab-chat .vnote{font-size:9.5px;color:#7fb6d9;margin:2px 2px 0;line-height:1.35}'
  ].join('');
  document.head.appendChild(css);

  var root = document.createElement('div');
  root.id = 'vpc-tab';
  root.innerHTML =
    '<div id="vpc-tab-panel">' +
      '<div id="vpc-tab-head"><div id="vpc-tab-title">▦ ARRANGE THE WALL</div>' +
      '<button id="vpc-tab-x" aria-label="Put the tablet back">✕</button></div>' +
      '<div id="vpc-tab-grid"></div>' +
      '<div id="vpc-tab-pick"><div class="ph" id="vpc-tab-pickh"></div><div id="vpc-tab-chips"></div></div>' +
      '<div id="vpc-tab-vol"><div class="vh"><div class="vt">MASTER VOLUME — EVERY SCREEN</div>' +
      '<div id="vpc-tab-volpct">100%</div><button id="vpc-tab-mute">MUTE</button></div>' +
      '<input id="vpc-tab-slider" type="range" min="0" max="100" step="1" value="100"></div>' +
      '<div id="vpc-tab-chat"><div class="vh"><div class="vt">BOARD CHATTER — BABYBOO ⇄ ALLON</div>' +
      '<div id="vpc-tab-chatpct">100%</div></div>' +
      '<input id="vpc-tab-chatslider" type="range" min="0" max="100" step="1" value="100">' +
      '<div class="vnote">Down makes the agents background. It never stops the conversation.</div></div>' +
    '</div>';
  document.body.appendChild(root);
  var ghost = document.createElement('div');
  ghost.id = 'vpc-tab-ghost';
  document.body.appendChild(ghost);

  var panel = root.querySelector('#vpc-tab-panel');
  var grid = root.querySelector('#vpc-tab-grid');
  var pickBox = root.querySelector('#vpc-tab-pick');
  var pickHead = root.querySelector('#vpc-tab-pickh');
  var chips = root.querySelector('#vpc-tab-chips');
  var slider = root.querySelector('#vpc-tab-slider');
  var volPct = root.querySelector('#vpc-tab-volpct');
  var muteBtn = root.querySelector('#vpc-tab-mute');
  var chatSlider = root.querySelector('#vpc-tab-chatslider');
  var chatPct = root.querySelector('#vpc-tab-chatpct');

  var state = null;          /* last __vpcTabletState payload */
  var stateJson = '';
  var open = false;
  var pickSlot = '';
  var sliderHeld = false;
  var chatHeld = false;
  var volHeld = '';          /* slot id whose per-screen slider is held */

  /* wall-map cell order: [slotId | 'spacer' | 'proj', gridColumnSpan] */
  var LAYOUT = [
    ['mount_left', 1], ['spacer', 1], ['mount_right', 1],
    ['code_shortz', 1], ['board', 1], ['code_games', 1],
    ['wing_shortz', 1], ['ultrawide', 1], ['wing_hq', 1],
    ['spacer', 1], ['command', 1], ['spacer', 1],
    ['proj', 3]
  ];

  function slotOf(id) {
    if (!state) return null;
    for (var i = 0; i < state.slots.length; i++) if (state.slots[i].id === id) return state.slots[i];
    return null;
  }
  function sendCmd(obj) {
    try { window.__vpcTabletCmd = JSON.stringify(obj); } catch (e) {}
    setTimeout(function () { try { window.__vpcTabletQuery = '1'; } catch (e) {} }, 350);
  }
  function closePick() { pickSlot = ''; pickBox.className = ''; }

  function render() {
    if (!state) return;
    grid.innerHTML = '';
    LAYOUT.forEach(function (cell) {
      var id = cell[0];
      var d = document.createElement('div');
      if (id === 'spacer') { d.className = 'vpc-tile spacer'; grid.appendChild(d); return; }
      if (id === 'proj') {
        d.className = 'vpc-tile proj';
        var sh = state.projector && state.projector.showing ? ' · ' + state.projector.showing : '';
        d.innerHTML = '<div class="cn">🎬 PROJECTOR' + sh + '</div><div class="ps">LEFT WALL · NEVER SWAPS</div>';
        grid.appendChild(d); return;
      }
      var s = slotOf(id);
      if (!s) { d.className = 'vpc-tile spacer'; grid.appendChild(d); return; }
      d.className = 'vpc-tile' + (s.power ? '' : ' off');
      d.setAttribute('data-slot', id);
      var head = (s.num ? 'SCREEN ' + s.num + ' · ' : '') + s.pos;
      var mt = '';
      if (typeof s.mount === 'boolean') mt = '<div class="mt">' + (s.mount ? '▼ MOUNT DOWN' : '▲ MOUNT TUCKED') + '</div>';
      d.innerHTML = '<div class="cn"></div><div class="ps"></div>' + mt + '<div class="st"></div>' +
        '<div class="vv"><span class="vi">🔊</span><input class="vs" type="range" min="0" max="100" step="1"><span class="vp"></span></div>';
      d.querySelector('.cn').textContent = s.name;
      d.querySelector('.ps').textContent = head + (s.power ? '' : ' · OFF');
      attachTile(d, id);
      attachVol(d, id, s);
      grid.appendChild(d);
    });
    if (pickSlot) renderPick();
  }

  function renderPick() {
    var s = slotOf(pickSlot);
    if (!s || !state) { closePick(); return; }
    pickBox.className = 'show';
    pickHead.textContent = 'PUT ON ' + (s.num ? 'SCREEN ' + s.num + ' · ' : '') + s.pos + ' — NOW: ' + s.name;
    chips.innerHTML = '';
    state.contents.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'vpc-chip' + (c.where === pickSlot ? ' here' : '');
      b.innerHTML = '';
      b.appendChild(document.createTextNode(c.name));
      if (c.where && c.where !== pickSlot) {
        var sm = document.createElement('small');
        var w = slotOf(c.where);
        sm.textContent = ' · on ' + (w && w.num ? w.num : (w ? w.pos : '?'));
        b.appendChild(sm);
      }
      b.addEventListener('click', function () {
        sendCmd({ cmd: 'assign', slot: pickSlot, content: c.content });
        closePick();
      });
      chips.appendChild(b);
    });
  }

  /* ---- drag-swap + tap-to-pick (pointer events, touch-first) ---- */
  function attachTile(d, id) {
    var sx = 0, sy = 0, dragging = false, pid = null;
    d.addEventListener('pointerdown', function (ev) {
      pid = ev.pointerId; sx = ev.clientX; sy = ev.clientY; dragging = false;
      try { d.setPointerCapture(pid); } catch (e) {}
      ev.preventDefault();
    });
    d.addEventListener('pointermove', function (ev) {
      if (pid === null || ev.pointerId !== pid) return;
      if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 12) {
        dragging = true;
        d.classList.add('dragging');
        var s = slotOf(id);
        ghost.textContent = s ? s.name : id;
        ghost.style.display = 'block';
      }
      if (dragging) {
        ghost.style.left = (ev.clientX + 12) + 'px';
        ghost.style.top = (ev.clientY + 10) + 'px';
        markDrop(ev);
      }
    });
    function finish(ev, commit) {
      if (pid === null) return;
      var wasDrag = dragging;
      pid = null; dragging = false;
      d.classList.remove('dragging');
      ghost.style.display = 'none';
      clearDrop();
      if (wasDrag && commit) {
        var t = tileAt(ev.clientX, ev.clientY);
        if (t && t !== id) { sendCmd({ cmd: 'swap', a: id, b: t }); closePick(); return; }
      }
      if (!wasDrag && commit) {
        if (pickSlot === id) closePick();
        else { pickSlot = id; renderPick(); }
      }
    }
    d.addEventListener('pointerup', function (ev) { finish(ev, true); });
    d.addEventListener('pointercancel', function (ev) { finish(ev, false); });
  }
  /* ---- per-screen volume (on each tile) ---- */
  var volTimers = {};
  function sendVolCmd(id, v) {
    if (volTimers[id]) clearTimeout(volTimers[id]);
    volTimers[id] = setTimeout(function () {
      volTimers[id] = null;
      sendCmd({ cmd: 'vol', slot: id, vol: v });
    }, 160);
  }
  function attachVol(d, id, s) {
    var inp = d.querySelector('.vs');
    var pct = d.querySelector('.vp');
    if (!inp) return;
    var v = (typeof s.vol === 'number') ? s.vol : 1;
    inp.value = Math.round(v * 100);
    pct.textContent = Math.round(v * 100) + '%';
    inp.addEventListener('pointerdown', function (ev) {
      ev.stopPropagation();
      volHeld = id;
      try { window.__vpcSlotVolHold = id; } catch (e) {}
    });
    function release() {
      if (volHeld !== id) return;
      volHeld = '';
      try { window.__vpcSlotVolHold = ''; } catch (e) {}
      sendVolCmd(id, parseInt(inp.value, 10) / 100);
      render();
    }
    inp.addEventListener('pointerup', release);
    inp.addEventListener('pointercancel', release);
    inp.addEventListener('click', function (ev) { ev.stopPropagation(); });
    inp.addEventListener('input', function () {
      var val = parseInt(inp.value, 10) / 100;
      pct.textContent = inp.value + '%';
      if (window.__vpcSetSlotVol) window.__vpcSetSlotVol(id, val);
      sendVolCmd(id, val);
    });
  }

  function tileAt(x, y) {
    var el = document.elementFromPoint(x, y);
    while (el && el !== document.body) {
      if (el.getAttribute && el.getAttribute('data-slot')) return el.getAttribute('data-slot');
      el = el.parentElement;
    }
    return '';
  }
  var dropEl = null;
  function markDrop(ev) {
    var t = tileAt(ev.clientX, ev.clientY);
    var el = t ? grid.querySelector('[data-slot="' + t + '"]') : null;
    if (dropEl && dropEl !== el) dropEl.classList.remove('drop');
    dropEl = el;
    if (dropEl) dropEl.classList.add('drop');
  }
  function clearDrop() { if (dropEl) dropEl.classList.remove('drop'); dropEl = null; }

  /* ---- master volume ---- */
  function syncVol() {
    if (!window.__vpcMasterState) return;
    var st = window.__vpcMasterState();
    if (!sliderHeld) slider.value = Math.round(st.vol * 100);
    volPct.textContent = st.muted ? 'MUTED' : Math.round(st.eff * 100) + '%';
    muteBtn.textContent = st.muted ? 'UNMUTE' : 'MUTE';
    muteBtn.className = st.muted ? 'muted' : '';
    muteBtn.id = 'vpc-tab-mute';
  }
  slider.addEventListener('pointerdown', function () { sliderHeld = true; });
  slider.addEventListener('pointerup', function () { sliderHeld = false; });
  slider.addEventListener('input', function () {
    if (window.__vpcSetMasterVol) window.__vpcSetMasterVol(parseInt(slider.value, 10) / 100);
    syncVolSoon();
  });
  muteBtn.addEventListener('click', function () {
    if (window.__vpcMasterState && window.__vpcSetMasterMuted) {
      window.__vpcSetMasterMuted(!window.__vpcMasterState().muted);
    }
    syncVol();
  });
  var syncT = null;
  function syncVolSoon() { if (syncT) return; syncT = setTimeout(function () { syncT = null; syncVol(); }, 60); }
  window.addEventListener('vpc-mastervol', syncVolSoon);

  /* ---- board chatter volume ---- */
  function syncChat() {
    if (!window.__vpcChatterState) return;
    var st = window.__vpcChatterState();
    if (!chatHeld) chatSlider.value = Math.round(st.vol * 100);
    chatPct.textContent = Math.round(st.vol * 100) + '%';
  }
  chatSlider.addEventListener('pointerdown', function () { chatHeld = true; });
  chatSlider.addEventListener('pointerup', function () { chatHeld = false; });
  chatSlider.addEventListener('input', function () {
    if (window.__vpcSetChatterVol) window.__vpcSetChatterVol(parseInt(chatSlider.value, 10) / 100);
    chatPct.textContent = chatSlider.value + '%';
  });
  window.addEventListener('vpc-chattervol', syncChat);

  /* ---- open / close ---- */
  function show() {
    open = true;
    root.className = 'open';
    try { window.__vpcTabletQuery = '1'; } catch (e) {}
    syncVol();
    syncChat();
    render();
  }
  function hide() {
    open = false;
    root.className = '';
    closePick();
  }
  root.querySelector('#vpc-tab-x').addEventListener('click', hide);
  root.addEventListener('pointerdown', function (ev) { if (ev.target === root) hide(); });
  panel.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });

  setInterval(function () {
    var pop = '';
    try { pop = window.__vpcTabletPop || ''; } catch (e) { pop = ''; }
    if (pop === 'open') { try { window.__vpcTabletPop = ''; } catch (e) {} show(); }
    else if (pop === 'close') { try { window.__vpcTabletPop = ''; } catch (e) {} hide(); }
    if (open && state !== window.__vpcTabletState && window.__vpcTabletState) {
      var j = '';
      try { j = JSON.stringify(window.__vpcTabletState); } catch (e) { j = ''; }
      if (j && j !== stateJson) {
        state = window.__vpcTabletState;
        /* While a per-screen slider is held, the tile under his
           finger is never rebuilt — the fresh state lands on
           release (attachVol's release calls render). */
        if (!volHeld) { stateJson = j; render(); }
      }
    }
  }, 200);
})();
