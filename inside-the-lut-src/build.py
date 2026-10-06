import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'
DIST = ROOT / 'dist'

def rd(p): return open(p, encoding='utf-8', newline='').read()
def wr(p, s): open(p, 'w', encoding='utf-8', newline='').write(s)

page=rd(SRC / 'page.html'); core=rd(SRC / 'core.js'); ui=rd(SRC / 'ui.js')
core=core.replace("if (typeof module !== 'undefined') module.exports","if (typeof module !== 'undefined' && module.exports) module.exports")
out=page.replace('/*__CORE__*/', core).replace('/*__UI__*/', ui)
assert '</script>' not in core+ui
DIST.mkdir(exist_ok=True)
wr(DIST / 'inside-the-lut.html', out)
print(len(out))

# Standalone page: a complete document for GitHub Pages. The artifact form above has no
# <html>/<head>/<body> because the artifact platform supplies them (and the reset below).
# The icon link assumes the page is served from simulations/<name>/ on the site, like the other
# simulations; without it the browser requests /favicon.ico and logs a 404 console error.
DESC = ("Type Boolean logic or a small Verilog module and watch an FPGA compile it: gates, "
        "64 LUT SRAM bits, simulated-annealing placement, PathFinder routing with a congestion "
        "heat map, and timing, plus a race against the annealer.")
RESET = ("[hidden]{display:none!important}body{margin:0}img{max-width:100%}"
         ":root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}")
m = re.match(r'(<title>.*?</title>)\s*((?:<link[^>]*>\s*)+)(<style>.*?</style>)\s*(.*)\Z', out, re.S)
assert m, 'page.html no longer starts with title, links, style'
title, links, style, body = m.groups()
assert body.lstrip().startswith('<') and body.count('<script>') == 1
doc = ('<!doctype html>\n<html lang="en">\n<head>\n'
       '<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
       + title + '\n'
       '<meta name="description" content="' + DESC + '">\n'
       '<link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml">\n'
       + links.rstrip() + '\n'
       '<style>' + RESET + '</style>\n'
       + style + '\n</head>\n<body>\n' + body.rstrip() + '\n</body>\n</html>\n')
wr(DIST / 'index.html', doc)
print(len(doc))
