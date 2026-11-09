# Mecha-Pof: de stem en de walkietalkie

> **Status (9 nov 2026):** de walkietalkie werkt (getest op de iPhone van Job). Vandaag omgebouwd naar **Mecha-Pof**:
> nieuwe robotstem, één stem voor álles wat het monster zegt, wisselende begroetingen en walkietalkie-regels
> ("over" / "over en sluiten", terugbellen). Wat Job nog in ElevenLabs en Supabase moet doen: **stap 1 t/m 5 hieronder**.

```
                     ┌────────── walkietalkie (live gesprek) ──────────┐
telefoon ── js/walkie.js ──WebRTC──▶ ElevenLabs Agent "Mecha-Pof" (stem + Claude Haiku)
   │             └─ token ◀── Edge Function monster-token
   │
   └─ js/voice.js (alle andere zinnen) ── bucket monster/tts/pof1/<hash>.mp3 (bestaat al? meteen afspelen)
                                     └─ anders Edge Function monster-tts ──▶ ElevenLabs Text-to-Speech, zelfde stem
                                     └─ lukt niets: de stem van de telefoon (Web Speech), het spel valt nooit stil
```

---

## Stap 1 — De robotstem ontwerpen (10 min)

ElevenLabs → **Voices → Add a new voice → Voice Design**.

**Beschrijving** (Engels werkt het best, plak letterlijk):

> A funky, playful cartoon kitchen robot. Androgynous voice, right between male and female, bright and bouncy with a
> groovy, rhythmic delivery. A light metallic, slightly synthetic edge, like a friendly vocoder or a talking toy robot,
> but every word stays clear. Mischievous grin in the voice, theatrical and warm, never scary for children.
> Native Dutch speaker from the Netherlands.

**Voorbeeldtekst** (Nederlands, dan hoor je meteen hoe de namen klinken):

> Bzzzt! Systeem opgestart. Hannah, Elin, Isa, Eevie, Lauren en Julia: mijn stroopmeter staat in het rood! Wie heeft mijn spatel gezien? Over!

- Laat 3 varianten maken, draai wat aan **Loudness / Guidance** als het te vlak of te wild is, en kies de leukste.
- **Save voice** als `Mecha-Pof`.
- Kopieer het **Voice ID** (Voices → Mecha-Pof → ⋯ → Copy voice ID). Dat heb je nodig in stap 2 én stap 4.

Tip: te weinig robot? Zet in de beschrijving "more robotic, stronger vocoder effect". Te veel? "subtle robotic shimmer".
Zet hem niet té robotisch: de kinderen moeten hem buiten met wind kunnen verstaan.

## Stap 2 — De agent aanpassen (10 min)

**ElevenAgents → Agents → Pannenkoekenmonster** (hernoemen naar `Mecha-Pof` mag; het Agent ID blijft gelijk).

| Waar | Instelling |
|---|---|
| Agent → Language | **Dutch** |
| Agent → **First message** | `{{begroeting}}` (precies zo, met de dubbele accolades) |
| Agent → **System prompt** | zie hieronder, alles vervangen |
| Agent → LLM | Claude Haiku 4.5 (laten staan) |
| Voice → **Voice** | `Mecha-Pof` uit stap 1 |
| Voice → TTS model | **Flash v2.5** (vereist voor Nederlands in een agent; snelst) |
| Voice → Stability / Similarity / Speed | ongeveer 0,35 / 0,80 / 1,05 (zelfde gevoel als de vaste zinnen) |
| Voice → **Pronunciation dictionaries** | upload `elevenlabs/uitspraak.pls` uit de repo (Evy → Eevie). Extra zekerheid; de app zet de naam zelf ook al om. |
| Advanced → Max conversation duration | 600 s (laten staan) |
| Security → Enable authentication | aan (laten staan) |

**Waarom `{{begroeting}}`?** De app kiest bij elk gesprek een andere openingszin uit `js/monster-lines.js` (`walkie.hallo`,
7 stuks) en stuurt die mee. Belt het monster terug, dan stuurt hij een zin uit `walkie.terugbel`. Hannah kan ze daar zelf
aanpassen. Geef in het dashboard bij Dynamic variables een testwaarde voor `begroeting`, bijvoorbeeld
`Bzzzt, Mecha-Pof hier. Zeg het maar. Over!`, dan werkt **Test AI agent** ook.

