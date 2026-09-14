import {parseCSV, normalizeRows, analyze, chartBuckets, sampleCSV, CATEGORY_COLORS, CATEGORY_ICONS} from './engine.mjs';
import {createPDFImporter} from './pdf-ui.mjs';
const icons = {
 overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 transactions:'<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
 shield:'<path d="M12 3 4 6v5c0 5 4 8 8 10 4-2 8-5 8-10V6z"/><path d="M12 8v5m0 3v.2"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
 file:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8m-8 4h5"/>',
 'arrow-up-right':'<path d="M6 18 18 6M6 6h12v12"/>',
 'arrow-down-left':'<path d="m18 6-12 12M6 6v12h12"/>',
 activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
 donut:'<path d="M12 3a9 9 0 1 0 9 9h-9zM16 3v5h5a9 9 0 0 0-5-5Z"/>',
 sparkle:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
 duplicate:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
 cart:'<path d="M3 4h2l2 12h11l3-8H6m3 12v.1m8-.1v.1"/>',
 home:'<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/>',
 food:'<path d="M5 3v6a3 3 0 0 0 6 0V3M8 3v18M19 3c-4 3-4 9 0 10v8m0-18v10"/>',
 travel:'<rect x="5" y="3" width="14" height="15" rx="4"/><path d="M5 11h14M8 7h8m-8 8h1m6 0h1M8 18l-2 3m10-3 2 3"/>',
 repeat:'<path d="M4 10V6h14l-3-3m3 3-3 3M20 14v4H6l3 3m-3-3 3-3"/>',
 salary:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8 6V3h8v3M3 11h18m-11 0v3h4v-3"/>',
 heart:'<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 8 15 8 15S25 10 20 5Z"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.transactions}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));

const $ = id => document.getElementById(id);
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = amount => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2,minimumFractionDigits:amount%100?2:0}).format(amount/100);
const shortMoney = amount => {const a=amount/100;return a>=1e7?`₹${+(a/1e7).toFixed(1)}Cr`:a>=1e5?`₹${+(a/1e5).toFixed(1)}L`:a>=1000?`₹${+(a/1000).toFixed(1)}k`:money(amount)};
const dateLabel = (date,opts={day:'numeric',month:'short',year:'numeric'}) => date ? new Date(date+'T00:00:00Z').toLocaleDateString('en-IN',{...opts,timeZone:'UTC'}) : '—';
const state={transactions:[],analysis:null,name:'',demo:true,issues:[],metadataRows:0,notes:[],dismissed:new Set(),page:0};
let parsedFile=null,selectedFileName='',fileRequest=0;
const pageSize=10;
function metricAmount(n){const parts=new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}).formatToParts(Math.abs(n)/100);const whole=parts.filter(p=>p.type!=='fraction'&&p.type!=='decimal').map(p=>p.value).join('');const cents=parts.find(p=>p.type==='fraction').value;return `${n<0?'−':''}₹${whole}<span>.${cents}</span>`}
function liveAlerts(){return (state.analysis?.alerts||[]).filter(a=>!state.dismissed.has(a.id))}
function setData(transactions,name,demo,issues=[],metadataRows=0,notes=[]){const analysis=analyze(transactions);Object.assign(state,{transactions,analysis,name,demo,issues,metadataRows,notes,dismissed:new Set(),page:0});render()}
function loadSample(){const parsed=parseCSV(sampleCSV());const normalized=normalizeRows(parsed,{mapping:parsed.mapping,layout:'split',dateFormat:'dmy'});setData(normalized.transactions,'A month in Mumbai',true);return {transactionCount:state.transactions.length,moneyOutPaise:state.analysis.moneyOut,moneyInPaise:state.analysis.moneyIn}}
function render(){
 const a=state.analysis;const active=liveAlerts();const hasData=state.transactions.length>0;
 $('statement-name').textContent=hasData?state.name:'No statement loaded';
 $('statement-meta').textContent=hasData?`${dateLabel(a.start,{day:'numeric',month:'short'})} – ${dateLabel(a.end)} · ${state.transactions.length} transactions · INR`:'Upload a CSV or explore the sample';
 $('demo-badge').hidden=!state.demo||!hasData;$('clear-button').disabled=!hasData;
 const cards=[['Total money out','arrow-up-right',metricAmount(a?.moneyOut||0),`Across ${a?.debits||0} outgoing transactions`,'primary'],['Total money in','arrow-down-left',metricAmount(a?.moneyIn||0),`${a?.credits||0} incoming transactions`,''],['Net cash flow','activity',metricAmount(a?.net||0),'Money in minus money out',''],['Worth a second look','shield',`${String(active.length).padStart(2,'0')} <span class="review-tag">${active.length?'TO REVIEW':'NO FLAGS'}</span>`,`<a href="#alerts" class="metric-link">${active.length?'See what caught our eye':'See review results'} <span>↗</span></a>`,'']];
 $('summary-grid').innerHTML=cards.map(([label,i,value,foot,cls])=>`<article class="metric-card ${cls}"><div class="metric-label">${label}${icon(i)}</div><div class="metric-value">${value}</div><div class="metric-foot">${foot}</div></article>`).join('');
 $('nav-alert-count').textContent=active.length;$('alert-count').textContent=active.length;$('restore-alerts').hidden=!state.dismissed.size;
 const notice=$('notice');notice.hidden=!state.issues.length&&!state.metadataRows&&!state.notes.length;
 if(!notice.hidden){notice.innerHTML=`${state.issues.length?`<strong>${state.issues.length} row${state.issues.length===1?' was':'s were'} excluded.</strong> Totals include only the ${state.transactions.length} imported transaction rows. <details><summary>Review excluded rows</summary><ul>${state.issues.map(i=>`<li>${escape(i.location||`CSV line ${i.line}`)}: ${escape(i.reason)}</li>`).join('')}</ul></details>`:''}${state.metadataRows?`<div>${state.metadataRows} introductory record${state.metadataRows===1?'':'s'} before the header were skipped.</div>`:''}${state.notes.length?`<ul>${state.notes.map(n=>`<li>${escape(n)}</li>`).join('')}</ul>`:''}`}
 renderCharts();renderInsights();renderAlerts();renderTransactions();
}
function renderCharts(){
 const a=state.analysis;const buckets=chartBuckets(state.transactions);
 if(!buckets.length||!a.moneyOut){$('spending-chart').innerHTML='<div class="chart-placeholder">No outgoing transactions to chart yet.</div>';$('category-chart').innerHTML='<p class="empty-copy">Categories appear when you add outgoing transactions.</p>';return}
 const max=Math.max(...buckets.map(b=>b.amount));const top=Math.ceil(max/Math.pow(10,Math.floor(Math.log10(max))))*Math.pow(10,Math.floor(Math.log10(max)));
 const width=600,height=238,left=52,right=12,base=196,chartTop=16,inner=width-left-right,space=inner/buckets.length,bar=Math.min(29,space*.64);
 let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Outgoing spending from ${escape(dateLabel(a.start))} to ${escape(dateLabel(a.end))}, totaling ${escape(money(a.moneyOut))}.">`;
 for(let i=0;i<=3;i++){const y=base-(base-chartTop)*i/3;svg+=`<line class="chart-gridline" x1="${left}" x2="${width-right}" y1="${y}" y2="${y}"/><text class="chart-label" x="${left-11}" y="${y+4}" text-anchor="end">${escape(shortMoney(top*i/3))}</text>`}
 buckets.forEach((b,i)=>{const h=(b.amount/top)*(base-chartTop);const x=left+i*space+(space-bar)/2;svg+=`<rect class="chart-bar ${b.amount===max?'peak':''}" x="${x}" y="${base-h}" width="${bar}" height="${Math.max(h,b.amount?2:0)}" rx="4"><title>${escape(dateLabel(b.date,{day:'numeric',month:'short'}))}${b.date!==b.end?' – '+escape(dateLabel(b.end,{day:'numeric',month:'short'})):''}: ${escape(money(b.amount))}</title></rect>`;if(i%Math.max(1,Math.ceil(buckets.length/6))===0||i===buckets.length-1){if(i!==buckets.length-1||buckets.length%Math.max(1,Math.ceil(buckets.length/6))!==1)svg+=`<text class="chart-label" x="${x+bar/2}" y="224" text-anchor="middle">${escape(dateLabel(b.date,{day:'numeric',month:'short'}))}</text>`}});
 $('spending-chart').innerHTML=svg+'</svg>';
 const cats=a.categories.slice(0,5);if(a.categories.length>5)cats.push(['Other categories',a.categories.slice(5).reduce((n,c)=>n+c[1],0)]);
 let start=0;const gradient=cats.map(([c,value])=>{const end=start+value/a.moneyOut*100;const part=`${CATEGORY_COLORS[c]||'#dbe0d0'} ${start}% ${end}%`;start=end;return part}).join(',');
 $('category-chart').innerHTML=`<div class="donut" role="img" aria-label="Spending by category" style="background:conic-gradient(${gradient})"><div><span>${a.categories.length} categories</span><strong>${shortMoney(a.moneyOut)}</strong></div></div><div class="category-legend">${cats.map(([c,v])=>`<div class="category-item" title="${escape(c)}: ${escape(money(v))}"><i style="background:${CATEGORY_COLORS[c]||'#dbe0d0'}"></i><span>${escape(c)}</span><strong>${Math.round(v/a.moneyOut*100)}%</strong></div>`).join('')}</div>`;
}
function renderInsights(){
 const a=state.analysis;let title='Your next insight starts with a statement.',copy='Upload a CSV, or try the sample data to explore the dashboard.';
 if(a?.categories.length){const [cat,amount]=a.categories[0];title=`${cat} accounts for ${Math.round(amount/a.moneyOut*100)}% of your money out.`;copy=`That’s ${money(amount)} over this statement period. Categories are estimates based on transaction descriptions.`;}
 else if(state.transactions.length){title='This statement has no outgoing payments.';copy='Incoming transactions are included in your totals. Spending insights need debit transactions.'}
 $('insight-strip').innerHTML=`<span class="insight-mark">${icon('sparkle')}</span><div><strong>${escape(title)}</strong><p>${escape(copy)}</p></div><span class="insight-label">SPENDLENS INSIGHT</span>`;
}
function renderAlerts(){
 const alerts=liveAlerts();
 if(!alerts.length){const limited=state.analysis&&state.analysis.debits<8&&state.transactions.length;const message=!state.transactions.length?'Add a statement to review unusual charges.':state.dismissed.size?'You’ve reviewed all flagged charges.':'No matching duplicate or unusually large payment patterns found.';$('alert-list').innerHTML=`<p class="empty-copy">${message}${limited?'<br><small>At least 8 outgoing transactions are needed for the large-payment comparison.</small>':''}</p>`;return}
 $('alert-list').innerHTML=alerts.map(a=>`<article class="alert-row"><span class="alert-icon">${icon(a.kind==='duplicate'?'duplicate':'activity')}</span><div class="alert-copy"><strong>${escape(a.title)}</strong><p>${escape(a.description)}</p></div><span class="alert-amount">${escape(money(a.amount))}${a.transactions.length>1?' <small>each</small>':''}</span><button class="outline-button" data-review="${escape(a.id)}" aria-label="Review ${escape(a.title)}: ${escape(a.transactions[0].description)}">Review charge ↗</button></article>`).join('');
 $('alert-list').querySelectorAll('[data-review]').forEach(b=>b.addEventListener('click',()=>openAlert(b.dataset.review)));
}
function renderTransactions(){
 const sorted=[...state.transactions].reverse();const totalPages=Math.ceil(sorted.length/pageSize);state.page=Math.min(state.page,Math.max(totalPages-1,0));const visible=sorted.slice(state.page*pageSize,(state.page+1)*pageSize);const flagged=new Set(liveAlerts().flatMap(a=>a.transactions.map(t=>t.id)));
 $('transaction-count').textContent=sorted.length;
 $('transaction-body').innerHTML=visible.length?visible.map(t=>`<tr><td>${escape(dateLabel(t.date,{day:'2-digit',month:'short',year:'numeric'}))}</td><td><div class="merchant"><span class="merchant-icon">${icon(CATEGORY_ICONS[t.category])}</span><div><strong>${escape(t.description)}</strong><small>${t.direction==='credit'?'Money in':'Money out'} · ${escape(t.sourceLabel || `CSV line ${t.line}`)}</small></div></div></td><td><span class="category-tag">${escape(t.category)}</span></td><td class="review-cell ${flagged.has(t.id)?'flagged':''}">${flagged.has(t.id)?'Needs review':'—'}</td><td class="amount-cell ${t.direction==='credit'?'credit':''}">${t.direction==='credit'?'+':'−'}${escape(money(t.amount))}</td></tr>`).join(''):'<tr><td colspan="5" class="empty-state">Your transactions will appear here after you add a statement.</td></tr>';
 $('page-summary').textContent=sorted.length?`Showing ${state.page*pageSize+1}–${Math.min((state.page+1)*pageSize,sorted.length)} of ${sorted.length} transactions`:'No transactions loaded';$('previous-page').disabled=state.page===0;$('next-page').disabled=state.page+1>=totalPages;
}
function openAlert(id){const a=state.analysis.alerts.find(a=>a.id===id);if(!a)return;$('detail-title').textContent=a.title;$('detail-content').innerHTML=`<span class="detail-badge">For your review</span><p class="detail-reason">${escape(a.reason)}</p>${a.kind==='large'?`<div class="preview-note">Statement median: <strong>${escape(money(a.median))}</strong><br>Flag threshold: <strong>more than ${escape(money(a.threshold))}</strong></div><br>`:''}${a.transactions.map(t=>`<div class="detail-transaction"><div><strong>${escape(t.description)}</strong><small>${escape(dateLabel(t.date))} · ${escape(t.sourceLabel || `CSV line ${t.line}`)}</small></div><span>${escape(money(t.amount))}</span></div>`).join('')}<p class="detail-note">This is a pattern-based flag, not a fraud finding. Dismissing it keeps the transaction in your statement and totals.</p><div class="detail-actions"><button class="text-button" id="keep-alert">Keep for review</button><button class="button button-dark" id="dismiss-alert">Dismiss flag</button></div>`;$('keep-alert').onclick=()=>$('detail-dialog').close();$('dismiss-alert').onclick=()=>{state.dismissed.add(id);$('detail-dialog').close();render()};$('detail-dialog').showModal()}
function showUpload(){fileRequest++;pdfImporter.reset();parsedFile=null;selectedFileName='';$('csv-file').value='';$('mapping-section').hidden=true;$('upload-error').hidden=true;$('analyze-button').disabled=false;$('analyze-button').textContent='Analyze statement ↗';$('upload-dialog').showModal()}
function errorUpload(message){$('upload-error').textContent=message;$('upload-error').hidden=false}
function mapOptions(){return {layout:$('amount-layout').value,dateFormat:$('date-format').value,signConvention:$('sign-convention').value,mapping:Object.fromEntries(['date','description','debit','credit','amount','type'].map(k=>[k,Number($('map-'+k).value)]))}}
function updateMapping(){const split=$('amount-layout').value==='split';document.querySelectorAll('.split-field').forEach(e=>e.hidden=!split);document.querySelectorAll('.signed-field').forEach(e=>e.hidden=split);if(!parsedFile)return;const m=mapOptions().mapping;const row=parsedFile.rows[0];$('mapping-preview').textContent=`First row: ${row.cells[m.date]||'No date selected'} · ${row.cells[m.description]||'No description selected'} · ${split?`Debit: ${row.cells[m.debit]||'—'} / Credit: ${row.cells[m.credit]||'—'}`:`Amount: ${row.cells[m.amount]||'—'}`}`}
async function chooseFile(file){
 if(!file)return;const request=++fileRequest;pdfImporter.reset();parsedFile=null;$('mapping-section').hidden=true;$('upload-error').hidden=true;
 if(!/\.(csv|pdf)$/i.test(file.name)){errorUpload('Please choose a CSV or PDF statement. Excel workbooks are not supported.');return}
 if(file.size>8*1024*1024){errorUpload('This file is larger than 8 MB. Export a shorter statement period.');return}
 if(/\.pdf$/i.test(file.name)){await pdfImporter.load(file);return}
 try{const text=await file.text();if(request!==fileRequest)return;if(text.includes('\u0000'))throw new Error('This CSV encoding is not supported. Save it as CSV UTF-8 and try again.');const parsed=parseCSV(text);parsedFile=parsed;selectedFileName=file.name;
 for(const k of ['date','description','debit','credit','amount','type']){const el=$('map-'+k);el.innerHTML='<option value="-1">Not selected</option>'+parsed.headers.map((h,i)=>`<option value="${i}">${escape(h)} (column ${i+1})</option>`).join('');el.value=String(parsed.mapping[k])}
 $('amount-layout').value=parsed.mapping.debit>=0||parsed.mapping.credit>=0?'split':'signed';$('date-format').value='dmy';$('sign-convention').value='negative';$('selected-file-name').textContent=file.name;$('detected-rows').textContent=`${parsed.rows.length} data rows detected · confirm your columns below`;$('mapping-section').hidden=false;updateMapping();$('mapping-section').scrollIntoView({block:'nearest'});
 }catch(e){errorUpload(e.message)}
}
async function analyzeFile(){if(!parsedFile)return;$('upload-error').hidden=true;const button=$('analyze-button');button.disabled=true;button.textContent='Analyzing…';await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));try{const {transactions,issues}=normalizeRows(parsedFile,mapOptions());setData(transactions,selectedFileName,false,issues,parsedFile.metadataRows);$('upload-dialog').close();$('overview').scrollIntoView({behavior:'smooth'});}catch(e){errorUpload(e.message)}finally{button.disabled=false;button.textContent='Analyze statement ↗'}}
function downloadSample(){const blob=new Blob(['\uFEFF'+sampleCSV()],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='spendlens-sample-july-2026.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
const pdfImporter=createPDFImporter({onError:errorUpload,onImport:(transactions,name,issues,notes)=>{setData(transactions,name,false,issues,0,notes);$('overview').scrollIntoView({behavior:'smooth'})}});
$('upload-button').addEventListener('click',showUpload);$('sample-button').addEventListener('click',()=>{loadSample();$('overview').scrollIntoView({behavior:'smooth'})});$('clear-button').addEventListener('click',()=>{setData([],'',false);parsedFile=null;$('csv-file').value=''});$('format-button').addEventListener('click',()=>$('guide-dialog').showModal());
document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}}));
$('csv-file').addEventListener('change',e=>chooseFile(e.target.files[0]));const drop=$('drop-zone');for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragover')});for(const event of ['dragleave','drop'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('dragover')});drop.addEventListener('drop',e=>chooseFile(e.dataTransfer.files[0]));
['amount-layout','date-format','sign-convention','map-date','map-description','map-debit','map-credit','map-amount','map-type'].forEach(id=>$(id).addEventListener('change',updateMapping));$('analyze-button').addEventListener('click',analyzeFile);$('download-sample').addEventListener('click',downloadSample);$('guide-download').addEventListener('click',downloadSample);$('restore-alerts').addEventListener('click',()=>{state.dismissed.clear();render()});$('previous-page').addEventListener('click',()=>{state.page--;renderTransactions()});$('next-page').addEventListener('click',()=>{state.page++;renderTransactions()});
document.querySelectorAll('[data-nav]').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('[data-nav]').forEach(el=>el.classList.toggle('active',el===a));document.querySelector('.breadcrumb strong').textContent=a.dataset.nav==='alerts'?'Review charges':a.dataset.nav==='transactions'?'Transactions':'Overview'}));
loadSample();
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 const definitions=[{name:'read_statement_summary',title:'Read statement summary',description:'Read aggregate totals and review counts for the statement currently displayed. Does not return transaction descriptions.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(input&&Object.keys(input).length)throw new Error('No arguments are accepted.');return {sampleData:state.demo,transactions:state.transactions.length,currency:'INR',moneyOutPaise:state.analysis.moneyOut,moneyInPaise:state.analysis.moneyIn,netPaise:state.analysis.net,reviewCount:liveAlerts().length,excludedRows:state.issues.length}}},{name:'start_statement_upload',title:'Open statement upload',description:'Open the CSV or PDF upload dialog. The user must select a local statement and confirm its mapping or extracted transactions before importing.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(input&&Object.keys(input).length)throw new Error('No arguments are accepted.');if(!$('upload-dialog').open)showUpload();return {dialogOpen:$('upload-dialog').open}}}];
 for(const tool of definitions){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}


