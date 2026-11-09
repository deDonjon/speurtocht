# Operatie Mecha-Pof — verhaal en teksten

Bron voor alle teksten in de app, de walkie en op papier. Gesproken zinnen staan ook in `js/monster-lines.js`
(daar zijn ze leidend; Hannah mag ze daar aanpassen). Toon: grappig, plagerig, lief, mechanisch met keukenwoorden;
nooit eng, gemeen of stoer. Zie `claude/MECHA-POF-SPEL.md`.

---

## 1. Lobby en start

### Wat de kinderen lezen (lobby-scherm)

> **OPERATIE MECHA-POF**
>
> *Bzzzt. Noodsignaal ontvangen.*
>
> Mecha-Pof, de hongerigste keukenrobot van de buurt, wilde voor Hannah de perfecte verjaardagspannenkoek bakken.
> Zijn stroopmeter sloeg in het rood. Zijn jetpack sloeg op hol. En toen: **POF.**
>
> Hij vloog in zeven stukken over de buurt. Alleen zijn processor en zijn radio landden thuis.
> Praten kan hij nog. De rest niet.
>
> Jullie zijn zijn **Reparatieteam**. Vind zijn onderdelen, kraak de puzzels en zet hem weer in elkaar.
> Elk onderdeel geeft hem een kracht terug. Lukt het? Dan... pannenkoeken.
>
> *Log in met je viercijferige code. Wacht op de rest van het team.*

Korte versie (als er weinig ruimte is): *Mecha-Pof is in zeven stukken uit elkaar gevlogen. Jullie zijn zijn
Reparatieteam. Vind de onderdelen, dan bakt hij pannenkoeken. Beloofd. Bliep.*

### Wat Mecha-Pof zegt als het spel start (`LINES.start`, er wordt er één gekozen)

- Bzzzt. Systeem opgestart. Processor: aan. Radio: aan. De rest van mij: kwijt. Reparatieteam, aan de slag!
- Piep! Zes monteurs gedetecteerd. Ik had om zeven gevraagd, maar goed. Zoek mijn onderdelen. Alle zeven.
- Hier spreekt Mecha-Pof. Of wat er van mij over is. Een praatdoos met een stroopvlek. Help me, alsjeblieft. Een beetje snel.
- {jarige}, ik wilde voor jou de perfecte verjaardagspannenkoek bakken. Toen ontplofte ik. Lang verhaal. Ga maar zoeken.
- Reparatieteam, luister. Mijn stroopmeter staat in het rood en mijn jetpack is op hol geslagen. Zet mij weer in elkaar, dan bak ik pannenkoeken. Beloofd. Bliep.

---

## 2. Per onderdeel: briefing (walkie, bij aankomst) en installatie

Briefing = `LINES.walkie.briefing.<deel>`; gaat als `{{begroeting}}` mee als Mecha-Pof belt bij `stop.arrived`.
Installatie = `LINES.installatie.<deel>`; zegt hij als het deel na het schudritueel vastklikt.
(De oude `LINES.deel` = de vondst, blijft bestaan voor het moment van oplossen.)

| deel | monteur | vermogen | app-gevolg |
|---|---|---|---|
| lijf | iedereen | staan | hologram verschijnt |
| ogen | Speurneus | zien | gesproken navigatie, warmer/kouder |
| neus | Kaartlezer | ruiken | hints komen vrij |
| mond | Codekraker | roepen | alarm bij verrassingen, brutalere zinnen |
| armen | Rekenmeester | vastpakken | deel terugpakken van de Kruimelaar |
| benen | Tijdbewaker | lopen | loopt mee op de kaart, finaletimer start |
| hoed | Sleutelbewaarder | vliegen | finale, Mega-Mecha-Pof |

### Lijf — het pannenkoekenpantser
**Briefing:** Krrrk, piep! Signaal sterk. Hier ergens ligt mijn pannenkoekenpantser. Vier lagen, met klinknagels. Zonder lijf ben ik maar een pratend doosje. Dit is de eerste klus, dus iedereen helpt mee. Lukt het, dan kunnen jullie mij eindelijk zien. Over!

