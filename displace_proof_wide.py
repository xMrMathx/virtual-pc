#!/usr/bin/env python3
"""WIDENED displacement proof (his 21:54 CST report: "random videos
playing in the background" — plural). Three named cases, each shown
STOPPED while face-down:
  Part 1  YouTube proper (mount, resident displacement + return cued)
  Part 2  Shortz surface (nests YouTube embeds + an auto-resume
          watchdog): stopped AND stays stopped across the watchdog's
          own intervals while face-down; returns on placement.
  Part 2b PROOF-THE-PROOF: the same Shortz scenario against PRISTINE
          shortz.html (git HEAD) must FAIL to stay stopped — the
          watchdog restarts the hidden show. If it does not, this
          test cannot be trusted and says so.
  Part 3  Generic HTML media: a playing <video> inside the browser
          surface, displaced via the switcher host map.
Channel-faithful stubs: the embed stub honors the real postMessage
command channel; the API stub answers getters from infoDelivery.
"""
import json
import re
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, '/tmp/pw')
from playwright.sync_api import sync_playwright

ROOT = '/home/hatch/tmp/vpcwork-displace'
PORT = 8973
BASE = f'http://127.0.0.1:{PORT}'
WAV = Path('/tmp/tone.wav').read_bytes()
import base64
WAVURI = 'data:audio/wav;base64,' + base64.b64encode(WAV).decode()
EMBED_STUB = Path('/tmp/yt_embed_stub.html').read_text()
API_STUB = Path('/tmp/yt_api_stub.js').read_text()
# Pristine = shortz.html as it was BEFORE the displacement addendum:
# the addendum commit's parent. (HEAD alone stops being pristine the
# moment the fix is committed — that mistake made one re-run's 2b
# vacuous; the asserts below now fail loudly instead.)
PARENT = subprocess.run(['git', '-C', ROOT, 'rev-parse', 'HEAD~1'],
                        capture_output=True, text=True).stdout.strip()
PRISTINE_SHORTZ = subprocess.run(['git', '-C', ROOT, 'show', f'{PARENT}:shortz.html'],
                                 capture_output=True, text=True).stdout
assert "vpc === 'displaced'" not in PRISTINE_SHORTZ, 'pristine sanity: no displaced handler'
assert 'getPlayerState() === 2' in PRISTINE_SHORTZ, 'pristine sanity: watchdog present'

R = []


def check(name, cond, extra=''):
    R.append((name, bool(cond), extra))
    print(('PASS  ' if cond else 'FAIL  ') + name + (f'  [{extra}]' if extra else ''), flush=True)


def serve():
    class H(SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=ROOT, **k)

        def log_message(self, *a):
            pass
    ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()


def snap(page, content=None, hosts=None, player=''):
    # ENGINE SHAPE (AppMain._layout_snapshot, verified at line 6231):
    # hosts maps APP KEY -> HOST SLOT ('' = unplaced); content maps
    # SCREEN ID -> content tag; player is the Shortz override host.
    c = {'ultrawide': '', 'projector': ''}
    if content:
        c.update(content)
    h = {'browser': '', 'youtube': '', 'muse': '', 'gaming': '', 'babyboo': ''}
    if hosts:
        h.update(hosts)
    s = {'v': 1, 'content': c, 'hosts': h, 'split_app': {}, 'split_native': {},
         'player': player, 'power': {}}
    page.evaluate("""(s) => localStorage.setItem('vpc_layout_v1', JSON.stringify(s))""", s)


def add_routes(ctx, pristine_shortz=False):
    def api(route):
        route.fulfill(status=200, content_type='application/javascript', body=API_STUB)

    def emb(route):
        route.fulfill(status=200, content_type='text/html', body=EMBED_STUB)
    ctx.route(re.compile(r'youtube\.com/iframe_api'), api)
    ctx.route(re.compile(r'youtube(-nocookie)?\.com/embed/'), emb)
    if pristine_shortz:
        ctx.route(re.compile(r'127\.0\.0\.1:' + str(PORT) + r'/shortz\.html'),
                  lambda route: route.fulfill(status=200, content_type='text/html',
                                               body=PRISTINE_SHORTZ))


def boot(pw, pristine_shortz=False):
    b = pw.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 1000})
    add_routes(ctx, pristine_shortz)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '/_wide_harness.html')
    pg.wait_for_function("typeof window.__vpcDisplaceState === 'function'", timeout=30000)
    pg.evaluate("""() => {
      // the engine creates this registry in production; the harness
      // stands in for it (same shape: one entry object per app key)
      window.__vpcTrack = window.__vpcTrack || {};
      const T = window.__vpcTrack;
      ['youtube','shortz','babyboo','browser','hq','gaming'].forEach(k => { T[k] = T[k] || {}; });
      T.youtube.f = document.getElementById('f-yt');
      T.shortz.f  = document.getElementById('f-sz');
      T.babyboo.f = document.getElementById('f-bb');
      T.browser.f = document.getElementById('f-br');
    }""")
    return b, pg, errs


