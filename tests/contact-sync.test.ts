import assert from 'node:assert/strict';
import { acharTelefoneConhecido, buildContactSyncBatches, chaveDeSugestao, contactKeyFromName, mapaDeTelefonesConhecidos } from '../src/services/contactSync';
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

// Sugestão de telefone: cliente só na carteira (nunca entrou no cadastro de
// contatos) também é achado; o cadastro vence quando os dois têm número.
{
  const mapa = mapaDeTelefonesConhecidos(
    [{ contactKey: contactKeyFromName('Maria Souza'), clientName: 'Maria Souza', phone: '77911112222' }],
    [
      devedor('GEOVANE DE JESUS SANTOS', '(77) 98888-7777'),
      devedor('Geovane de Jesus Santos', '77900000000'),
      devedor('MARIA SOUZA', '77933334444'),
      devedor('Sem Numero', ''),
    ],
  );
  assert.equal(mapa.get(contactKeyFromName('geovane de jesus santos'))?.phone, '(77) 98888-7777', 'carteira: primeiro título vale');
  assert.equal(mapa.get(contactKeyFromName('Maria Souza'))?.phone, '77911112222', 'cadastro vence a carteira');
  assert.equal(mapa.has(contactKeyFromName('Sem Numero')), false, 'título sem telefone não entra');
}

// Contato do cadastro sem telefone válido não apaga o número da carteira.
{
  const mapa = mapaDeTelefonesConhecidos(
    [{ contactKey: contactKeyFromName('Joao Silva'), clientName: 'Joao Silva', phone: '' }],
    [devedor('Joao Silva', '77999137848')],
  );
  assert.equal(mapa.get(contactKeyFromName('Joao Silva'))?.phone, '77999137848');
}

// CPF/CNPJ colado no nome não impede a sugestão; número curto continua valendo.
assert.equal(chaveDeSugestao('CARLOS MENDES ROCHA 12345678909'), 'carlos mendes rocha');
assert.equal(chaveDeSugestao('Carlos Mendes Rocha - 123.456.789-09'), 'carlos mendes rocha');
assert.equal(chaveDeSugestao('Loja 2'), 'loja 2');
// Tipo de empresa no fim não conta.
assert.equal(chaveDeSugestao('ALFA MOVEIS E ELETRO LTDA'), chaveDeSugestao('Alfa Moveis e Eletro EIRELI'));
assert.equal(chaveDeSugestao('Mercado Bom Preco S/A'), 'mercado bom preco');
assert.equal(chaveDeSugestao('LTDA'), 'ltda');

{
  const mapa = mapaDeTelefonesConhecidos([], [
    devedor('CARLOS MENDES ROCHA', '77900001111'),
    devedor('BETA MATERIAIS DE CONSTRUCAO', '77988881111'),
    devedor('Joao Pedro Lima', '77911110000'),
    devedor('Joao Pedro Santos', '77922220000'),
  ]);
  const cpf = acharTelefoneConhecido(mapa, 'CARLOS MENDES ROCHA 12345678909');
  assert.equal(cpf?.tipo, 'exato', 'CPF no nome do arquivo');
  assert.equal(cpf?.contato.phone, '77900001111');

  // Nome cortado pelo relatório, nos dois sentidos.
  assert.equal(acharTelefoneConhecido(mapa, 'CARLOS MENDES ROC')?.tipo, 'parecido');
  assert.equal(acharTelefoneConhecido(mapa, 'BETA MATERIAIS DE CONSTRUCAO LTDA')?.contato.phone, '77988881111');

  // Carteira com nome cortado, arquivo com nome completo + LTDA.
  {
    const m = mapaDeTelefonesConhecidos([], [devedor('ALFA MOVEIS E ELETRO', '77900002222')]);
    assert.equal(acharTelefoneConhecido(m, 'ALFA MOVEIS E ELETRO LTDA')?.contato.phone, '77900002222');
    const cortado = mapaDeTelefonesConhecidos([], [devedor('ALFA MOVEI', '77900002222')]);
    assert.equal(acharTelefoneConhecido(cortado, 'ALFA MOVEIS E ELETRO LTDA')?.tipo, 'parecido');
  }

  // Dois clientes diferentes começam igual: não sugere nenhum.
  assert.equal(acharTelefoneConhecido(mapa, 'Joao Pedro'), null);
  // Uma palavra só não basta para "parecido".
  assert.equal(acharTelefoneConhecido(mapa, 'Beta'), null);
}

console.log('PASS: aprendizado de contatos preserva o representante existente.');