**Installatie:**
- Pantser vastgeklikt. Klik, klak, klonk. Ik sta! Wankel, maar ik sta. Jullie kunnen mij nu zien, als hologram. Zwaai maar. Bliep.
- Pannenkoekenpantser gemonteerd. Vier lagen, zestien klinknagels, nul kruimels. Ik voel me weer een echte robot.

### Ogen — de LED-ogen (Speurneus)
**Briefing:** Bzzzt, Mecha-Pof hier. Alles is zwart. Ik heb net sorry gezegd tegen een lantaarnpaal. Mijn LED-ogen liggen bij deze plek. Speurneus, jij bent de monteur. Krijg ik ze terug, dan zeg ik voortaan hoe ver het nog is. Over!

**Installatie:**
- Vizier online. Ik kan weer zien! O. Jullie zijn kleiner dan ik dacht. Vanaf nu zeg ik hoe ver het nog is. Warmer, kouder. Let op mijn radio.
- LED-ogen aan. Scannen links, scannen rechts. Gevonden: zes speurders en een kat die mij raar aankijkt. Ik help jullie nu navigeren.

### Neus — de aardbei-knop (Kaartlezer)
**Briefing:** Piep piep, snuf... niks. Ik ruik helemaal niks. Mijn aardbei-knop ligt hier. Kaartlezer, jij bent de monteur. Zonder neus kan ik geen hints ruiken, en hints ruiken naar warme stroop. Over!

**Installatie:**
- Aardbei-knop erin. Snuif, snuif. Ik ruik weer! Ik ruik stroop, ik ruik modder, en ik ruik... hints. Vanaf nu mag je mij om een hint vragen.
- Neus gemonteerd. Niet op drukken, dan nies ik stoom. Mijn hintsensor werkt weer. Vraag maar, als jullie vastzitten.

### Mond — het luidsprekerrooster (Codekraker)
**Briefing:** Krrr... hoor je dat? Ik praat door een theezeefje. Mijn luidsprekerrooster ligt hier. Codekraker, jij bent de monteur. Met een mond kan ik alarm slaan. En nog brutaler doen. Sorry, niet sorry. Over!

**Installatie:**
- Test, test, één twee. Luidspreker werkt! Nu kan ik alarm slaan als er iets geks gebeurt. En ik kan weer brutaal zijn. Daar heb ik zin in.
- Rooster vastgeschroefd. Eindelijk geen theezeefstem meer. Pas op, speurders: ik heb weer heel veel te zeggen.

### Armen — de spatel en de garde (Rekenmeester)
**Briefing:** Bliep. Ik wil zwaaien, maar er gebeurt niks. Mijn spatel en mijn garde liggen hier. Rekenmeester, jij bent de monteur. Met armen kan ik weer vastpakken. Handig, want er loopt hier een kruimelrobot rond die dingen pikt. Over!

**Installatie:**
- Spatel links, garde rechts. Ik kan weer vastpakken! Als iemand een onderdeel van mij pikt, pak ik het gewoon terug. Hup.
- Armen erop. Even testen: zwaai, draai, klop. Perfect. Klaar om pannenkoeken om te draaien. En om mijn spullen terug te grijpen.

### Benen — de zuigerbenen (Tijdbewaker)
**Briefing:** Pssst... pssst... niks. Mijn zuigerbenen liggen hier, met de pannetjes eraan. Tijdbewaker, jij bent de monteur. Als ik kan lopen, loop ik met jullie mee op de kaart. Maar dan begint ook de klok te tikken. Over!

**Installatie:**
- Zuigers ingeplugd. Pssst, pssst. Ik kan weer lopen! Kijk op de kaart, daar loop ik nu met jullie mee. Op mijn pannetjes.
- Benen geïnstalleerd. Pomp, pomp, pomp. Vanaf nu loop ik mee. Maar mijn jetpack wordt warm, dus de klok tikt. Snel naar huis!

### Hoed — de boterknop en de stroop-jetpack (Sleutelbewaarder, thuis)
**Briefing:** Bzzzt! Thuis! Mijn kern ligt hier, en het laatste stuk ook: mijn boterknop en mijn stroop-jetpack. Sleutelbewaarder, dit is jouw moment. Druk op de knop, dan vlieg ik. Klaar? Over!

**Installatie:** Boterknop ingedrukt. Jetpack: ontsteking. Drie, twee, één... ik zweef! Ik vlieg! Kijk mij eens! Bliep bliep bliep!

