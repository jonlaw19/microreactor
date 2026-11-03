# Microreactor: Interactive 3D Power Plant

A fully interactive 3D world for microreactors.org: a sodium-cooled microreactor (10 MWe class) in its building, the switchyard and transmission line, and the data center campus it powers. Built with Three.js. No build step. Six static files.

Live: **https://jonlaw19.github.io/microreactor/**

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell, controls markup, Three.js import map (jsDelivr CDN) |
| `styles.css` | UI styling. Design tokens mirror aalo.com: warm black, off-white, space grey, Aspekta type |
| `app.js` | Scene, materials, geometry, animation, camera, search, labels, cutaway, explode, tour, start-up |
| `parts.js` | The 51 labeled parts (33 on the main plant, 18 in the demonstration park): names, descriptions, specs, search keywords, explode offsets, tour order |
| `physics.js` | Lumped plant model: drum reactivity, fuel and coolant feedback, pump coast-down, decay heat, trips, batteries, generators |
| `textures.js` | Procedural PBR texture sets: concrete, painted and galvanized metal, brushed steel, asphalt, grass, rubber, water, grime, stains, rust |
| `walk.js` | Walk mode: capsule controller, colliders and walkable surfaces, animated doors, the articulated figure, touch joystick |
| `audio.js` | Synthesized soundscape: transformer hum, turbine whine, cooler fans, data hall, generators, highway, crickets, wind, rain, thunder, footsteps, doors, the SCRAM alarm |
| `cine.js` | The 60-second intro tour: shot-list camera driver, captions, dip-to-black cuts, and the tour script as text |
| `map.js` | Site map, minimap, compass, fast travel, and the field checklist |
| `tools/build-guide.mjs` | Generates the crawlable guide and JSON-LD from `parts.js` into `index.html` |
| `tools/content.mjs` | The written guide: overview essay, FAQ, system intros, reactor-type comparison |
| `tools/build-pages.mjs` | Generates `/guide/` and its pages, `llms.txt`, `llms-full.txt`, and `sitemap.xml` |
| `guide/`, `guide.css` | The generated static pages and their stylesheet |
| `llms.txt`, `llms-full.txt`, `robots.txt`, `sitemap.xml` | Crawler files |
| `og.png` | Social sharing image |
| `godaddy-embed.html` | The ~600-character snippet to paste into GoDaddy |
| `.github/workflows/pages.yml` | Deploys the repo root to GitHub Pages on every push to `main` |

## What the viewer can do

