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
//   • {spelers} (alleen bij de walkietalkie) wordt de lijst met namen; {naam} in walkie.oproep wordt voor wie hij belt.
//   • {afstand} (alleen bij navigatie) wordt het aantal meters.
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
    'Daar gaan we! Mijn brein doet het en mijn radio ook. De rest van mij ligt ergens buiten. Reparatieteam, succes!',
    'Piep! Even tellen... één, twee, drie, vier, vijf, zes monteurs. Mooi, iedereen is er. Zoek mijn zeven onderdelen. Ik reken op jullie!',
    'Hier Mecha-Pof. Of wat er van mij over is: een praatdoos met een stroopvlek. Helpen jullie mij? Graag een beetje snel.',
    '{jarige}, ik wilde voor jou de mooiste verjaardagspannenkoek bakken. En toen deed ik pof. Ga maar gauw zoeken, dan komt het helemaal goed.',
    'Reparatieteam, luister. Zetten jullie mij weer in elkaar? Dan bak ik straks pannenkoeken voor iedereen. Beloofd. Bliep.',
  ],

  // Een onderdeel is net vastgeklikt (na het installatieritueel). Per deel: welk vermogen hij terugkrijgt.
  installatie: {
    lijf: [
      'Pantser vastgeklikt. Klik, klak, klonk. Ik sta! Wankel, maar ik sta. Jullie kunnen mij nu zien, als hologram. Zwaai maar. Bliep.',
      'Pannenkoekenpantser gemonteerd. Vier lagen, zestien klinknagels, nul kruimels. Ik voel me weer een echte robot.',
    ],
    ogen: [
      'Vizier online. Ik kan weer zien! O. Jullie zijn kleiner dan ik dacht. Vanaf nu zeg ik hoe ver het nog is. Warmer, kouder. Let op mijn radio.',
      'LED-ogen aan. Scannen links, scannen rechts. Gevonden: zes speurders en een kat die mij raar aankijkt. Ik help jullie nu navigeren.',
    ],
    neus: [
      'Aardbei-knop erin. Snuif, snuif. Ik ruik weer! Ik ruik stroop, ik ruik modder, en ik ruik... hints. Vanaf nu mag je mij om een hint vragen.',
      'Neus gemonteerd. Niet op drukken, dan nies ik stoom. Mijn hintsensor werkt weer. Vraag maar, als jullie vastzitten.',
    ],
    mond: [
      'Test, test, één twee. Luidspreker werkt! Nu kan ik alarm slaan als er iets geks gebeurt. En ik kan weer brutaal zijn. Daar heb ik zin in.',
      'Rooster vastgeschroefd. Eindelijk geen theezeefstem meer. Pas op, speurders: ik heb weer heel veel te zeggen.',
    ],
    armen: [
      'Spatel links, garde rechts. Ik kan weer vastpakken! Als iemand een onderdeel van mij pikt, pak ik het gewoon terug. Hup.',
      'Armen erop. Even testen: zwaai, draai, klop. Perfect. Klaar om pannenkoeken om te draaien. En om mijn spullen terug te grijpen.',
    ],
    benen: [
      'Zuigers ingeplugd. Pssst, pssst. Ik kan weer lopen! Kijk op de kaart, daar loop ik nu met jullie mee. Op mijn pannetjes.',
      'Benen geïnstalleerd. Pomp, pomp, pomp. Vanaf nu loop ik mee. Maar mijn jetpack wordt warm, dus de klok tikt. Snel naar huis!',
    ],
    hoed: [
      'Boterknop ingedrukt. Jetpack: ontsteking. Drie, twee, één... ik zweef! Ik vlieg! Kijk mij eens! Bliep bliep bliep!',
    ],
  },

  // ---------------------------------------------------------------- onboarding thuis (kern.html, chat 7)
  // De kern ligt in slaapstand op de laptop; de begeleider tikt op de wekknop (regie.html).
  wek: [
    'Bzzzt... hé! Wie maakt mij daar wakker? Wacht even. Ik hoor zes stemmen en heel veel gegiechel. Dan is dit het feest van {jarige}! Gefeliciteerd, {jarige}. Tien jaar alweer. En welkom allemaal, fijn dat jullie er zijn.',
  ],
  // Het verhaal van Mecha-Pof, meteen na de wekzin. Eén zin per plaatje op het kernscherm (INTRO in kern.html, zelfde volgorde):
  // wie hij is · wat er misging · waar zijn onderdelen zijn · wat het team gaat doen. {jarige} = naam van de jarige.
  intro: [
    'Ik zal me even voorstellen. Ik ben Mecha-Pof, een keukenrobot. Mijn helm is een koekenpan, mijn armen zijn een spatel en een garde, en op mijn rug zit een jetpack die op stroop vliegt. En ik bak de lekkerste pannenkoeken van heel Veghel. Dat zeg ik zelf, maar het is ook gewoon zo.',
    'Voor het feest van {jarige} wilde ik de allergrootste verjaardagspannenkoek ooit bakken. Dus deed ik er een beetje extra stroop bij. En nog een beetje. En toen nog een heleboel. Mijn stroopmeter schoot in het rood, mijn jetpack sloeg op hol, en toen deed ik... POF.',
    'Nu lig ik in zeven stukken door de buurt. Mijn pantser, mijn ogen, mijn neus, mijn mond, mijn armen, mijn benen en mijn jetpack. Alleen mijn brein en mijn radio zijn hier op tafel geland. Praten kan ik dus nog prima. Maar dat is dan ook alles.',
    'En daarom ben ik zo blij dat jullie er zijn. Jullie zijn vanmiddag mijn reparatieteam. Zoek mijn zeven onderdelen, los bij elke plek een puzzel op en zet mij weer in elkaar. Lukt dat, dan vieren we het hier thuis. Met taart en met pannenkoeken. Doen jullie mee?',
  ],
  // De talenten op het kernscherm. {naam} is de naam die net vastklikt. intro ervoor, klaar erna.
  // (De talenten staan vast en zijn vooraf verdeeld, maar Mecha-Pof doet alsof hij ze nu uitdeelt: het rad stopt altijd op het goede vak.
  //  Laat "{naam}... Talent!" aan het begin staan.)
  loting: {
    intro: [
      'Dan gaan we nu de talenten verdelen. Ik draai voor iedereen aan het talentenrad. Waar het rad stopt, dat ben jij. En bij elk talent hoort een onderdeel van mij. Spannend! Daar gaat hij.',
    ],
    speurneus: ['{naam}... Speurneus! Jij ziet alles, ook wat een ander mist. Daarom zet jij straks mijn LED-ogen terug.'],
    kaartlezer: ['{naam}... Kaartlezer! Jij weet altijd de weg. Mijn neus is straks van jou, de aardbei-knop.'],
    codekraker: ['{naam}... Codekraker! Geheime codes zijn voor jou een makkie. Jij zet straks mijn mond terug, het luidsprekerrooster.'],
    rekenmeester: ['{naam}... Rekenmeester! Jij rekent bijna net zo snel als mijn processor. Mijn armen zijn straks voor jou, de spatel en de garde.'],
    tijdbewaker: ['{naam}... Tijdbewaker! Jij houdt de klok in de gaten. En jij zet straks mijn benen eronder.'],
    sleutelbewaarder: ['{naam}... Sleutelbewaarder! Jij drukt straks thuis op mijn boterknop, het allerlaatste onderdeel. En omdat je jarig bent, krijg je van mij een cadeautje: één verjaardagswens. Tik daarvoor op de taart linksonder op je telefoon. Je mag een puzzel overslaan, een gratis hint vragen of iedereen een robotdans laten doen. Het kan maar één keer, dus kies goed!'],
    klaar: [
      'Zo, iedereen heeft een talent. Zes monteurs en één robot in stukken. Dit komt helemaal goed. Denk ik. Bliep.',
    ],
  },
  // Speluitleg op het kernscherm (regie: knop "Speluitleg"). Eén zin per stap; het plaatje bij elke stap staat in kern.html (UITLEG).
  // Zelfde volgorde: de route · drie telefoons · wat elke telefoon doet en het doorschuiven · de radio · de puzzel · verjaardagswens · veiligheid.
  uitleg: [
    'Dan leg ik nu uit hoe het werkt. Het is niet moeilijk. Jullie lopen met zijn zessen één route, langs zeven plekken. Op elke plek ligt een onderdeel van mij, en bij elk onderdeel hoort een puzzel.',
    'Jullie krijgen drie telefoons, twee monteurs per telefoon. En nu komt het: elke telefoon kan iets anders. Eén is de kaart, één is de radio en één is de werkbank. Jullie hebben elkaar dus echt nodig.',
    'De kaart wijst de weg en telt de meters af. Op de radio bel ik jullie op. En op de werkbank los je de puzzel op. Bij elke plek schuiven de taken een telefoon door. Bovenaan je scherm staat wat jouw telefoon op dat moment is.',
    'Zijn jullie op een plek aangekomen, dan bel ik de radio. Luister tot ik klaar ben. Daarna zeggen jullie samen wat er groot in beeld staat. Heb je mij niet verstaan? Tik dan op herhaal.',
    'Dan de puzzel. Die staat op de werkbank, maar jullie lossen hem samen op. Meedenken en hardop roepen mag dus. Is hij goed, dan dient de Sleutelbewaarder hem in en schudt de monteur het onderdeel vast. Komen jullie er echt niet uit? Vraag dan een hint. Die kost wel een paar stroopdruppels.',
    'Dan nog iets speciaals voor de jarige. {jarige} heeft één verjaardagswens. Die zit achter de taart linksonder op haar telefoon. Ze mag een puzzel overslaan, een gratis hint vragen of iedereen een robotdans laten doen. Het kan maar één keer, dus bewaar hem voor een lastig moment.',
    'En het allerbelangrijkste. Blijf bij elkaar, en steek alleen over samen met de papa van {jarige}. Dat was het! Zijn jullie er klaar voor? Dan gaan we zo beginnen.',
  ],
  // Het spel start; de kern blijft thuis op tafel.
  kern: {
    wacht: ['Ik blijf hier op tafel wachten op mijn onderdelen. Weglopen kan ik toch niet, ik heb geen benen. Veel plezier, en tot straks!'],
  },

  // Een bonusopdracht (stop zonder onderdeel) is gelukt.
  bonus: {
    gevonden: [
      'Bonus binnen! Geen onderdeel, maar wel extra stroopdruppels. Mijn stroopmeter maakt een sprongetje.',
      'Extra klus geklaard. Ik schrijf het in mijn logboek, met een stroopvlek ernaast. Door naar mijn onderdelen!',
    ],
  },

  // ---------------------------------------------------------------- finale thuis (js/finale.js)
  // Kort houden (Job, 9 nov): steeds één korte zin, dan beeld of muziek. Volgorde: check → onthul → dj → vers → hiep → dans
  // → dansstuk met confetti → taart → afscheid.
  // Alle zeven delen zitten vast. check: na de zeven klikjes in beeld. onthul: als Mega gegroeid is (Job trekt het laken weg).
  mega: {
    check: [
      'Systeemcontrole. Alle zeven onderdelen: check!',
    ],
    onthul: [
      'Stroopmeter: MEGA! Dames en heren: MEGA-MECHA-POF!',
    ],
  },

  // Het verjaardagsrapje op het dansmuziekje. Eén regel per keer, met een stukje muziek ertussen.
  dj: [
    'Bzzzt! DJ Mecha-Pof. Muziek aan!',
  ],
  vers: [
    [
      'Mijn lampjes knipperen rood en goud, want {jarige} is vandaag tien jaar oud!',
      'Zes speurders vonden stuk voor stuk al mijn onderdelen. Wat een geluk!',
    ],
  ],
  // Roep-en-antwoord: Mecha-Pof zegt het begin, de meiden roepen HOERA in de pauze die erna komt.
  hiep: [
    'Iedereen! Hiep hiep...',
    'Nog een keer! Hiep hiep...',
    'En de laatste! Hiep hiep...',
  ],
  // Hoera-meter (js/hoera.js, alleen op het kernscherm met microfoon): de uitslag na drie keer HOERA. De beste van de drie telt.
  hoera: {
    mega: ['Hoera-meter: MEGA! Mijn schroeven trillen ervan!'],
    hard: ['Hoera-meter: keihard! Mijn oren piepen ervan!'],
    zacht: ['Hoera-meter: lekker hard! Mijn lampjes knipperen ervan.'],
  },
  dans: [
    'Robotdans! Doe mij maar na. Bliep, bloep, stap!',
  ],
  // Na de dans: één zin, daarna de hoogtepunten van het spel als dia's (zonder gepraat, muziek zachter eronder).
  terugblik: [
    'Terugblik! Kijk wat jullie allemaal gedaan hebben.',
  ],
  // Na de terugblik: de volgende missie (staat ook groot in beeld). Eerst taart versieren, dan pannenkoeken.
  taart: [
    'Nieuwe missie, monteurs! Eerst versieren jullie de taart. Zo mooi als ik. Daarna: pannenkoeken!',
  ],

  // ---------------------------------------------------------------- verrassingen (zie MECHA-POF-SPEL.md)
  // De Kruimelaar: een klein kruimelrobotje pikt een onderdeel en rent ermee weg (thief.*).
  kruimelaar: {
    start: [
      'Alarm! Alarm! Een kruimelrobot! Het is de Kruimelaar. Hij heeft een onderdeel van mij gepikt. Kijk op de kaart, achter hem aan!',
      'Bzzzt! Iets kriebelt aan mijn bouten. De Kruimelaar! Dat kleine stofzuigertje rent weg met mijn onderdeel. Pak hem!',
    ],
    sprong: [
      'Hij is gesprongen! Kijk op de kaart, hij zit nu ergens anders. Wat een kruimelaar.',
      'Piep, hij glipt weg. Hij is klein en snel. Maar jullie zijn slimmer.',
    ],
    gevangen: [
      'Gevangen! Hup, spatel erin, onderdeel eruit. Sorry Kruimelaar, ga maar ergens anders kruimels zoeken.',
      'Ha! Mijn garde heeft hem te pakken. Onderdeel terug. Kruimelaar, foei. Jullie: heel goed.',
    ],
    weg: [
      'Hij is ontsnapt met zijn kruimelstaartje. Geeft niks, ik heb dat onderdeel nog in mijn reservelaatje. Doorlopen!',
    ],
  },
  // Kortsluiting: 30 tellen zo snel mogelijk vonken wegtikken op alle telefoons (storm.*).
  kortsluiting: {
    start: [
      'Krrrzzzt! Kortsluiting! Er springen vonken uit mijn draadjes. Tik ze weg, allemaal tegelijk, snel snel snel!',
      'Bliep blap blop! Mijn stroop is in mijn stopcontact gelopen. Vonken! Tikken, speurders, tikken!',
    ],
    eind: [
      'Pfffff. Alle vonken gedoofd. Mijn draadjes ruiken een beetje naar geroosterde pannenkoek, maar ik leef nog.',
      'Kortsluiting opgelost. Teamwerk! Ik doe alsof ik niet onder de indruk ben. Lukt niet.',
    ],
    // Aanmoediging halverwege het tikken (één keer, zonder {tikken} is ook goed).
    tik: [
      'Au, au, au! Sneller tikken, ik voel ze kriebelen!',
      'Ja! Zo! Elke vonk telt. Mijn draadjes zeggen dankjewel.',
    ],
  },
  // Dubbel signaal: twee kanten op, de telefoons stemmen (fork.*).
  dubbelSignaal: {
    start: [
      'Bliep? Ik ontvang twee signalen tegelijk. Mijn processor wil twee kanten op. Kies jij maar, ik word er duizelig van. Stem per telefoon!',
      'Krrr, dubbel signaal! Links of rechts? Pannenkoek of poffertje? Stem snel, voordat mijn antenne in de knoop raakt.',
    ],
    uitslag: [
      'De stemmen zijn geteld. Mijn processor kiest... wat jullie kozen. Natuurlijk. Ik ben een democratische robot.',
      'Besluit genomen! Signaal opgeslagen. Die kant op, Reparatieteam.',
    ],
  },
  // Poffertjespan: schuifpuzzel in de pan, op elke telefoon (game.surprise kind 'pan').
  pan: {
    start: [
      'Bliep! Wie heeft er aan mijn poffertjespan geschud? Schuif ze terug, elke telefoon zijn eigen pan!',
      'O nee, mijn poffertjes zijn gaan wandelen. Schuif ze terug. Wie klaar is, roept: poedersuiker!',
    ],
    // Stand Wisselen: twee poffertjes aantikken = omwisselen.
    startWissel: [
      'Bliep! Wie heeft er aan mijn poffertjespan geschud? Tik er twee aan, dan wisselen ze van kuiltje!',
      'O nee, mijn poffertjes liggen verkeerd. Tik er twee aan om ze te ruilen. Wie klaar is, roept: poedersuiker!',
    ],
    klaar: [
      'Poedersuiker erover! De pan klopt weer. Jullie mogen bij mij in de keuken komen werken.',
      'Ja! Elk poffertje in zijn eigen kuiltje. Mijn bakplaat is trots op jullie.',
    ],
    eind: [
      'Pan van het vuur. Ik eet ze ook op als ze door elkaar liggen, hoor. Verder met de klus!',
    ],
  },
  // Jetpack oververhit: de finaletimer tikt (finale.timer).
  oververhit: {
    start: [
      'Waarschuwing! Mijn jetpack wordt heet. Heel heet. Pannenkoek-in-de-pan-heet. Snel naar huis, voordat ik ga sissen!',
      'Piep piep piep! Temperatuur stijgt. Ik moet thuis afkoelen. Rennen hoeft niet, stevig doorlopen wel!',
    ],
    bijna: [
      'Nog maar even! Ik begin te sissen. Sssssst. Dat was ik, niet een slang.',
    ],
    gered: [
      'Pfffoe. Thuis. Jetpack koelt af. Jullie hebben mij gered van een gesmolten bodem.',
    ],
    // De tijd is om, maar ze zijn er nog niet: noodkoeling op elke telefoon (samen koel tikken). Nooit eng, geen straf.
    op: [
      'Pssssst! Jetpack op nul, ik sis als een pannenkoek in de pan! Noodkoeling, monteurs: sta stil en tik mij koel!',
      'Bliep bliep! Tijd om, mijn stroop brandt aan! Stop even en tik zo snel als je kunt op de koelknop!',
    ],
    afgekoeld: [
      'Aaaah. Afgekoeld. Dat scheelde een aangebrande bodem. Dank je wel, monteurs! Nu rustig naar huis, niet rennen.',
    ],
    // Thuis aangekomen nadat de tijd om was (en er gekoeld is).
    thuis: [
      'Pfffoe. Thuis. Jetpack koel, bodem heel. Jullie zijn mijn favoriete brandweer.',
    ],
  },
  // Verjaardagswens: alleen de jarige, één keer (wish.used).
  wens: {
    gebruikt: [
      'Bliep! {jarige} doet een verjaardagswens. Dat mag maar één keer per jaar, en vandaag is het zover. Wens toegestaan!',
    ],
    overslaan: [
      'Wens vervuld: deze puzzel slaan we over. Niet verder vertellen aan de andere keukenrobots.',
    ],
    hint: [
      'Wens vervuld: een gratis hint. Zonder dat het in mijn logboek komt. Speciaal voor de jarige.',
    ],
    dansje: [
      'Wens vervuld: een dansje! Spatel omhoog, garde rondjes, zuigers op en neer. Robotdans! Doe maar mee!',
    ],
  },

  // ---------------------------------------------------------------- gesproken navigatie (alleen met de LED-ogen, radiotelefoon)
  // {afstand} wordt de afstand in meters (afgerond). Korte zinnen: ze lopen buiten. Hooguit één zin per 20 seconden.
  // 'warmer' en 'kouder' = dichterbij / verder weg dan de vorige keer; 'gelijk' = ongeveer hetzelfde; 'dichtbij' < 40 m;
  // 'ver' > 400 m. 'brutaal' = extra zinnen zodra hij ook zijn mond (luidspreker) terug heeft.
  navigatie: {
    warmer: [
      'Warmer! Nog {afstand} meter. Mijn LED-ogen knipperen van blijdschap.',
      'Bliep! Dichterbij: {afstand} meter. Goed zo, speurders.',
      'Warmer, warmer. {afstand} meter. Ik ruik... nee wacht, ik zie het bijna.',
      'Ja! Die kant op. Nog {afstand} meter.',
    ],
    kouder: [
      'Brrr, kouder. {afstand} meter. Draai je eens om, speurders.',
      'Piep. Verder weg: {afstand} meter. Mijn vizier zegt: andere kant.',
      'Kouder! Nog {afstand} meter. Ik zie jullie de verkeerde kant op lopen. Grapje. Of niet.',
    ],
    gelijk: [
      'Nog {afstand} meter. Zelfde als net. Staan jullie stil, of loop ik in een kringetje?',
      'Hmm, {afstand} meter. Beweeg eens wat, dan weet ik warmer of kouder.',
    ],
    dichtbij: [
      'Bijna! Nog {afstand} meter. Kijk goed rond, mijn sensoren tintelen.',
      'Heet! Heel heet! {afstand} meter. Niet aan mijn stroopmeter komen nu.',
    ],
    ver: [
      'Oef, {afstand} meter. Dat is een eind. Goed dat jullie benen hebben, want de mijne zijn kwijt.',
      'Nog {afstand} meter. Kijk op de kaart bij de kaarttelefoon, en doorstappen.',
    ],
    brutaal: [
      'Warmer! {afstand} meter. Ik zou harder lopen, maar ik ben een doosje met ogen.',
      'Kouder, speurders! {afstand} meter. Zelfs een tosti-ijzer vindt die kant verdacht.',
    ],
  },

  // ---------------------------------------------------------------- wachtwoordstop (ElevenLabs client tool unlock_stop)
  // 'goed' zegt de app op alle telefoons zodra het wachtwoord via de walkietalkie is gezegd; 'fout' als het niet klopte.
  wachtwoord: {
    goed: [
      'Wachtwoord geaccepteerd! Klik, klak, slot open. Dat had ik zelf niet beter kunnen zeggen. Nou ja, misschien iets robotischer.',
      'Bliep! Dat is hem. Toegang verleend. Mijn processor doet een klein dansje.',
    ],
    fout: [
      'Errr. Dat wachtwoord ken ik niet. Mijn processor zegt: nee. Zoek nog eens goed.',
      'Toegang geweigerd. Beleefd, maar geweigerd. Kijk nog eens om je heen.',
    ],
  },

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
    'Alle systemen compleet! {jarige}, gefeliciteerd. Nu eerst taart versieren, dan pannenkoeken!',
    'Helemaal heel! Slimste speurders ooit. Eerst de taart versieren, daarna pannenkoeken!',
  ],

  // Na de finale: een plagerij over het aantal hints. Kies op aantal.
  finaleHints: {
    nul: ['En geen enkele hint nodig gehad. Ik ben onder de indruk. Een heel klein beetje.'],
    een: ['Eén hint maar. Eén. Het staat in mijn logboek, hoor.'],
    meer: ['{Hints} hints. {Hints}. Het staat in mijn logboek.', 'O ja, en {hints} hints. Ik ben het niet vergeten. Robots vergeten nooit.'],
  },
  // Na de finale: het afscheid via de walkietalkie, en de teamfoto.
  afscheid: [
    'Laatste klus: allemaal tegelijk in de walkie. Over en sluiten!',
  ],
  teamfoto: [
    'Teamfoto! Allemaal voor mijn poster. Drie, twee, één... zeg allemaal: pannenkoek!',
  ],

  // Eindscherm: één zin per monteur (op het scherm, niet hardop). {naam} = haar naam.
  eind: {
    speurneus: ['{naam} vond mijn LED-ogen. Zonder jou zei ik nog steeds sorry tegen lantaarnpalen.'],
    kaartlezer: ['{naam} bracht mijn aardbei-knop terug. Ik ruik weer alles, ook dat jij de weg wist.'],
    codekraker: ['{naam} haalde mijn luidsprekerrooster op. Daarom ben ik nu zo brutaal. Jouw schuld.'],
    rekenmeester: ['{naam} gaf mij mijn spatel en garde terug. Daar draai ik straks jouw pannenkoek mee om.'],
    tijdbewaker: ['{naam} zette mijn zuigerbenen erop en hield de klok in de gaten. Pomp, pomp, bedankt.'],
    sleutelbewaarder: ['{naam} drukte op mijn boterknop en liet mij vliegen. En ze is jarig. Dubbel feest.'],
    geen: ['{naam} hielp overal mee. Mijn processor vergeet dat nooit.'],
  },
  // Eindscherm: korte toevoeging per bijzondere badge.
  eindBadge: {
    'kruimelaar-vanger': ['Ving de Kruimelaar.'],
    vonkenvanger: ['Tikte vonken weg als een bliksem.'],
    'jetpack-redder': ['Redde mijn jetpack.'],
    wensvervuller: ['Deed een verjaardagswens.'],
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
    // Mecha-Pof belt zelf (regie: monster.call zonder eigen tekst). {naam} = voor wie hij belt. Eindigt op "over".
    oproep: [
      'Bzzzt! {naam}, ben jij daar? Mecha-Pof hier. Ik moet je iets vragen. Zeg maar hallo, en eindig met over. Over!',
      'Piep piep, hier Mecha-Pof. Ik bel voor {naam}. Praat maar gewoon, en eindig met over. Over!',
      'Krrrk... inkomend bericht van mij, voor {naam}. Mijn antenne trilt ervan. Zeg het maar. Over!',
    ],
    // Briefing als ze bij een plek aankomen: Mecha-Pof belt zelf en zegt welk onderdeel hier ligt en wie de monteur is.
    // {monteur} = talent + naam van de monteur van dit deel ("Tijdbewaker Elin"); zonder naam alleen het talent. Zij heeft op haar plek de leiding.
    // Wordt als begroeting meegestuurd (stop.arrived), per deel van de stop. Zonder "over" aan het eind: walkie.js plakt er
    // een slot uit briefingSlot achter, zodat de kinderen precies weten wat ze moeten doen en wat ze terug moeten zeggen.
    briefing: {
      lijf: [
        'Krrrk, piep! Signaal sterk. Hier ergens ligt mijn pannenkoekenpantser. Vier lagen, met klinknagels. Zonder lijf ben ik maar een pratend doosje. Dit is de eerste klus, dus hier zijn jullie allemaal de baas. Lukt het, dan kunnen jullie mij eindelijk zien.',
      ],
      ogen: [
        'Bzzzt, Mecha-Pof hier. Alles is zwart. Ik heb net sorry gezegd tegen een lantaarnpaal. Mijn LED-ogen liggen bij deze plek. {monteur}, jij bent de monteur, dus jij hebt hier de leiding. Jij verdeelt wie welke schijf doet. Krijg ik mijn ogen terug, dan zeg ik voortaan hoe ver het nog is.',
      ],
      neus: [
        'Piep piep, snuf... niks. Ik ruik helemaal niks. Mijn aardbei-knop ligt hier. {monteur}, jij bent de monteur, dus jij hebt hier de leiding. Jij zegt wie waar gaat staan. Zonder neus kan ik geen hints ruiken, en hints ruiken naar warme stroop.',
      ],
      mond: [
        'Krrr... hoor je dat? Ik praat door een theezeefje. Mijn luidsprekerrooster ligt hier. {monteur}, jij bent de monteur, dus jij hebt hier de leiding. Laat iedereen goed kijken, en jij beslist wanneer jullie het weten. Met een mond kan ik alarm slaan. En nog brutaler doen. Sorry, niet sorry.',
      ],
      armen: [
        'Bliep. Ik wil zwaaien, maar er gebeurt niks. Mijn spatel en mijn garde liggen hier. {monteur}, jij bent de monteur, dus jij hebt hier de leiding. Jij verdeelt de klusjes, zodat iedereen iets te doen heeft. Met armen kan ik weer vastpakken. Handig, want er loopt hier een kruimelrobot rond die dingen pikt.',
      ],
      benen: [
        'Pssst... pssst... niks. Mijn zuigerbenen liggen hier, met de pannetjes eraan. {monteur}, jij bent de monteur, dus jij hebt hier de leiding. Tip van mijn processor: verdeel de kleuren, dan hoeft niemand alles te onthouden. Als ik kan lopen, loop ik met jullie mee op de kaart. Maar dan begint ook de klok te tikken.',
      ],
      // Bonusopdracht (stop zonder onderdeel, gekozen door de begeleider).
      bonus: [
        'Bzzzt! Extra klus, speurders. Hier ligt geen onderdeel, maar wel een bonus met stroopdruppels.',
      ],
      hoed: [
        'Bzzzt! Thuis! Mijn kern ligt hier, en het laatste stuk ook: mijn boterknop en mijn stroop-jetpack. {monteur}, dit is jouw moment, jij hebt hier de leiding. Druk op de knop, dan vlieg ik.',
      ],
    },
    // Afscheid na de finale (knop op het eindscherm): kort, zodat ze meteen met zijn zessen "over en sluiten" roepen.
    afscheid: [
      'Mega-Mecha-Pof hier, groter dan ooit! Roep met zijn zessen: over en sluiten. Over!',
    ],
    // Slot van elke briefing (bij aankomst). 'zeg' = wat de kinderen terugzeggen; staat ook groot in beeld.
    // 'gemist' = als niemand opneemt, zegt de app de briefing zelf met dit slot (dan valt er niks terug te zeggen).
    briefingSlot: {
      // Puzzels waar elke telefoon een eigen stuk heeft (slot, formatie, licht, splits).
      samen: { tekst: 'Jullie opdracht: deze klus doen jullie met alle drie de telefoons tegelijk. Kijk allemaal op je eigen scherm. Begrepen? Zeg dan: begrepen, over en sluiten. Over!', zeg: 'Begrepen, over en sluiten', gemist: 'Jullie opdracht: deze klus doen jullie met alle drie de telefoons tegelijk. Kijk allemaal op je eigen scherm.' },
      werkbank: { tekst: 'Jullie opdracht: kijk op de werkbank-telefoon, daar staat de puzzel. Begrepen? Zeg dan: begrepen, over en sluiten. Over!', zeg: 'Begrepen, over en sluiten', gemist: 'Jullie opdracht: kijk op de werkbank-telefoon, daar staat de puzzel.' },
      wachtwoord: { tekst: 'Hier is een geheim wachtwoord verstopt. Zoek het! Gevonden? Druk dan op het walkie-knopje en zeg het hardop tegen mij. Nu eerst: zeg begrepen, over en sluiten. Over!', zeg: 'Begrepen, over en sluiten', gemist: 'Hier is een geheim wachtwoord verstopt. Zoek het! Gevonden? Druk op het walkie-knopje en zeg het hardop tegen mij.' },
      hoed: { tekst: 'Zeg: klaar, over en sluiten. Dan hang ik op en drukt {monteur} op de knop. Over!', zeg: 'Klaar, over en sluiten', gemist: 'Druk maar op de knop!' },
    },
  },
};

export default LINES;
