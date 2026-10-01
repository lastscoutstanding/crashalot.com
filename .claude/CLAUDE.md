# crashalot.com

Persoonlijke projectensite van Bas (CrashALot): een tegelpagina met links naar webapps, plus losse tools en pagina's.
Repo: github.com/lastscoutstanding/crashalot.com, gehost op GitHub Pages (crashalot.com, via `CNAME`).
Stand: 1 oktober 2026, opgezet vanuit een Claude Code-sessie in watchcafe.eu.

## Werkwijze in Claude Code

- Werk direct in deze lokale repo. Begin een taak met `git pull`; Bas past vaak zelf bestanden aan via GitHub (o.a. `domeinen.txt`).
- Eén logische wijziging = één commit. Push pas na akkoord van Bas: de site staat live.
- Testen via `python3 -m http.server 8000`. `domeinen.txt` en `pellets.txt` worden met `fetch` geladen en werken niet via `file://`.
- Werk dit bestand bij na elke grotere wijziging, vooral de secties per onderdeel en "Open punten".

## Architectuur

Vanilla HTML/CSS/JS, geen build-stap. Elke pagina is grotendeels zelfstandig (CSS en JS inline), behalve Range Card. Geen gedeelde nav of thema zoals op watchcafe.eu. Externe bron: Google Fonts op de meeste pagina's.

| Pad | Rol |
| --- | --- |
| `index.html` | Homepage "Projecten": tegels uit de `PROJECTEN`-array in het script (titel, tekst, url, kleur, hoog, nav). Taal: NL |
| `rangecard/` | Range Card: ballistiek/holdover-calculator voor luchtdruk. Eigen `README.md` met alle details |
| `domeinen/index.html` + `domeinen.txt` | Domeinnamen te koop: nep-websiteje per domein met verkooptekst en contactformulier. NL/EN |
| `hoofdkwartier/index.html` | Archief: eerdere homepage in spionagestijl (UV-lamp, codewoord) |
| `guust/index.html` | Archief: eerdere homepage in Guust Flater-stijl ("M'enfin!") |
| `img/` | Afbeeldingen voor de archiefpagina's |

Gelinkte externe projecten: wijnkelder.eu en watchcafe.eu (eigen repo).

localStorage-keys:
- `rc.theme`, `rc.view`, `rc.state`: Range Card (alles met prefix `rc.`).
- `crashalot-taal`: taalkeuze op de domeinenpagina.
- `crashalot-toegang`: ontgrendeld-status van het hoofdkwartier.

## Domeinen

- Inhoud staat volledig in `domeinen.txt`; het formaat staat bovenin dat bestand uitgelegd (`[domein]` + `sleutel: waarde`, `-en`-varianten, `sjabloon`, `tonen`, `vorm`, `verwant`).
- Welk domein getoond wordt: `?d=` / `?domein=` in de URL, anders de hostname (voor domeinen die hierheen doorverwijzen).
- `CONFIG` bovenin het script: contactadres `info@crashalot.com`; `formulierAdres` is leeg, dus het formulier opent het mailprogramma van de bezoeker.
- Vaste UI-teksten NL/EN staan in `TEKSTEN` in het script; taal ook via `?taal=`.

## Range Card

- Lees eerst `rangecard/README.md`. Kernregels daaruit:
  - Geen kleur buiten `rangecard/theme.css`; `app.css` is alleen layout.
  - `ballistics.js` en `reticle.js` hebben geen DOM-afhankelijkheid.
  - Thema's `field` (standaard) en `night`; anti-flash-snippet bovenin `<head>`.
  - Geen merkreticles, bewust. Geen service worker zolang de bestanden nog vaak veranderen.
- `pellets.txt` is de pelletbibliotheek: één pellet per regel, velden gescheiden door `|`, `#` voor commentaar. Een pellet toevoegen = een regel toevoegen, geen codewijziging. Het formaat en de `quality`-waarden (`meas`/`est`/`none`) staan bovenin het bestand.
- `check.html` is een validatiepagina, niet gelinkt vanuit de app.
- UI in het Engels.

## Open punten

- [ ] De root-`README.md` is vrijwel leeg.
