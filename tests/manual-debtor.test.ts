import assert from 'node:assert/strict';
import { isValidDueDate, parseManualAmount } from '../src/utils/manualDebtorValidation';
for (const date of ['31/02/2026', '29/02/2025', '31/04/2026', '00/01/2026', '01/13/2026', 'abc']) assert.equal(isValidDueDate(date), false, date);
for (const date of ['29/02/2024', '14/09/2026', '31/12/2026']) assert.equal(isValidDueDate(date), true, date);
for (const date of ['1/1/2026', '2026-10-01', '01/10/26']) assert.equal(isValidDueDate(date), false, date);
assert.equal(parseManualAmount('1.250,00'),1250);
assert.equal(parseManualAmount('125,50'),125.5);
assert.equal(parseManualAmount('100'),100);
assert.equal(parseManualAmount('  1.250,00  '),1250);
assert.equal(parseManualAmount('1.234.567,89'),1234567.89);
// Ponto só vale como separador de milhar: 1.234 é mil duzentos e trinta e quatro.
assert.equal(parseManualAmount('1.234'),1234);
for(const value of ['1abc','-1','0','Infinity','1,2,3','1.25','']) assert.ok(Number.isNaN(parseManualAmount(value)),value);
// Ponto como separador decimal é recusado de propósito: "328.34" seria ambíguo
// com "328.340" truncado, e aceitar transformaria erro de digitação em cobrança
// de valor errado. A UI orienta a trocar por vírgula em vez de adivinhar.
for(const value of ['328.34','0.17','5.5','1.250.00','R$ 100','0,00','1,234']) assert.ok(Number.isNaN(parseManualAmount(value)),value);
console.log('PASS: datas reais e valores brasileiros no cadastro manual.');
