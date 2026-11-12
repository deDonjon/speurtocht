// node test/node-spooktoestel.mjs — dezelfde speler op twee toestellen telt maar één keer (het laatst verbonden toestel wint).
import assert from 'node:assert/strict';
import { state } from '../js/state.js';
import { rolesOf } from '../js/roles.js';
const t0 = '2026-11-12T17:00:00Z', t1 = '2026-11-12T17:30:00Z';
state.set({ device: { id: 'dev-b', players: ['job'] }, players: [{ id: 'job', name: 'Job' }, { id: 't2', name: 'Test 2' }] });

state.presence({ 'dev-a': { players: ['job'], at: t0 }, 'dev-b': { players: ['job'], at: t1 } });
assert.deepEqual(state.devices(), ['dev-b'], 'spooktoestel dev-a telt niet');
assert.deepEqual(rolesOf('dev-b', 0), ['radio', 'kaart', 'werkbank'], 'echte telefoon heeft alle rollen');
assert.deepEqual(rolesOf('dev-a', 0), [], 'spooktoestel heeft geen rol');
console.log('✓ zelfde speler op twee toestellen: laatste wint');

state.presence({ 'dev-a': { players: ['job'], at: t1 }, 'dev-b': { players: ['job'], at: t0 } });
assert.deepEqual(state.devices(), ['dev-a'], 'laatst verbonden toestel wint');
console.log('✓ andersom: het andere toestel neemt het over');

state.presence({ 'dev-a': { players: ['t2'], at: t0 }, 'dev-b': { players: ['job'], at: t0 } });
assert.deepEqual(state.devices(), ['dev-a', 'dev-b'], 'twee echte telefoons blijven twee');
console.log('✓ verschillende spelers: twee toestellen');

state.presence({});
assert.deepEqual(state.devices(), ['dev-b'], 'net ingelogd zonder presence: dit toestel telt');
console.log('✓ net ingelogd: eigen toestel telt');
console.log('\n4 tests goed.');
process.exit(0);
