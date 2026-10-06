"""End-to-end checks of the built page in headless Chromium.

Usage: python3 tests/browser_test.py [path/to/index.html]   (defaults to dist/index.html)
Needs: pip install playwright && python3 -m playwright install chromium
"""
import pathlib
import sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
page_path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'dist' / 'index.html').resolve()
URL = page_path.as_uri()

# Expected solution results per level: (worst edge error as % of CD, stars). Measured with the level optics.
EXPECTED = [(7.9, 3), (8.8, 3), (14.2, 2), (11.5, 2), (3.5, 3), (14.1, 2)]
TOL = 0.15

failures = []
def check(name, ok, detail=''):
    print(('PASS  ' if ok else 'FAIL  ') + name + (f'  ({detail})' if detail != '' else ''))
    if not ok:
        failures.append(name)

SCORE_JS = "() => { const s = __LP.score(); return { pct: s.pct, stars: s.stars, assisted: __LP.S.assisted, defects: __LP.S.defects.length } }"
CHIP_JS = "i => document.querySelectorAll('.lvl')[i].querySelector('.st').getAttribute('aria-label')"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1360, 'height': 1000})
    page_errors = []
    page.on('pageerror', lambda e: page_errors.append(str(e)))
    page.goto(URL)
    page.wait_for_timeout(1000)

    s = page.evaluate(SCORE_JS)
    check('level 1 loads with raw corner error ≈ 39.2%', abs(s['pct'] - 39.2) < 0.3, round(s['pct'], 2))
    check('solution panel hidden at load', page.locator('#solution').is_hidden())

    # Own work earns stars: paint the four corner serifs by hand with the 3-cell brush.
    page.click('#brushSeg button[data-b="3"]')
    box = page.locator('#maskCanvas').bounding_box()
    cs = box['width'] / 48  # the reticle shows cells 8..55
    for cx, cy in [(23, 23), (40, 23), (23, 40), (40, 40)]:
        page.mouse.click(box['x'] + (cx - 8 + 0.5) * cs, box['y'] + (cy - 8 + 0.5) * cs)
    page.wait_for_timeout(600)
    s = page.evaluate(SCORE_JS)
    check('hand-painted serifs score 3 stars', s['stars'] == 3 and not s['assisted'], round(s['pct'], 2))
    check('hand-painted stars are recorded', page.evaluate(CHIP_JS, 0) == '3 of 3 stars', page.evaluate(CHIP_JS, 0))

    # Every solution: hidden until clicked, scores as expected, never records stars.
    for i, (pct, stars) in enumerate(EXPECTED):
        page.click(f'.lvl[data-l="{i}"]')
        page.wait_for_timeout(250)
        check(f'level {i + 1}: solution hidden until clicked', page.locator('#solution').is_hidden())
        page.click('#solBtn')
        page.wait_for_timeout(150)
        check(f'level {i + 1}: solution panel opens', page.locator('#solution').is_visible() and page.locator('#solSteps li').count() > 0)
        page.click('#solApply')
        page.wait_for_timeout(500)
        s = page.evaluate(SCORE_JS)
        check(f'level {i + 1}: solution scores {pct}% / {stars} stars, no defects',
              abs(s['pct'] - pct) < TOL and s['stars'] == stars and s['defects'] == 0, f"{s['pct']:.2f}%, {s['stars']} stars")
        check(f'level {i + 1}: loaded solution is flagged and not recorded',
              s['assisted'] == 'solution' and page.evaluate(CHIP_JS, i) == ('3 of 3 stars' if i == 0 else '0 of 3 stars'))

    # Assist flag is sticky through edits, undone by Undo, cleared by Reset.
    page.click('.lvl[data-l="1"]'); page.wait_for_timeout(250)
    page.click('#solBtn'); page.click('#solApply'); page.wait_for_timeout(400)
    page.click('#brushSeg button[data-b="1"]')
    page.mouse.click(box['x'] + 2.5 * cs, box['y'] + 2.5 * cs); page.wait_for_timeout(300)
    check('editing a loaded solution keeps it flagged', page.evaluate('__LP.S.assisted') == 'solution')
    page.keyboard.press('Control+z'); page.keyboard.press('Control+z'); page.wait_for_timeout(300)
    check('undo back past the solution clears the flag', page.evaluate('__LP.S.assisted') is False)
    page.click('#solApply'); page.wait_for_timeout(300)
    page.click('#resetBtn'); page.wait_for_timeout(300)
    check('reset clears the flag', page.evaluate('__LP.S.assisted') is False)

    # Applying a solution restores the level optics first.
    page.click('#naChips .chip[data-na="0.55"]'); page.wait_for_timeout(300)
    page.click('#solApply'); page.wait_for_timeout(500)
    check('apply restores NA 0.33', abs(page.evaluate('__LP.S.NA') - 0.33) < 1e-9, page.evaluate('__LP.S.NA'))

    page.click('.lvl[data-l="2"]'); page.wait_for_timeout(250)
    check('panel closes on level change', page.locator('#solution').is_hidden() and page.locator('#solBtn').inner_text() == 'Show solution')
    page.click('#modeSeg button[data-mode="sandbox"]'); page.wait_for_timeout(600)
    check('sandbox hides the solution button', not page.locator('#solBtn').is_visible())

    mobile = browser.new_page(viewport={'width': 400, 'height': 900}, device_scale_factor=2)
    mobile.on('pageerror', lambda e: page_errors.append('mobile: ' + str(e)))
    mobile.goto(URL); mobile.wait_for_timeout(1000)
    mobile.click('.lvl[data-l="5"]'); mobile.click('#solBtn'); mobile.wait_for_timeout(300)
    sw, cw = mobile.evaluate('[document.documentElement.scrollWidth, document.documentElement.clientWidth]')
    check('no horizontal scroll at 400 px', sw <= cw, f'{sw} vs {cw}')

    dark = browser.new_page(viewport={'width': 1360, 'height': 1000}, color_scheme='dark')
    dark.on('pageerror', lambda e: page_errors.append('dark: ' + str(e)))
    dark.goto(URL); dark.wait_for_timeout(800)
    bg = dark.evaluate("getComputedStyle(document.body).backgroundColor")
    check('dark theme applies', bg == 'rgb(14, 16, 20)', bg)

    check('no uncaught page errors', not page_errors, '; '.join(page_errors))
    browser.close()

print(f'\n{len(failures)} failure(s)' if failures else '\nall checks passed')
sys.exit(1 if failures else 0)