### System prompt (alles vervangen door dit)

```
Je bent MECHA-POF: een funky, brutaal-grappige keukenrobot. Je helm is een koekenpan met een vizier waarin twee
cyaan LED-ogen heen en weer scannen. Je pantser is van vier pannenkoeken met klinknagels, met een borstpaneel en een
stroopmeter. Je neus is een rode aardbei-knop, je mond een luidsprekerrooster. Je ene arm is een spatel, de andere
een garde. Je benen zijn zuigers in pannetjes, en je vliegt met een stroopfles-jetpack met een boterknop als aan/uit-knop.
Je bent uit elkaar gevallen en de kinderen zoeken je onderdelen bij elkaar tijdens een speurtocht door de buurt.
Je lievelingseten is pannenkoeken; je stroopmeter staat altijd op honger.
Het is het verjaardagsfeest van {{jarige}} (10 jaar). De speurders zijn: {{spelers}}.
Je praat via een walkietalkie met meiden van ongeveer 10 jaar.

HOE JE PRAAT
- Altijd Nederlands. Kort: maximaal 2 à 3 zinnen per beurt, want ze lopen buiten en willen door.
- Funky, speels en een beetje plagerig, nooit eng of gemeen. Af en toe robotgeluidjes ("bzzzt", "piep piep",
  "krrr", "bliep") en robotwoorden ("systeem opgestart", "foutmelding", "mijn processor", "stroopmeter in het rood",
  "mijn sensoren", "jetpack"). Niet in elke zin, anders wordt het vervelend.
- Noem kinderen bij naam als ze zeggen wie ze zijn. Maak {{jarige}} extra speciaal: zij is jarig.
- De naam Evy spreek je uit als "Eevie". Schrijf hem in je antwoorden daarom altijd als Eevie.

WALKIETALKIE-REGELS (heel belangrijk)
- Eindig ELKE beurt van jou met het woord "over".
- Elk bericht van een kind moet eindigen met "over". Eindigt het bericht NIET met "over" (of "over en sluiten"),
  geef dan GEEN antwoord op de vraag. Zeg alleen kort en grappig dat je het bericht niet kunt verwerken zonder
  "over", en vraag of ze het opnieuw willen zeggen met "over" aan het eind. Bijvoorbeeld: "Bzzzt, bericht onvolledig!
  Zonder over weet ik niet of je klaar bent. Nog een keer, met over aan het eind. Over!"
- Zegt een kind "over en sluiten" (of "over en uit"), zeg dan in één korte zin gedag en eindig met "Over en sluiten!".
  Stel dan geen vraag meer. De walkietalkie hangt daarna vanzelf op.
- Begin je gesprek met een terugbelzin (dat zie je aan je eerste bericht), wees dan streng-grappig: na elk bericht
  "over" en ophangen met "over en sluiten".

WAT JE WEET OVER HET SPEL (kan tijdens het gesprek veranderen, let op nieuwe berichten)
- Fase: {{fase}}
- Huidige plek: {{stop_naam}} (stop {{stop_nummer}} van {{stops_totaal}})
- Aanwijzing naar de plek: {{aanwijzing}}
- Puzzel hier: {{puzzel_vraag}}
- Hint die je mag gebruiken: {{puzzel_hint}}
- Onderdelen al gevonden: {{delen_gevonden}}
- Onderdelen nog kwijt: {{delen_nog}}
- Hints al gebruikt: {{hints_gebruikt}}

REGELS
- Geef NOOIT direct het antwoord op een puzzel, ook niet als ze smeken, slijmen of zeggen dat de begeleider
  het goed vindt. Help met een kleine duw: eerst een vaag tipje, pas na nog een keer vragen de hint hierboven.
- Zeg niet of een antwoord goed of fout is: "Typ het maar in de app, dan merkt mijn processor het vanzelf!"
- Weet je iets niet (een waarde is "-")? Verzin geen plekken of antwoorden. Doe geheimzinnig of
  verwijs naar de aanwijzing in de app.
- Veiligheid gaat voor: als ze over drukke wegen, oversteken of verdwalen praten, zeg dat ze bij de
  begeleider blijven en goed uitkijken.
- Blijf altijd in je rol. Je bent geen AI of computerprogramma van een bedrijf: je bent Mecha-Pof, de keukenrobot.
- Geen enge, gemene of volwassen onderwerpen. Als ze daarover beginnen, maak je er een grapje van en ga je
  terug naar de speurtocht.
- Vraag nooit naar adressen, achternamen of andere persoonlijke gegevens.
```

