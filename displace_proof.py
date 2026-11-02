"""DISPLACEMENT STOP proof (his ruling 2026-11-01 ~20:36 CST).

Replays his live report end-to-end through the REAL room + REAL
switch paths: YouTube playing on the left mount -> switcher pick puts
Babyboo on the mount -> the video must stop (player destroyed, embed
unloaded, saved position frozen) -> an injected playing <audio> in
Babyboo's own surface must pause when SHE is displaced in turn ->
"open youtube" puts YouTube back, restored cued at the saved spot,
silent until played -> a switcher swap to a desk screen MOVES YouTube
(keeps playing, identity travels) while a resident pick onto that
desk screen stops it again.

YouTube's embed + IFrame API are route-stubbed (sandbox Chromium
reaches no external host — the house pattern). The stub implements
the exact API surface youtube.html uses (Player, getPlayerState,
getCurrentTime, pauseVideo, playVideo, destroy) with a real clock,
so "position did not advance while hidden" is measured, not faked.
"""
import asyncio, base64, functools, math, struct, sys, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
sys.path.insert(0, "/home/hatch/tmp/vpcwork52")
from playwright.sync_api import sync_playwright

SERVE = "/home/hatch/tmp/vpcwork-displace"
PORT = 8493
BASE = f"http://127.0.0.1:{PORT}"
ADELE = "YQHsXMglC9A"   # Music lane head; any embeddable id serves

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