- **Intro tour**: on a first visit the site opens with a 60-second camera flight over the town, the plant, the core, the power train, the data center, the safety systems, and the park, with ten captions. Once the scene is ready, a sunset flyover loops live behind the title card in place of the poster (attract mode): the light aircraft crosses the airfield, the plant, and the town on a banked arc and lines up on a low sun, and the sky, the sun, the fog, the lights, and the grade shift to golden hour (`setGolden` in `app.js`). The loading poster is a frame from it. The tour itself stays on the reactor. Skip is one click, Esc, or Space. Later visits land on the title card with an Enter button and a "Play the 60-second tour" link. `#intro` or `?tour=1` plays it, and Views has an "Intro tour" entry. The shot list lives in `app.js` (`INTRO_CAMS`), the words in `cine.js` (`INTRO_SCRIPT`), and the guide page prints the words.
- Orbit, pan, and zoom with mouse or touch. WASD / Q / E free-fly on desktop (Shift = fast).
- Click or tap any of 33 labeled parts. Search by name (press `/`). Browse the grouped **Parts** list.
- Each part has a two-sentence description and four specs.
- **Cutaway** slider: the section plane always faces the camera. **Explode** slider: components separate and the shield silo splits open.
- **X-ray others**: ghosts everything except the selected part.
- **Tour**: guided pass through all parts. **Start-up**: drums rotate out, the core comes to power, the turbine rolls.
- **Physics**: a live plant model. Turn the drums and watch power settle. Stop the pumps and watch natural circulation take over. Trip the generator and watch batteries, then backup generators, carry the data hall. Drop the rods. Readouts, a 90-second chart, and plain-language explanations of each response. Drums out past about 85% trigger the overpower trip, on purpose.
- **Guide**: the full text of every part in a reading drawer, with "Show in 3D" links.
- **Deep links**: `#core`, `#drums`, `#dchall`, or any part id opens that part. `#view-datacenter` opens a preset view. The URL updates as you click.
- **Walk**: drop onto the site as a hi-vis figure. `W S` walk, `A D` turn and the camera follows, the mouse or a drag looks around, `Shift` runs (6 m/s), `Space` jumps, `E` opens doors, climbs ladders, runs the console, inspects parts, talks to workers, takes the badge and boards the pickup or the plane, `V` switches between third and first person, `Esc` leaves. Doors close behind you. Workers stop and step aside for you. Ladders with safety cages lead to the reactor building roof and the data hall roof. Doors swing, slide, or roll up. You can enter the reactor hall, climb the stair tower to the silo top, read the live video wall in the control room, walk the cold aisles of the data hall, and look around the warehouse and gatehouse. On phones a joystick appears under your left thumb and the right half of the screen looks around. `#walk` opens the page in walk mode.
- **Site map (M)**: a top-down blueprint drawn from the walk colliders, with the roads, fences, pond, labels, workers, and your position and heading. Click open ground or a marker to travel there. A round minimap and a compass strip sit in the walk HUD. Indoors the view switches to first person on its own; V sets your preference for the zone you are in.
- **Field checklist**: sixteen things to find or do on foot (enter the hall, reach the silo top, climb a roof, take the badge, open the keypad, run a console, trip the reactor, walk a cold aisle, visit the gate, the casks, and the three park reactors, talk to a worker, drive the pickup, fly over the plant). Progress shows in the map panel and saves in the browser.
- **Badge and keypad**: the visitor badge sits on the gatehouse counter and goes in your inventory. The reactor hall door has a keypad; the code is the boiling point of sodium in degrees Celsius, and the gatehouse notice board says so. It unlocks for good once done.
- **Drive the pickup**: E at the pickup by the control building. `W S` drive, `A D` steer, `E` gets out. A bicycle model with corner checks against the colliders, a chase camera, and a synthesized engine.
- **Fly the plane**: an airfield north of the road has a 200 m runway, an apron, a hangar, and a light aircraft. E boards it. `W S` set the throttle, `A D` steer on the ground and bank in the air, `Space` or the up arrow climbs, the down arrow dives (`R F` work too), and `Space` brakes on the ground. Full throttle climbs on its own. It rotates past 80 km/h, stalls below about 47 km/h, tops out at 150 m, and turns back at the edge of the world. `V` gives a cockpit view. Land anywhere flat; the HUD shows speed and height. The site map has a fast-travel pin for it.
- **Live gauges**: six canvas panels in the world (net electric, dry cooler, sodium loop, hall load, battery, plant status) redraw from the plant model once a second when you are within 60 m.
- **Workers you can talk to**: press E on a worker for a line about their job. They stop and face you. **L** toggles the headlamp. **P** saves a photo of the frame as a PNG, in walk or orbit mode.
- **Views**: Reactor, Core section, Top-down, Power train, Data center, Whole site, Reactor park, Intro tour.
- **Weather**: calm evening, breezy, or a thunderstorm. Wind moves the leaves, grass, clouds, smoke, and turbines together. The storm darkens the sky, wets the ground, adds rain, and flashes lightning with thunder a moment later.
- **Sound**: a synthesized soundscape with positional sources. Off by default; the Sound button turns it on. Indoors, the outdoor sources duck.
- **A control room you can run**: stand at a console in walk mode and press E. The physics panel opens, and the video wall shows the result. The red button on the centre desk trips the reactor.
- **Life**: workers walk routes between the buildings, a guard keeps the gate, two operators sit at the consoles, birds circle the pond, moths orbit the lamps, and traffic runs on the highway.
- **Light**: fixture cones and dust motes indoors in walk mode, heat haze over the generator stacks, the cooler, and the decay-heat stack, and lightning in a storm.
- **Layers**: building, silo, vessels, sodium, data hall roof, solid walls, quality.
- Animations: sodium flow (hot and cold), electricity flow from generator to servers, rotating control drums, fuel glow, turbine coupling, cooler fans, server LEDs.
- Keys: `/` search · `L` labels · `T` tour · `R` reset · `F` fullscreen · `Esc` close.

