# Operatie Mecha-Pof — spelconcept en bouwplan (9 nov 2026)

Leidraad voor alle bouwchats na de overstap naar Mecha-Pof. Volledige versie met uitleg: Claude Doc "Mecha-Pof — regieplan" (https://claude.ai/artifact/VeVfVs3vVdRDSkFVRSDDes). CONTRACTS.md blijft de technische waarheid; dit document zegt wat we ermee bouwen.

**Datum: het feest is vrijdag 13 november 2026** (Hannah is dinsdag 10 november jarig). Vier bouwdagen; zonsondergang ±16:55.

## Verhaal
Mecha-Pof wilde voor Hannah de perfecte verjaardagspannenkoek bakken. Stroopmeter in het rood, jetpack op hol, in zeven stukken over de buurt gevlogen. Alleen zijn kern (processor + radio) landde thuis: daarom praat hij via de walkietalkie maar kan hij niets. De zes meiden zijn zijn Reparatieteam. Elk gevonden onderdeel geeft hem een vermogen terug.

## Toon (geldt voor alle teksten, geluiden en beelden)
- Grappig, plagerig en zelfspottend; nooit eng, gemeen of stoer-doenerig. Mecha-Pof is onder de indruk van de speurders en geeft dat met tegenzin toe.
- Mechanisch: klikken, piepen, zoemen, stroopmeter, processor die "vastloopt". Robotwoorden blijven keukenwoorden (spatel, garde, stroop, koekenpan); geen wapens of gevechten.
- Geschreven voor zes meiden van tien die hem lief en grappig moeten vinden. Vormen rond en warm: pannenkoekgoud, cyaan LED's, aardbeirood.
- **Mega-Mecha-Pof**: eindvorm als alle zeven delen vastzitten (fase `klaar`): groter, jetpack op volle kracht, stroopmeter op MEGA, stem met lichte galm. Finalebeeld thuis en plaatje voor kaartje/taart (`monsterImage('mega')`). Bestaat maar één avond.

| part | monteur (talent) | vermogen | app-gevolg |
| --- | --- | --- | --- |
| lijf | iedereen (startstop) | staan | 3D-model verschijnt als hologram |
| ogen | speurneus | zien | gesproken navigatie (afstand, warmer/kouder) op de radiotelefoon |
| neus | kaartlezer | ruiken | hints komen vrij |
| mond | codekraker | roepen | alarm bij verrassingen; langere, brutalere zinnen |
| armen | rekenmeester | vastpakken | kan één deel terugpakken van de Kruimelaar |
| benen | tijdbewaker | lopen | loopt mee op de kaart; finaletimer start |
| hoed | sleutelbewaarder | vliegen | finale thuis: opstijgen, confetti, verjaardagsvers, Mega-Mecha-Pof |

Installatieritueel na elke vondst: de monteur van dat deel houdt haar telefoon omhoog en schudt (DeviceMotion; fallback: grote knop); de andere telefoons tonen het deel dat vastklikt.

## Drie telefoons, drie rollen (roteren per stop)
Rol = (stop-volgnummer + index van het toestel in de gesorteerde device-lijst) mod 3.
- radio: Mecha-Pof praat, walkie-knop, inkomende oproepen (vervangt isSpeakerPhone)
- kaart: kaart, afstand, warmer/kouder; andere telefoons zien alleen de aanwijzing
- werkbank: puzzelinvoer en indienen (sleutelbewaarder-regel blijft)
Met 1 of 2 toestellen online vallen rollen samen. Elke puzzel houdt een 1-telefoonvariant.

## Walkie en stem
1. Mecha-Pof belt zelf bij stop.arrived en bij event monster.call (belgeluid, knop Opnemen → walkie met briefing als begroeting).
2. Hints via de walkie: eerst vaag tipje, bij aandringen de hint; telt als hint.
3. Wachtwoordstop: ElevenLabs client tool unlock_stop → sync.solve(). Fallback: codepuzzel.
4. Gesproken navigatie na de ogen, max. eens per 20 s, alleen radiotelefoon.
5. Finale: eigen verjaardagsvers (geen bestaand lied), jetpack, alle zes tegelijk "over en sluiten", Mega-Mecha-Pof.

## Verrassingen (events uit CONTRACTS §2, naam in het verhaal)
thief = de Kruimelaar (kruimelrobot steelt een deel; achtervolging op de kaart; armen pakken terug) · storm = Kortsluiting (30 s vonken tikken op elke telefoon, scores tellen op) · fork = Dubbel signaal (stemmen per telefoon) · finale.timer = Jetpack oververhit · wish = Verjaardagswens (alleen Hannah, één keer: puzzel overslaan, gratis hint of dansje).

## Kader
6 kinderen van 10, 3 telefoons, 1 begeleider (Job). 7 stops, start en thuis aan De Haag, < 2,5 km, 75–90 min. Avondkaart na 16:30, laatste stops verlicht. Alles valt terug op tekst + telefoonstem; de regie kan elke stop vrijgeven.

## Chats (volgorde, afhankelijkheid, model)
1. Verhaal en teksten → claude/STORY.md, monster-lines.js, agent-prompt, stopteksten in Supabase, ouderbriefje — Opus 5.5
2. Rollen en installatie → rolverdeling, installatieritueel, puzzels splits/slot/sync — Fable 5.1
3. Puzzels licht/formatie/qr + printbaar QR-kaartje — Opus 5.5
4. Regiescherm regie.html (daarna regie-functies uit index.html, behalve sleutel-login en Plekken vastleggen) — Fable 5.1
5. Walkie 2.0 + js/surprises.js + badges (na chat 1) — Fable 5.1
6. Plekken verwerken: scout_place → stops (na scouting, zie claude/SCOUTING.md) — Fable 5.1, samen met Job
7. Generale repetitie en checklist — Opus 5.5
8. Mecha-Pof in hoge kwaliteit: Zdog-model afgewerkt en op iPhone getest, hologram-stand, installatie-animaties per deel, Mega-Mecha-Pof, stilstaand beeld voor kaartje/taart (parallel aan 1–4) — Fable 5.1

Planning: scouting ma/di · chats 1–5 en 8 di/wo · plekken verwerken wo · generale do · feest vr 13 nov.
Elke chat leest eerst CONTRACTS.md en dit bestand, verandert CONTRACTS.md niet, hoogt ?v= op volgens MONSTER-AGENT.md, commit op `main` (GitHub is gekoppeld) en zet aan het eind een overdracht onder Status hieronder. Chats die tegelijk in index.html werken (2, 4, 5): eerst `git pull`, kleine commits, en bij een conflict de ander laten staan.

## Status
- 9 nov (regieplan-chat): concept vastgesteld (incl. toon en Mega-Mecha-Pof). Scouting compleet op `main` (d790449): scout.html v2 (foto's rondom, video, inspreken, ideeën), tabel scout_place (migratie uitgevoerd), Edge Function scout-media live.
- 9 nov (chat 1, verhaal en teksten, commit aada323): alles in `claude/STORY.md` (repo + project): lobby-intro, briefing per onderdeel (walkie) en installatiezin per onderdeel, verjaardagsvers (8 regels, eigen tekst), Mega-Mecha-Pof-aankondiging, ouderbrief A5. `js/monster-lines.js`: nieuwe `start`, `installatie.<deel>`, `mega` (3 stukjes), `vers`, `kruimelaar{start,sprong,gevangen,weg}`, `kortsluiting{start,eind}`, `dubbelSignaal{start,uitslag}`, `oververhit{start,bijna,gered}`, `wens{gebruikt,overslaan,hint,dansje}`, `walkie.briefing.<deel>` (als `{{begroeting}}` bij stop.arrived, voor chat 5). Ophalen via `pickLine(sit, {sub})`. ?v nu: monster 10, walkie 9, audio 7, lines 5, voice 1. Agent-prompt in MONSTER-AGENT.md vernieuwd: vermogens per onderdeel via `{{delen_gevonden}}` (zonder neus geen hint, zonder ogen niets zien, zonder mond kort). Stopteksten in Supabase (hannah10) en de seed in `supabase/schema.sql` herschreven, geen spekarmen/boterhoedje meer; stop 1 is nu STROOPMETER → antwoord 11. **Job nog doen:** (1) nieuwe system prompt in ElevenLabs plakken; (2) test/monster.html → 🎙️ alle vaste zinnen opnemen; (3) bewaren van audio bij de agent uitzetten vóór het ouderbriefje uitgaat (+ tijd/telefoon invullen). **Voor andere chats:** test/monster.html toont de nieuwe sub-sleutels (installatie, kruimelaar, …) niet in de keuzelijst (alleen deel/finaleHints); opnemen werkt wel. Let op: puzzelantwoorden staan in `stop.puzzles` en zijn dus leesbaar voor anon (geen `stop_secret` gebruikt) — chat 6 kan ze daarheen verplaatsen.
- 9 nov (chat 3, puzzels licht/formatie/qr + QR-kaartje, commit 58af3c2 e.v.): drie nieuwe puzzels volgens CONTRACTS §3 (pure reduce, 1-telefoonvariant), niet aan index.html gekomen (nieuwe bestanden laden met de bestaande `PUZZLE_V`).
  - `js/puzzles/licht.js` — config `{type:'licht', length:4–6 (5), colors:3–5 (4), speed:ms (750)}`. Zender = toestel `devices[seed % n]` (gesorteerd); die ziet alleen "💡 Zend" (schermvullend knipperen met kleur, symbool ♥★●▲■ en toon) en de voortgang; de andere telefoons bouwen samen na. Laatste kleur = automatisch controleren; fout = poging +1 en leeg. 1 telefoon: zelf knipperen, daarna nabouwen. Zetten `play|tap{c}|undo|clear`.
  - `js/puzzles/formatie.js` — config `{type:'formatie', lat?, lng? (standaard de stop), ring:15, margin:8, loop:20, maxAcc:30}`. 3 tel. = driehoek (vrij draaibaar, elke telefoon ≤ margin van zijn hoek én onderling ≥ ring m, anders telde een kluitje bij het punt ook), 2 tel. = lijn door het punt, 1 tel. = rondje op loop ± margin m (92% van 360°, GPS-sprongen > 80° tellen niet, heen-en-terug heft op). Elke telefoon stuurt stil `{t:'pos', d, lat, lng, acc, ts}` (elke 5 s of 3 m, via `pkm.sync.move` zodat er geen plop klinkt); posities ouder dan 20 s of acc > maxAcc tellen niet. De eerste telefoon die "klopt" ziet stuurt `{t:'done'}` (zet vast, ook als er daarna een telefoon wegvalt). Radar met hoeken, eigen afstand en lijst per telefoon.
  - `js/puzzles/qr.js` — config `{type:'qr', question?, image?, answer? (reserve)}`; de echte code staat in `stop_secret.geheim.qr` (tekst of lijst). Camera met BarcodeDetector, op iPhone jsQR van jsdelivr (`jsqr@1.4.0/+esm`); getypte reserve. Zet `{t:'scan', v, typed?}`; **de server** (nieuwe `puzzle_move`) zet `ok:true|false` erbij (goede code wordt niet bewaard), zonder geheim `ok:null` → terugval op config.answer. Zonder de migratie werkt de puzzel ook (dan alleen met config.answer).
  - Tests: `node test/node-puzzles.mjs` (12 tests) en `test/puzzle-licht|formatie|qr.html` (nep-sync: 1–3 iframes `puzzle-frame.html` delen één moves-array via `test/puzzle-harness.js`; formatie met sleepbare nep-GPS of echte GPS; qr met nep-servercontrole en QR op het scherm). In headless Chrome bekeken: alle drie lossen op.
  - `qr-kaartje.html` (root): A6-kaartjes (of 4 per A4 met snijlijnen), Mecha-Pof met spatel, tekstballon in zijn toon, QR + code in letters, briefje voor voorbijgangers. Haalt met de regiesleutel alle stops met een qr-puzzel en hun code op; 🎲 maakt een code (POF-WOORD-NN) en slaat hem op via `regie_upsert_stop` (geheim). Of codes met de hand typen.
  - **Job nog doen:** migratie `supabase/puzzle_move_qr.sql` uitrollen (SQL Editor; ik mocht de live database niet wijzigen). Daarna bij een stop een puzzel `{"type":"qr"}` zetten, op qr-kaartje.html een code maken en printen. **Op de iPhone testen:** camera + jsQR (Safari vraagt toestemming), knipperen buiten in de schemering, formatie met drie telefoons op een grasveld (eventueel `ring` verkleinen als het veld klein is).