def waitfor(fn, timeout=20.0, interval=0.3):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
        except Exception:
            v = None
        if v:
            return v
        time.sleep(interval)
    return None


def sz_state(fr):
    try:
        return fr.evaluate("window.__vpcShortzState ? window.__vpcShortzState() : null")
    except Exception:
        return None


def play_shortz(pg):
    """Drive Shortz's real UI: row -> card -> play, until a YouTube
    title is actually playing (state 1). Returns (frame, state)."""
    fr = [f for f in pg.frames if 'shortz.html' in f.url][0]
    fr.wait_for_selector('.row', timeout=90000)
    for i in range(8):
        fr.click(f'.row >> nth={i}', timeout=10000)
        fr.wait_for_selector('#playBtn', state='visible', timeout=10000)
        fr.click('#playBtn', timeout=10000)
        st = waitfor(lambda: (lambda s: s if s and s.get('ytId') else None)(sz_state(fr)),
                     timeout=6)
        if not st:
            try:
                fr.click('#cardX', timeout=3000)
            except Exception:
                pass
            continue
        st = waitfor(lambda: (lambda s: s if s and s.get('yt') == 1 else None)(sz_state(fr)),
                     timeout=25)
        if st:
            return fr, st
        try:
            fr.click('#cardX', timeout=3000)
        except Exception:
            pass
    return fr, None


def yt_state(fr):
    try:
        st = fr.evaluate("window.__vpcYouTubeState ? window.__vpcYouTubeState() : null")
        if not st:
            return None
        return {'state': st.get('yt'), 'id': st.get('id'), 't': st.get('t'),
                'disp': st.get('disp'), 'src': st.get('src')}
    except Exception:
        return None


