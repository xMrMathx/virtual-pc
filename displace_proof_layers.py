"""DISPLACEMENT STOP — layered proof (fallback for a box that cannot
boot the Godot engine tonight: 3 full-room attempts died of load —
browser crash / page crash at load 27-34, other lanes' exports
competing; the documented sandbox limit).

What runs UNMODIFIED here: the shipped tools.js watcher (real file,
real tick, real tell/sweep) and the shipped youtube.html surface
(real message listener, real saveYt persistence), driven through
their REAL interfaces — the {vpc:'displaced'} postMessage and the
vpc_layout_v1 snapshot in the EXACT shape AppMain._layout_snapshot()
writes (verified line-by-line against the engine source). The YT
IFrame API + embeds are route-stubbed with a real clock, the house
pattern. The only simulated link is the engine writing the snapshot
— pre-existing shipped machinery (persistence lane), not this fix.
"""
import asyncio, base64, functools, math, struct, sys, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
sys.path.insert(0, "/home/hatch/tmp/vpcwork52")
from playwright.sync_api import sync_playwright

SERVE = "/home/hatch/tmp/vpcwork-displace"
PORT = 8493
BASE = f"http://127.0.0.1:{PORT}"
ADELE = "YQHsXMglC9A"

RES = []
def check(name, ok, extra=""):
    RES.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + " | " + str(extra)[:200], flush=True)
def note(s):
    print("NOTE " + s, flush=True)

def tiny_wav_b64():
    sr, dur, freq = 8000, 2.0, 440.0
    n = int(sr * dur)
    frames = b"".join(struct.pack("<h", int(9000 * math.sin(2 * math.pi * freq * i / sr))) for i in range(n))
    data = b"data" + struct.pack("<I", len(frames)) + frames
    fmt = b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16)
    riff = b"RIFF" + struct.pack("<I", 4 + len(fmt) + len(data)) + b"WAVE"
    return base64.b64encode(riff + fmt + data).decode()

YT_API_STUB = r"""
(function(){
  var StubPlayer = function(id, cfg){
    this._el = document.getElementById(id);
    this._cfg = cfg || {};
    this._dead = false;
    this._read();
    (window.__ytStubs = window.__ytStubs || []).push(this);
    var self = this;
    if (this._cfg.events && this._cfg.events.onReady)
      setTimeout(function(){ self._cfg.events.onReady({ target: self }); }, 0);
  };
  StubPlayer.prototype._read = function(){
    var src = '';
    try { src = this._el.getAttribute('src') || ''; } catch (e) {}
    this._t = 0;
    var m = /[?&]start=([0-9.]+)/.exec(src);
    if (m) this._t = parseFloat(m[1]);
    this._state = /[?&]autoplay=1/.test(src) ? 1 : 2;
    this._stamp = Date.now();
    this._src = src;
  };
  StubPlayer.prototype._now = function(){
    if (this._state === 1 && !this._dead){
      var n = Date.now();
      this._t += (n - this._stamp) / 1000.0;
      this._stamp = n;
    }
    return this._t;
  };
  StubPlayer.prototype.getPlayerState = function(){ return this._dead ? -99 : this._state; };
  StubPlayer.prototype.getCurrentTime = function(){ return this._now(); };
  StubPlayer.prototype.pauseVideo = function(){ this._now(); this._state = 2; this._fire(); };
  StubPlayer.prototype.playVideo = function(){ this._stamp = Date.now(); this._state = 1; this._fire(); };
  StubPlayer.prototype.nextVideo = function(){};
  StubPlayer.prototype.destroy = function(){ this._dead = true; };
  StubPlayer.prototype._fire = function(){
    if (this._cfg.events && this._cfg.events.onStateChange)
      this._cfg.events.onStateChange({ data: this._state, target: this });
  };
  window.YT = { Player: StubPlayer, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 } };
  if (window.onYouTubeIframeAPIReady) { try { window.onYouTubeIframeAPIReady(); } catch (e) {} }
})();
"""

