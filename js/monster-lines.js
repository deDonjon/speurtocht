// monster-lines.js — alles wat Mecha-Pof zegt (de keukenrobot, vroeger het Pannenkoekenmonster).
//
// ✏️  ZELF AANPASSEN (Hannah, dit is jouw bestand!)
//   • Elke zin staat tussen 'aanhalingstekens' met een komma erachter.
//   • Wil je een zin erbij? Kopieer een regel en verander de woorden.
//   • Wil je een zin weg? Haal de hele regel weg.
//   • Gebruik geen ' in een zin (dus niet: "zo'n"), of zet er een \ voor: 'zo\'n'.
//   • {jarige} wordt de naam van de jarige (dat ben jij).
//   • {naam} wordt alleen ingevuld als jij het was die iets deed. Is het iemand anders,
//     dan kiest het monster gewoon een andere zin. Het monster noemt alleen jou bij naam.
//   • {hints} en {Hints} worden het aantal hints in woorden ("vier" / "Vier").
//   • {spelers} (alleen bij de walkietalkie) wordt de lijst met namen.
//   • Klaar? Hoog daarna het getal achter monster-lines.js?v= op in js/monster.js, js/walkie.js en
//     test/monster.html, en dat achter monster.js?v= in index.html. Anders laten telefoons soms nog de oude zinnen horen.
//   • Elke nieuwe zin wordt de eerste keer met de robotstem opgenomen (een paar tellen wachten), daarna gaat het meteen.
//
// Sommige situaties hebben zinnen per stemming. 'alle' mag het monster altijd zeggen;
// de andere alleen in die stemming: slaap, wakker, nieuwsgierig, brutaal, compleet.

// Naam die gebruikt wordt als de app (nog) niet weet wie er jarig is, bijvoorbeeld op de testpagina.
export const NAAM_JARIGE = 'Hannah';

