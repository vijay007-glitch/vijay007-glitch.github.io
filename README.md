# vijay007-glitch.github.io

Personal site and blog, served by GitHub Pages. No build step, no framework: plain HTML, CSS, and JavaScript.

Live site: https://vijay007-glitch.github.io
First post: https://vijay007-glitch.github.io/posts/high-na-euv/

## What's here

```
index.html                     Home page with the list of posts
posts/high-na-euv/index.html   Blog post with the interactive EUV simulator
posts/pnr-command-lab/index.html
                               Blog post that embeds the PnR Command Lab
simulations/pnr-command-lab/   PnR Command Lab: one self-contained page, plus thumb.png
posts/sti-wafer-run/index.html
                               Blog post that embeds the STI Wafer Run
simulations/sti-wafer-run/     STI Wafer Run: one self-contained page (three.js from CDN), plus thumb.png
posts/multi-vt-explorer/index.html
                               Blog post that embeds the Multi-Vt Cell Explorer
simulations/multi-vt-explorer/ Multi-Vt Cell Explorer: one self-contained page, plus thumb.png
posts/chiplet-slicer/index.html
                               Blog post that embeds the Chiplet Slicer
simulations/chiplet-slicer/    Chiplet Slicer: one self-contained page, plus thumb.png
posts/light-painter/index.html
                               Blog post that embeds Light Painter
simulations/light-painter/     Light Painter: one self-contained page (built from light-painter-src/), plus thumb.png
light-painter-src/             Light Painter source, tests and build.py. Not linked from the site.
                               Rebuild: python build.py, then copy dist/index.html to simulations/light-painter/
simulations/inside-the-lut/    Inside the LUT: one self-contained page (built from inside-the-lut-src/), plus thumb.png.
                               Linked from the home page directly, with no post page
inside-the-lut-src/            Inside the LUT source, test.js and build.py. Not linked from the site.
                               Test: node test.js. Rebuild: python build.py, then copy dist/index.html to simulations/inside-the-lut/
assets/css/style.css           Shared styles (light and dark mode)
assets/js/euv-simulator.js     Simulator code
assets/img/                    Screenshots used in the post
assets/favicon.svg             Site icon
404.html                       Page shown for broken links
.nojekyll                      Tells GitHub Pages to serve files as-is
```

## Publishing

1. Create a new public repository on GitHub named exactly `vijay007-glitch.github.io`. Leave "Add a README" unchecked so the first push goes through cleanly.
2. From inside this folder, run:

```
git init
git add .
git commit -m "Launch site with High-NA EUV post"
git branch -M main
git remote add origin https://github.com/vijay007-glitch/vijay007-glitch.github.io.git
git push -u origin main
```

3. In the repository, open Settings, then Pages. Set the source to "Deploy from a branch" and choose `main` with the `/ (root)` folder. The site goes live within a few minutes.

## Changing the display name

The site shows the name "Vijay". To change it, find and replace `Vijay` in `index.html`, `404.html`, and `posts/high-na-euv/index.html`.

## Adding another post

1. Copy `posts/high-na-euv/` to a new folder, such as `posts/my-next-post/`, and replace the article content.
2. Add a new `<a class="post-item">` block to `index.html`, newest first.
