# Mecha-Pof — het nieuwe monster (overdracht voor de bouwchat)

> **Besluit (9 nov 2026, Job + Hannah):** het Pannenkoekenmonster wordt **Mecha-Pof**, een keukenrobot.
> Gekozen uit 14 richtingen op het ontwerpcanvas "Pannenkoekenmonster ontwerpen" (artboard **M · Mecha-Pof**).
> Referentietekening: `claude/mecha-pof-reference.svg` (zelfstandige, geanimeerde SVG, 400×460).

## Status (9 nov 2026)

**Het Zdog-model is afgewerkt (chat 8, commit 2118194 op main; `js/monster.js?v=12`).** Dezelfde `createMonster`-API,
pose-velden en landing/praat/walkie-logica als eerder; alle nieuwe standen volgen uit `parts` + `mood`:
- **Afwerking:** klinknagels met glimmertje (alleen aan de zichtbare kant), glans op pannenkoeken, stalen rand, steel, armen en
  jetpack, gloed om de LED-ogen en het vizier die mee-ademt, vier stoompluimen uit de steel, wijzerplaat als echte meter
  (boog 9→3 uur, rood rechts). Hoofd knikt opzij (`headTilt`): ogen, neus en mond hangen aan `m.head`, de boterknop knikt mee.
- **Slaapstand:** op de grond, stroom uit (`power` → LED's gedimd, stand-by-lampje pulseert, antennelampje uit, wijzer in rust,
  armen hangen, zuigers stil); bij wakker worden flikkeren de LED's even. Vijf stemmingen met eigen houding: slaap, wakker,
  nieuwsgierig (voorover, hoofd schuin, volgt de vinger, drukt op de aardbei-knop), brutaal (armen over elkaar, lamel half
  dicht, grijns, kijkt weg en dan strak naar je), compleet (^ ^, stuitert, boterknop in).
- **Hologram** (alleen `lijf` gevonden): pantser half doorzichtig cyaan met scanlijnen, lichte flikker en een lichtring op
  de grond; geluid `holo`.
- **Installatie** (`setParts(parts, { land: deel })`): het deel vliegt van buiten beeld in een boog naar zijn plek, draait om
  zijn as en klikt vast met flits, vonkjes en geluid `vast`; vertrek met `vlieg`. Reduced motion: direct op zijn plek.