---

## 3. Finale: verjaardagsvers en Mega-Mecha-Pof

### Het verjaardagsvers (eigen tekst; `LINES.vers`)

> Bzzzt, mijn lampjes knipperen rood en goud,
> want Hannah is vandaag tien jaar oud!
> Mijn garde draait, mijn spatel zwaait in het rond,
> de stroop loopt bijna uit mijn luidsprekermond.
> Zes speurders zochten mij bij elkaar, stuk voor stuk,
> van pantser tot jetpack: wat een reuzengeluk.
> Dus hiep hiep hoera, en een piep piep erbij:
> voor Hannah de grootste pannenkoek. Van mij!

Idee voor de regie: na de laatste regel roepen alle zes tegelijk "over en sluiten" in de walkie.

### Aankondiging Mega-Mecha-Pof (`LINES.mega`, drie stukjes na elkaar, met galm)

1. Systeemcontrole. Pantser: check. Ogen: check. Neus: check. Mond: check. Spatel en garde: check. Benen: check. Jetpack: check.
2. Stroopmeter... honger... nee wacht. De wijzer gaat voorbij honger. Voorbij heel veel honger. Hij staat op... MEGA.
3. Krrrrr... bzzzzt... BLIEP! Dames en heren, speurders en de jarige: hier is hij. Groter, sterker, plakkeriger. MEGA-MECHA-POF!

Volgorde in de finale: installatie hoed → `mega` 1-2-3 (beeld groeit naar Mega) → `vers` → confetti → `finale` + `finaleHints`.

---

## 4. Verrassingen (`js/monster-lines.js`, voor chat 5)

| sleutel | event | sub-sleutels |
|---|---|---|
| `kruimelaar` | `thief.*` | `start`, `sprong`, `gevangen`, `weg` |
| `kortsluiting` | `storm.*` | `start`, `eind` |
| `dubbelSignaal` | `fork.*` | `start`, `uitslag` |
| `oververhit` | `finale.timer` | `start`, `bijna`, `gered` |
| `wens` | `wish.used` | `gebruikt`, `overslaan`, `hint`, `dansje` |

Ophalen met `pickLine('kruimelaar', { sub: 'start' })` (zelfde mechaniek als `deel`). De Kruimelaar is een klein,
ondeugend kruimelrobotje (een soort stofzuigertje), nooit eng. Zonder armen kan Mecha-Pof het deel niet terugpakken;
dan gebruikt de app `kruimelaar.weg` ("reservelaatje"). Zonder mond geen alarmzin, alleen een piep.

Cacheversies na deze chat: monster 10, walkie 9, lines 5 (audio 7, voice 1 ongewijzigd).
Nieuwe zinnen moeten nog één keer opgenomen worden: test/monster.html → **🎙️ Neem alle vaste zinnen op**
(walkie-briefings niet; die zegt de agent zelf).

---

## 5. Agent (ElevenLabs)

De system prompt in `MONSTER-AGENT.md` (stap 2) is vernieuwd: verhaal, en per onderdeel wat hij wel en niet kan, op
basis van `{{delen_gevonden}}` (labels uit `js/state.js`: het pannenkoekenpantser, de LED-ogen, de aardbei-knop, het
luidsprekerrooster, de spatel en de garde, de zuigerbenen, de boterknop en de jetpack). Belangrijkste regels:
zonder neus geen hint, zonder ogen geen "ik zie jullie", zonder mond kort en krakerig. Vraagt een kind serieus of hij
echt is, dan zegt hij eerlijk dat hij een robot met een computerbrein is. **Moet nog in ElevenLabs geplakt worden.**

---

## 6. Stopteksten (Supabase, tabel `stop`, spel hannah10)

Op 9 november herschreven (aanwijzing + puzzelvraag; coördinaten, namen en antwoorden ongewijzigd, behalve stop 1).
Ook in de seed van `supabase/schema.sql`. Dit zijn nog voorbeeldplekken; chat 6 vervangt ze na de scouting en kan deze
toon aanhouden: Mecha-Pof vertelt in de ik-vorm waar zijn onderdeel ligt en noemt de monteur.

