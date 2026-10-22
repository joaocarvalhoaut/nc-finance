import assert from 'node:assert/strict';
import { buildContactSyncBatches, contactKeyFromName } from '../src/services/contactSync';
import type { Debtor } from '../src/types';

const REP_A = '11111111-1111-4111-8111-111111111111';
const REP_B = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-10-22T12:00:00.000Z';

const devedor = (client: string, phone: string, representativeId?: string): Debtor =>
  ({ id: 'x', client, phone, representativeId, document: 'D', dueDate: '01/01/2027', value: 10 } as unknown as Debtor);

// Boleto SEM representante: a coluna não pode ir no payload, senão o upsert
// grava null por cima do representante que o contato já tinha.
{
  const { comRep, semRep } = buildContactSyncBatches('u1', [devedor('Joao Silva', '77999137848')], NOW);
  assert.equal(comRep.length, 0);
  assert.equal(semRep.length, 1);
  assert.ok(!('representative_id' in semRep[0]), 'sem representante: coluna ausente do payload');
}

// Boleto COM representante: grava.
{
  const { comRep, semRep } = buildContactSyncBatches('u1', [devedor('Joao Silva', '77999137848', REP_A)], NOW);
  assert.equal(semRep.length, 0);
  assert.equal(comRep[0].representative_id, REP_A);
}

// Mesmo cliente duas vezes no lote: o segundo boleto sem representante não
// apaga o do primeiro, e o telefone fica o último válido.
{
  const { comRep, semRep } = buildContactSyncBatches('u1', [
    devedor('JOÃO SILVA', '77999137848', REP_A),
    devedor('joao silva', '77988887777'),
  ], NOW);
  assert.equal(semRep.length, 0);
  assert.equal(comRep.length, 1);
  assert.equal(comRep[0].representative_id, REP_A, 'representante do primeiro preservado');
  assert.equal(comRep[0].phone, '77988887777', 'telefone do último');
}

// Representante novo substitui o anterior dentro do lote.
{
  const { comRep } = buildContactSyncBatches('u1', [
    devedor('Joao Silva', '77999137848', REP_A),
    devedor('Joao Silva', '77999137848', REP_B),
  ], NOW);
  assert.equal(comRep[0].representative_id, REP_B);
}

// Representante inválido (não-UUID, ex.: "rep-123" legado) conta como ausente.
{
  const { comRep, semRep } = buildContactSyncBatches('u1', [devedor('Joao Silva', '77999137848', 'rep-123')], NOW);
  assert.equal(comRep.length, 0);
  assert.equal(semRep.length, 1);
}

// Telefone inválido não sincroniza nada (nem apaga nada).
{
  const { comRep, semRep } = buildContactSyncBatches('u1', [devedor('Joao Silva', '123')], NOW);
  assert.equal(comRep.length + semRep.length, 0);
}

// Chave do contato ignora acento, caixa e pontuação.
assert.equal(contactKeyFromName('João-Silva'), contactKeyFromName('JOAO SILVA'));

console.log('PASS: aprendizado de contatos preserva o representante existente.');