## Rendering

- Every surface uses a procedurally generated PBR set (albedo, normal, roughness) from `textures.js`, so there are no texture downloads.
- Image-based lighting comes from the sky itself: a brighter copy of the sky dome plus a sun disc is baked into an environment map at start-up.
- Low sun to the east-north-east, warm key light with three-cascade shadow maps (CSM), cool fill and sky light, ground-truth ambient occlusion (GTAO), and bloom.
- Image stage: AgX tone mapping, a film-style grade (lifted blacks, warm shadows, cool highlights, vignette, fine grain), sun shafts when the sun is on screen, soft shadows, and SMAA anti-aliasing at every quality level. MSAA is added at Medium and above.
- Night sky: a moon with a soft glow, point stars, and a faint Milky Way band. All of them fade near the horizon, toward the sun, and under storm cloud.
- Lamp halos on every fixture head, wall pack, and highway light. They swell in storm air and fade when you stand under them.
- Surfaces: a tileable detail normal blended in near the camera on concrete, paint, panel, galvanized, and asphalt, and edge wear that finds bevels from the curvature of the normal and shows bare metal through the paint.
- Small motion: a flag on the control building and a windsock at the gate, both driven by the shared wind value, vapour off the roof coolers and the dry cooler fans, a sweeping camera on the gatehouse, and a radar bar turning on the control building mast.
- Labels: each label pill sits above its anchor on a hairline leader with an anchor dot, in the style of a technical drawing. The selected part gets a turning dashed ring.
- Beveled edges on boxes and cylinders, hatched caps on the cutaway, grime at wall bases, oil stains, rust streaks, grass tufts and leaf cards that sway in the wind, pond ripples.
- Flags for slower machines: `?q=low` (half resolution), `?detail=low`, `?shadows=0`, `?csm=0` (single shadow map), `?ao=0`, `?rays=0`, `?grade=0`, `?smaa=0`.

## The world

**Reactor plant.** Shield silo with rebar visible on the cut faces, guard and reactor vessels, sodium pool, core with 61 wire-wrapped assemblies and one cut-open pin that shows pellets, reflector with 12 control drums, shutdown rods, EM pumps, IHX units, redan and upper internals, head with drives and bolted flange, RVACS ducts and stack, pipe rack, power conversion skid, dry cooler, bridge crane, stair tower, roof HVAC.

**Grid connection.** Switchyard transformer and switchgear, 69 kV line on steel monopoles with sagging conductors, campus substation with two step-down transformers and a switch house.

**Site.** Control and operations building (hollow, with a two-storey control room, console desks, and a video wall driven by the physics model),  used-fuel cask pad, fire-water tank and pump house, maintenance warehouse (pallet racking, workbench, forklift), gatehouse with barrier and entrance sign, perimeter fence, roads, an airfield with a lit runway, hangar, and windsock, parking with EV chargers, a pond, light poles, and three species of trees (live oak, ashe juniper, mesquite) built from leaf-card canopies with baked shading, branched trunks, and wind. A woodland fills the land beyond the fence. A grid-tie line on lattice towers runs to the horizon. A car drives the site road, a person walks the sidewalk, and the stack beacon blinks.

**Demonstration park.** Through the gate and across the access road, a fenced park holds three sister plants with their own labeled parts, specs, and guide entries. The **heat-pipe reactor** sits in an open transport canister under a canopy: a monolith core, 127 sodium heat pipes, control drums, a heat-pipe heat exchanger, and an open-air Brayton skid. The **gas-cooled reactor** building holds a helium pressure vessel with its circulator, a helium-to-salt heat exchanger, and a TRISO particle cut open in a display case; outside are two molten-salt storage tanks and a steam turbine under a canopy. The **molten-salt reactor** cell has thick concrete walls, a vessel opened to show the graphite core and glowing fuel salt, a fuel pump, a primary heat exchanger, the freeze plug and finned drain tank, an off-gas cabinet, and a steam plant next door. `#view-park` opens the park; `#hp_core`, `#ht_fuel`, `#ms_drain` and the rest deep-link to parts.