| # | plek | deel | aanwijzing | puzzel |
|---|---|---|---|---|
| 1 | De speeltuin | lijf | Piep! Mijn pannenkoekenpantser is in de speeltuin geland. Zoek de plek waar je het hoogst kunt klimmen. Daar ruikt het naar verbrande stroop. | code: Hoeveel letters heeft STROOPMETER? → **11** (was 19) |
| 2 | De grote boom | ogen | Mijn LED-ogen zijn in de grote boom aan het einde van de straat blijven hangen. Daar knippert iets cyaans tussen de takken. Speurneus, ga voorop! | raadsel: wat wordt natter terwijl het droogt? → handdoek |
| 3 | Het bankje bij het water | neus | Snuf snuf... mijn aardbei-knop is bij het bankje bij het water gerold. Kaartlezer, jij weet de weg. | keuze: wat hoort niet in beslag? → Kaas |
| 4 | De brievenbus | mond | Krrr... mijn luidsprekerrooster is bij de brievenbus op de hoek beland. Hij praat nu tegen de post. Codekraker, haal hem terug! | code: 3 pannenkoeken per dag, hoeveel per week? → 21 |
| 5 | Het lantaarnpaaltje | armen | Mijn spatel en mijn garde hangen bij het lantaarnpaaltje bij het voetpad. Ze zwaaien naar elkaar. Rekenmeester, aan het werk! | memory: Mijn keukenla is omgevallen! |
| 6 | Het hekje | benen | Pssst, pssst... mijn zuigerbenen pompen nog een beetje bij het hekje van het grasveld. Tijdbewaker, let op de klok! | schuif: Mecha-Pof is door elkaar geschud |
| 7 | Thuis | hoed | Bijna compleet! Mijn jetpack wordt warm. Loop terug naar huis, daar wachten mijn boterknop en mijn stroop-jetpack. En pannenkoeken! | opdracht: Sleutelbewaarder drukt op de boterknop, iedereen telt af van tien; begeleider vinkt af |

---

## 7. Briefje voor de ouders (A5)

> **Een robot op het verjaardagsfeest van Hannah**
>
> Beste ouders,
>
> Vrijdag 13 november viert Hannah haar tiende verjaardag met een speurtocht door de buurt rond De Haag in Veghel.
> De meiden lopen in een groepje van zes, samen met mij als begeleider, en zijn ongeveer anderhalf uur onderweg.
> Ze blijven op stoepen en paden en steken alleen samen met mij over. Na zonsondergang lopen we op verlichte plekken.
>
> **Mecha-Pof.** Het verhaal draait om Mecha-Pof, een keukenrobot die in zeven stukken over de buurt is gevlogen.
> De kinderen zoeken zijn onderdelen met een app op drie telefoons. Mecha-Pof praat met ze, ook via een
> walkietalkie-knop in de app. Dat is een AI-stem: de kinderen stellen een vraag, en de robot antwoordt live.
>
> **Hoe dat werkt.** Als een kind op de walkietalkie-knop drukt, gaat wat het zegt naar ElevenLabs (de stem) en
> Anthropic (Claude, de "hersenen"). De robot krijgt alleen de voornamen van de meiden en de stand van het spel.
> Hij vraagt nooit naar adressen, achternamen of andere gegevens, geeft geen antwoorden op puzzels weg en houdt het
> gesprek bij de speurtocht. Vraagt een kind of hij echt is, dan zegt hij dat hij een robot met een computerbrein is.
> Ik bewaar zelf geen opnames, en het bewaren bij ElevenLabs zet ik uit of zo kort mogelijk.
> In de app staan geen foto's van de kinderen.
>
> **Telefoons.** De meiden hoeven zelf niets mee te nemen. Ze krijgen in de app een eigen code.
>
> **Liever niet?** Laat het mij weten. Dan praat uw dochter niet zelf in de walkietalkie en doet ze verder gewoon mee
> met zoeken en puzzelen.
>
> Ophalen: … uur, De Haag 6-D. Vragen? Bel of app Job: … .
>
> Hartelijke groet,
> Job (vader van Hannah)

(A5 = ongeveer 300 woorden; dit past met een normale letter op één kant. Tijd en telefoonnummer zelf invullen.
Vóór het uitdelen: in ElevenLabs bij de agent het bewaren van audio echt uitzetten, zie MONSTER-AGENT.md → Privacy.)
