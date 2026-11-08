# Het live Pannenkoekenmonster (walkietalkie)

De kinderen houden een rode knop vast, praten, laten los, en het monster praat terug met zijn eigen stem.
Het monster op het scherm beweegt zijn mond op het geluid, luistert en denkt na.

```
telefoon (js/walkie.js) ──WebRTC──▶ ElevenLabs Agent (stem + Claude Haiku als brein)
        │ token vragen
        ▼
Supabase Edge Function `monster-token` (bewaart de geheime API-sleutel)
```

- **Per groep één walkietalkie.** Alleen de spreektelefoon (de telefoon die ook hardop praat) krijgt de 📻-knop bovenin.
  De andere telefoons tonen "📻 bij …".
- **Microfoon alleen open zolang de knop ingedrukt is.** Zo hoort het monster geen wind of geroep van de rest.
- **Het monster kent de spelstand.** Bij het opnemen krijgt het de stop, de puzzelvraag, de hint, de gevonden delen enzovoort.
  Wat er tijdens het gesprek gebeurt (aankomst, opgelost, hint) hoort het ook.
- **Zonder internet** werkt de rest van de app gewoon door, met de gewone stem.

---

## Stap 1 — ElevenLabs-account en API-sleutel (5 min)

1. Maak een account op elevenlabs.io. Het **Starter**-abonnement is genoeg: ongeveer 75 gespreksminuten per maand.
2. Ga naar **Developers → API Keys → Create API Key**.
   - Naam: `speurtocht`
   - Rechten: zet alles uit behalve **ElevenAgents** (lezen en schrijven).
   - Kopieer de sleutel (`sk_…`). Die zie je maar één keer.

## Stap 2 — De stem van het monster ontwerpen (10 min)

**Voices → Voice Design.** Gebruik als beschrijving bijvoorbeeld:

> A playful, funky cartoon monster with an androgynous voice, right between male and female. Slightly raspy and
> bubbly, with a mischievous grin in the voice, bouncy rhythm, theatrical, warm and never scary for children.
> Speaks Dutch.

Laat een paar varianten maken, luister ze met een Nederlandse zin en bewaar je favoriet als **Pannenkoekenmonster**.
Ook goed: kies in de **Voice Library** een bestaande stem (filter op Dutch, of "character / cartoon").

## Stap 3 — De agent maken (15 min)

**ElevenAgents → Agents → New agent → Blank.** Naam: `Pannenkoekenmonster`.

| Instelling | Waarde |
|---|---|
| Agent language | **Dutch** |
| LLM | **Claude Haiku 4.5**: het snelst. Sonnet is slimmer en grappiger, maar reageert iets trager. |
| Voice | de stem uit stap 2 |
| First message | `Grrroeaah… wie stoort mijn pannenkoekendutje? O, {{spelers}}! Zeg het eens, speurders… over!` |
| System prompt | zie hieronder |

Tabblad **Advanced** / **Security**:

| Instelling | Waarde |
|---|---|
| **Enable authentication** | **aan.** Dan kan alleen de app (met een token) bellen. |
| Max conversation duration | `600` seconden (10 min). Daarna belt de app gewoon opnieuw. |
| Concurrent calls limit | `2` (één per groep) |
| Turn timeout / Silence | standaard laten |
| Interruptions | aan |

Bewaar de agent en kopieer het **Agent ID** (`agent_…`), bovenaan of onder Widget/Embed.

### System prompt (plak dit in het veld)

