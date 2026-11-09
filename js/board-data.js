// board-data.js — vaste gegevens voor het 3D-speelbord (js/board.js): de looproute van route A als lijn langs de scoutplekken,
// en de regie-markers (bonus, reserve, verrassingen, buitenprints). Bron: claude/ROUTE.md en tabel scout_place (9 nov 2026).
// Elke stop in de route is gekoppeld via `seq` aan de stop in Supabase; staat een stop daar op een andere plek, dan buigt de lijn mee.

// [scoutplek, lat, lng, seq?]  — seq = stop op die plek; de route begint en eindigt thuis (46).
export const ROUTE = [
  [46, 51.6161936800616, 5.56150253222193],        // thuis: vertrek
  [45, 51.6170444681664, 5.56177250236784],
  [2,  51.6171073681724, 5.56179110643271],
  [43, 51.6174216196923, 5.56169724057404],
  [44, 51.6173481940817, 5.56157870709163],
  [3,  51.6173561611341, 5.56059206420589],
  [4,  51.6173397872705, 5.56049793311638, 1],     // stop 1 palenrij
  [17, 51.6147277602416, 5.56080215552305],
  [16, 51.6144261650986, 5.56094804692787, 2],     // stop 2 sokjesbord
  [18, 51.6141578894147, 5.56179901355995],
  [19, 51.6140304364131, 5.56199215834042],
  [20, 51.6134343423956, 5.56168320730608],
  [21, 51.6132495781706, 5.56152406207715],
  [22, 51.6131287318835, 5.56151375023169, 3],     // stop 3 veldje
  [23, 51.6128993136383, 5.56157037991922],
  [24, 51.6126959052459, 5.5623303986974],
  [25, 51.6117990968642, 5.56199148341111],
  [26, 51.6118072424695, 5.5620482785309],
  [27, 51.611233528942,  5.56300712077826],
  [28, 51.6116258951653, 5.56318532351919],
  [29, 51.6121904163888, 5.5636045019296],
  [31, 51.612555968981,  5.563946717186],
  [32, 51.6132589091494, 5.56409176554725, 4],     // stop 4 Stadsbrink
  [33, 51.6138055611613, 5.5644137523082],
  [34, 51.6143923986825, 5.56578889821013],
  [35, 51.6145857040122, 5.5658703928623, 5],      // stop 5 groene kastje
  [36, 51.6155422212249, 5.565293461306],
  [37, 51.6157679595311, 5.56512013525062],
  [38, 51.6159852836062, 5.56485384055174],
  [39, 51.6161762600178, 5.56407958501448],
  [40, 51.6163646539981, 5.56361937409429, 6],     // stop 6 huis met de steen
  [41, 51.6168045722548, 5.56237465783113],
  [42, 51.6169345816817, 5.56198691891273],
  [45, 51.6170444681664, 5.56177250236784],
  [46, 51.6161936800616, 5.56150253222193, 7],     // stop 7 thuis
];
export const HOME = { lat: 51.6161936800616, lng: 5.56150253222193 };
export const BRUGGETJE = { lat: 51.613975083332, lng: 5.56060142750155 };
// Kaartuitsnede voor OpenStreetMap (route ± 75 m)
export const BBOX = { s: 51.6105, w: 5.5594, n: 51.6181, e: 5.5670 };
// Richttijden (minuten na middernacht) voor de demo-schuif: vertrek 15:30, stop 1–6, thuis 17:05; zon onder ±16:55.
export const TIMES = [930, 935, 950, 965, 980, 995, 1010, 1025];
export const SUNSET = 1015;

