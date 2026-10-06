"""Build Light Painter from src/ into one self-contained HTML page.

Usage: python3 build.py [--out DIR]   (DIR defaults to dist/)

Writes:
  DIR/index.html                    standalone page (doctype, head, body) for GitHub Pages
  DIR/light-painter.artifact.html   fragment for a claude.ai artifact; the host adds doctype/head/body
"""
import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'

# Mirrors the base styles the claude.ai artifact host injects. The [hidden] rule is load-bearing:
# panels such as .solution set display:grid, so without it el.hidden = true would not hide them.
BASE_CSS = (':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);'
            'padding-bottom:env(safe-area-inset-bottom,0px)}'
            'body{margin:0}img{max-width:100%}[hidden]{display:none!important}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(ROOT / 'dist'))
    out = pathlib.Path(ap.parse_args().out)

    tpl = (SRC / 'app.template.html').read_text(encoding='utf-8')
    core = (SRC / 'core.js').read_text(encoding='utf-8')
    app = (SRC / 'app.js').read_text(encoding='utf-8')
    for marker in ('/*CORE*/', '/*APP*/'):
        if tpl.count(marker) != 1:
            sys.exit(f'app.template.html must contain {marker} exactly once')

    fragment = tpl.replace('/*CORE*/', core).replace('/*APP*/', app)
    cut = fragment.index('</style>') + len('</style>')
    head, body = fragment[:cut], fragment[cut:]
    page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            f'<style>{BASE_CSS}</style>\n{head}\n</head>\n<body>{body}</body>\n</html>\n')

    out.mkdir(parents=True, exist_ok=True)
    (out / 'index.html').write_text(page, encoding='utf-8')
    (out / 'light-painter.artifact.html').write_text(fragment, encoding='utf-8')
    print(f'built {out / "index.html"} ({len(page)} bytes) and {out / "light-painter.artifact.html"} ({len(fragment)} bytes)')


if __name__ == '__main__':
    main()
