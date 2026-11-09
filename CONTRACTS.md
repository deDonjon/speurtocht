# CONTRACTS — Pannenkoekenmonster 2.0

Het enige bestand dat elke bouwchat leest. Wijzigen = alle chats raken; doe het alleen in een "chat 1"-vervolg.
Alle JS is ESM zonder build-stap. Tijden zijn ISO-strings van de server. Ids zijn uuid's. Taal in code: Engels, in tekst voor kinderen: Nederlands.

## 1. Spelstand `state` (js/state.js — `import { state } from './js/state.js'`)
```
state.get() → {
  conn:    'connecting'|'online'|'offline',
  device:  { id, players: [playerId, …] },                       // 1 of 2 bewakers op dit toestel
  game:    { id, code, phase, stop_order:[stopId…], active_index, parts:[part…], drops, hints,
             energy, wish_used, surprise:null|{kind, started_at, data}, settings:{radius, min_gap, any_can_submit}, started_at, finished_at },
  players: [{ id, name, is_birthday, part, talent, color, badges:[…], device_id, last_seen_at, lat, lng, acc, battery, online }],
  stops:   [{ id, seq, key:'start'|'home'|null, name, clue, lat, lng, radius, part, puzzles:[config, config?] }],
  puzzle:  null|{ stop_id, variant, seed, moves:[move…], arrived_at, solved_at, solved_by, hints },  // actieve stop
  events:  [event…],   // laatste 50, nieuwste eerst
  pos:     null|{ lat, lng, acc, at }
}
```
`phase`: `lobby` → `onderweg` → `puzzel` → (`onderweg`|`puzzel`)… → `finale` (thuis) → `klaar`.
`part`: `lijf|ogen|neus|mond|armen|benen|hoed`. `talent`: `speurneus|kaartlezer|codekraker|rekenmeester|tijdbewaker|sleutelbewaarder`.
Afgeleid (functies op `state`): `activeStop()`, `route()`, `me()` (spelers op dit toestel), `myTalents()`, `hasTalent(t)`, `player(id)`, `stop(id)`, `onlinePlayers()`, `partsMissing()`.
Luisteren: `state.on(evt, fn)` met evt ∈ `change|game|players|stops|puzzle|event|conn|pos`; `fn(payload)`. `off(evt, fn)` ontkoppelt.
Alleen sync.js schrijft in `state` (`state.apply(table, row)`, `state.set(patch)`). Modules lezen en luisteren.

## 2. Event-formaat (tabel `event`; één rij = één gebeurtenis; apps reageren binnen 1 s)
`{ id, game_id, at, type, actor:'regie'|'player'|'system', player_id|null, payload:{} }`
Typen (payload tussen haken):
- spel: `game.start`, `game.reset`, `stop.arrived{stop_id}`, `stop.solved{stop_id, part, drops, by}`, `hint.given{stop_id, text}`, `badge.awarded{player_id, badge}`, `energy{level:1|2|3}`
- regie → monster: `monster.say{text, mood?}`, `monster.call{player_id, message_id}`, `roles.shuffle{talents:{playerId:talent}}`, `plan_b{dropped_device}`, `gps.skip{stop_id}`, `stop.approve{stop_id}`, `photo.approve{stop_id}`
- verrassingen: `thief.start{part, points:[{lat,lng}…]}`, `thief.jump{i}`, `thief.caught`, `thief.end`, `storm.start{seconds}`, `storm.score{player_id,n}`, `storm.end{total}`, `fork.open{a,b}`, `fork.vote{player_id,choice}`, `fork.result{choice}`, `finale.timer{seconds}`, `wish.used{for}`
Spelers mogen alleen `storm.score`, `fork.vote`, `wish.used` en `monster.say` (eigen tekst) sturen via `log_event`, en `badge.awarded` via `award_badge`; de rest komt van de regie of uit RPC's (`stop.arrived`, `stop.solved`, `hint.given`).
De lopende verrassing staat ook in `game.surprise`, zodat een telefoon die net inlogt hem meteen ziet.