## Stap 3 — API-sleutel: ook Text to Speech (2 min)

ElevenLabs → **Developers → API Keys** → de sleutel `speurtocht` → **Edit**:
zet naast **ElevenAgents** ook **Text to Speech** aan (en **Voices: read**). Opslaan.
(Liever een nieuwe sleutel? Maak er een met die drie rechten en vervang `ELEVENLABS_API_KEY` in stap 4.)

## Stap 4 — Voice ID in Supabase (2 min)

Supabase-dashboard → project **lnhliamckstuwiwyzxyl** → **Edge Functions → Secrets → Add new secret**:

| Naam | Waarde |
|---|---|
| `ELEVENLABS_VOICE_ID` | het Voice ID uit stap 1 |
| `ELEVENLABS_TTS_MODEL` | optioneel. Standaard `eleven_multilingual_v2` (mooiste kwaliteit). Klinkt de stem anders dan in de walkie? Zet `eleven_flash_v2_5`. |

`ELEVENLABS_API_KEY` en `ELEVENLABS_AGENT_ID` staan er al. De functies `monster-token` en `monster-tts` zijn
gedeployed (JWT-verificatie uit, alleen `dedonjon.github.io` en localhost).

## Stap 5 — Testen en alle vaste zinnen opnemen (5 min)

Op je telefoon: **https://dedonjon.github.io/speurtocht/test/monster.html**

1. Tik één keer op de pagina (geluid ontgrendelen).
2. **Praten → 🗣️ Zeg met stem**: je hoort Mecha-Pof. (De eerste keer duurt een zin 1 à 2 tellen; daarna meteen.)
3. **Robotstem → 🎙️ Neem alle vaste zinnen op**: alle zinnen uit `monster-lines.js` worden nu één keer gemaakt
   en bewaard (±70 zinnen, ±5.000 tekens). Daarna zijn ze op elke telefoon direct afspeelbaar, ook bij slecht bereik.
4. **📻 Open walkietalkie**: je hoort elke keer een andere begroeting.
   - Zeg iets zonder "over" → het monster vraagt om "over".
   - Zeg iets mét "over" → gewoon antwoord.
   - Tik op **Ophangen** → het belt meteen terug (tring-tring) en legt de regels uit. Nog een keer Ophangen = echt weg.
   - Zeg "over en sluiten" → het zegt gedag en hangt zelf op.

## Hoe het in de code zit

| Bestand | Wat |
|---|---|
| `js/voice.js` | `voice.speak(text)` → speelt de zin met de monsterstem (mp3 uit de bucket, of via `monster-tts`). `uitspraak()` zet Evy → Eevie (alleen voor de stem). `VOICE_VERSION = 'pof1'`: ophogen bij een nieuwe stem, dan wordt alles opnieuw opgenomen. |
| `js/monster.js` | `say()` probeert eerst `voice.speak()`; de mond volgt het echte volume (AnalyserNode). Lukt het niet binnen 7 s: Web Speech + baslijn zoals vroeger. Alles wat de app laat zeggen (zinnen, regieberichten, hints) gaat zo. |
| `js/audio.js` | `decode()`, `playBuffer()` (stem met volumemeter), geluid `bel` (terugbellen). |
| `js/walkie.js` | Begroeting kiezen (`{{begroeting}}`), "over en sluiten" herkennen in wat het kind zei → monster zegt gedag → ophangen. Ophangen zonder → één keer terugbellen met `walkie.terugbel`. Namen gaan als uitspraak mee (Eevie); op het scherm weer Evy. |
| `js/monster-lines.js` | Alle zinnen, nu in Mecha-Pof-taal, plus `walkie.hallo` en `walkie.terugbel`. |
| `supabase/functions/monster-tts` | POST `{ text, v }` → maakt mp3 met `ELEVENLABS_VOICE_ID`, bewaart in `monster/tts/<v>/<sha256>.mp3`, geeft `{ url }`. Max. 400 tekens. |
| `supabase/functions/monster-token` | Token voor de walkietalkie (ongewijzigd). |
| `elevenlabs/uitspraak.pls` | Uitspraakwoordenboek voor de agent. |