class Q(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

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
        ctx.route("**youtube.com/iframe_api**", yt_api)
        ctx.route("**youtube-nocookie.com/embed/**", yt_embed)
        ctx.route("**youtube.com/embed/**", yt_embed)
        page = ctx.new_page()
        logs, errs = [], []
        page.on("console", lambda m: logs.append(m.text))
        page.on("pageerror", lambda e: errs.append(str(e)[:180]))

        def wait_log(sub, timeout=300):
            t0 = time.time()
            while time.time() - t0 < timeout:
                if any(sub in l for l in logs): return True
                page.wait_for_timeout(400)
            return False
        def frame_of(part):
            for f in page.frames:
                if part in (f.url or ""): return f
            return None
        def yt_state():
            f = frame_of("youtube.html")
            return f.evaluate("() => window.__vpcYouTubeState ? window.__vpcYouTubeState() : null") if f else None
        def snap():
            return page.evaluate("() => { try { return JSON.parse(localStorage.getItem('vpc_layout_v1') || 'null'); } catch (e) { return null; } }")
        def disp():
            return page.evaluate("() => window.__vpcDisplaceState ? window.__vpcDisplaceState() : null")
        def wait_until(fn, timeout=20, what=""):
            t0 = time.time()
            last = None
            while time.time() - t0 < timeout:
                try: last = fn()
                except Exception: last = None
                if last: return last
                page.wait_for_timeout(300)
            print("  (wait timeout: " + what + " last=" + str(last)[:160] + ")", flush=True)
            return last
        def cmd(text, timeout=45):
            page.evaluate("(t) => { window.__vpcMuseReply = ''; window.__vpcMuseCmd = t; }", text)
            r = wait_until(lambda: page.evaluate("() => window.__vpcMuseReply || ''"), timeout, "cmd " + text)
            return r or ""
        def pick(screen, content, name, where):
            page.evaluate("""(a) => { window.__vpcSwitcher = { screen: a[0], num: 0, name: 'TEST',
                contents: [{ content: a[1], name: a[2], where: a[3] }] }; }""",
                [screen, content, name, where])
            page.wait_for_selector("#vpc-switch .vpc-sw-row", timeout=8000)
            page.click("#vpc-switch .vpc-sw-row")
            page.wait_for_timeout(400)

        # ---------- boot ----------
        page.goto(BASE + "/index.html")
        ok_boot = wait_log("VPC boot complete", 720)
        check("boot completes", ok_boot)
        if not ok_boot:
            print("DISPLACE PROOF: aborted at boot", flush=True)
            return
        wait_until(lambda: page.evaluate("() => !!(window.__vpcTrack && window.__vpcTrack.youtube && window.__vpcDisplaceState)"), 60, "track+guard up")
        wait_until(lambda: snap(), 30, "layout snapshot live")

        # ---------- S1: YouTube placed on the left mount ----------
        r = cmd("open youtube")
        check("S1: 'open youtube' lands it on the left mount", "YOUTUBE" in r, r[:90])
        s = wait_until(lambda: (snap() or {}).get("hosts", {}).get("youtube") == "mount_left", 15, "yt host")
        d = wait_until(lambda: (disp() or {}).get("youtube", {}).get("face") is True, 15, "yt face up")
        check("S1: watcher sees YouTube face-up on the mount", bool(d), str(d)[:120])

        # ---------- S2: the Adele video, playing ----------
        f = frame_of("youtube.html")
        check("S2: youtube surface frame present", f is not None)
        f.evaluate("(id) => window.__vpcYouTubeGo && window.__vpcYouTubeGo(id)", ADELE)
        st = wait_until(lambda: (yt_state() or {}).get("yt") == 1, 15, "playing")
        check("S2: video is playing (player state 1)", bool(st), str(st)[:140])
        t1 = (yt_state() or {}).get("t") or 0
        page.wait_for_timeout(1300)
        t2 = (yt_state() or {}).get("t") or 0
        check("S2: position advancing while on screen", t2 > t1 + 0.6, f"{t1:.2f} -> {t2:.2f}")

        # ---------- S3: THE BUG — Babyboo takes the mount ----------
        pick("mount_left", "babyboo", "BABYBOO", "")
        s = wait_until(lambda: (snap() or {}).get("hosts", {}).get("babyboo") == "mount_left", 15, "bb host")
        check("S3: Babyboo now holds the mount", bool(s), str((s or {}).get("hosts"))[:120])
        d = wait_until(lambda: (disp() or {}).get("youtube", {}).get("stopped") is True, 12, "yt stopped")
        check("S3: watcher marks YouTube displaced + stopped", bool(d), str(d)[:120])
        st = yt_state()
        check("S3: embed UNLOADED (about:blank), player gone, disp flag set",
              bool(st) and st.get("disp") is True and st.get("src") == "about:blank" and st.get("yt") is None,
              str(st)[:160])
        rec1 = page.evaluate("() => { try { return JSON.parse(localStorage.getItem('vpc_youtube_play') || 'null'); } catch (e) { return null; } }")
        page.wait_for_timeout(2600)
        rec2 = page.evaluate("() => { try { return JSON.parse(localStorage.getItem('vpc_youtube_play') || 'null'); } catch (e) { return null; } }")
        check("S3: saved position FROZEN while hidden (no advance in 2.6s)",
              bool(rec1) and bool(rec2) and abs((rec2.get("t") or 0) - (rec1.get("t") or 0)) < 0.01,
              f"t={rec1 and rec1.get('t')} -> {rec2 and rec2.get('t')}")
        check("S3: frozen position is the playing position, not zero",
              bool(rec2) and (rec2.get("t") or 0) > 1.0, str(rec2)[:120])

        # ---------- S4: generic media in ANOTHER surface stops too ----------
        bf = frame_of("babyboo.html")
        check("S4: babyboo surface frame present", bf is not None)
        bf.evaluate("""(b64) => { const a = document.createElement('audio');
            a.id = 'displace-test-audio'; a.loop = true; a.src = 'data:audio/wav;base64,' + b64;
            document.body.appendChild(a); return a.play().then(() => !a.paused).catch(() => false); }""", wav)
        page.wait_for_timeout(500)
        playing = bf.evaluate("() => { const a = document.getElementById('displace-test-audio'); return a && !a.paused; }")
        check("S4: injected audio playing in Babyboo's surface", playing is True, str(playing))
        r = cmd("open youtube")   # displaces Babyboo (host -> '') AND returns YouTube in one move
        d = wait_until(lambda: (disp() or {}).get("babyboo", {}).get("stopped") is True, 12, "bb stopped")
        check("S4: watcher marks Babyboo displaced when her host is taken", bool(d), str(d)[:120])
        paused = bf.evaluate("() => { const a = document.getElementById('displace-test-audio'); return a && a.paused; }")
        check("S4: her surface's playing media is PAUSED by the sweep", paused is True, str(paused))

        # ---------- S5: YouTube returns — cued at the saved spot, silent ----------
        st = wait_until(lambda: (yt_state() or {}).get("disp") is False, 12, "yt restored")
        st = yt_state()
        saved_t = (rec2 or {}).get("t") or 0
        check("S5: same video restored", bool(st) and st.get("id") == ADELE, str(st)[:140])
        check("S5: restored CUED/paused at the saved position",
              bool(st) and st.get("yt") == 2 and abs((st.get("t") or 0) - saved_t) < 1.2,
              f"yt={st and st.get('yt')} t={st and st.get('t')} saved={saved_t}")
        ta = (yt_state() or {}).get("t") or 0
        page.wait_for_timeout(1600)
        tb = (yt_state() or {}).get("t") or 0
        check("S5: silent until played — position does not advance on its own",
              abs(tb - ta) < 0.05, f"{ta:.2f} -> {tb:.2f}")

        # ---------- S6: desk screen — swap MOVES it (keeps playing); resident pick STOPS it ----------
        f = frame_of("youtube.html")
        f.evaluate("(id) => window.__vpcYouTubeGo && window.__vpcYouTubeGo(id)", ADELE)
        wait_until(lambda: (yt_state() or {}).get("yt") == 1, 15, "playing again")
        pick("ultrawide", "mount_left", "YOUTUBE", "wing_shortz")   # swap mount <-> Screen 1
        s = wait_until(lambda: (snap() or {}).get("hosts", {}).get("youtube") == "ultrawide", 15, "yt on S1")
        check("S6: switcher swap moved YouTube to Screen 1", bool(s), str((s or {}).get("hosts"))[:120])
        page.wait_for_timeout(600)
        t1 = (yt_state() or {}).get("t") or 0
        page.wait_for_timeout(1200)
        t2 = (yt_state() or {}).get("t") or 0
        st = yt_state()
        check("S6: a swap is travel, not displacement — still playing",
              bool(st) and st.get("yt") == 1 and t2 > t1 + 0.5, f"yt={st and st.get('yt')} {t1:.2f}->{t2:.2f}")
        pick("ultrawide", "babyboo", "BABYBOO", "mount_left")       # resident takes Screen 1
        d = wait_until(lambda: (disp() or {}).get("youtube", {}).get("stopped") is True, 12, "yt stopped on S1")
        st = yt_state()
        check("S6: resident pick on the desk screen stops it there too",
              bool(d) and bool(st) and st.get("src") == "about:blank", str(st)[:140])

        # ---------- S7: one-audio law — nothing of YouTube's is audible anywhere ----------
        alive = page.evaluate("""() => { let n = 0;
            const walk = (w) => { try {
                if (w.__ytStubs) w.__ytStubs.forEach(p => { if (!p._dead && p.getPlayerState() === 1) n++; });
                const ms = w.document.querySelectorAll('video,audio');
                ms.forEach(m => { if (!m.paused) n++; });
                w.document.querySelectorAll('iframe').forEach(f => walk(f.contentWindow));
            } catch (e) {} };
            walk(window); return n; }""")
        check("S7: zero playing media anywhere while displaced", alive == 0, f"alive={alive}")
        mine = [e for e in errs if ("displac" in e or "tools.js" in e or "youtube.html" in e)]
        check("S7: no page errors from the fix's files", not mine, str(mine[:2])[:160])
        if errs: note(f"{len(errs)} other page errors (sandbox network noise): {errs[:2]}")

        ctx.close(); browser.close()
    p = sum(1 for _, ok in RES if ok)
    print(f"DISPLACE PROOF: {p} PASS / {len(RES) - p} FAIL (of {len(RES)})", flush=True)

if __name__ == "__main__":
    main()
