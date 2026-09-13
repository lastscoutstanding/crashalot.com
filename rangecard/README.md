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
| `check.html` | Bare validation page for comparing the engine against a reference. Not linked from the app. |

## Deploying under an existing site

Drop the folder into the repo that already serves the site:

```
/               index.html   (the tile page)
/rangecard/     index.html, app.js, ballistics.js, theme.css, theme.js, app.css
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