HARNESS = r"""<!doctype html><html><head><meta charset="utf-8"><title>harness</title></head>
<body>
<iframe id="ytf" src="/youtube.html" style="width:420px;height:520px"></iframe>
<iframe id="bbf" src="/babyboo.html" style="width:300px;height:300px"></iframe>
<iframe id="stf" src="/frames.html" style="width:200px;height:200px"></iframe>
<script src="/tools.js"></script>
</body></html>"""

class Q(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def snap(hosts, power=None, player="", content=None):
    p = {"ultrawide": True, "mount_left": True, "mount_right": True,
         "screen4": True, "screen5": True, "command": True}
    if power: p.update(power)
    return {"v": 1, "content": content or {}, "hosts": hosts,
            "split_app": {}, "split_native": {}, "player": player,
            "mounts": {"mount_left": 0.0, "mount_right": 0.0},
            "power": p, "laptop": True}

def main():
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Q, directory=SERVE))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    wav = tiny_wav_b64()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required",
                                           "--disable-dev-shm-usage"])
        ctx = browser.new_context(viewport={"width": 1100, "height": 850})
        def yt_api(route):
            route.fulfill(status=200, content_type="application/javascript", body=YT_API_STUB)
        def yt_embed(route):
            route.fulfill(status=200, content_type="text/html", body="<html><body>stub embed</body></html>")
        def harness(route):
            route.fulfill(status=200, content_type="text/html", body=HARNESS)
        ctx.route("**youtube.com/iframe_api**", yt_api)
        ctx.route("**youtube-nocookie.com/embed/**", yt_embed)
        ctx.route("**youtube.com/embed/**", yt_embed)
        ctx.route("**/harness.html", harness)

        def wait_until(fn, timeout=15, what=""):
            t0 = time.time(); last = None
            while time.time() - t0 < timeout:
                try: last = fn()
                except Exception: last = None
                if last: return last
                time.sleep(0.3)
            print("  (wait timeout: " + what + " last=" + str(last)[:160] + ")", flush=True)
            return last

        # ================= LAYER A — the surface itself =================
        page = ctx.new_page()
        errsA = []
        page.on("pageerror", lambda e: errsA.append(str(e)[:160]))
        page.goto(BASE + "/youtube.html")
        wait_until(lambda: page.evaluate("() => !!window.__vpcYouTubeState"), 15, "yt surface up")
        page.evaluate("(id) => window.__vpcYouTubeGo(id)", ADELE)
        st = wait_until(lambda: (page.evaluate("() => window.__vpcYouTubeState()") or {}).get("yt") == 1, 15, "A playing")
        check("A1: Adele video playing on the surface", bool(st), str(st)[:120])
        page.wait_for_timeout(1500)
        page.evaluate("() => window.postMessage({ vpc: 'displaced', on: true }, '*')")
        page.wait_for_timeout(400)
        st = page.evaluate("() => window.__vpcYouTubeState()")
        check("A2: displaced message = HARD STOP (embed unloaded, player destroyed, flag set)",
              st.get("disp") is True and st.get("src") == "about:blank" and st.get("yt") is None, str(st)[:140])
        rec1 = page.evaluate("() => JSON.parse(localStorage.getItem('vpc_youtube_play') || 'null')")
        page.wait_for_timeout(2600)
        rec2 = page.evaluate("() => JSON.parse(localStorage.getItem('vpc_youtube_play') || 'null')")
        check("A3: saved position frozen while displaced (2.6s)",
              bool(rec1) and bool(rec2) and abs((rec2.get("t") or 0) - (rec1.get("t") or 0)) < 0.01,
              f"t={rec1 and rec1.get('t')} -> {rec2 and rec2.get('t')}")
        check("A4: frozen position is the real playing position (>1s)",
              bool(rec2) and (rec2.get("t") or 0) > 1.0, str(rec2)[:120])
        page.evaluate("() => window.postMessage({ vpc: 'displaced', on: false }, '*')")
        st = wait_until(lambda: (page.evaluate("() => window.__vpcYouTubeState()") or {}).get("disp") is False, 12, "A restored")
        st = page.evaluate("() => window.__vpcYouTubeState()")
        saved_t = (rec2 or {}).get("t") or 0
        check("A5: same video back, CUED at saved position, not playing",
              st.get("id") == ADELE and st.get("yt") == 2 and abs((st.get("t") or 0) - saved_t) < 1.2,
              f"yt={st.get('yt')} t={st.get('t')} saved={saved_t}")
        ta = st.get("t") or 0
        page.wait_for_timeout(1600)
        tb = (page.evaluate("() => window.__vpcYouTubeState()") or {}).get("t") or 0
        check("A6: silent until played — no self-advance after return", abs(tb - ta) < 0.05, f"{ta:.2f} -> {tb:.2f}")
        check("A7: no page errors on the surface", not errsA, str(errsA[:2])[:160])
        page.close()

        # ================= LAYER B — the watcher (real tools.js) =================
        page = ctx.new_page()
        errsB = []
        page.on("pageerror", lambda e: errsB.append(str(e)[:160]))
        page.goto(BASE + "/harness.html")
        wait_until(lambda: page.evaluate("() => !!window.__vpcDisplaceState"), 15, "watcher up")
        ytf = page.frame(name="ytf") or [f for f in page.frames if "youtube.html" in (f.url or "")][0]
        bbf = [f for f in page.frames if "babyboo.html" in (f.url or "")][0]
        stf = [f for f in page.frames if "frames.html" in (f.url or "")][0]
        wait_until(lambda: ytf.evaluate("() => !!window.__vpcYouTubeState"), 15, "yt frame up")
        # registry in the engine's exact shape (entry.f = the tracked iframe element)
        page.evaluate("""() => { window.__vpcTrack = {
            youtube: { f: document.getElementById('ytf') },
            babyboo: { f: document.getElementById('bbf') },
            studio:  { f: document.getElementById('stf') } }; }""")
        def yt_st():
            return ytf.evaluate("() => window.__vpcYouTubeState()")
        def disp():
            return page.evaluate("() => window.__vpcDisplaceState()")
        def write_snap(s):
            page.evaluate("(s) => localStorage.setItem('vpc_layout_v1', JSON.stringify(s))", s)

        # B1: boot-default room — Babyboo resident on the left mount, YouTube stored on it too
        ytf.evaluate("(id) => window.__vpcYouTubeGo(id)", ADELE)
        wait_until(lambda: (yt_st() or {}).get("yt") == 1, 15, "B yt playing")
        write_snap(snap({"youtube": "mount_left", "babyboo": "mount_left", "browser": "", "muse": "mount_right", "gaming": ""}))
        d = wait_until(lambda: (disp() or {}).get("youtube", {}).get("stopped") is True, 12, "B1 stopped")
        st = yt_st()
        check("B1: boot-default (YouTube under the resident) is stopped by the watcher",
              bool(d) and st.get("src") == "about:blank" and st.get("disp") is True, str(st)[:130])
        # B2: he puts YouTube on Screen 1 -> back, cued
        write_snap(snap({"youtube": "ultrawide", "babyboo": "mount_left", "browser": "", "muse": "mount_right", "gaming": ""}))
        d = wait_until(lambda: (disp() or {}).get("youtube", {}).get("face") is True, 12, "B2 face")
        st = yt_st()
        check("B2: placed on Screen 1 -> restored, same video cued",
              bool(d) and st.get("disp") is False and st.get("id") == ADELE and st.get("yt") == 2, str(st)[:130])
        # B3: resident takes Screen 1 (his exact report, desk edition) -> hard stop
        ytf.evaluate("() => { const s = window.__vpcYouTubeState(); }")
        ytf.evaluate("(id) => window.__vpcYouTubeGo(id)", ADELE)
        wait_until(lambda: (yt_st() or {}).get("yt") == 1, 15, "B3 playing")
        write_snap(snap({"youtube": "ultrawide", "babyboo": "ultrawide", "browser": "", "muse": "mount_right", "gaming": ""}))
        d = wait_until(lambda: (disp() or {}).get("youtube", {}).get("stopped") is True, 12, "B3 stopped")
        st = yt_st()
        check("B3: resident pick on the desk screen stops it (embed unloaded)",
              bool(d) and st.get("src") == "about:blank", str(st)[:130])
        # B4: a MOVE to the right mount is placement, face-up again -> restored cued
        write_snap(snap({"youtube": "mount_right", "babyboo": "mount_left", "browser": "", "muse": "", "gaming": ""}))
        d = wait_until(lambda: (disp() or {}).get("youtube", {}).get("face") is True, 12, "B4 face")
        check("B4: moved to the right mount -> face-up, restored", bool(d) and (yt_st() or {}).get("disp") is False, str(d)[:110])
        # B5: power off the host -> stop; power back -> restore
        write_snap(snap({"youtube": "mount_right", "babyboo": "mount_left", "browser": "", "muse": "", "gaming": ""}, power={"mount_right": False}))
        d = wait_until(lambda: (disp() or {}).get("youtube", {}).get("stopped") is True, 12, "B5 stopped")
        check("B5: host powered off -> stopped", bool(d), str(d)[:110])
        write_snap(snap({"youtube": "mount_right", "babyboo": "mount_left", "browser": "", "muse": "", "gaming": ""}))
        d = wait_until(lambda: (disp() or {}).get("youtube", {}).get("face") is True, 12, "B5 restored")
        check("B5b: power back on -> restored", bool(d), str(d)[:110])
        # B6: projector host must NEVER be stopped (engine rule: projector counts as powered)
        write_snap(snap({"youtube": "projector", "babyboo": "mount_left", "browser": "", "muse": "", "gaming": ""}, power={"projector": False}))
        page.wait_for_timeout(1800)
        d = disp() or {}
        check("B6: on the projector = face-up (no false stop)",
              (d.get("youtube") or {}).get("face") is True and (yt_st() or {}).get("disp") is False, str(d.get("youtube"))[:110])
        # B7: a tracked surface with NO placement record is never assumed displaced
        stf.evaluate("""(b64) => { const a = document.createElement('audio');
            a.id = 'unmanaged-audio'; a.loop = true; a.src = 'data:audio/wav;base64,' + b64;
            document.body.appendChild(a); return a.play().then(() => !a.paused).catch(() => false); }""", wav)
        page.wait_for_timeout(1600)
        d = disp() or {}
        un = stf.evaluate("() => { const a = document.getElementById('unmanaged-audio'); return a && !a.paused; }")
        check("B7: unplaced surface untouched (no 'studio' key, its media keeps playing)",
              "studio" not in d and un is True, f"keys={sorted(d.keys())} playing={un}")
        # B8: generic sweep — Babyboo's own playing media pauses when SHE is displaced
        bbf.evaluate("""(b64) => { const a = document.createElement('audio');
            a.id = 'bb-audio'; a.loop = true; a.src = 'data:audio/wav;base64,' + b64;
            document.body.appendChild(a); return a.play().then(() => !a.paused).catch(() => false); }""", wav)
        page.wait_for_timeout(400)
        write_snap(snap({"youtube": "mount_right", "babyboo": "ultrawide", "browser": "", "muse": "", "gaming": ""}))
        wait_until(lambda: (disp() or {}).get("babyboo", {}).get("face") is True, 12, "B8 bb face")
        write_snap(snap({"youtube": "mount_right", "babyboo": "", "browser": "", "muse": "", "gaming": ""}))
        d = wait_until(lambda: (disp() or {}).get("babyboo", {}).get("stopped") is True, 12, "B8 bb stopped")
        paused = bbf.evaluate("() => { const a = document.getElementById('bb-audio'); return a && a.paused; }")
        check("B8: displaced surface's HTML media is paused by the sweep",
              bool(d) and paused is True, f"disp={d} paused={paused}")
        mine = [e for e in errsB if "displac" in e.lower() or "tools" in e.lower()]
        check("B9: no page errors from tools.js in the harness", not mine, str(mine[:2])[:160])
        if errsB: note(f"{len(errsB)} other harness page errors: {errsB[:2]}")
        ctx.close(); browser.close()
    p = sum(1 for _, ok in RES if ok)
    print(f"DISPLACE LAYERS PROOF: {p} PASS / {len(RES) - p} FAIL (of {len(RES)})", flush=True)

if __name__ == "__main__":
    main()