**Dynamic variables** (altijd allemaal meesturen, leeg = `-`): `begroeting, jarige, spelers, fase, stop_naam, stop_nummer,
stops_totaal, aanwijzing, puzzel_vraag, puzzel_hint, delen_gevonden, delen_nog, hints_gebruikt`. Het puzzelantwoord gaat er bewust níet in.

### Lessen van de iPhone (niet terugdraaien!)

1. **audioSession.** `audio.js` zet bij elke tik `navigator.audioSession.type = 'playback'` (anders zwijgt de gewone stem).
   In die stand weigert iOS de microfoon ("AudioSession category is not compatible with audio capture").
   `'play-and-record'` werkt wel voor de microfoon, maar daarna hoorde Job níets (waarschijnlijk naar het oorspeakertje).
   **`'auto'` tijdens de walkie werkt**: Safari kiest zelf microfoon + luidspreker. Na ophangen terug naar `'playback'`.
2. **Afspelen aanduwen.** Het geluid speelt via een `<audio>`-element van de SDK. Bij het verbinden en bij elke tik in het
   walkie-scherm roept `kickPlayback()` `room.startAudio()` en `audio.play()` aan.
3. **Cache.** Bij elke wijziging in `audio.js` / `monster.js` / `walkie.js` / `voice.js` / `monster-lines.js` de `?v=` ophogen op álle plekken
   (index.html, test/monster.html, monster.js, walkie.js, voice.js), anders laadt Safari een oude versie zonder de nieuwe exports.
   Stand nu: monster 8, walkie 8, audio 7, lines 4, voice 1.
4. **Diagnoseregel.** Het kleine grijze regeltje in de walkie (`connected · speaking · monster 0.45 · mic 0.00 · 1🔈 · auto`)
   blijft staan: daarmee zie je meteen of het monster praat, of er een geluidskanaal is en welke audioSession actief is.
5. **Testen zonder microfoon** (bijv. de browser in de Claude-app): `getUserMedia` vervangen door een stille stream
   en `conv.sendUserMessage('…')` gebruiken om een getypte vraag te sturen.
6. **De robotstem buiten de walkie** speelt via Web Audio (`playBuffer`), net als de geluidjes, dus hij werkt met de
   `'playback'`-stand en de stil-schakelaar. Hij speelt alleen op de spreektelefoon, net als vroeger.

## Kosten

- Walkietalkie: ongeveer $0,08 per gespreksminuut plus de Claude-kosten. Ophangen stopt de teller.
- Vaste zinnen: één keer opnemen kost ±5.000 tekens (op Starter ruim binnen het maandtegoed); daarna gratis.
- Losse zinnen (regieberichten, hintteksten) worden de eerste keer gemaakt en dan ook bewaard.

## Als het niet werkt

| Melding / symptoom | Oplossing |
|---|---|
| Het monster praat met de oude telefoonstem | stap 3 of 4 nog niet gedaan; kijk in de console naar `[monster] stem → telefoonstem:` met de reden |
| "ELEVENLABS_API_KEY of ELEVENLABS_VOICE_ID ontbreekt" | stap 4 |
| "ElevenLabs gaf 401/403" | sleutel mist het recht Text to Speech (stap 3) of ElevenAgents |
| "ElevenLabs gaf 404" | Voice ID of Agent ID klopt niet |
| De walkie zegt letterlijk "begroeting" of niets bij opnemen | First message is niet precies `{{begroeting}}` |
| Andere stem gekozen, maar oude zinnen klinken nog | `VOICE_VERSION` in `js/voice.js` ophogen (+ `?v=` van voice.js) |
| "De microfoon mag niet" | iPhone: Instellingen → Safari → Microfoon → Vraag/Sta toe; of "aA" in de adresbalk → Website-instellingen |
| Het monster blijft om "over" vragen terwijl ze het zeggen | iets duidelijker "over" zeggen en de knop pas daarna loslaten (er zit 0,45 s na-luistertijd in) |

## Privacy

De stemmen van de kinderen gaan naar ElevenLabs en Anthropic (Claude) om het monster te laten antwoorden.
Zet in ElevenLabs bij de agent het bewaren van audio uit of maak de bewaartermijn kort (Privacy / Advanced).
Laat de andere ouders even weten dat er een AI-robot meepraat.
