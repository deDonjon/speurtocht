# Speurtocht met Mecha-Pof

GPS-speurtocht (web app) voor het tiende verjaardagsfeest van Hannah. Groepjes lopen van plek naar plek, lossen samen puzzels op
en verzamelen de onderdelen van **Mecha-Pof**, een keukenrobot van pannenkoeken (vroeger het Pannenkoekenmonster).
Live op https://dedonjon.github.io/speurtocht/ (GitHub Pages, branch `main`).

| Wat | Waar |
|---|---|
| De app | `index.html` + `js/` (ESM, geen build-stap) |
| Afspraken tussen de onderdelen | `CONTRACTS.md` |
| Stem van Mecha-Pof en de walkietalkie (ElevenLabs) | `MONSTER-AGENT.md` |
| Zinnen van het monster (zelf aan te passen) | `js/monster-lines.js` |
| Server (Supabase: schema en Edge Functions `monster-token`, `monster-tts`) | `supabase/` |
| Uitspraakwoordenboek voor ElevenLabs | `elevenlabs/uitspraak.pls` |
| Testpagina's | `test/monster.html` (monster, stem, walkie), `test/sync.html` |
| 3D-speelbord (route A als hex-eiland, wolken, LED-lijn naar de volgende stop) | `bord.html` (`?kern`, `?regie`, `?demo`), `js/board.js`, `js/board-data.js`; in de app de knop **3D** op de kaart. Three.js staat in `js/vendor/three/`. Echte kaart: `data/osm.json` (anders één keer live uit OpenStreetMap, bewaard op het toestel). Test: `LEAFLET_DIR=… node test/browser-bord.mjs` |
| Scouting (begeleider legt plekken, foto's rondom, video en gesproken notities vast) | `scout.html`, `supabase/scout.sql`, Edge Function `supabase/functions/scout-media` |

Na een wijziging in een JS-bestand: de `?v=` ophogen op álle plekken waar het geladen wordt, anders laadt Safari een oude versie.
