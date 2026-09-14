import {parseDate,parseAmount,categorize} from './engine.mjs';

// PDF text order is not table order: reconstruct baselines and column positions.
export function textLines(items){
 const words=items.filter(i=>typeof i.str==='string'&&i.str.trim()).map(i=>({text:i.str.replace(/\u00a0/g,' '),x:i.transform[4],y:-i.transform[5],width:i.width||0,height:Math.abs(i.height||i.transform[3])||10})).sort((a,b)=>a.y-b.y||a.x-b.x);
 const lines=[];
 for(const word of words){let line=lines.at(-1);if(!line||Math.abs(line.y-word.y)>Math.min(3,word.height*.28)){line={y:word.y,height:word.height,words:[]};lines.push(line)}line.words.push(word)}
 return lines.map((line,index)=>{const chunks=[];for(const word of line.words.sort((a,b)=>a.x-b.x)){const last=chunks.at(-1);const gap=last?word.x-(last.x+last.width):Infinity;if(last&&gap<Math.max(4,word.height*.45)){last.text+=(gap>word.height*.12?' ':'')+word.text;last.width=Math.max(last.width,word.x+word.width-last.x)}else chunks.push({...word})}return {...line,chunks,line:index+1,text:chunks.map(c=>c.text).join('  ')}});
}
const keyFor=text=>{const n=text.toLowerCase().replace(/[^a-z]/g,'');
 if(/^(valuedate|valuedt)$/.test(n))return 'valueDate';
 if(/^(date|dt|txndate|transactiondate|postingdate|transdate)$/.test(n))return 'date';
 if(/^(description|narration|particulars|details|remarks|transactiondetails|transactionremarks|transactiondescription)$/.test(n))return 'description';
 if(/^(?:(?:withdrawals?|debits?)(?:amt|amount)?(?:dr|inr|rs)?|dr)$/.test(n))return 'debit';
 if(/^(?:(?:deposits?|credits?)(?:amt|amount)?(?:cr|inr|rs)?|cr)$/.test(n))return 'credit';
 if(/^(balance|closingbalance|runningbalance|balanceinr|balancers)$/.test(n))return 'balance';
 if(/^(amount|transactionamount|amountinr|amountrs|txnamount)$/.test(n))return 'amount';
 if(/^(drcr|crdr|type|transactiontype|debitcredit|creditdebit)$/.test(n))return 'type';
 if(/^(ref|refno|referenceno|reference|chequeno|chqno|chqrefno|chequerefno|transactionid|txnid|srno|sno)$/.test(n))return 'reference';
 return null;
};
function headerAt(lines,i){
 const detect=chunks=>{const cols=[];for(const c of chunks){const key=keyFor(c.text);if(key&&!cols.some(x=>x.key===key))cols.push({key,x:c.x,width:c.width,center:c.x+c.width/2})}const keys=cols.map(c=>c.key);if(!keys.includes('date')&&keys.includes('valueDate'))cols.find(c=>c.key==='valueDate').key='date';return cols.some(c=>c.key==='date')&&cols.some(c=>c.key==='description')&&cols.some(c=>['debit','credit','amount'].includes(c.key))?cols.sort((a,b)=>a.center-b.center):null};
 const one=detect(lines[i].chunks);if(one)return {columns:one,end:i};
 if(lines[i+1]&&lines[i+1].y-lines[i].y<=20){const two=detect([...lines[i].chunks,...lines[i+1].chunks]);if(two)return {columns:two,end:i+1}}
 return null;
}
function cellsFor(line,columns){
 const cells=Object.fromEntries(columns.map(c=>[c.key,'']));cells.ambiguous=[];
 for(const chunk of line.chunks){const center=chunk.x+chunk.width/2;let nearest=0;for(let i=0;i<columns.length-1;i++){const boundary=(columns[i].center+columns[i+1].center)/2;if(center>boundary)nearest=i+1}
  const col=columns[nearest],key=col.key;
  if(['debit','credit','amount','balance'].includes(key)){
   const left=nearest?(columns[nearest-1].center+col.center)/2:-Infinity;
   const right=nearest<columns.length-1?(col.center+columns[nearest+1].center)/2:Infinity;
   const inBand=chunk.x>=left-3&&chunk.x+chunk.width<=right+3;
   const overlapsHeader=chunk.x<=col.x+col.width+3&&chunk.x+chunk.width>=col.x-3;
   if(!inBand||!overlapsHeader)cells.ambiguous.push(key);
  }
  cells[key]+=(cells[key]?' ':'')+chunk.text;
 }
 return cells;
}
const datePattern=/^(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-/ ]+[A-Za-z]{3,9}[-/ ,]+\d{2,4})(?:\s|$)/;
const summaryPattern=/^(?:opening balance|closing balance|brought forward|carried forward|balance brought|balance carried|page\s+\d|statement (?:period|summary)|total(?:s| debit| credit)?(?:\s|:)|end of statement|generated (?:on|by)|this is (?:a|an)|computer generated|continued on)/i;
export function extractTable(pages){
 const rows=[],warnings=[];let lastColumns=null,lastWidth=0;let textPageCount=0;
 for(const page of pages){const lines=textLines(page.items);if(lines.reduce((n,l)=>n+l.text.length,0)<25){warnings.push(`Page ${page.number}: no readable text. It may be scanned or blank; transactions on this page have not been extracted.`);continue}textPageCount++;
  let columns=null,current=null,hasHeader=false,pageRows=0,unmatched=0;
  for(let i=0;i<lines.length;i++){
   const header=headerAt(lines,i);if(header){columns=header.columns;lastColumns=columns;lastWidth=page.width;hasHeader=true;current=null;i=header.end;continue}
   const line=lines[i];if(summaryPattern.test(line.text.trim())){current=null;continue}
   if(!columns&&lastColumns&&datePattern.test(line.text.trim())){columns=lastColumns.map(c=>({...c,x:c.x*page.width/lastWidth,width:c.width*page.width/lastWidth,center:c.center*page.width/lastWidth}));warnings.push(`Page ${page.number}: reused the previous page’s columns. Check this page’s extracted amounts carefully.`)}
   if(!columns){if(datePattern.test(line.text.trim()))unmatched++;continue}
   const cells=cellsFor(line,columns);const dateText=(cells.date||'').trim();const validDateShape=datePattern.test(dateText);
   const dated=validDateShape||(dateText&&cells.description?.trim()&&['debit','credit','amount'].some(key=>{try{return !!parseAmount(cells[key])}catch{return false}}));
   if(dated&&!validDateShape)warnings.push(`Page ${page.number}, text row ${line.line}: date needs correction. This transaction is retained for review.`);
   if(dated){current={id:`pdf-${page.number}-${line.line}`,page:page.number,line:line.line,dateText:cells.date.trim(),description:cells.description||'',debit:cells.debit||'',credit:cells.credit||'',amount:cells.amount||'',type:cells.type||'',balance:cells.balance||'',ambiguous:cells.ambiguous,mode:columns.some(c=>c.key==='debit'||c.key==='credit')?'split':'signed',raw:line.text};rows.push(current);pageRows++;if(cells.ambiguous.length)warnings.push(`Page ${page.number}, text row ${line.line}: uncertain amount column. Re-enter the amount and direction from the original PDF.`);}
   else if(current&&!cells.date?.trim()){
    if(cells.ambiguous.length){current.ambiguous.push(...cells.ambiguous);warnings.push(`Page ${page.number}, text row ${line.line}: uncertain continuation amount. Re-enter the transaction amount and direction.`)}
    const financial=['debit','credit','amount','type'];let conflicting=false;for(const key of financial){if(cells[key]?.trim()){if(current[key])conflicting=true;else current[key]=cells[key].trim()}}
    if(conflicting){warnings.push(`Page ${page.number}, text row ${line.line}: an undated amount could not be attached reliably. Check the original PDF.`);current=null;continue}
    if(cells.description?.trim()&&line.y-(lines[i-1]?.y||line.y)<30){current.description+=' '+cells.description.trim();current.raw+=' | '+line.text}
   }else if(datePattern.test(line.text.trim())){unmatched++}
  }
  if(!hasHeader&&!columns)warnings.push(`Page ${page.number}: a transaction table could not be identified. This page was not imported.`);
  else if(!pageRows)warnings.push(`Page ${page.number}: no dated transaction rows were found. Check whether this is a summary page.`);
  if(unmatched)warnings.push(`Page ${page.number}: ${unmatched} date-like text row${unmatched===1?'':'s'} could not be placed in the table.`);
 }
 if(!textPageCount)throw new Error('This PDF has no readable text. Scanned or image-only statements need OCR first. Please upload a text-based PDF or export a CSV from your bank.');
 if(!rows.length)throw new Error('No transaction table could be read from this PDF. Try a statement with Date, Description, and Debit/Credit or Amount column headings, or use CSV.');
 if(rows.length>2000)throw new Error('This PDF contains more than 2,000 candidate transactions. Upload a shorter statement period.');
 return {rows,warnings,pageCount:pages.length};
}
function pdfDate(raw){let value=raw.trim();const short=value.match(/^(\d{1,2}[-/.]\d{1,2}[-/.])(\d{2})$/);if(short)value=short[1]+'20'+short[2];const shortNamed=value.match(/^(\d{1,2}[-/ ]+[A-Za-z]{3,9}[-/ ,]+)(\d{2})$/);if(shortNamed)value=shortNamed[1]+'20'+shortNamed[2];return parseDate(value,'dmy')}
export function makeReviewRow(raw){
 const row={...raw,date:'',amountText:'',direction:'',included:false,initialError:'',unmarked:false,negative:false};
 try{row.date=pdfDate(raw.dateText)}catch{row.initialError='Check the transaction date.'}
 try{
  if(raw.mode==='split'){
   const d=parseAmount(raw.debit),c=parseAmount(raw.credit);if(d?.paise&&c?.paise)throw new Error('Both debit and credit have values. Check the amount and direction.');if(d?.suffix==='CR'||c?.suffix==='DR'||c?.negative)throw new Error('Direction markers conflict with the PDF columns.');if(!d&&!c)throw new Error('No transaction amount was found.');
   row.direction=c?.paise>0||(!d&&c)?'credit':'debit';row.amountText=(((row.direction==='credit'?c:d)?.paise||0)/100).toFixed(2);
  }else{
   const a=parseAmount(raw.amount);if(!a)throw new Error('No transaction amount was found.');row.amountText=(a.paise/100).toFixed(2);row.negative=a.negative;
   const type=raw.type.replace(/[^a-z]/gi,'').toLowerCase();const fromType=['dr','debit','d'].includes(type)?'debit':['cr','credit','c'].includes(type)?'credit':null;const fromSuffix=a.suffix?(a.suffix==='DR'?'debit':'credit'):null;
   if(type&&!fromType)throw new Error('Check the debit/credit type.');if(fromType&&fromSuffix&&fromType!==fromSuffix)throw new Error('Direction markers conflict.');if(a.negative&&(fromType||fromSuffix)==='credit')throw new Error('Negative amount conflicts with credit marker.');
   row.direction=fromType||fromSuffix||'';row.unmarked=!row.direction;
  }
 }catch(e){row.initialError+=(row.initialError?' ':'')+e.message;row.direction='';row.amountText=raw.amount||raw.debit||raw.credit||''}
 if(raw.ambiguous?.length){row.amountText='';row.direction='';row.unmarked=false;row.initialError+=(row.initialError?' ':'')+'Amount columns are ambiguous. Enter the amount and direction from the original statement.';}
 row.included=!reviewError(row);return row;
}
export function reviewError(row){try{parseDate(row.date,'iso');if(!row.description.trim())return 'Add a description.';if(row.description.length>1500)return 'Description is too long.';const amount=parseAmount(row.amountText);if(!amount||amount.negative||amount.paise<=0)return 'Enter a positive amount.';if(!['debit','credit'].includes(row.direction))return 'Choose money out or money in.';if(amount.suffix&&((amount.suffix==='DR'?'debit':'credit')!==row.direction))return 'Amount marker conflicts with direction.';return ''}catch(e){return e.message}}
export function reviewedTransactions(rows){
 const included=rows.filter(r=>r.included);if(!included.length)throw new Error('Select at least one transaction to import.');
 return included.map(r=>{const error=reviewError(r);if(error)throw new Error(`Page ${r.page}, text row ${r.line}: ${error}`);return {id:r.id,line:r.line,date:r.date,description:r.description.trim(),amount:parseAmount(r.amountText).paise,direction:r.direction,category:categorize(r.description,r.direction),sourceLabel:`PDF page ${r.page} · text row ${r.line}`}}).sort((a,b)=>a.date.localeCompare(b.date)||a.line-b.line);
}