## 3. Puzzel-interface (js/puzzles/<type>.js — default export; types: vraag, code, keuze, opdracht, memory, schuif, splits, slot, sync, licht, formatie, qr)
```
export default {
  type: 'slot',
  init(config, ctx)            → data        // startstand uit stop.puzzles[variant]; ctx = { seed, players, devices, variant, phones }
  reduce(data, move, ctx)      → data        // pure; zelfde volgorde = zelfde data op elke telefoon
  isSolved(data, config, ctx)  → boolean
  render(el, data, api)                      // tekent alles in el; api = { me, talents, phones, config, move(m), hint(), solve() }
  destroy?(el)
}
```
`move` dat je stuurt: `{ t:'<zet>', …velden }`; de server vult `by` (player_id) en `at` aan en zet hem achter `puzzle.moves`. Nooit zelf `data` opslaan: data = `moves.reduce(reduce, init(config, ctx))`.
`phones` = aantal toestellen online (1, 2 of 3); elke puzzel heeft een variant voor 1 toestel. `api.solve()` mag alleen de Sleutelbewaarder (of iedereen als `settings.any_can_submit`); de server controleert dat.
Elke puzzel heeft `test/puzzle-<type>.html` met een nep-sync (twee iframes delen één `moves`-array).

## 4. Server (Supabase, js/sync.js) — anon leest tabellen `game, player, stop, puzzle_state, event`; schrijven kan alleen via RPC's. Geheimen (`player_secret`, `stop_secret`, `game_secret`) zijn niet leesbaar voor anon.
Spelers (bewijs = eigen 4-cijferige code): `login(game_code, code, device_id)`, `heartbeat(codes[], lat, lng, acc, battery)`, `arrive(code, stop_id)`, `puzzle_move(code, stop_id, move)`, `puzzle_hint(code, stop_id)`, `complete_stop(code, stop_id, drops)`, `award_badge(code, player_id, badge)`, `log_event(code, type, payload)`.
Regie (bewijs = regiesleutel): `regie_check`, `regie_state` (alles incl. geheimen), `regie_start`, `regie_reset`, `regie_event(type, payload)` (zet ook `game.surprise`), `regie_patch_game(patch)`, `regie_upsert_stop(stop)`, `regie_delete_stop`, `regie_set_player(player)`, `regie_approve_stop`, `regie_hint(text)`.
sync.js API: `sync.connect(gameCode)`, `sync.login(code)`, `sync.logout(playerId)`, `sync.arrive()`, `sync.move(m)`, `sync.hint()`, `sync.solve()`, `sync.badge(playerId, badge)`, `sync.log(type, payload)`, `sync.setPos(pos)`, `sync.regie.*` (zelfde namen zonder prefix). Alles retourneert een Promise; zetten worden gebufferd als de verbinding weg is.
Realtime: één kanaal `game:<id>` met postgres_changes op alle vijf tabellen (filter `game_id`) en presence `{device_id, players}`. Storage-bucket `monster` is publiek leesbaar; uploaden via het dashboard (chat 8).

## Walkietalkie (live monster) — zie MONSTER-AGENT.md
`openWalkie({ mon, context, onClose }) → { update(text), close(), open }` (js/walkie.js). `mon.live(phase, { out, in })` met phase `luister|denk|praat|null` (js/monster.js); zolang de walkie open is doet `mon.say()` niets. `audio.setRecording(on)` (js/audio.js) zet de iOS-audioSession op `auto` tijdens de walkie. Edge Function `monster-token` (GET, header `apikey`) → `{ token }` voor `Conversation.startSession({ conversationToken, connectionType:'webrtc', dynamicVariables })`. Eén walkie per groep: alleen de spreektelefoon (`isSpeakerPhone()`). Dynamic variable `begroeting` (uit `LINES.walkie`); "over en sluiten" hangt op, ophangen zonder belt één keer terug.

## Stem — js/voice.js
`voice.speak(text) → { done, level(), stop(), duration }` (gooit een fout als het niet lukt), `voice.prewarm(texts)`, `uitspraak(text)` (Evy → Eevie). Bron: bucket `monster/tts/<VOICE_VERSION>/<sha256>.mp3`, anders Edge Function `monster-tts` (POST `{text, v}` → `{url}`). `mon.say()` gebruikt dit en valt terug op Web Speech.
