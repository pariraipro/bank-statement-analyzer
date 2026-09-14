import assert from 'node:assert/strict';

import {parseCSV,parseDate,parseAmount,normalizeRows,analyze,chartBuckets,sampleCSV} from '../dist/engine.mjs';
const normalize=(csv,overrides={})=>{const p=parseCSV(csv);return normalizeRows(p,{mapping:p.mapping,layout:'split',dateFormat:'dmy',...overrides})};
const sample=normalize(sampleCSV());const a=analyze(sample.transactions);
assert.equal(a.moneyOut,6224500);assert.equal(a.moneyIn,8549900);assert.equal(a.net,2325400);assert.equal(a.alerts.length,3);assert.equal(sample.transactions.length,52);assert.equal(a.categories.reduce((n,c)=>n+c[1],0),a.moneyOut);assert.equal(chartBuckets(sample.transactions).reduce((n,b)=>n+b.amount,0),a.moneyOut);
assert.equal(parseAmount('₹1,23,456.78').paise,12345678);assert.equal(parseAmount('INR 1,234.50 DR').suffix,'DR');assert.equal(parseAmount('(500.00)').negative,true);assert.equal(parseAmount('0').paise,0);assert.equal(parseAmount('—'),null);assert.throws(()=>parseAmount('-500 CR'));assert.throws(()=>parseAmount('1,23,45'));assert.throws(()=>parseAmount('12.345'));
assert.equal(parseDate('03/04/2026','dmy'),'2026-04-03');assert.equal(parseDate('03/04/2026','mdy'),'2026-03-04');assert.equal(parseDate('2026-04-03'),'2026-04-03');assert.equal(parseDate('29-Feb-2024'),'2024-02-29');assert.throws(()=>parseDate('29/02/2026'));assert.throws(()=>parseDate('31/04/2026'));assert.throws(()=>parseDate('01/01/26'));
const fixture='\uFEFFSample Bank Statement\r\nDate,Narration,Withdrawal Amt.,Deposit Amt.\r\n01/07/2026,"Merchant, \"\"quoted\"\"\nMumbai","₹1,23,456.78",\r\n02/07/2026,Salary,,150000\r\n31/02/2026,Bad date,100,\r\n03/07/2026,Conflicting,100,50\r\n04/07/2026,Zero,0,\r\n05/07/2026,<img src=x onerror=alert(1)>,500,\r\n06/07/2026,Too few,5\r\n';
const mixed=normalize(fixture);assert.equal(mixed.transactions.length,4);assert.equal(mixed.issues.length,3);assert.equal(mixed.transactions[0].line,3);assert.equal(mixed.issues[0].line,6);assert.equal(analyze(mixed.transactions).moneyOut,12395678);assert.equal(analyze(mixed.transactions).moneyIn,15000000);
const signed=normalize('Date,Description,Amount,Type\n01/07/2026,Debit,500,DR\n02/07/2026,Credit,200,CR\n03/07/2026,Conflict,-300,CR',{layout:'signed'});assert.equal(signed.transactions.length,2);assert.equal(signed.issues.length,1);assert.equal(analyze(signed.transactions).moneyOut,50000);
const convention=normalize('Date,Description,Amount\n01/07/2026,Purchase,100\n02/07/2026,Refund,-25',{layout:'signed',signConvention:'positive'});assert.equal(analyze(convention.transactions).net,-7500);
const semicolon=normalize('Date;Description;Debit;Credit\n01/07/2026;Coffee;100;');assert.equal(semicolon.transactions.length,1);
assert.equal(analyze([]).moneyOut,0);assert.equal(analyze(convention.transactions).alerts.length,0);assert.throws(()=>parseCSV('Date,Description,Amount\n01/07/2026,"unclosed,100'));
console.log('PASS: totals, chart and category invariants, quoting/BOM/multiline, row accounting, INR amounts, strict dates, amount conflicts, signed conventions, duplicates and sparse-history handling.');

