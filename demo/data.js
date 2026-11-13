// demo/data.js — gemaakt door demo/build.mjs (niet met de hand aanpassen). Stops: seed uit supabase/schema.sql.
export const DEMO_V = 1;
export const STOPS = [
 {
  "id": "demo-s1",
  "seq": 1,
  "key": "start",
  "name": "De palenrij bij de zaaier",
  "clue": "Piep! Mijn pannenkoekenpantser is als een zak bloem neergeploft bij een rij palen, naast het huis met de zaaiende man op de gevel. Loop De Haag af en zoek de palen die allemaal nét een ander lengtetje hebben.",
  "lat": 51.61734,
  "lng": 5.560498,
  "radius": 25,
  "part": "lijf",
  "puzzles": [
   {
    "hint": "Begin bij de muur en tel met je vinger. Het zijn er meer dan twintig.",
    "type": "code",
    "answer": "23",
    "question": "Mijn pantser is tegen deze palen gestuiterd, tegen elke paal precies één keer. Hoe vaak heb ik \"au\" gezegd? Tel ze allemaal, ook de kleintjes!"
   }
  ],
  "geheim": {}
 },
 {
  "id": "demo-s2",
  "seq": 2,
  "key": null,
  "name": "Het bord met de sokjes",
  "clue": "Mijn LED-ogen zijn naar het zuiden gevlogen en staren nu naar een bord waar zes piepkleine sokjes aan hangen. Zes sokjes, net zoveel als jullie! Speurneus, ga voorop. O ja: mijn gebruiksaanwijzing is onder het bruggetje ernaast gerold.",
  "lat": 51.614426,
  "lng": 5.560948,
  "radius": null,
  "part": "ogen",
  "puzzles": [
   {
    "hint": "De datum staat als dag-maand-jaar op het bord. En tel de sokjes nog eens.",
    "type": "slot",
    "dials": [
     {
      "clue": "Op welke dag van de maand is het meisje geboren?",
      "answer": "6"
     },
     {
      "clue": "In welke maand? (als cijfer)",
      "answer": "10"
     },
     {
      "clue": "Hoeveel sokjes hangen er onder het bord?",
      "answer": "6"
     }
    ],
    "symbols": [
     "0",
     "1",
     "2",
     "3",
     "4",
     "5",
     "6",
     "7",
     "8",
     "9",
     "10",
     "11",
     "12"
    ],
    "question": "Mijn ogen zitten achter een slot met drie schijven. Alles wat je nodig hebt staat op het bord met de sokjes, en hoe je het afleest staat in mijn gebruiksaanwijzing."
   }
  ],
  "geheim": {}
 },
 {
  "id": "demo-s3",
  "seq": 3,
  "key": null,
  "name": "Het veldje aan het pad",
  "clue": "Snuf snuf… mijn neus, het aardbeiknopje, ligt in het gras op het veldje aan het pad. Kaartlezer, het pad in; het ruikt daar naar natte bladeren en een heel klein beetje stroop.",
  "lat": 51.61309,
  "lng": 5.56152,
  "radius": null,
  "part": "neus",
  "puzzles": [
   {
    "hint": "Ga uit elkaar staan, ongeveer vijftien grote stappen, en houd de telefoon stil.",
    "loop": 20,
    "ring": 15,
    "type": "formatie",
    "margin": 8,
    "maxAcc": 30,
    "question": "Mijn neus werkt pas als jullie een driehoek om hem heen maken: drie telefoons, ieder op een eigen punt. Kijk op de radar en schuif tot alles groen is."
   }
  ],
  "geheim": {}
 },
 {
  "id": "demo-s4",
  "seq": 4,
  "key": null,
  "name": "De Stadsbrink",
  "clue": "Krrr… mijn luidsprekerrooster is helemaal naar de Stadsbrink gerold. Het pad uit en dan linksaf; waar de straat breder wordt hoor je mij misschien al mompelen.",
  "lat": 51.613259,
  "lng": 5.564092,
  "radius": null,
  "part": "mond",
  "puzzles": [
   {
    "hint": "Kijk naar het smeedijzeren bord. Mecha-Pof heeft één woordje verkeerd gelezen: hij dacht aan stroop.",
    "type": "wachtwoord",
    "image": "https://lnhliamckstuwiwyzxyl.supabase.co/storage/v1/object/public/monster/scout/e6aa0290-3cbb-41c4-99af-d61813c37110/1794236045870-foto-cdd1ae.jpg",
    "answer": "stadsbrink",
    "overlay": "DE STROOPBRINK",
    "password": "stadsbrink|de stadsbrink",
    "question": "Mijn processor leest het bord hier als DE STROOPBRINK. Dat klopt toch niet? Vergelijk mijn uitlezing met het echte bord aan de muur en zeg het échte woord tegen mij in de walkietalkie, met \"over\" erachter!"
   }
  ],
  "geheim": {}
 },
 {
  "id": "demo-s5",
  "seq": 5,
  "key": null,
  "name": "Het groene kastje",
  "clue": "Mijn spatel en mijn garde zwaaien om hulp bij een groen kastje langs de weg, richting de hoge bomen. Rekenmeester, daar hangt een kaartje met mijn handtekening.",
  "lat": 51.614586,
  "lng": 5.56587,
  "radius": null,
  "part": "armen",
  "puzzles": [
   {
    "hint": "Het kaartje hangt op ooghoogte aan het groene kastje.",
    "type": "qr",
    "question": "Scan het kaartje van Mecha-Pof. Lukt scannen niet? Typ de code die eronder staat."
   }
  ],
  "geheim": {
   "qr": "POF-GARDE-35"
  }
 },
 {
  "id": "demo-s6",
  "seq": 6,
  "key": null,
  "name": "Het huis met de steen",
  "clue": "Pssst, pssst… mijn zuigerbenen staan te wiebelen bij huisnummer 11, het huis met de witte rozetten en een oude steen in de muur. Tijdbewaker, de klok tikt!",
  "lat": 51.616365,
  "lng": 5.563619,
  "radius": null,
  "part": "benen",
  "puzzles": [
   {
    "hint": "Zeg de kleuren hardop mee terwijl de zender knippert, dan onthoud je ze met z'n drieën.",
    "type": "licht",
    "speed": 750,
    "colors": 4,
    "length": 5,
    "question": "Mijn zuigers pompen in een kleurenritme en ik ben het kwijt. Eén telefoon zendt de reeks, de andere twee bouwen hem samen na. Kijk goed, het gaat snel!"
   }
  ],
  "geheim": {}
 },
 {
  "id": "demo-s7",
  "seq": 7,
  "key": "home",
  "name": "Thuis op het erf",
  "clue": "Bijna compleet! Mijn jetpack wordt warm. Terug naar het erf, langs het tankstation van de buren (even bijtanken…), tot midden op ons erf. Daar wachten mijn boterknop en mijn stroop-jetpack. En pannenkoeken!",
  "lat": 51.616194,
  "lng": 5.561503,
  "radius": null,
  "part": "hoed",
  "puzzles": [
   {
    "hint": "Eén iemand telt hardop af, de rest drukt op BOTER.",
    "type": "sync",
    "rounds": 2,
    "window": 900,
    "question": "De boterknop! Alle telefoons moeten hem precies tegelijk indrukken, anders slaat mijn jetpack af. Tel samen af: drie, twee, één, BOTER!",
    "question_solo": "De boterknop! Tik precies in de groene zone, drie keer raak, anders slaat mijn jetpack af."
   }
  ],
  "geheim": {}
 }
];
export const PLAYERS = [{"id":"demo-p1","name":"Hannah","is_birthday":true,"talent":"sleutelbewaarder","part":"hoed"},{"id":"demo-p2","name":"Elin","is_birthday":false,"talent":"speurneus","part":"ogen"},{"id":"demo-p3","name":"Isa","is_birthday":false,"talent":"kaartlezer","part":"neus"},{"id":"demo-p4","name":"Evy","is_birthday":false,"talent":"codekraker","part":"mond"},{"id":"demo-p5","name":"Lauren","is_birthday":false,"talent":"rekenmeester","part":"armen"},{"id":"demo-p6","name":"Julia","is_birthday":false,"talent":"tijdbewaker","part":"benen"}];
export const CODES = {"1010":"demo-p1","2020":"demo-p2","3030":"demo-p3","4040":"demo-p4","5050":"demo-p5","6060":"demo-p6"};
