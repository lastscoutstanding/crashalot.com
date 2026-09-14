# Range Card

A trajectory and holdover calculator for airguns. Vanilla HTML, CSS and
JavaScript, no build step, no dependencies. Built to be served as a static
folder from GitHub Pages.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page. All markup, no logic. |
| `ballistics.js` | The engine: atmosphere, drag, RK4 integration, zeroing, BC fitting. No DOM. |
| `app.js` | Reads the form, calls the engine, renders readouts, chart and table. Owns profiles. |
| `theme.css` | Every colour in the app, as tokens, one block per theme. |
| `theme.js` | Theme switching and persistence. |
| `app.css` | Layout only. No colours. |
| `pellets.txt` | Pellet library: calibre, brand, model, head size, weight, BC. Plain text, edit by hand. |
| `check.html` | Bare validation page for comparing the engine against a reference. Not linked from the app. |

## Deploying under an existing site

Drop the folder into the repo that already serves the site:

```
/               index.html   (the tile page)
/rangecard/     index.html, app.js, ballistics.js, theme.css, theme.js,
                app.css, pellets.txt
```

Nothing else to configure. GitHub Pages serves subfolders as-is, so it goes
live at `/rangecard/` on the next commit. Link a tile on the home page to
`/rangecard/` and you're done.

## Themes

Themes are selected by the `data-theme` attribute on `<html>`:

- `field` — olive and amber, the default, made for daylight
- `night` — blue-black and reticle red, easier on the eyes on an indoor range

The anti-flash snippet at the top of `<head>` sets the stored theme before the
first paint. Without it you get a flash of the wrong theme on every load.

Adding a third theme (a high-contrast daylight variant, say) takes one block in
`theme.css` and one line in the `THEMES` array in `theme.js`.

One rule keeps this working: no colour may appear anywhere except `theme.css`.
Everything else uses `var(--…)`.

## Storage

Everything lives in `localStorage`, prefixed `rc.` so it never collides with
anything else on the domain:

- `rc.theme` — the selected theme
- `rc.state` — profiles and their values

Profiles export and import as JSON from the Tools panel.

## The pellet library

`pellets.txt` is pipe separated, one pellet per line, `#` for comments. Adding
a pellet is appending a line; no code change needed. The file is fetched at
load, so `file://` won't serve it — test it on the live site or a local server.

The `quality` field says how far to trust the BC: `meas` is a published
measurement, `est` is scaled by weight from a pellet of the same brand, shape
and calibre, and `none` means no defensible figure exists. Picking a `none`
pellet sets the weight and deliberately leaves your BC untouched.

## Accuracy

The engine integrates a point mass with a Mach-dependent drag coefficient. The
G1 table in `ballistics.js` should be checked against a reference before you
trust the output on paper.

Two things matter more than the model for airguns:

1. **Fit your own BC.** Published BCs for diabolo pellets are optimistic and
   the G1 shape fits them poorly. Chrono at the muzzle and again downrange,
   then use the BC fitter.
2. **Verify against groups.** Shoot the card at each distance and adjust. A
   calculator gets you close; the target confirms it.
