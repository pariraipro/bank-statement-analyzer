import {readStatementPDF} from './pdf-reader.mjs';
import {makeReviewRow,reviewError,reviewedTransactions} from './pdf-engine.mjs';
import {parseAmount} from './engine.mjs';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n/100);
export function createPDFImporter({onImport,onError}){
 let file=null,controller=null,rows=[],warnings=[],page=0,generation=0;const pageSize=6;
 function reset(){generation++;controller?.abort();controller=null;file=null;rows=[];warnings=[];page=0;$('pdf-password').value='';$('pdf-password-form').hidden=true;$('pdf-review').hidden=true;$('file-progress').hidden=true;$('pdf-confirm').checked=false;$('pdf-convention').value='';$('pdf-review-rows').replaceChildren()}
 async function load(selected,password=''){
  controller?.abort();const current=++generation;controller=new AbortController();file=selected;$('pdf-password-form').hidden=true;$('pdf-review').hidden=true;$('upload-error').hidden=true;$('file-progress').hidden=false;$('file-progress').textContent='Opening PDF…';
  try{
   const result=await readStatementPDF(selected,{password,signal:controller.signal,onProgress:text=>{if(generation===current)$('file-progress').textContent=text}});if(current!==generation)return;
   rows=result.rows.map(makeReviewRow);warnings=result.warnings;page=0;$('pdf-password').value='';$('pdf-review').hidden=false;$('pdf-confirm').checked=false;$('pdf-convention').value='';$('pdf-convention-label').hidden=!rows.some(r=>r.unmarked);
   $('pdf-file-summary').textContent=`${selected.name} · ${result.pageCount} pages · ${rows.length} candidate transactions`;
   $('pdf-warnings').hidden=!warnings.length;$('pdf-warnings').innerHTML=`<strong>Check these pages before importing.</strong><ul>${warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`;renderRows();$('pdf-review').scrollIntoView({block:'nearest'});
  }catch(e){if(current!==generation||e.name==='AbortError')return;onError(e.name==='TypeError'?'The PDF reader could not load. Check your connection and try again.':e.message);if(e.name==='PDFPasswordError'){$('pdf-password-form').hidden=false;$('pdf-password').value='';$('pdf-password').focus()}}
  finally{if(current===generation)$('file-progress').hidden=true}
 }
 function stats(){
  const included=rows.filter(r=>r.included);let out=0,incoming=0;for(const row of included){if(!reviewError(row)){const n=parseAmount(row.amountText).paise;if(row.direction==='debit')out+=n;else incoming+=n}}
  const invalid=included.filter(r=>reviewError(r)).length,unresolved=rows.filter(r=>reviewError(r)).length;
  $('pdf-review-stats').textContent=`${included.length} selected · ${rows.length-included.length} excluded${unresolved?` · ${unresolved} need correction`:''} | Money out ${money(out)} · Money in ${money(incoming)}`;
  $('pdf-import-button').disabled=!$('pdf-confirm').checked||!included.length||!!invalid;
 }
 function renderRows(){
  const visible=rows.slice(page*pageSize,(page+1)*pageSize);
  $('pdf-review-rows').innerHTML=visible.map((r,i)=>{const index=page*pageSize+i;return `<article class="pdf-row" data-index="${index}"><div class="pdf-row-top"><label><input type="checkbox" data-field="included" ${r.included?'checked':''} aria-label="Include transaction ${index+1}">Transaction ${index+1}</label><span>Page ${r.page} · text row ${r.line}</span></div><div class="pdf-row-grid"><label>Date<input type="date" data-field="date" value="${esc(r.date)}" aria-label="Date for transaction ${index+1}"></label><label class="pdf-description">Description<input type="text" data-field="description" value="${esc(r.description)}" maxlength="1500" aria-label="Description for transaction ${index+1}"></label><label>Amount (₹)<input type="text" inputmode="decimal" data-field="amountText" value="${esc(r.amountText)}" aria-label="Amount for transaction ${index+1}"></label><label>Direction<select data-field="direction" aria-label="Direction for transaction ${index+1}"><option value="" ${!r.direction?'selected':''}>Choose direction</option><option value="debit" ${r.direction==='debit'?'selected':''}>Money out (debit)</option><option value="credit" ${r.direction==='credit'?'selected':''}>Money in (credit)</option></select></label></div><p class="pdf-row-error" data-error>${esc(reviewError(r))}</p><details><summary>Show extracted source text</summary><p>${esc(r.raw)}</p>${r.initialError?`<p>Extraction note: ${esc(r.initialError)}</p>`:''}</details></article>`}).join('');
  $('pdf-page-summary').textContent=`${page*pageSize+1}–${Math.min((page+1)*pageSize,rows.length)} of ${rows.length} rows`;$('pdf-previous').disabled=page===0;$('pdf-next').disabled=(page+1)*pageSize>=rows.length;stats();
 }
 $('pdf-review-rows').addEventListener('input',e=>{const field=e.target.dataset.field;if(!field)return;const article=e.target.closest('[data-index]');const row=rows[Number(article.dataset.index)];row[field]=field==='included'?e.target.checked:e.target.value;if(field==='included')row.selectionTouched=true;if(field==='direction')row.unmarked=false;article.querySelector('[data-error]').textContent=reviewError(row);$('pdf-confirm').checked=false;stats()});
 $('pdf-confirm').addEventListener('change',stats);
 $('pdf-previous').addEventListener('click',()=>{page--;renderRows()});$('pdf-next').addEventListener('click',()=>{page++;renderRows()});
 $('pdf-convention').addEventListener('change',()=>{const convention=$('pdf-convention').value;if(!convention)return;for(const row of rows){if(row.unmarked){row.direction=convention==='positive'?(row.negative?'credit':'debit'):(row.negative?'debit':'credit');if(!row.selectionTouched)row.included=!reviewError(row)}}$('pdf-confirm').checked=false;renderRows()});
 $('pdf-password-form').addEventListener('submit',e=>{e.preventDefault();if(!file)return;if(!$('pdf-password').value){onError('Enter the PDF password.');return}const password=$('pdf-password').value;$('pdf-password').value='';load(file,password)});
 $('pdf-import-button').addEventListener('click',()=>{try{if(!$('pdf-confirm').checked)throw new Error('Review the selected transactions before importing.');const transactions=reviewedTransactions(rows);const issues=rows.filter(r=>!r.included).map(r=>({location:`PDF page ${r.page}, text row ${r.line}`,reason:reviewError(r)||'Excluded during PDF review.'}));onImport(transactions,file.name,issues,[...warnings,'PDF extraction was reviewed before import. Dates use day/month/year; two-digit years are read as 20xx.']);$('upload-dialog').close();reset()}catch(e){onError(e.message)}});
 $('upload-dialog').addEventListener('close',reset);
 return {load,reset};
}