def main():
    threading.Thread(target=serve, daemon=True).start()
    time.sleep(0.6)
    with sync_playwright() as pw:
        # ── Part 1: YouTube proper ─────────────────────────────
        b, pg, errs = boot(pw)
        yt = [f for f in pg.frames if 'youtube.html' in f.url][0]
        waitfor(lambda: yt_state(yt) is not None, timeout=30)
        snap(pg, hosts={'youtube': 'mount_left'})
        ok = waitfor(lambda: (pg.evaluate("window.__vpcDisplaceState().youtube.face") is True),
                     timeout=6)
        check('W1.0 watcher face-up baseline (YouTube on left mount)', ok)
        # the page's own start path: a verified lane chip (his picks
        # row) loads /embed/<id> with autoplay — no search needed
        yt.wait_for_selector('#chips button', timeout=30000)
        yt.click('#chips button >> nth=0', timeout=10000)
        ok = waitfor(lambda: (lambda s: s if (s and s.get('state') == 1 and s.get('id'))
                              else None)(yt_state(yt)),
                     timeout=25)
        check('W1.1 YouTube playing on the mount', bool(ok), json.dumps(ok) if ok else '')
        vid = ok['id'] if ok else None
        snap(pg, hosts={'youtube': 'mount_left', 'babyboo': 'mount_left'})
        ok = waitfor(lambda: pg.evaluate("window.__vpcDisplaceState().youtube.stopped") is True,
                     timeout=5)
        check('W1.2 resident takes the mount -> YouTube stopped', ok)
        st = yt_state(yt)
        check('W1.3 player hard-stopped (API player gone, embed unloaded)',
              st is not None and st.get('state') is None and
              (st.get('src') or '').startswith('about:blank'),
              json.dumps(st))
        snap(pg, hosts={'youtube': 'mount_left'})
        ok = waitfor(lambda: (lambda s: s and s.get('state') == 2 and s.get('id') == vid)
                     (yt_state(yt)), timeout=25)
        check('W1.4 YouTube back -> same video cued, silent', bool(ok),
              json.dumps(ok) if ok else '')

        # ── Part 2: Shortz (watchdog surface) ──────────────────
        snap(pg, content={'ultrawide': 'wing_shortz'})
        ok = waitfor(lambda: pg.evaluate("window.__vpcDisplaceState().shortz.face") is True,
                     timeout=6)
        check('W2.0 watcher face-up baseline (Shortz on Screen 1)', ok)
        szf, st = play_shortz(pg)
        check('W2.1 Shortz playing a YouTube title via its real UI', bool(st),
              json.dumps(st) if st else '')
        if st:
            t1 = st.get('t') or 0
            time.sleep(1.0)
            st2 = sz_state(szf)
            check('W2.2 Shortz position advancing while face-up',
                  st2 and (st2.get('t') or 0) > t1 + 0.3,
                  f"t {t1:.2f} -> {(st2 or {}).get('t')}")
            snap(pg, content={'ultrawide': 'wing_youtube'})
            ok = waitfor(lambda: pg.evaluate(
                "window.__vpcDisplaceState().shortz.stopped") is True, timeout=5)
            check('W2.3 Shortz displaced -> watcher stopped it', ok)
            samples = []
            for delay in (1.2, 1.2, 1.4):
                time.sleep(delay)
                samples.append(sz_state(szf))
            check('W2.4 Shortz STAYS paused face-down (watchdog gated): samples at ~1.2/2.4/3.8s all state 2',
                  all(s and s.get('yt') == 2 for s in samples),
                  json.dumps([{'yt': s.get('yt'), 't': s.get('t'), 'disp': s.get('disp')}
                              if s else None for s in samples]))
            ts = [(s or {}).get('t') or 0 for s in samples]
            check('W2.5 Shortz position frozen while face-down',
                  max(ts) - min(ts) <= 0.05, f'ts={ts}')
            check('W2.6 Shortz reports its displaced flag', 
                  samples[0] and samples[0].get('disp') is True)
            snap(pg, content={'ultrawide': 'wing_shortz'})
            ok = waitfor(lambda: (lambda s: s and s.get('disp') is False)(sz_state(szf)),
                         timeout=5)
            check('W2.7 Shortz returned -> displaced flag cleared', bool(ok))
            ok = waitfor(lambda: (lambda s: s and s.get('yt') == 1)(sz_state(szf)),
                         timeout=5)
            check('W2.8 Shortz resumes its show on return (its own law)', bool(ok),
                  json.dumps(ok) if ok else '')
        mine = [e for e in errs if 'tools.js' in e or 'shortz' in e or 'youtube.html' in e]
        check('W2.9 no page errors from the touched surfaces', len(mine) == 0,
              '; '.join(mine[:3]))
        b.close()

        # ── Part 2b: proof-the-proof on PRISTINE Shortz ────────
        b, pg, errs = boot(pw, pristine_shortz=True)
        snap(pg, content={'ultrawide': 'wing_shortz'})
        waitfor(lambda: pg.evaluate("window.__vpcDisplaceState().shortz.face") is True,
                timeout=6)
        szf, st = play_shortz(pg)
        check('W2b.1 pristine Shortz playing', bool(st), json.dumps(st) if st else '')
        if st:
            snap(pg, content={'ultrawide': 'wing_youtube'})
            waitfor(lambda: pg.evaluate("window.__vpcDisplaceState().shortz.stopped") is True,
                    timeout=5)
            samples = []
            for delay in (1.2, 1.2, 1.4):
                time.sleep(delay)
                samples.append(sz_state(szf))
            resumed = any(s and s.get('yt') == 1 for s in samples)
            check('W2b.2 BUG REPRODUCED on pristine Shortz: hidden show RESUMES itself (watchdog) — the test detects the defect',
                  resumed,
                  json.dumps([{'yt': s.get('yt')} if s else None for s in samples]))
        b.close()

        # ── Part 3: generic HTML media (browser surface) ───────
        b, pg, errs = boot(pw)
        snap(pg, hosts={'browser': 'screen4'})
        ok = waitfor(lambda: pg.evaluate("window.__vpcDisplaceState().browser.face") is True,
                     timeout=6)
        check('W3.0 watcher face-up baseline (browser on Screen 4)', ok)
        br = [f for f in pg.frames if 'browser.html' in f.url][0]
        br.evaluate("""(u) => {
          const v = document.createElement('video');
          v.id = 'dispTestVid'; v.src = u; v.autoplay = true;
          document.body.appendChild(v);
          return v.play().then(() => 'ok').catch((e) => 'err:' + e.name);
        }""", WAVURI)
        ok = waitfor(lambda: br.evaluate(
            "(() => { const v = document.getElementById('dispTestVid'); return v && !v.paused; })()"),
            timeout=8)
        check('W3.1 generic <video> playing inside the browser surface', bool(ok))
        snap(pg, hosts={'browser': ''})
        ok = waitfor(lambda: br.evaluate(
            "(() => { const v = document.getElementById('dispTestVid'); return v && v.paused; })()"),
            timeout=6)
        check('W3.2 displaced via switcher host map -> generic media paused', bool(ok))
        okst = pg.evaluate("window.__vpcDisplaceState().browser")
        check('W3.3 watcher reports the browser surface stopped',
              okst and okst.get('stopped') is True, json.dumps(okst))
        b.close()

    fails = [n for n, ok, _ in R if not ok]
    print(f"\n==== WIDE RESULT: {len(R) - len(fails)}/{len(R)} passed ====")
    if fails:
        print('FAILED:', *fails, sep='\n  ')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