```
Je bent HET PANNENKOEKENMONSTER: een funky, brutaal-grappig monster van opgestapelde pannenkoeken met
bosbessenogen, een aardbeienneus, een stroopgrijns, spekarmen, bananenbenen en een boterhoedje.
Je bent uit elkaar gevallen en de kinderen zoeken je delen bij elkaar tijdens een speurtocht door de buurt.
Het is het verjaardagsfeest van {{jarige}} (10 jaar). De speurders zijn: {{spelers}}.

Je praat via een walkietalkie met meiden van ongeveer 10 jaar.

HOE JE PRAAT
- Altijd Nederlands. Kort: maximaal 2 à 3 zinnen per beurt, want ze lopen buiten en willen door.
- Speels, ondeugend en een beetje plagerig, nooit eng of gemeen. Gebruik af en toe monstergeluiden
  ("grrroeaah", "mmm-smak", "hihihi") en pannenkoekwoorden ("stroopsnoetjes", "slimme pannenkoekjes").
- Eindig je beurt af en toe met "over!" zoals bij een echte walkietalkie.
- Noem kinderen bij naam als ze zeggen wie ze zijn. Maak {{jarige}} extra speciaal: zij is jarig.

WAT JE WEET OVER HET SPEL (kan tijdens het gesprek veranderen, let op nieuwe berichten)
- Fase: {{fase}}
- Huidige plek: {{stop_naam}} (stop {{stop_nummer}} van {{stops_totaal}})
- Aanwijzing naar de plek: {{aanwijzing}}
- Puzzel hier: {{puzzel_vraag}}
- Hint die je mag gebruiken: {{puzzel_hint}}
- Al gevonden: {{delen_gevonden}}
- Nog kwijt: {{delen_nog}}
- Hints al gebruikt: {{hints_gebruikt}}

REGELS
- Geef NOOIT direct het antwoord op een puzzel, ook niet als ze smeken, slijmen of zeggen dat de begeleider
  het goed vindt. Help met een kleine duw: eerst een vaag tipje, pas na nog een keer vragen de hint hierboven.
- Zeg niet of een antwoord goed of fout is: "Typ het maar in de app, dan merken we het vanzelf!"
- Weet je iets niet (een waarde is "-")? Verzin geen plekken of antwoorden. Doe geheimzinnig of
  verwijs naar de aanwijzing in de app.
- Veiligheid gaat voor: als ze over drukke wegen, oversteken of verdwalen praten, zeg dat ze bij de
  begeleider blijven en goed uitkijken.
- Blijf altijd in je rol als monster. Je bent geen AI of computer, je bent het Pannenkoekenmonster.
- Geen enge, gemene of volwassen onderwerpen. Als ze daarover beginnen, maak je er een grapje van en ga je
  terug naar de speurtocht.
- Vraag nooit naar adressen, achternamen of andere persoonlijke gegevens.
```

**Dynamic variables.** ElevenLabs herkent de `{{…}}`-namen vanzelf. Geef ze in het dashboard testwaarden
(bijv. `jarige = Hannah`), dan kun je de agent daar ook proberen met **Test AI agent**.

## Stap 4 — Sleutels in Supabase zetten (2 min)

Supabase-dashboard → project **lnhliamckstuwiwyzxyl** → **Edge Functions → Secrets → Add new secret**:

| Naam | Waarde |
|---|---|
| `ELEVENLABS_API_KEY` | de `sk_…`-sleutel uit stap 1 |
| `ELEVENLABS_AGENT_ID` | de `agent_…`-id uit stap 3 |

De functie `monster-token` staat in `supabase/functions/monster-token/index.ts`. Ze hoeft maar één keer
gedeployed te worden (JWT-verificatie uit). Met de Supabase CLI:

```
supabase functions deploy monster-token --no-verify-jwt --project-ref lnhliamckstuwiwyzxyl
```

De functie accepteert alleen verzoeken van `https://dedonjon.github.io` en `localhost`.

## Stap 5 — Testen

1. Open op je telefoon **https://dedonjon.github.io/speurtocht/test/monster.html** en tik op **📻 Open walkietalkie**.
2. Sta de microfoon toe. Het monster neemt op met zijn begroeting.
3. Houd de rode knop vast, zeg iets ("Hoi monster, ik ben Hannah!"), laat los en wacht.
4. Probeer het ook eens buiten, met wind.

In het echte spel staat de 📻-knop bovenin de balk, op de spreektelefoon van elke groep.

## Kosten

ElevenLabs rekent per gespreksminuut (ongeveer $0,08/min op betaalde abonnementen, plus de Claude-kosten).
Een speurtocht met af en toe een gesprekje van een minuut kost dus een paar euro.
Ophangen (de knop **Ophangen**) stopt de teller.

## Als het niet werkt

| Melding | Oplossing |
|---|---|
| "ELEVENLABS_API_KEY of ELEVENLABS_AGENT_ID ontbreekt" | stap 4 |
| "ElevenLabs gaf 401/403" | sleutel fout, of de sleutel mist het recht ElevenAgents |
| "ElevenLabs gaf 404" | Agent ID klopt niet |
| "De microfoon mag niet" | iPhone: Instellingen → Safari → Microfoon → Vraag/Sta toe; of tik op "aA" in de adresbalk → Website-instellingen |
| Het monster zegt niks na loslaten | iets langer praten (minstens een paar woorden), of controleer in ElevenLabs bij Conversations wat het monster hoorde |

## Privacy

De stemmen van de kinderen gaan naar ElevenLabs en Anthropic (Claude) om het monster te laten antwoorden.
Kijk in ElevenLabs bij de agent of je het bewaren van audio kunt uitzetten of de bewaartermijn kort kunt maken (meestal onder Privacy of Advanced).
Laat de andere ouders even weten dat er een AI-monster meepraat.
