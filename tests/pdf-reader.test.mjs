import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readStatementPDF} from '../dist/pdf-reader.mjs';
import {makeReviewRow,reviewedTransactions} from '../dist/pdf-engine.mjs';

// Node-only rendering primitives for the PDF.js module. The website uses browser primitives.
const require=createRequire(import.meta.url);
const canvas=require(process.env.PDF_TEST_CANVAS_MODULE||'@napi-rs/canvas');
for(const key of ['DOMMatrix','ImageData','Path2D'])globalThis[key]??=canvas[key];

function pdfFixture({pages=1,text=true}={}){
 const words=[['Date',40,750],['Description',140,750],['Debit',350,750],['Credit',440,750],['Balance',515,750],['01/04/2026',40,730],['Groceries',140,730],['100.00',350,730],['900.00',515,730],['02/04/2026',40,710],['Salary',140,710],['500.00',440,710],['1400.00',515,710]];
 const stream=text?words.map(([s,x,y])=>`BT /F1 10 Tf 1 0 0 1 ${x} ${y} Tm (${s}) Tj ET`).join('\n'):'';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 const kids=[];for(let i=0;i<pages;i++){const id=objects.length+1;kids.push(`${id} 0 R`);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id+1} 0 R >>`,`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);}
 objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`;
 let source='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(source));source+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(source);source+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return new File([source],'synthetic-statement.pdf',{type:'application/pdf'});
}
const result=await readStatementPDF(pdfFixture({pages:2}));
assert.equal(result.pageCount,2);assert.equal(result.rows.length,4);
const reviewed=result.rows.map(makeReviewRow);assert.ok(reviewed.every(r=>r.included));
assert.deepEqual(reviewed.map(r=>r.direction),['debit','credit','debit','credit']);
assert.deepEqual(reviewedTransactions(reviewed).map(t=>t.amount),[10000,10000,50000,50000]);
await assert.rejects(()=>readStatementPDF(pdfFixture({pages:51})),/more than 50/);
await assert.rejects(()=>readStatementPDF(pdfFixture({text:false})),/no readable text/);
await assert.rejects(()=>readStatementPDF(new File(['invalid PDF'],'bad.pdf')),/could not be read/);
const controller=new AbortController();controller.abort();
await assert.rejects(()=>readStatementPDF(pdfFixture(),{signal:controller.signal}),e=>e.name==='AbortError');
console.log('PASS: actual PDF.js extraction, multiple pages, review conversion, page limit, empty PDF, malformed PDF, and cancellation.');
