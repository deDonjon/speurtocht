// demo/build.mjs — maakt de demo opnieuw uit de echte app:   node demo/build.mjs
//
//   demo/index.html  = kopie van index.html met bovenin: <base href="../"> (zodat js/, print/ en img/ van de echte app
//                      geladen worden), demo/prelude.js (afgeschermde opslag + netwerkwacht) en een import map die
//                      supabase-js vervangt door demo/fake-supabase.js. Verder is de app precies dezelfde.
//   demo/data.js     = de zeven stops uit de seed in supabase/schema.sql (route A) en zes monteurs met democodes.
//
// De echte app (index.html, js/, Supabase) wordt hierdoor niet aangeraakt. Na een wijziging aan index.html: dit script opnieuw
// draaien en demo/index.html meecommitten. Open: https://dedonjon.github.io/speurtocht/demo/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---------------------------------------------------------------- data.js
const schema = rd('supabase/schema.sql');
const m = schema.match(/jsonb_to_recordset\(\$j\$(\[[\s\S]*?\])\$j\$::jsonb\)/);
if (!m) throw new Error('seed met de stops niet gevonden in supabase/schema.sql');
const seed = JSON.parse(m[1]);
const STOPS = seed.map(s => ({ id: 'demo-s' + s.seq, seq: s.seq, key: s.key, name: s.name, clue: s.clue, lat: s.lat, lng: s.lng, radius: s.radius, part: s.part, puzzles: s.puzzles, geheim: s.geheim || {} }));
const PLAYERS = [
  { id: 'demo-p1', name: 'Hannah', is_birthday: true,  talent: 'sleutelbewaarder', part: 'hoed' },
  { id: 'demo-p2', name: 'Elin',   is_birthday: false, talent: 'speurneus',        part: 'ogen' },
  { id: 'demo-p3', name: 'Isa',    is_birthday: false, talent: 'kaartlezer',       part: 'neus' },
  { id: 'demo-p4', name: 'Evy',    is_birthday: false, talent: 'codekraker',       part: 'mond' },
  { id: 'demo-p5', name: 'Lauren', is_birthday: false, talent: 'rekenmeester',     part: 'armen' },
  { id: 'demo-p6', name: 'Julia',  is_birthday: false, talent: 'tijdbewaker',      part: 'benen' },
];
const CODES = { '1010': 'demo-p1', '2020': 'demo-p2', '3030': 'demo-p3', '4040': 'demo-p4', '5050': 'demo-p5', '6060': 'demo-p6' };
const DEMO_V = 1; // ophogen = elke demo-telefoon begint opnieuw
fs.writeFileSync(path.join(ROOT, 'demo/data.js'), `// demo/data.js — gemaakt door demo/build.mjs (niet met de hand aanpassen). Stops: seed uit supabase/schema.sql.
export const DEMO_V = ${DEMO_V};
export const STOPS = ${JSON.stringify(STOPS, null, 1)};
export const PLAYERS = ${JSON.stringify(PLAYERS)};
export const CODES = ${JSON.stringify(CODES)};
`);

// ---------------------------------------------------------------- index.html
let html = rd('index.html');
const head = `<meta charset="utf-8">
<!-- DEMO: gemaakt door demo/build.mjs uit ../index.html. Alles hieronder is de echte app; alleen deze drie regels zijn anders. -->
<base href="../">
<script src="demo/prelude.js?v=1"></script>
<script type="importmap">{ "imports": { "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm": "./demo/fake-supabase.js?v=1" } }</script>`;
if (!html.includes('<meta charset="utf-8">')) throw new Error('meta charset niet gevonden');
html = html.replace('<meta charset="utf-8">', head);
html = html.replace('<title>Mecha-Pof</title>', '<title>Mecha-Pof · demo</title>');
// Link naar het echte regiescherm niet in de demo (dat zou het echte spel openen)
html = html.replace(/href="\.\/regie\.html"/g, 'href="demo/" onclick="window.__demo&&window.__demo.panel.show(true);return false"');
if (/href="\.?\/?(regie|kern|scout)\.html"/.test(html)) throw new Error('nog een link naar een echt beheerscherm');
fs.writeFileSync(path.join(ROOT, 'demo/index.html'), html);
console.log('demo/index.html en demo/data.js geschreven:', STOPS.length, 'stops,', PLAYERS.length, 'monteurs');