**Beyond the fence.** A two-lane access road runs from the gate to a four-lane highway with lit medians and moving traffic. Across the highway: an industrial park with four warehouses, dock doors, parked trailers, roof units, and two glass office towers. To the north-east, a town of lit buildings at the foot of the hills with a water tower and radio masts. To the west, crop fields with fence lines and a farmstead with a barn, silos, and a water tower. On the north-west ridge, six wind turbines turn. Every one of these is instanced or merged: the whole outskirts adds about twenty draw calls and casts no shadows.

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

The site is one interactive page plus a set of static pages that search engines and AI assistants can read without JavaScript. All of them come from the same `parts.js`, so the copy never drifts.

- `/guide/` is the plain-language overview: what a microreactor is, how this plant works, how it stays safe, how it powers the data center, the 60-second tour as text, and a 13-question FAQ with `FAQPage` structured data.
- `/guide/<system>/` is one page per system (reactor core, sodium primary system, safety and shielding, power conversion, site and buildings, grid connection, data center, and the three park reactors). Each part is an H2 with its description, a spec table, and an "Open in 3D" link into the model.
- `/guide/reactor-types/` compares the four designs side by side.
- `llms.txt` lists the pages with one-line summaries, and `llms-full.txt` holds every page as plain text, for AI assistants that read those files.
- `robots.txt` allows the common search and AI crawlers by name. `sitemap.xml` lists every page with dates.
- Every page has a canonical URL, Open Graph and Twitter cards, `TechArticle` and `BreadcrumbList` JSON-LD, and the guide pages add `DefinedTermSet` for their parts. `index.html` keeps the full guide as static HTML inside the drawer and a `noscript` pointer to the pages.

After you edit `parts.js` or the written content in `tools/content.mjs`, regenerate everything:

```
node tools/build-guide.mjs    # the in-app guide drawer and the JSON-LD in index.html
node tools/build-pages.mjs    # /guide/ pages, llms.txt, llms-full.txt, sitemap.xml
```

Two steps only the site owner can do: add `https://microreactors.org/` as a property in Google Search Console and Bing Webmaster Tools, verify it with the DNS or HTML method, and submit `sitemap.xml`. Both tools then report which pages are indexed and which queries bring people in.

The site serves at the apex domain through GitHub Pages (Actions deploy, custom domain set in the repo's Pages settings). Canonicals, the sitemap, and the structured data all use `https://microreactors.org/`.

## Edit the content

- **Part names, descriptions, specs, keywords:** `parts.js`.
- **Tour order:** the `TOUR` array at the bottom of `parts.js`.
- **Colors and type:** the `:root` tokens at the top of `styles.css`.
- **Camera home view and presets:** `HOME_POS`, `HOME_TGT`, and `VIEWS` in `app.js`.
- **Walk spawn point:** `WALK_SPAWN` in `app.js`. Colliders are registered with `addBox`, `addCyl`, `addSurf`, `addRamp` from `walk.js`; walls with openings come from `wallSeg`.
- **Stamp text (top left):** `#stamp` in `index.html`.

Commit to `main`. GitHub Pages redeploys in about a minute. The GoDaddy embed does not change.

## Technical notes

- Three.js r170 via import map from jsDelivr. All geometry is procedural; all textures are generated in code.
- Desktop: MSAA 4×, PCF shadows, image-based lighting, bloom, pixel ratio up to 1.5. Mobile: direct render, lower pixel ratio, lighter geometry.
- URL flags: `?q=low` forces low quality, `?detail=low` uses the lighter geometry set, `?shadows=0` disables shadows, `?test=1` disables the render loop for screenshot tooling.
- The design is representative. Values are typical of a 10 MWe class pool-type sodium-cooled design and of a ~8 MW data center. They do not describe a specific product.

## Browser support

Current Chrome, Edge, Safari, and Firefox on desktop and mobile. WebGL 2 is required. The page shows a plain message if the 3D engine cannot load.
