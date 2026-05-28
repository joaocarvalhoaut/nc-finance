// Debug: simulate full extraction pipeline against real PDF text
// Run: node scripts/debug-missing-records.mjs

// --- regexExtractors (with fixes applied) ---
const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}[/\\]?\d{4}-?\d{2}\b/g;
const CPF_RE = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const PHONE_RE = /\b\d{10,11}\b/g;
const DATE_RE = /\b\d{2}\/\d{2}\/\d{4}\b/g;
const CURRENCY_RE = /R\$\s*([\d.,]+)/gi;
// FIX 8a: \s* instead of \s+
const DOC_TYPE_RE = /\b(Duplicata\s*Mercantil|Nota\s+Promiss[oó]ria|Cheque|Boleto|NF[e]?|Recibo|Contrato|D\.M\.|DM)\b/gi;
const STATUS_RE = /\b(Aberto|Pago|Parcial|Vencido|Cancelado|Liquidado|Protestado|Em\s+atraso)\b/gi;

function findAllCNPJ(text) {
  return [...text.matchAll(new RegExp(CNPJ_RE.source, "g"))].map(m => ({ value: m[0], index: m.index }));
}
function findAllDates(text) {
  return [...text.matchAll(new RegExp(DATE_RE.source, "g"))].map(m => m[0]);
}
function parseBRLAmount(raw) {
  const s = raw.trim().replace(/R\$\s*/gi, "");
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", "."));
  return parseFloat(s);
}
function findAllCurrencies(text) {
  return [...text.matchAll(new RegExp(CURRENCY_RE.source, "gi"))]
    .map(m => parseBRLAmount(m[1]))
    .filter(n => Number.isFinite(n) && n > 0);
}
function findFirstPhone(text) {
  const exclusions = [
    ...text.matchAll(new RegExp(CNPJ_RE.source, "g")),
    ...text.matchAll(new RegExp(CPF_RE.source, "g")),
  ].map(m => [m.index, m.index + m[0].length]);
  for (const m of text.matchAll(new RegExp(PHONE_RE.source, "g"))) {
    const start = m.index;
    const end = start + m[0].length;
    const overlaps = exclusions.some(([a, b]) => start < b && end > a);
    if (!overlaps) return m[0];
  }
  return null;
}

const HEADER_WORDS = new Set([
  "empresa","sacado","telefone","tipo","titulo","vencimento","dias","valor","estado",
  "emissao","emissão","pagamento","pago","cnpj","cpf","lista","recebiveis","recebíveis",
  "data","registro","nfe","nf","serie","numero","no",
]);
function isHeaderWord(word) {
  const norm = word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return HEADER_WORDS.has(norm);
}
function cleanName(raw) {
  return raw.split(/\s+/).filter(t => t.length > 1 && !isHeaderWord(t) && !/^\d+$/.test(t)).join(" ").trim();
}
function score(r) {
  let s = 0;
  if (r.client && r.client.length >= 3) s += 30;
  if (r.document) s += 25;
  if (r.dueDate) s += 25;
  if (r.value && r.value > 0) s += 20;
  return s;
}

// Raw PDF text as extracted by pdfjs (page 1 + page 2)
const rawText = `Lista de Recebiveis   Data: 07/05/2026 15:05:11  Empresa   Cnpj/Cpf Empresa   Sacado   Telefone   Tipo   Nr Titulo   Vencimento   Dias   Valor   Estado   Emissao NFE   Pagamento   Valor Pago  ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   IDERLANDIO JESUS DE OLIVEIRA   33988245204  Duplicata Mercantil   4254-2   10/05/2026   0   R$   715,66 Aberto   11/03/2026   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   MENEZES E BATISTA LTDA ME   3835721919   Duplicata Mercantil   4240-2   09/05/2026   0   R$   760,20 Aberto   11/03/2026   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   COLCHOES E CIA DE BRASILANDIA LTDA   3835622844   Duplicata Mercantil   1243/002   11/05/2026   0   R$   833,20 Aberto   10/03/2026   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   RAMOS MOVEIS E ELETRO LTDA   38834801030  Duplicata Mercantil   1244/002   11/05/2026   0   R$6.459,60 Aberto   11/03/2026   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   MENEZES E BATISTA LTDA ME   3835721919   Duplicata Mercantil   1241/002   11/05/2026   0   R$   403,52 Aberto   10/03/2026   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   FRANCISCO FERREIRA MOTA   3399137048   Duplicata Mercantil   CH01-3   10/05/2026   0   R$5.600,00 Aberto   04/02/2026   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   ELETROMAIS MOBILIADORA LTDA   2737591519   Duplicata Mercantil   2433-5   11/05/2026   0   R$2.436,00 Aberto   12/12/2025   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   SEBASTIAO BATISTA DA SILVA   27999881536  Duplicata Mercantil   2431/9   11/05/2026   0   R$1.315,89 Aberto   12/12/2025   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   DM CASA   27999263037  Duplicata Mercantil   2427/5   08/05/2026   0   R$2.633,80 Aberto   12/12/2025   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   SETE 4 SETE BRASIL LTDA   38836622169  Duplicata Mercantil   1049/5   11/05/2026   0   R$5.208,20 Aberto   12/12/2025   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   BARAO COLCHOES LTDA   3835614074   Duplicata Mercantil   1047/5   11/05/2026   0   R$2.025,40 Aberto   12/12/2025   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   BARAO COLCHOES LTDA   3835614074   Duplicata Mercantil   3524/5   11/05/2026   0   R$1.597,80 Aberto   12/12/2025   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   BENDICASA MOVEIS E ELETRO LTDA   3831003223   Duplicata Mercantil   1051/5   11/05/2026   0   R$6.532,20 Aberto   12/12/2025   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   SETA REPRESENTACAO COMERCIAL LTDA   27732259295  Duplicata Mercantil   2466-4   13/05/2026   0   R$2.004,53 Aberto   04/02/2026   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   IGOR OLIVEIRA PINTO 07413478579   77988165596  Duplicata Mercantil   FCH01-3   15/05/2026   0   R$1.940,00 Aberto   04/02/2026   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   MENEZES E BATISTA LTDA ME   3835721919   Duplicata Mercantil   4239-2   09/05/2026   0   R$   544,96 Aberto   11/03/2026   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   L7 PROMOCOES E PAGAMENTOS LTDA 48143632000  Duplicata Mercantil   4246-2   09/05/2026   0   R$1.728,97 Aberto   11/03/2026   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO 51.382.654/0001-68   SUPER MOVEIS DA VOVO LTDA   3899073980   Duplicata Mercantil 4241-2   09/05/2026   0   R$2.248,00 Aberto   11/03/2026   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   MENEZES E BATISTA LTDA ME   3835721919   Duplicata Mercantil   1242/002   11/05/2026   0   R$   253,40 Aberto   10/03/2026   R$   0,00 ORTHOMAX INDUSTRIA E COMERCIO   51.382.654/0001-68   GIL MOVEIS E ELETRODOMESTICOS LTDA   77999861948  Duplicata Mercantil   F01-3   14/05/2026   0   R$2.941,16 Aberto   04/02/2026   R$   0,00  Total:   R$ 48,182.49   R$ 0.00  iRecebiveis - Versao 20160330 Todos os direitos reservados WBA Software`;

