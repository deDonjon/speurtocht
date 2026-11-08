// monster-lines.js — alles wat het Pannenkoekenmonster zegt.
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
//   • Klaar? Hoog daarna het getal achter monster-lines.js?v= op in js/monster.js, en dat achter
//     monster.js?v= in index.html. Anders laten telefoons soms nog de oude zinnen horen.
//
// Sommige situaties hebben zinnen per stemming. 'alle' mag het monster altijd zeggen;
// de andere alleen in die stemming: slaap, wakker, nieuwsgierig, brutaal, compleet.

// Naam die gebruikt wordt als de app (nog) niet weet wie er jarig is, bijvoorbeeld op de testpagina.
export const NAAM_JARIGE = 'Hannah';

export const LINES = {
  // Het spel begint en het monster wordt wakker.
  start: [
    'Hè? Wie maakt mij wakker? O, jullie. Ik ben in stukken gevallen. Zoek ze maar. Als je durft.',
    'Goedemorgen, speurders! Mijn neus ligt ergens in de buurt. En mijn ogen. En eigenlijk alles.',
    'Zes speurders? Ik heb wel eens slimmere pannenkoeken gezien. Bewijs maar dat ik ongelijk heb.',
    '{jarige}, jij bent jarig, dus jij mag vooroplopen. Ik kijk mee. Zodra ik ogen heb.',
  ],

  // Ze zijn bij een plek aangekomen.
  aankomst: [
    'Hier ruik ik iets. Stroop? Nee. Een puzzel!',
    'Jullie zijn er. Nu wordt het pas echt lastig. Hihi.',
    'Stop! Kijk eens goed om je heen. Ik verstop nooit iets zomaar.',
    'Plek gevonden. Maar de puzzel nog niet, hè?',
  ],

  // Een puzzel is goed opgelost.
  goed: {
    alle: [
      'Hmpf. Goed. Dat had ik niet verwacht.',
      'Slim hoor. Slimmer dan een wafel, in elk geval.',
      'Knap gedaan. Zeg het niet tegen de andere pannenkoeken.',
      '{naam}, dat was jij, hè? Ik wist het wel.',
    ],
    brutaal: [
      'Ja ja, goed. Ik doe alsof ik niet onder de indruk ben.',
    ],
  },

  // Een fout antwoord.
  fout: {
    alle: [
      'Haha, nee. Probeer het nog eens.',
      'Fout! Maar wel een leuke poging.',
      'Bijna. Of eigenlijk helemaal niet. Nog een keer!',
    ],
    brutaal: [
      'Nee. Nee nee nee. Denk nog eens na, slimmeriken.',
      'Zelfs mijn spekarm weet dat dat niet klopt.',
    ],
    nieuwsgierig: [
      'Hmm, interessant antwoord. Alleen niet goed.',
    ],
  },

  // Er is een hint gegeven (zonder eigen hinttekst).
  hint: [
    'Oké, één tipje. Maar ik schrijf het op.',
    'Een hint? Goed dan. Ik ben vandaag in een goeie bui.',
    'Psst. Lees de vraag nog eens. Heel goed.',
  ],

  // Een deel van het monster is gevonden. Per deel.
  deel: {
    lijf: [
      'Mijn lijf! Vijf pannenkoeken hoog. Ik voel me al een stuk steviger.',
      'Eindelijk weer een buik. Daar passen straks heel veel pannenkoeken in.',
    ],
    ogen: [
      'Ik kan weer zien! En wat ik zie... valt eigenlijk best mee.',
      'Ogen! Nu kan ik jullie in de gaten houden. Allemaal.',
    ],
    neus: [
      'Een neus! Ik ruik... pannenkoeken. En een beetje modder.',
      'Mijn aardbeienneus. Niet opeten, hè.',
    ],
    mond: [
      'Mijn stroopgrijns is terug. Kijk maar hoe breed.',
      'Eindelijk een mond. Nu kan ik pas echt brutaal zijn.',
    ],
    armen: [
      'Armen! Nu kan ik ze over elkaar slaan. Zo. Heel streng.',
      'Spekarmen! Ze ruiken heerlijk, maar ik deel ze niet.',
    ],
    benen: [
      'Benen! Nu kan ik weglopen. Grapje. Misschien.',
      'Bananenbenen, klaar om te dansen.',
    ],
    hoed: [
      'Mijn boterhoedje! Het smelt een beetje. Dat hoort zo.',
    ],
  },

  // Het is 90 seconden stil (niemand tikt, niets gebeurt).
  stilte: {
    alle: [
      'Hallooo? Ik val bijna weer in slaap.',
      'Ik hoor niks. Zijn jullie stiekem pannenkoeken aan het eten zonder mij?',
      'Lopen, speurders! Mijn delen liggen niet voor altijd te wachten.',
    ],
    brutaal: [
      'Ik tel tot tien. Eén. Twee. Ach, laat ook maar. Schiet nou op.',
    ],
  },

  // Iemand tikt op het monster.
  tik: {
    alle: [
      'Hihi! Dat kietelt!',
      'Hé! Niet aan mijn stroop zitten.',
      'Nog één keer en ik plak aan je vinger.',
      'Draai me niet te hard rond, dan word ik duizelig.',
    ],
    slaap: [
      'Snurk... nog vijf minuutjes...',
    ],
    brutaal: [
      'Pardon? Wie gaf jou toestemming?',
    ],
  },

  // Het monster is compleet.
  finale: [
    'Ik ben compleet! {jarige}, gefeliciteerd. En jullie ook. Tijd voor pannenkoeken!',
    'Helemaal heel! Jullie zijn de slimste speurders die ik ken. Nu: pannenkoeken!',
  ],

  // Na de finale: een plagerij over het aantal hints. Kies op aantal.
  finaleHints: {
    nul: ['En geen enkele hint nodig gehad. Ik ben onder de indruk. Een heel klein beetje.'],
    een: ['Eén hint maar. Eén. Ik tel mee, hoor.'],
    meer: ['{Hints} hints. {Hints}. Ik tel mee.', 'O ja, en {hints} hints. Ik ben het niet vergeten.'],
  },
};

export default LINES;
