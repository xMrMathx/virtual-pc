/* wakeword.js — the Virtual PC's idle ear (FIX 20).
 *
 * An ON-DEVICE keyword spotter: openWakeWord's pretrained "hey
 * jarvis" model (melspectrogram + speech-embedding + classifier,
 * ONNX, run locally by onnxruntime-web over a raw getUserMedia
 * stream). It hears ONLY its wake phrase:
 *   - SpeechRecognition is never constructed or started here;
 *   - no audio is recorded, stored, transcribed, or sent anywhere —
 *     samples flow through fixed-size buffers and are discarded
 *     frame by frame;
 *   - it never touches media playback (no ducking, no pausing) —
 *     it only reads the mic stream and computes scores.
 * The streaming pipeline is a faithful port of openWakeWord's
 * reference implementation (AudioFeatures._streaming_features +
 * Model.predict): 1280-sample (80ms) frames at 16kHz, melspec over
 * the trailing 1760 samples transformed by x/10+2, embeddings of
 * the trailing 76 mel frames, classifier over the trailing 16
 * embeddings, first 5 predictions suppressed, threshold 0.5.
 * Validated against the reference Python implementation on a
 * synthesized "Hey Jarvis" clip: reference max score 0.998.
 *
 * Exposes window.__vpcKWS = { start(stream), setPaused(bool),
 * testSamples(int16array) } and reports through the engine hooks
 * window.__vpcWakeNote(state) / window.__vpcWakeHit(phrase).
 */