// Normalize
const text = rawText.replace(/[ \t]+/g, " ").trim();

const cnpjs = findAllCNPJ(text);
console.log(`Found ${cnpjs.length} CNPJs\n`);

const passed = [];
const failed = [];

for (let i = 0; i < cnpjs.length; i++) {
  const { value: cnpjValue, index: cnpjStart } = cnpjs[i];
  const cnpjEnd = cnpjStart + cnpjValue.length;
  const prevEnd = i === 0 ? 0 : cnpjs[i-1].index + cnpjs[i-1].value.length;
  const beforeCnpj = text.slice(prevEnd, cnpjStart);
  const nextStart = cnpjs[i+1]?.index ?? text.length;
  const tail = text.slice(cnpjEnd, nextStart);

  const supplier = cleanName(beforeCnpj).slice(0, 120) || null;
  const phone = findFirstPhone(tail);

  let clientEnd = tail.length;
  if (phone) {
    clientEnd = tail.indexOf(phone);
  } else {
    const firstDateMatch = tail.match(new RegExp(DATE_RE.source));
    if (firstDateMatch) clientEnd = tail.indexOf(firstDateMatch[0]);
  }
  const clientRaw = tail.slice(0, clientEnd);
  const client = cleanName(clientRaw).slice(0, 120) || null;

  const afterPhone = phone
    ? tail.slice(tail.indexOf(phone) + phone.length)
    : tail.slice(clientEnd);

  const docTypeMatch = afterPhone.match(new RegExp(DOC_TYPE_RE.source, "i"));
  const docType = docTypeMatch ? docTypeMatch[0].replace(/\s+/g, " ").trim() : null;

  let docNumber = null;
  if (docType) {
    const afterDocType = afterPhone.slice(
      afterPhone.toLowerCase().indexOf(docType.toLowerCase()) + docType.length
    ).trim();
    const m = afterDocType.match(/^([A-Z]{0,4}\d[\w/-]{0,20})/i);
    docNumber = m ? m[1] : null;
  }
  if (!docNumber) {
    // FIX 8b: \d{1,} instead of \d{2,}
    const docFallbackRe = /\b([A-Z]{1,4}\d[\d-]{0,15}(?:\/\d{1,6})?|\d{3,}[-/]\d{1,}(?:[-/]\d{1,})?)\b/gi;
    for (const m of afterPhone.matchAll(docFallbackRe)) {
      const candidate = m[1];
      if (/^\d{2}\/\d{2}(\/\d{4})?$/.test(candidate)) continue;
      if (candidate.replace(/\D/g, "").length < 2) continue;
      docNumber = candidate;
      break;
    }
  }

  const dates = findAllDates(tail);
  const dueDate = dates[0] ?? null;
  const currencies = findAllCurrencies(tail);
  const value = currencies[0] ?? null;
  const statusMatch = tail.match(new RegExp(STATUS_RE.source, "i"));
  const status = statusMatch ? statusMatch[0] : null;

  const record = { client, supplier, cnpj: cnpjValue, document: docNumber, dueDate, value, phone, status, docType, confidenceScore: 0 };
  record.confidenceScore = score(record);

  const passScore = record.confidenceScore >= 50;
  const passFinal = passScore && !!client && !!dueDate && !!value;

  const icon = passFinal ? "✓" : "✗";
  console.log(`[${i+1}] ${icon} score=${record.confidenceScore} client="${client}" doc="${docNumber}" date="${dueDate}" value=${value} phone=${phone}`);
  if (!passFinal) {
    console.log(`   FAIL reason: score<50=${!passScore} noClient=${!client} noDueDate=${!dueDate} noValue=${!value}`);
    console.log(`   tail (first 200): "${tail.slice(0, 200)}"`);
    failed.push(i+1);
  } else {
    passed.push(i+1);
  }
}

console.log(`\nPassed: ${passed.length} → [${passed.join(",")}]`);
console.log(`Failed: ${failed.length} → [${failed.join(",")}]`);