- **Mega-Mecha-Pof** (mood `compleet` + alle zeven delen): groter (wereldschaal 0,86 → 0,95), hoger zweven, jetpack vol
  met vlamkrans en gouden lichtring, wijzer trillend in het rood en **MEGA** in LED-letters op het borstpaneel, boterknop
  gloeit; bij de verandering een rondje, vonkjes en geluid `mega`. Stem met lichte galm: `voice.speak(text, { galm: true })`
  → `audio.playBuffer(buf, { galm })` (nagalm + zachte echo; de mp3's blijven dezelfde). `monsterImage('mega')` = stilstaand
  plaatje met raster voor kaartje en taart (300×300 svg-data-URL; knop met download op test/monster.html).
- Cacheversies nu: monster 12, walkie 10, audio 8, lines 5, voice 2, roles 1, install 1, teaser 1, map 5, PUZZLE_V 5.
- Getest in headless Chrome met iPhone-viewport (alle standen, reduced motion, index.html). 312 vormen, 2–3 ms per beeldje
  zonder throttling; met 8× CPU-throttle 20 fps (v10: 24), Mega 15. Canvas-pixelratio gemaximeerd op 2.

Eerder klaar (andere chats): app-stijl/werkplaats-thema, kaart, ballon, walkie-stijl, PARTS, geluiden, de stem overal
(monster-tts, voice.js), zinnen in robottaal en de nieuwe agent-prompt in MONSTER-AGENT.md.
De ElevenLabs-kant is op 9 november door Job ingesteld en getest (robotstem, agent-prompt, first message `{{begroeting}}`,
Voice ID in Supabase, vaste zinnen opgenomen).

**Nog te doen (Job, op de iPhone 11):** test/monster.html → regel bovenin (fps ≈ 60, ms < 8) in stand wakker, Mega en
tijdens 🗣️ praten met stem (mond moet het volume volgen zonder haperen); 🔧 Installatie-demo; ⚡ Mega-plaatje. Hapert het
alleen bij Mega: in `applyPose` `megaFlame`/`megaRing` uitzetten of de wereldschaal bij Mega op 0,90 zetten.

## 1. Wat Mecha-Pof is

Een robot in elkaar gezet uit de keukenla, op een donkerblauwe "werkplaats"-achtergrond met rasterlijnen.
Hij zweeft (jetpack), scant met zijn ogen, en zijn stroopmeter slaat uit. Tekst onderin: `SYSTEEM: HONGER 97%`.

| Deel (`part`) | Wat het is | Kleuren |
|---|---|---|
| `lijf` | Pantser van **vier pannenkoeken** met klinknagels, met een nek van gietijzer en een **borstpaneel** (gietijzer) met ronde **stroopmeter** (wijzer, oranje/rode boog, "STROOP") en twee LED'jes (groen, rood) | pannenkoek `#F2BE62`/`#C9792C`/`#9A5419`, gietijzer `#2F3542`→`#171B24`, staal `#E6EBEF`/`#8E979F` |
| `ogen` | **Koekenpanhelm** (grote donkere schijf met stalen rand, de **steel** steekt rechtsboven uit) met een **vizier** waarin twee cyaan **LED-ogen** heen en weer scannen; bovenop een korte antenne met rood knipperlampje | vizier `#0E1B2E`→`#1E3352`, LED `#7FE8FF` (gloed), lampje `#E0473C` |
| `neus` | Rode **aardbei-knop** met stalen rand | `#E0352B` |
| `mond` | **Luidsprekerrooster**: donkere afgeronde balk met 7 cyaan streepjes, daaronder een stalen glimlachlijn | `#0E1B2E`, `#7FE8FF` |
| `armen` | Links: **spatel** (stalen schouderblok, buis, spatelblad met sleuven), zwaait. Rechts: **garde** (ellipsen van draad) die rondjes draait | staal |
| `benen` | Twee **zuigers** (stalen buizen die op en neer gaan) in gietijzeren voeten die **pannetjes** zijn (met steeltje naar buiten en een pannenkoek erin) | staal/gietijzer, pannenkoek |
| `hoed` | **Stroopfles-jetpack** (schuin op de rug, etiket STROOP, rode dop, stalen beugel) met een **flakkerende vlam** eronder, plus de **boterknop** (aan/uit-knop, geel blokje met power-symbool) bovenop de helm | fles `#A24C14`/`#3E1604`, vlam `#FFF1A6`→`#F59E2E`, boter `#FFF7CC`/`#F3D460` |

Sfeer: lief en grappig, mechanisch maar rond en warm (ronde vormen, geen scherpe tanden, niets engs). Geen bestaande robotfiguren nadoen.

## 2. Beweging

- **Zweven**: hele robot op en neer, schaduw krimpt mee. **Vlam** flakkert. **Ogen** scannen. **Lampje** knippert; LED'jes om en om.
- **Garde** draait; **spatel** zwaait; **zuigers** pompen; **stroopmeter**-wijzer slaat uit; **stoom** uit de steel.
- **Slaap**: op de grond, stroom uit. **Hologram**: alleen het pantser, doorzichtig. **Mega**: groter, vol gas, MEGA op de meter.

## 3. Hoe het in de app zit (lees `CONTRACTS.md` en `js/monster.js`)

```
createMonster() → { el, setParts(parts,{land}), setMood(mood), setSize(sm|md|lg), say(text,{ms,voice}), react(kind), live(phase,{out,in}), destroy() }
monsterImage(parts?) → data-URL (stilstaand; schuifpuzzel)   monsterImage('mega') → Mega-Mecha-Pof (kaartje, taart)
PART_KEYS = lijf ogen neus mond armen benen hoed   MOODS = slaap wakker nieuwsgierig brutaal compleet
Extra (testpagina): mon.status → { holo, mega, power, landing, frameMs, shapes }; mon.line(sit, sub)
```

Lessen uit de bouw (Zdog):
- Een `Z.Anchor` met `visible:false` verbergt zijn kinderen níet; gebruik een `Z.Group` voor alles wat aan/uit moet.
- Benen en pantser zitten samen in één Group (vaste tekenvolgorde); de diepte van die Group is vastgezet op het midden
  van het lijf, anders schuift het borstpaneel het gemiddelde naar voren en verdwijnt het gezicht erachter. Gevolg: een deel
  dat vóór die Group invliegt wordt nog door het hoofd overtekend; daarom komen de benen van linksonder en het lijf van links.
- De voorkant van de pan telt voor de diepte 6 eenheden naar achter (`sink`), anders vallen neus en rooster er soms achter.
- Klinknagels en borstpaneel worden verborgen als ze van je af wijzen (`cos(a - yaw)`), net als vroeger de stroopdruppels.
- `Ellipse` met `quarters` telt vanaf 12 uur met de klok mee; `rotate.z` positief draait op het scherm met de klok mee.
- Doorzichtige (rgba) vlakken zijn duur om te tekenen; glans als dekkende lichtere kleur is bijna gratis. Kleur-strings
  alleen opnieuw zetten als de waarde merkbaar verandert (`powerApplied`, `glowApplied`), niet elk beeldje.
