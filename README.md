# Microreactor — Interactive 3D Power Plant

A fully interactive 3D world for microreactors.org: a sodium-cooled microreactor (10 MWe class) in its building, the switchyard and transmission line, and the data center campus it powers. Built with Three.js. No build step. Four static files.

Live: **https://jonlaw19.github.io/microreactor/**

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell, controls markup, Three.js import map (jsDelivr CDN) |
| `styles.css` | UI styling. Design tokens mirror aalo.com: warm black, off-white, space grey, Aspekta type |
| `app.js` | Scene, materials, geometry, animation, camera, search, labels, cutaway, explode, tour, start-up |
| `parts.js` | The 33 labeled parts: names, descriptions, specs, search keywords, explode offsets, tour order |
| `physics.js` | Lumped plant model: drum reactivity, fuel and coolant feedback, pump coast-down, decay heat, trips, batteries, generators |
| `tools/build-guide.mjs` | Generates the crawlable guide and JSON-LD from `parts.js` into `index.html` |
| `og.png` | Social sharing image |
| `godaddy-embed.html` | The ~600-character snippet to paste into GoDaddy |
| `.github/workflows/pages.yml` | Deploys the repo root to GitHub Pages on every push to `main` |

## What the viewer can do

- Orbit, pan, and zoom with mouse or touch. WASD / Q / E free-fly on desktop (Shift = fast).
- Click or tap any of 33 labeled parts. Search by name (press `/`). Browse the grouped **Parts** list.
- Each part has a two-sentence description and four specs.
- **Cutaway** slider: the section plane always faces the camera. **Explode** slider: components separate and the shield silo splits open.
- **X-ray others**: ghosts everything except the selected part.
- **Tour**: guided pass through all parts. **Start-up**: drums rotate out, the core comes to power, the turbine rolls.
- **Physics**: a live plant model. Turn the drums and watch power settle. Stop the pumps and watch natural circulation take over. Trip the generator and watch batteries, then backup generators, carry the data hall. Drop the rods. Readouts, a 90-second chart, and plain-language explanations of each response. Drums out past about 85% trigger the overpower trip, on purpose.
- **Guide**: the full text of every part in a reading drawer, with "Show in 3D" links.
- **Deep links**: `#core`, `#drums`, `#dchall`, or any part id opens that part. `#view-datacenter` opens a preset view. The URL updates as you click.
- **Views**: Reactor, Core section, Top-down, Power train, Data center, Whole site.
- **Layers**: building, silo, vessels, sodium, data hall roof, solid walls, quality.
- Animations: sodium flow (hot and cold), electricity flow from generator to servers, rotating control drums, fuel glow, turbine coupling, cooler fans, server LEDs.
- Keys: `/` search · `L` labels · `T` tour · `R` reset · `F` fullscreen · `Esc` close.

## The world

**Reactor plant.** Shield silo with rebar visible on the cut faces, guard and reactor vessels, sodium pool, core with 61 wire-wrapped assemblies and one cut-open pin that shows pellets, reflector with 12 control drums, shutdown rods, EM pumps, IHX units, redan and upper internals, head with drives and bolted flange, RVACS ducts and stack, pipe rack, power conversion skid, dry cooler, bridge crane, stair tower, roof HVAC.

**Grid connection.** Switchyard transformer and switchgear, 69 kV line on steel monopoles with sagging conductors, campus substation with two step-down transformers and a switch house.

**Site.** Control and operations building, used-fuel cask pad, fire-water tank and pump house, maintenance warehouse, gatehouse with barrier and entrance sign, perimeter fence, roads, parking with EV chargers, a pond, light poles, and two species of trees. A grid-tie line on lattice towers runs to the horizon. A car drives the site road, a person walks the sidewalk, and the stack beacon blinks.

**Data center campus.** 48 × 22 m data hall with a ghosted roof, 320 racks in hot-aisle pairs with live LED fronts, overhead busway, UPS and electrical room, battery storage containers, backup generators with a fuel tank, six rooftop dry coolers with spinning fans, office annex, loading dock, parking, light poles, trees, perimeter fence, and the module delivery truck.

## Hosting

The site deploys from this repo with GitHub Actions on every push to `main`. Pages is set to **Source: GitHub Actions**.

## Embed in GoDaddy Website Builder

1. Edit the page on microreactors.org. Add a section and choose **HTML**.
2. Paste the contents of `godaddy-embed.html` into the Custom Code field.
3. Set the section **height to 700 px** or more. GoDaddy fixes the iframe height.
4. Preview, then publish.

The fullscreen button works inside GoDaddy if the HTML section allows it. If GoDaddy blocks it, the button opens the model in a new tab.

## Fonts

The stylesheet asks for **Aspekta** (300–600) from `fonts/Aspekta-300.woff2` … `Aspekta-600.woff2`. Those files are not in the repo. Add the four woff2 files from the Aalo theme to a `fonts/` folder and the type switches over. Until then the page uses Inter from Google Fonts.

## Search engines and AI assistants

The guide text for all 33 parts is static HTML inside `index.html`, so crawlers that do not run JavaScript still read it. The page carries a `TechArticle` JSON-LD block with every part as a `DefinedTerm`, Open Graph and Twitter cards, and a canonical URL.

After you edit `parts.js`, regenerate the static guide: `node tools/build-guide.mjs`. Commit the updated `index.html`.

To put the content on your own domain, add a DNS CNAME `3d.microreactors.org → jonlaw19.github.io`, set it as the custom domain in the repo's Pages settings, and update `SITE_URL` in `tools/build-guide.mjs` plus the canonical and OG tags in `index.html`.

## Edit the content

- **Part names, descriptions, specs, keywords:** `parts.js`.
- **Tour order:** the `TOUR` array at the bottom of `parts.js`.
- **Colors and type:** the `:root` tokens at the top of `styles.css`.
- **Camera home view and presets:** `HOME_POS`, `HOME_TGT`, and `VIEWS` in `app.js`.
- **Stamp text (top left):** `#stamp` in `index.html`.

Commit to `main`. GitHub Pages redeploys in about a minute. The GoDaddy embed does not change.

## Technical notes

- Three.js r170 via import map from jsDelivr. All geometry is procedural; all textures are generated in code.
- Desktop: MSAA 4×, PCF shadows, image-based lighting, bloom, pixel ratio up to 1.5. Mobile: direct render, lower pixel ratio, lighter geometry.
- URL flags: `?q=low` forces low quality, `?detail=low` uses the lighter geometry set, `?shadows=0` disables shadows, `?test=1` disables the render loop for screenshot tooling.
- The design is representative. Values are typical of a 10 MWe class pool-type sodium-cooled design and of a ~8 MW data center. They do not describe a specific product.

## Browser support

Current Chrome, Edge, Safari, and Firefox on desktop and mobile. WebGL 2 is required. The page shows a plain message if the 3D engine cannot load.
