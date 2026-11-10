/**
 * Unit tests for importarTelefones.ts (agenda .vcf / planilha → telefones da carteira).
 * Run:  npx tsx src/services/__tests__/importarTelefones.test.ts
 */

import type { Debtor } from "../../types";
import { contatosDaTabela, cruzarComCarteira, lerVcf, telefoneDe } from "../importarTelefones";

let passed = 0;
let failed = 0;
function iguais(got: unknown, want: unknown, label: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) { passed++; }
  else { failed++; console.error(`  ✗ ${label}\n    → ${JSON.stringify(got)}\n    esperado ${JSON.stringify(want)}`); }
}

// ── vCard do iPhone (3.0, item1.TEL, dobra de linha, foto) ───────────────────
const iphone = [
  "BEGIN:VCARD", "VERSION:3.0", "PRODID:-//Apple Inc.//iPhone OS 18.7//EN",
  "N:Santana;Oscar;;;", "FN:Oscar Santana",
  "TEL;type=CELL;type=VOICE;type=pref:+55 (77) 99988-7766",
  "PHOTO;ENCODING=b;TYPE=JPEG:AAAA", " BBBB", "END:VCARD",
  "BEGIN:VCARD", "VERSION:3.0", "N:;;;;", "FN:Distribuidora\\, Alfa",
  "item1.TEL;type=pref:(11) 3456-7890", "item1.X-ABLabel:_$!<Work>!$_", "END:VCARD",
  "BEGIN:VCARD", "VERSION:3.0", "N:Silva;Maria;;;", "TEL;type=HOME:123", "END:VCARD",
  "BEGIN:VCARD", "VERSION:3.0", "FN:Oscar Santana", "TEL:77 99999-0000", "END:VCARD",
].join("\r\n");
const v = lerVcf(iphone);
iguais(v.contatos, [
  { nome: "Oscar Santana", telefone: "77999887766" },
  { nome: "Distribuidora, Alfa", telefone: "1134567890" },
], "iPhone: +55 sai, item1.TEL lido, vírgula desescapada");
iguais(v.semTelefoneValido, 1, "número inválido não entra");
iguais(v.repetidos, 1, "mesmo nome duas vezes: fica o primeiro");

// ── vCard do Android (2.1, quoted-printable) ─────────────────────────────────
const android = [
  "BEGIN:VCARD", "VERSION:2.1",
  "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:;Jo=C3=A3o;;;",
  "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jo=C3=A3o Concei=C3=A7=C3=A3o",
  "TEL;CELL:061981234567", "TEL;CELL;PREF:+5561987654321", "END:VCARD",
].join("\n");
iguais(lerVcf(android).contatos, [{ nome: "João Conceição", telefone: "61987654321" }], "Android: acento em QP e telefone preferido");

// ── Planilha ─────────────────────────────────────────────────────────────────
iguais(contatosDaTabela([
  ["Código", "Razão social", "WhatsApp"],
  ["1", "Oscar Santana", "(77) 99988-7766"],
  ["2", "Maria", ""],
])?.contatos, [{ nome: "Oscar Santana", telefone: "77999887766" }], "planilha com títulos");
iguais(contatosDaTabela([
  ["Oscar Santana", "77999887766", "Bahia"],
  ["Maria Silva", "11 98765-4321", "SP"],
])?.contatos.map(c => c.telefone), ["77999887766", "11987654321"], "planilha sem títulos: acha pelas colunas");
iguais(contatosDaTabela([["a", "b"], ["c", "d"]]), null, "sem telefone: nada");

// ── Cruzamento ───────────────────────────────────────────────────────────────
const t = (over: Partial<Debtor>): Debtor => ({
  id: "x", client: "OSCAR SANTANA DO CARMO", supplier: "", document: "1", dueDate: "25/10/2026",
  value: 100, phone: "", category: "vencidos", status: "pending", ...over,
});
const carteira = [
  t({ id: "a" }), t({ id: "b", phone: "77 91111-2222" }), t({ id: "c", phone: "77999887766" }),
  t({ id: "d", client: "Maria Silva" }), t({ id: "e", client: "Maria Silva", category: "liquidado" }),
  t({ id: "f", client: "Ana Paula" }), t({ id: "g", client: "Ana Paula Souza" }),
];
const cruz = cruzarComCarteira([
  { nome: "Oscar Santana", telefone: "77999887766" },
  { nome: "MARIA SILVA", telefone: "11987654321" },
  { nome: "Ana", telefone: "11911112222" },
  { nome: "Pedro", telefone: "11933334444" },
], carteira);
iguais(cruz.casados.map(c => [c.cliente, c.tipo, c.semTelefone, c.outroNumero, c.jaIguais]), [
  ["Maria Silva", "exato", ["d"], [], 0],
  ["OSCAR SANTANA DO CARMO", "parecido", ["a"], ["b"], 1],
], "exato primeiro; parecido = começo do nome; liquidado fica fora");
iguais(cruz.fora.map(c => c.nome), ["Ana", "Pedro"], "uma palavra só nunca casa por aproximação");

const ambiguo = cruzarComCarteira([{ nome: "Ana Paula", telefone: "11911112222" }],
  [t({ id: "f", client: "Ana Paula Souza" }), t({ id: "g", client: "Ana Paula Lima" })]);
iguais(ambiguo.casados.length, 0, "dois clientes começam igual: não chuta");

// ── Casos achados na revisão de 10/11/2026 ──
iguais(telefoneDe("015 11 98765-1111"), "11987651111", "código de operadora (015) sai");
iguais(telefoneDe("0xx77 99932-3232"), "77999323232", "0xx + DDD");
iguais(telefoneDe("11 3333-4444 / 11 98765-4321"), "11987654321", "dois números na célula: fica o celular");
iguais(telefoneDe("1439/005"), null, "documento não vira telefone");
iguais(lerVcf("BEGIN:VCARD\nVERSION:4.0\nFN:Ana Paula\nTEL;VALUE=uri;TYPE=cell:tel:+55-77-99932-3232\nEND:VCARD\n").contatos,
  [{ nome: "Ana Paula", telefone: "77999323232" }], "vCard 4.0 com tel: URI");
iguais(contatosDaTabela([
  ["Cliente", "Número", "Vencimento", "Telefone"],
  ["MARIA SILVA", "1439/005", "10/10/2026", "(11) 98765-4321"],
  ["JOSE SOUZA", "1440", "10/10/2026", "77 99932 3232"],
])?.contatos.map((c) => c.telefone), ["11987654321", "77999323232"], "coluna Número (documento) antes de Telefone não engana");
iguais(contatosDaTabela([["Contato", "Nome"], ["11 98765-4321", "MARIA SILVA"]])?.contatos,
  [{ nome: "MARIA SILVA", telefone: "11987654321" }], "coluna Contato com número não vira nome");
const maior = cruzarComCarteira([{ nome: "OSCAR SANTANA DO CARMO LTDA", telefone: "11987654322" }],
  [t({ id: "z", client: "Oscar Santana do Carmo" })]);
iguais(maior.casados.map((c) => [c.cliente, c.tipo]), [["Oscar Santana do Carmo", "parecido"]], "nome do arquivo maior que o da carteira casa como parecido");

console.log(`\n  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}\n`);
if (failed > 0) process.exit(1);
