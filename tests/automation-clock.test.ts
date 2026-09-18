import assert from 'node:assert/strict';
import { automationTime, nextAutomationStart, scheduledAutomationStart } from '../supabase/functions/_shared/automationClock';
assert.equal(automationTime(new Date('2026-09-18T11:00:00Z')),'08:00');
assert.equal(automationTime(new Date('2026-09-18T01:00:00Z')),'22:00');
assert.equal(scheduledAutomationStart('08:00',new Date('2026-09-18T10:00:00Z')),'2026-09-18T11:00:00.000Z');
assert.equal(scheduledAutomationStart('08:00',new Date('2026-09-18T12:00:00Z')),'2026-09-18T12:00:00.000Z');
assert.equal(nextAutomationStart('08:00',new Date('2026-09-18T22:00:00Z')).toISOString(),'2026-09-19T11:00:00.000Z');
assert.equal(nextAutomationStart('08:00',new Date('2026-09-18T01:00:00Z')).toISOString(),'2026-09-18T11:00:00.000Z');
assert.equal(nextAutomationStart('08:00',new Date('2026-12-31T23:00:00Z')).toISOString(),'2027-01-01T11:00:00.000Z');
console.log('PASS: UTC-3, meia-noite e virada do ano nas automações.');

import { deferredAutomationStart } from '../supabase/functions/_shared/automationClock';
for (const instant of ['2026-09-18T11:00:00Z','2026-09-18T15:30:00Z','2026-09-18T21:00:59Z']) {
  assert.equal(deferredAutomationStart('08:00:00','18:00:00',new Date(instant)),null,instant);
}
for (const [instant, expected] of [
  ['2026-09-18T10:59:59Z','2026-09-18T11:00:00.000Z'],
  ['2026-09-18T21:01:00Z','2026-09-19T11:00:00.000Z'],
  ['2026-09-19T01:30:00Z','2026-09-19T11:00:00.000Z'],
]) {
  assert.equal(deferredAutomationStart('08:00','18:00',new Date(instant))?.toISOString(),expected);
  // O mesmo horário calculado pelo worker deve ser admitido na próxima execução.
  assert.equal(deferredAutomationStart('08:00','18:00',new Date(expected)),null);
}
console.log('PASS: decisão de reagendamento do worker antes/dentro/depois da janela.');
