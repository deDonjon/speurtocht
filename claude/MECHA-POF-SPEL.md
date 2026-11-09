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
