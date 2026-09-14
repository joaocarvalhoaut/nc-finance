import assert from 'node:assert/strict';
import { isValidDueDate, parseManualAmount } from '../src/utils/manualDebtorValidation';
for (const date of ['31/02/2026', '29/02/2025', '31/04/2026', '00/01/2026', '01/13/2026', 'abc']) assert.equal(isValidDueDate(date), false, date);
for (const date of ['29/02/2024', '14/09/2026', '31/12/2026']) assert.equal(isValidDueDate(date), true, date);
assert.equal(parseManualAmount('1.250,00'),1250);
assert.equal(parseManualAmount('125,50'),125.5);
assert.equal(parseManualAmount('100'),100);
for(const value of ['1abc','-1','0','Infinity','1,2,3','1.25','']) assert.ok(Number.isNaN(parseManualAmount(value)),value);
console.log('PASS: datas reais e valores brasileiros no cadastro manual.');
