import {extractTable, makeReviewRow} from '../dist/pdf-engine.mjs';

// Synthetic PDF.js TextItems. No files in the Site checkout are changed.
export const word = (str, x, y, width = str.length * 5) => ({
  str, transform: [10, 0, 0, 10, x, 800 - y], width, height: 10,
});
const headers = (debit = 'Debit') => [
  word('Date', 20, 20, 20), word('Description', 110, 20, 55),
  word(debit, 300, 20), word('Credit', 400, 20, 30),
  word('Balance', 500, 20, 35),
];
const transaction = ({date = '01/04/2026', y = 40, description = 'Groceries', amount = '100.00', x = 305, width = 30} = {}) => [
  word(date, 20, y, 50), word(description, 110, y),
  word(amount, x, y, width), word('9,000.00', 510, y, 40),
];
const page = items => ({number: 1, width: 600, items});
export const fixtures = {
  alignedDebit: [page([...headers(), ...transaction()])],
  alignedCredit: [page([...headers(), ...transaction({x: 405})])],
  rightEdgeAlignedDebit: [page([...headers(), ...transaction({amount: '1000.00', x: 290, width: 35})])],
  amountCrossesBand: [page([...headers(), ...transaction({amount: '1,000.00', x: 350, width: 40})])],
  amountMissesHeader: [page([...headers(), ...transaction({x: 370, width: 25})])],
  unrecognizedDebitHeader: [page([...headers('Withdrawals (Dr.)'), ...transaction()])],
  missingYear: [page([...headers(), ...transaction(), ...transaction({date: '02/04', y: 55, description: 'Coffee', amount: '200.00'})])],
  repeatedHeader: [page([...headers(), ...transaction(), ...headers().map(i => ({...i, transform: [...i.transform.slice(0, 5), 730]})), ...transaction({date: '02/04/2026', y: 90, description: 'Coffee', amount: '200.00'})])],
};

const failures = [];
const outcomes = {};
for (const [name, pages] of Object.entries(fixtures)) {
  try {
    const extracted = extractTable(pages);
    outcomes[name] = {warnings: extracted.warnings, rows: extracted.rows.map(makeReviewRow)};
  } catch (error) {
    outcomes[name] = {error: error.message, rows: [], warnings: []};
  }
}
const require = (condition, message) => {if (!condition) failures.push(message);};
for (const [name, direction, amount] of [['alignedDebit', 'debit', '100.00'], ['alignedCredit', 'credit', '100.00'], ['rightEdgeAlignedDebit', 'debit', '1000.00']]) {
  const rows = outcomes[name].rows;
  require(rows.length === 1 && rows[0].included && rows[0].direction === direction && rows[0].amountText === amount, `${name}: ordinary aligned transaction must retain its correct amount and direction`);
}
for (const name of ['amountCrossesBand', 'amountMissesHeader']) {
  const rows = outcomes[name].rows;
  require(rows.length === 1 && !rows[0].included, `${name}: ambiguous amount must remain visible and excluded until confirmed`);
}
{
  const rows = outcomes.unrecognizedDebitHeader.rows;
  require(rows.length === 1 && (!rows[0].included || rows[0].direction === 'debit'), 'unrecognizedDebitHeader: debit must be correctly recognized or require confirmation, never become an included credit');
}
require(outcomes.missingYear.rows.length === 2 && !outcomes.missingYear.rows[1].included, 'missingYear: retain the second transaction for date correction');
require(outcomes.repeatedHeader.rows.length === 2 && outcomes.repeatedHeader.rows.every(r => r.included), 'repeatedHeader: retain both transactions without importing the repeated header');
for (const [name, result] of Object.entries(outcomes)) {
  console.log(JSON.stringify({name, warnings: result.warnings, error: result.error, rows: result.rows.map(({date, amountText, direction, included, initialError}) => ({date, amountText, direction, included, initialError}))}));
}
console.log(JSON.stringify({passed: Object.keys(fixtures).length - failures.length, failures}));
process.exitCode = failures.length ? 1 : 0;

