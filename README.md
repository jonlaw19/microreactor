# Interactive Microreactor — 3D model for microreactors.org

A fully interactive, labeled 3D cutaway of a generic sodium-cooled microreactor (10 MWe class).
Built with Three.js. No build step. Four static files.

## What is in this folder

| File | Purpose |
|---|---|
| `index.html` | Page shell, UI markup, Three.js import map (jsDelivr CDN) |
| `styles.css` | All styling (dark technical theme; colors in `:root`) |
| `app.js` | 3D scene, materials, animation, camera, search, labels, cutaway, explode, tour |
| `parts.js` | The 20 labeled parts: names, descriptions, specs, search keywords, explode offsets |
| `godaddy-embed.html` | The ~600-character snippet to paste into GoDaddy |
| `.github/workflows/pages.yml` | Deploys the repo root to GitHub Pages on every push to `main` |

## Features

- Orbit, pan, zoom (mouse or touch). WASD / Q / E free-fly on desktop (Shift = fast).
- Click or tap any part. Search box with keyboard navigation (press `/`).
- 20 labeled components with two-sentence descriptions and key specs.
- Cutaway slider: the section plane always faces the camera.
- Explode slider: components separate; the shield silo splits open.
- X-ray mode: ghosts everything except the selected part.
- Guided tour (`T`), labels toggle (`L`), reset (`R`), fullscreen (`F`).
- Animations: sodium flow particles (hot/cold), rotating control drums, fuel glow, spinning turbine coupling and cooler fans.
- Layer toggles: building, shield, vessels, sodium, solid walls, quality.
- Mobile layout: collapsible parts list, bottom info sheet, lower render quality.

## Hosting

The site deploys from this repo with GitHub Actions on every push to `main`.
Live URL: **https://jonlaw19.github.io/microreactor/**

If the first workflow run fails on the "configure-pages" step, open **Settings → Pages** once and set Source to **GitHub Actions**. Then re-run the workflow from the Actions tab.

## Embed in GoDaddy Website Builder

1. Edit the page on microreactors.org. Add a section and choose **HTML**.
2. Paste the contents of `godaddy-embed.html` into the Custom Code field.
3. Replace `jonlaw19` with your GitHub username.
4. Set the section **height to 700 px** or more. GoDaddy fixes the iframe height, so the model does not grow on its own.
5. Preview, then publish.

The fullscreen button works inside GoDaddy if the HTML section allows it. If GoDaddy blocks it, the button opens the model in a new tab instead.

## Optional: custom subdomain

You can serve the model at `3d.microreactors.org`:

1. In GoDaddy DNS, add a **CNAME** record: host `3d`, value `jonlaw19.github.io`.
2. In the GitHub repo, **Settings → Pages → Custom domain**, enter `3d.microreactors.org` and save. Enable **Enforce HTTPS** after the check passes.
3. Update the iframe `src` in the GoDaddy snippet to `https://3d.microreactors.org/`.

## Edit the content

- **Part names, descriptions, specs, search keywords:** `parts.js`. Each entry is plain text.
- **Tour order:** the `TOUR` array at the bottom of `parts.js`.
- **Colors and fonts:** the `:root` variables at the top of `styles.css`.
- **Title text:** the `.brand` block in `index.html`.
- **Camera home view:** `HOME_POS` and `HOME_TGT` near the top of `app.js`.

After an edit, commit to `main`. GitHub Pages redeploys in about a minute. The GoDaddy embed does not change.

## Technical notes

- Three.js r170 loads from jsDelivr through an import map. No bundler and no npm step.
- All geometry is procedural. All textures are generated in code. No external assets.
- Desktop quality: MSAA 4×, PCF soft shadows, image-based lighting, bloom. Mobile: direct render, no bloom.
- The model is a representative design for education. Values are typical of a 10 MWe class pool-type sodium-cooled design and do not describe a specific product.
- URL flags for testing: `?q=low` forces low quality; `?test=1` disables the render loop (for screenshot tooling).

## Browser support

Current Chrome, Edge, Safari, and Firefox on desktop and mobile. WebGL 2 is required. The page shows a plain message if the 3D engine cannot load.