export const LINES = {
  // Het spel begint en het monster wordt wakker.
  start: [
    'Bzzzt. Systeem opgestart. Waar is de rest van mij? O nee. Overal verspreid. Zoek mijn onderdelen. Als je durft.',
    'Goedemorgen, speurders! Mijn vizier, mijn spatel, mijn jetpack: allemaal kwijt. Aan de slag!',
    'Zes speurders gedetecteerd. Slimheid: onbekend. Bewijs maar dat jullie slimmer zijn dan een broodrooster.',
    '{jarige}, jij bent jarig, dus jij mag vooroplopen. Ik kijk mee. Zodra ik weer ogen heb.',
  ],

  // Ze zijn bij een plek aangekomen.
  aankomst: [
    'Piep piep! Mijn sensoren slaan uit. Hier ligt een puzzel.',
    'Doel bereikt. Nu wordt het pas echt lastig. Hihi, bzzt.',
    'Stop! Scan de omgeving. Ik verstop nooit iets zomaar.',
    'Plek gevonden. Puzzel nog niet. Rekenen, speurders!',
  ],

  // Een puzzel is goed opgelost.
  goed: {
    alle: [
      'Antwoord geaccepteerd. Dat had mijn processor niet verwacht.',
      'Slim hoor. Slimmer dan een tosti-ijzer, in elk geval.',
      'Correct! Zeg het niet tegen de andere keukenrobots.',
      '{naam}, dat was jij, hè? Mijn sensoren wisten het al.',
    ],
    brutaal: [
      'Ja ja, goed. Ik doe alsof mijn lampjes niet knipperen van trots.',
    ],
  },

  // Een fout antwoord.
  fout: {
    alle: [
      'Errrr. Fout. Probeer het nog eens.',
      'Bzzzt, nee! Maar wel een leuke poging.',
      'Bijna. Of eigenlijk helemaal niet. Opnieuw opstarten en nog een keer!',
    ],
    brutaal: [
      'Nee. Nee nee nee. Zelfs mijn garde weet dat dat niet klopt.',
      'Foutmelding! Denk nog eens na, slimmeriken.',
    ],
    nieuwsgierig: [
      'Hmm, interessante berekening. Alleen niet goed.',
    ],
  },

  // Er is een hint gegeven (zonder eigen hinttekst).
  hint: [
    'Oké, één tipje. Maar het wordt opgeslagen in mijn geheugen.',
    'Een hint? Goed dan. Mijn stroopmeter staat vandaag op vrolijk.',
    'Psst. Lees de vraag nog eens. Heel langzaam. Zoals een robot.',
  ],

  // Een deel van het monster is gevonden. Per deel.
  deel: {
    lijf: [
      'Mijn pannenkoekenpantser! Vier lagen dik. Ik voel me al een stuk steviger.',
      'Mijn borstpaneel zit erin. De stroopmeter werkt weer. Hij staat op honger.',
    ],
    ogen: [
      'Vizier online! Ik kan weer zien. En wat ik zie... valt eigenlijk best mee.',
      'Mijn LED-ogen scannen weer. Links. Rechts. Ik hou jullie in de gaten. Allemaal.',
    ],
    neus: [
      'Mijn aardbei-knop! Druk er niet op, hè. Dan ga ik niezen.',
      'Neus gemonteerd. Ik ruik... pannenkoeken. En een beetje modder.',
    ],
    mond: [
      'Luidspreker aangesloten. Test, test. Hoor je hoe brutaal ik nu kan klinken?',
      'Eindelijk een mond. Nu kan ik pas echt praten. En eten.',
    ],
    armen: [
      'Mijn spatel en mijn garde! Klaar om pannenkoeken om te draaien.',
      'Armen erop! Nu kan ik ze over elkaar slaan. Zo. Heel streng.',
    ],
    benen: [
      'Zuigerbenen geïnstalleerd. Pssst, pssst. Ik kan weer lopen!',
      'Benen! Met pannetjes als schoenen. Heel modern.',
    ],
    hoed: [
      'Mijn boterknop en mijn stroop-jetpack! Ontsteking... en ik zweef!',
    ],
  },

  // Het is 90 seconden stil (niemand tikt, niets gebeurt).
  stilte: {
    alle: [
      'Hallooo? Mijn batterij gaat bijna in de slaapstand.',
      'Ik hoor niks. Zijn jullie stiekem pannenkoeken aan het eten zonder mij?',
      'Lopen, speurders! Mijn onderdelen liggen niet voor altijd te wachten.',
    ],
    brutaal: [
      'Aftellen gestart. Tien. Negen. Ach, laat ook maar. Schiet nou op.',
    ],
  },

  // Iemand tikt op het monster.
  tik: {
    alle: [
      'Hihi! Bzzt! Dat kietelt in mijn draadjes!',
      'Hé! Niet aan mijn knoppen zitten.',
      'Nog één keer en ik zet mijn garde aan.',
      'Draai me niet te hard rond, dan raken mijn tandwielen in de war.',
    ],
    slaap: [
      'Zzzz... stand-by... nog vijf minuutjes...',
    ],
    brutaal: [
      'Pardon? Toegang geweigerd.',
    ],
  },

  // Het monster is compleet.
  finale: [
    'Alle systemen compleet! {jarige}, gefeliciteerd. En jullie ook. Tijd voor pannenkoeken!',
    'Helemaal heel! Jullie zijn de slimste speurders in mijn hele geheugen. Nu: pannenkoeken!',
  ],

  // Na de finale: een plagerij over het aantal hints. Kies op aantal.
  finaleHints: {
    nul: ['En geen enkele hint nodig gehad. Ik ben onder de indruk. Een heel klein beetje.'],
    een: ['Eén hint maar. Eén. Het staat in mijn logboek, hoor.'],
    meer: ['{Hints} hints. {Hints}. Het staat in mijn logboek.', 'O ja, en {hints} hints. Ik ben het niet vergeten. Robots vergeten nooit.'],
  },

  // Walkietalkie. 'hallo' is wat het monster zegt als het opneemt (er wordt er één gekozen).
  // 'terugbel' zegt het als het terugbelt omdat er niet met "over en sluiten" is opgehangen.
  // Laat elke zin eindigen op "over" (behalve 'terugbel'), zo leren ze het vanzelf.
  walkie: {
    hallo: [
      'Bzzzt, krrr... Mecha-Pof hier. Wie stoort mijn stroopmeter? O, {spelers}! Zeg het maar, en eindig met over. Over!',
      'Piep! Verbinding gemaakt. Met Mecha-Pof, de hongerigste keukenrobot van de buurt. Wat is er, speurders? Over!',
      'Grrr-bzzt... ik was net aan het opladen. {jarige}, ben jij dat? Praat maar, en vergeet niet: over. Over!',
      'Hallo hallo, hier keukenrobot Mecha-Pof, ik ontvang jullie luid en duidelijk. Vertel. Over!',
      'Krrrk... systeem wakker. Mijn garde draait al. Wat willen jullie weten, speurders? Over!',
      'Mecha-Pof meldt zich! Stroopmeter op zevenennegentig procent honger. Zeg het maar. Over!',
      'Bliep bloep. Inkomend bericht van {spelers}? Ik luister met al mijn antennes. Over!',
    ],
    terugbel: [
      'Bzzzt! Hé, niet zomaar ophangen! Bij een walkietalkie eindig je elk bericht met over. En stoppen doe je met over en sluiten. Probeer maar. Over!',
      'Piep piep, ik bel terug! Jullie hingen op zonder over en sluiten. Dat mag niet van de robotregels. Zeg aan het eind van een bericht over, en als je klaar bent: over en sluiten. Over!',
      'Krrr, verbinding hersteld. Afspraak is afspraak, speurders: na elk bericht zeg je over, en om op te hangen zeg je over en sluiten. Nu jullie. Over!',
    ],
  },
};

export default LINES;