// Alleen in de regieweergave. `at` = [lat, lng]; `off` = verschuiving in meters [oost, zuid] zodat markers niet op elkaar staan.
export const EXTRAS = [
  { k: 'bonus', lab: 'B1', bonus: 'B1', at: [51.6163646539981, 5.56361937409429], off: [11, -7], h: 'B1 · De steen van H van Kleef', chips: ['bij stop 6', 'splits'], p: 'Rozetten voorkant (7) + zijkant (3) + "19 ANNO 25". Antwoord 1935.', p2: 'Vóór of na de licht-puzzel.' },
  { k: 'bonus', lab: 'B2', bonus: 'B2', at: [51.6138055611613, 5.5644137523082], off: [0, 0], h: 'B2 · Het bankje met de pijlen', chips: ['stop 4 → 5', 'opdracht'], p: 'Robotdans van drie keukenbewegingen: spatel, garde, stroop. Job vinkt af.', p2: '60 m van de lijn, goed rustpunt.' },
  { k: 'bonus', lab: 'B3', bonus: 'B3', at: [51.6159852836062, 5.56485384055174], off: [0, 8], h: 'B3 · Het stalen huis', chips: ['stop 5 → 6', 'keuze'], p: '"Waarvan is dit huis gebouwd?" Antwoord: staal.', p2: 'Daarna bij de hoge bomen de plek zoeken met de minste bomen in zicht.' },
  { k: 'reserve', lab: 'R', at: [51.6169345816817, 5.56198691891273], off: [0, 0], h: 'Reserve · De leeuwensteen', chips: ['bij Esther en Jeroen', 'code'], p: 'Code 1947. Vlak voor huis, voor als er een stop uitvalt.', p2: '30 m voorbij het Stroop-tankstation, zonder bord.' },
  { k: 'surprise', lab: '!', at: [51.6134343423956, 5.56168320730608], off: [0, 0], h: 'Kruimelaar', chips: ['na stop 3', 'regie start'], p: 'Kruimels op het pad bij plekken 19, 20, 24 en 25.', p2: 'Punten 70 tot 140 m rond de telefoons.' },
  { k: 'surprise', lab: '!', at: [51.6168045722548, 5.56237465783113], off: [-8, 6], h: 'Kortsluiting', chips: ['stop 6 → thuis', 'regie start'], p: 'Bij het Stroop-tankstation van de buren. Start zodra de groep voor het bord staat.', p2: '' },
  { k: 'surprise', lab: '!', at: [51.6140304364131, 5.56199215834042], off: [8, -4], h: 'Dubbel signaal', chips: ['begin van het pad', 'regie start'], p: 'Links of rechts? Kan ook op de Stadsbrink.', p2: '' },
  { k: 'surprise', lab: '!', at: [51.61659, 5.56300], off: [0, 0], h: 'Jetpack oververhit', chips: ['na stop 6', 'finaletimer ±15 min'], p: 'De stroopfles raakt oververhit: de laatste meters gaan op tijd.', p2: '' },
  { k: 'print', lab: '▤', at: [51.613975083332, 5.56060142750155], off: [0, 0], h: 'Gebruiksaanwijzing LED-ogen', chips: ['buitenprint 1', '±90 × 150 cm'], p: 'Opgerold onder het bruggetje, in een plastic zak. Hint voor het slot van stop 2.', p2: '' },
  { k: 'print', lab: '▤', at: [51.6145857040122, 5.5658703928623], off: [-9, 6], h: 'QR-poster', chips: ['buitenprint 2', '±90 × 120 cm'], p: 'Spatel en garde levensgroot, QR ≥ 30 cm met POF-GARDE-35 eronder.', p2: 'Het A6-kaartje als reserve in de jaszak.' },
  { k: 'print', lab: '▤', at: [51.6168045722548, 5.56237465783113], off: [7, -8], h: 'Stroop-tankstation', chips: ['buitenprint 3', '±90 × 60 cm'], p: '"Hier tankt Mecha-Pof", stroopmeter in het rood. Eerst overleggen met de buren.', p2: '' },
];
export const CRUMBS = [[51.6140304364131, 5.56199215834042], [51.6134343423956, 5.56168320730608], [51.6126959052459, 5.5623303986974], [51.6117990968642, 5.56199148341111]];

// Teksten per stop voor het kaartje (regie: met antwoord; spelers: alleen een plaagzin). Sleutel = seq.
export const STOP_INFO = {
  1: { puz: 'code', kern: '23 palen tellen. Straal 25 m, dit is de startstop.', teaser: 'Hier ligt het lijf. Tel goed om je heen.' },
  2: { puz: 'slot · 3 schijven', kern: 'Dag 6 · maand 10 · sokjes 6. De gebruiksaanwijzing ligt opgerold onder het bruggetje.', teaser: 'De LED-ogen zitten achter een slot met drie schijven.' },
  3: { puz: 'formatie · driehoek', kern: 'Driehoek met drie telefoons, ring 15 m. Daarna de Kruimelaar op het pad.', teaser: 'Ga in formatie staan, dan snuift de neus je op.' },
  4: { puz: 'wachtwoord via walkie', kern: 'Mecha-Pof leest DE STROOPBRINK. Wachtwoord: stadsbrink.', teaser: 'Mecha-Pof leest iets verkeerd. Wat staat er echt?' },
  5: { puz: 'QR-code', kern: 'Grootformaat QR-poster aan het kastje, geheim POF-GARDE-35.', teaser: 'Spatel en garde hangen hier ergens. Scan ze!' },
  6: { puz: 'licht · nabouwen', kern: 'Zender knippert (5 lang, 4 kleuren), twee telefoons bouwen na. Rond zonsondergang.', teaser: 'Volg het lichtsignaal om de benen te laten lopen.' },
  7: { puz: 'sync · BOTER', kern: 'Alle telefoons tegelijk op BOTER, daarna de finale met Mega-Mecha-Pof.', teaser: 'Alle telefoons tegelijk. Dan komt de hoed op zijn kop.' },
};