(function () {
  'use strict';
  var BASE = 'kws/';
  var THRESH = 0.5;
  var REFRACT_MS = 2500;

  var melS = null, embS = null, clsS = null;
  var ready = false, starting = null;

  // ---- streaming state (mirrors the reference implementation) ----
  var rawBuf = [];                 // int16 samples, capped at 10s
  var melBuf = null;               // rows of 32, starts as 76 x ones
  var featBuf = null;              // rows of 96
  var predCount = 0;
  var lastHit = 0;
  var lastScore = 0;

  var paused = false;
  var audioCtx = null, procNode = null, srcNode = null;
  var chain = Promise.resolve();
  var frameAcc = [];               // float samples at 16k awaiting a frame
  var rsPhase = 0;

  function ones(rows, cols, v) {
    var a = [], i, j, r;
    for (i = 0; i < rows; i++) { r = []; for (j = 0; j < cols; j++) r.push(v); a.push(r); }
    return a;
  }
  // Deterministic pseudo-noise for the initial feature buffer — the
  // reference seeds it with 4s of random int16; the values wash out
  // within seconds of real audio and predictions start suppressed.
  var _seed = 987654321;
  function rnd() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x80000000; }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  async function melFor(samples) {
    var f32 = new Float32Array(samples.length), i;
    for (i = 0; i < samples.length; i++) f32[i] = samples[i];
    var inp = new ort.Tensor('float32', f32, [1, samples.length]);
    var out = await melS.run({ input: inp });
    var t = out[Object.keys(out)[0]];
    var frames = t.dims[t.dims.length - 2], data = t.data, rows = [], fr, b, row;
    for (fr = 0; fr < frames; fr++) {
      row = [];
      for (b = 0; b < 32; b++) row.push(data[fr * 32 + b] / 10 + 2);
      rows.push(row);
    }
    return rows;
  }

  async function embFor(melRows) {
    var f32 = new Float32Array(76 * 32), i, j;
    for (i = 0; i < 76; i++) for (j = 0; j < 32; j++) f32[i * 32 + j] = melRows[i][j];
    var inp = new ort.Tensor('float32', f32, [1, 76, 32, 1]);
    var out = await embS.run({ input_1: inp });
    var d = out[Object.keys(out)[0]].data, v = [];
    for (i = 0; i < 96; i++) v.push(d[i]);
    return v;
  }

  async function embeddingsFor(samples) {
    var rows = await melFor(samples), feats = [], i;
    for (i = 0; i + 76 <= rows.length; i += 8) feats.push(await embFor(rows.slice(i, i + 76)));
    return feats;
  }

  async function resetState() {
    rawBuf = [];
    melBuf = ones(76, 32, 1);
    predCount = 0;
    var noise = new Int16Array(64000), i;
    for (i = 0; i < 64000; i++) noise[i] = Math.floor(rnd() * 2000 - 1000);
    featBuf = await embeddingsFor(noise);
  }

  async function init() {
    if (ready) return;
    if (starting) return starting;
    starting = (async function () {
      if (!window.ort) await loadScript(BASE + 'ort.wasm.min.js');
      ort.env.wasm.wasmPaths = new URL(BASE, document.baseURI).href;
      ort.env.wasm.numThreads = 1;
      melS = await ort.InferenceSession.create(BASE + 'melspectrogram.onnx', { executionProviders: ['wasm'] });
      embS = await ort.InferenceSession.create(BASE + 'embedding_model.onnx', { executionProviders: ['wasm'] });
      clsS = await ort.InferenceSession.create(BASE + 'hey_jarvis_v0.1.onnx', { executionProviders: ['wasm'] });
      await resetState();
      ready = true;
      if (window.__vpcWakeNote) window.__vpcWakeNote('on');
      try { console.log('VPC WAKE: ear on (hey jarvis)'); } catch (e) {}
    })();
    try { await starting; } catch (e) {
      starting = null;
      if (window.__vpcWakeNote) window.__vpcWakeNote('failed');
      try { console.log('VPC WAKE: failed ' + e); } catch (x) {}
      throw e;
    }
  }

  async function processFrame(frame) {
    if (!ready) return;
    var i;
    for (i = 0; i < 1280; i++) rawBuf.push(frame[i]);
    if (rawBuf.length > 160000) rawBuf.splice(0, rawBuf.length - 160000);
    var n = Math.min(rawBuf.length, 1760);
    var tail = Int16Array.from(rawBuf.slice(rawBuf.length - n));
    var rows = await melFor(tail), r;
    for (r = 0; r < rows.length; r++) melBuf.push(rows[r]);
    if (melBuf.length > 970) melBuf.splice(0, melBuf.length - 970);
    var win = melBuf.slice(melBuf.length - 76);
    if (win.length === 76) {
      var e = await embFor(win);
      featBuf.push(e);
      if (featBuf.length > 120) featBuf.splice(0, featBuf.length - 120);
    }
    var last = featBuf.slice(featBuf.length - 16);
    if (last.length < 16) return;
    var f32 = new Float32Array(16 * 96), a, b;
    for (a = 0; a < 16; a++) for (b = 0; b < 96; b++) f32[a * 96 + b] = last[a][b];
    var out = await clsS.run({ 'x.1': new ort.Tensor('float32', f32, [1, 16, 96]) });
    var score = out[Object.keys(out)[0]].data[0];
    predCount++;
    var eff = predCount <= 5 ? 0 : score;
    lastScore = eff;
    window.__vpcWakeScore = eff;
    if (eff >= THRESH && !paused) {
      var now = Date.now();
      if (now - lastHit > REFRACT_MS) {
        lastHit = now;
        if (window.__vpcWakeHit) window.__vpcWakeHit('hey jarvis');
      }
    }
  }

  function enqueueFrame(frame) {
    chain = chain.then(function () { return processFrame(frame); }).catch(function () {});
  }

  // float samples (any rate) -> 16k int16 frames of 1280
  function pushSamples(f32, rate) {
    var i, v;
    if (rate === 16000) {
      for (i = 0; i < f32.length; i++) frameAcc.push(f32[i]);
    } else {
      var step = rate / 16000;
      while (rsPhase < f32.length - 1) {
        var i0 = Math.floor(rsPhase), fr = rsPhase - i0;
        frameAcc.push(f32[i0] * (1 - fr) + f32[i0 + 1] * fr);
        rsPhase += step;
      }
      rsPhase -= f32.length;
    }
    while (frameAcc.length >= 1280) {
      var fr2 = frameAcc.splice(0, 1280), i16 = new Int16Array(1280);
      for (i = 0; i < 1280; i++) {
        v = Math.max(-1, Math.min(1, fr2[i]));
        i16[i] = Math.round(v * 32767);
      }
      if (!paused) enqueueFrame(i16);
    }
  }

  async function start(stream) {
    try {
      await init();
    } catch (e) { return; }
    if (audioCtx || !stream) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      try { audioCtx = new AC({ sampleRate: 16000 }); }
      catch (e) { audioCtx = new AC(); }
      srcNode = audioCtx.createMediaStreamSource(stream);
      procNode = audioCtx.createScriptProcessor(4096, 1, 1);
      var rate = audioCtx.sampleRate;
      procNode.onaudioprocess = function (ev) {
        if (paused) return;
        pushSamples(ev.inputBuffer.getChannelData(0), rate);
      };
      srcNode.connect(procNode);
      procNode.connect(audioCtx.destination);
      // Chrome may start the context suspended when it was created
      // outside the direct gesture handler — any later tap resumes it.
      document.addEventListener('pointerdown', function () {
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      }, true);
    } catch (e) {
      if (window.__vpcWakeNote) window.__vpcWakeNote('failed');
    }
  }

  function setPaused(p) {
    paused = !!p;
    if (paused) { frameAcc = []; rsPhase = 0; }
  }

  // Harness/validation entry: feed raw 16k int16 samples through the
  // exact live pipeline and report what the ear would have done.
  async function testSamples(samples) {
    await init();
    await resetState();
    var hits0 = lastHit, max = 0, scores = [];
    var origHit = window.__vpcWakeHit, hitCount = 0;
    window.__vpcWakeHit = function () { hitCount++; };
    var total = Math.floor(samples.length / 1280) * 1280, i;
    for (i = 0; i < total; i += 1280) {
      await processFrame(samples.subarray(i, i + 1280));
      scores.push(lastScore);
      if (lastScore > max) max = lastScore;
    }
    window.__vpcWakeHit = origHit;
    lastHit = hits0;
    return { max: max, hits: hitCount, scores: scores };
  }

  window.__vpcKWS = {
    start: start,
    setPaused: setPaused,
    testSamples: testSamples,
    isReady: function () { return ready; }
  };
})();
