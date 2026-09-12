export const CATEGORY_COLORS = {'Housing':'#214c3c','Food & groceries':'#78995b','Shopping':'#afce82','Transport':'#d6e6ab','Bills & subscriptions':'#98b29f','Health':'#758879','Transfers':'#c3c8b9','Cash':'#e7d9b1','Other':'#dbe0d0','Income & credits':'#6d995d'};
export const CATEGORY_ICONS = {'Housing':'home','Food & groceries':'food','Shopping':'cart','Transport':'travel','Bills & subscriptions':'repeat','Health':'heart','Transfers':'transactions','Cash':'salary','Other':'file','Income & credits':'salary'};
const normal = x => String(x ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases = {
 date:['date','transactiondate','txndate','valuedate','postingdate','transactionposteddate'],
 description:['description','narration','particulars','transactionremarks','remarks','transactiondescription','details','merchant','transactiondetails'],
 debit:['debit','debitamount','withdrawal','withdrawals','withdrawalamount','withdrawalamt','debitamt','dramount','moneyout'],
 credit:['credit','creditamount','deposit','deposits','depositamount','depositamt','creditamt','cramount','moneyin'],
 amount:['amount','transactionamount','txnamount','amountinr','transactionamountinr'],
 type:['type','drcr','crdr','transactiontype','debitorcredit','debitcredit','creditdebit']
};
function matchHeader(value,key){const n=normal(value).replace(/(?:inr|rs)$/,'');return aliases[key].includes(n)}
function tokenize(text,delimiter){
  const rows=[];let cells=[],field='',quoted=false,closed=false,line=1,start=1;
  const save=()=>{cells.push(field);if(cells.some(v=>v.trim()!==''))rows.push({cells,line:start});cells=[];field='';closed=false;start=line+1;};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}}else{field+=c;if(c==='\n')line++}continue}
    if(c==='"'){if(field.trim()!==''||closed)throw new Error(`Unexpected quote at line ${line}. Quote the entire field when it contains commas.`);quoted=true;field='';continue}
    if(c===delimiter){cells.push(field);field='';closed=false;continue}
    if(c==='\n'||c==='\r'){save();if(c==='\r'&&text[i+1]==='\n')i++;line++;continue}
    if(closed&&!/\s/.test(c))throw new Error(`Unexpected text after a closing quote at line ${line}.`);
    if(!closed)field+=c;
  }
  if(quoted)throw new Error('An opening quote has no closing quote. Please export the CSV again.');
  if(field!==''||cells.length)save();return rows;
}
export function parseCSV(text){
  if(typeof text!=='string'||!text.trim())throw new Error('This file is empty. Choose a CSV with transaction rows.');
  text=text.replace(/^\uFEFF/,'');
  let candidates=[],errors=[];
  for(const delimiter of [',',';','\t']){try{const records=tokenize(text,delimiter);let index=-1,score=0;for(let i=0;i<Math.min(records.length,40);i++){const cells=records[i].cells;const hasDate=cells.some(v=>matchHeader(v,'date'));const hasDesc=cells.some(v=>matchHeader(v,'description'));const hasAmount=cells.some(v=>['debit','credit','amount'].some(k=>matchHeader(v,k)));const s=(hasDate?4:0)+(hasDesc?3:0)+(hasAmount?3:0);if(cells.length>=3&&s>score){index=i;score=s;}}candidates.push({records,index,score,delimiter})}catch(e){errors.push(e)}}
  candidates.sort((a,b)=>b.score-a.score);
  let chosen=candidates[0];
  if(!chosen||chosen.score<4){if(errors.length&&(!chosen||chosen.records.every(r=>r.cells.length<2)))throw errors[0];throw new Error('Could not find a CSV header. Include a Date column, Description or Narration, and Debit/Credit or Amount columns.');}
  const headers=chosen.records[chosen.index].cells.map((v,i)=>v.trim()||`Column ${i+1}`);
  const rows=chosen.records.slice(chosen.index+1);
  if(rows.length>20000)throw new Error('This statement has more than 20,000 rows. Split it into smaller CSV files.');
  if(!rows.length)throw new Error('The header was found, but there are no transaction rows.');
  const mapping={};for(const k of Object.keys(aliases))mapping[k]=headers.findIndex(v=>matchHeader(v,k));
  return {headers,rows,mapping,metadataRows:chosen.index,delimiter:chosen.delimiter};
}
export function parseDate(value,format='dmy'){
 const raw=String(value??'').trim();let y,m,d;let match;
 if((match=raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))){[,y,m,d]=match.map(Number)}
 else if((match=raw.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ,]+(\d{4})$/))){d=Number(match[1]);m=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].toLowerCase().slice(0,3))+1;y=Number(match[3])}
 else if(format!=='iso'&&(match=raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))){y=Number(match[3]);d=Number(match[format==='mdy'?2:1]);m=Number(match[format==='mdy'?1:2])}
 else throw new Error('Date is missing or does not match the selected format (use a four-digit year).');
 if(y<1900||y>2100||m<1||m>12||d<1||d>31)throw new Error('Date is outside the supported range or is invalid.');
 const date=new Date(Date.UTC(y,m-1,d));if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw new Error('Date does not exist in the calendar.');
 return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
export function parseAmount(value){
 let s=String(value??'').trim();if(!s||/^(?:-|—|n\/?a|nil)$/i.test(s))return null;
 const suffix=s.match(/\s*(DR|CR)\.?$/i)?.[1]?.toUpperCase()||null;
 if(suffix)s=s.replace(/\s*(DR|CR)\.?$/i,'').trim();
 s=s.replace(/^(?:INR|Rs\.?)\s*/i,'').replace(/^₹\s*/,'').trim();
 let negative=false;if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1).trim()}
 if(s.startsWith('-')){if(negative)throw new Error('Amount has two negative signs.');negative=true;s=s.slice(1).trim()}else if(s.startsWith('+'))s=s.slice(1).trim();
 if(!/^\d[\d,]*(?:\.\d{1,2})?$/.test(s))throw new Error('Amount is not a valid rupee value with up to two decimal places.');
 const [whole,fraction='']=s.split('.');
 if(whole.includes(',')&&!/^\d{1,3}(?:,\d{3})+$/.test(whole)&&!/^\d{1,2}(?:,\d{2})*,\d{3}$/.test(whole))throw new Error('Amount has invalid comma grouping.');
 const paise=Number(whole.replaceAll(',',''))*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(paise)||paise>1e12)throw new Error('Amount is too large to analyze accurately.');
 if(negative&&suffix==='CR')throw new Error('Amount has a negative sign and a conflicting CR marker.');
 return {paise,negative,suffix};
}
export function categorize(description,direction){
 if(direction==='credit')return 'Income & credits';const d=description.toLowerCase();
 const rules=[['Housing',/\brent\b|housing|landlord|maintenance society/],['Food & groceries',/swiggy|zomato|blinkit|zepto|bigbasket|dmart|d-mart|grocer|restaurant|cafe|coffee|starbucks|dining|bakery|freshmart/],['Transport',/uber|ola\b|metro|irctc|railway|petrol|fuel|fastag|parking|rapido|bus ticket/],['Bills & subscriptions',/netflix|spotify|prime membership|hotstar|jio|airtel|electric|broadband|internet bill|subscription|youtube|water bill|insurance|gas bill/],['Health',/pharmacy|hospital|medical|apollo|clinic|health|medplus/],['Shopping',/amazon|flipkart|myntra|shopping|electronics|croma|ajio|decathlon/],['Cash',/\batm\b|cash withdrawal/],['Transfers',/\bneft\b|\bimps\b|\brtgs\b|self transfer|own account|transfer to|credit card payment/]];
 return rules.find(([,re])=>re.test(d))?.[0]||'Other';
}
function typeDirection(raw){const n=normal(raw);if(!n)return null;if(['dr','debit','withdrawal','withdraw','d','purchase'].includes(n))return 'debit';if(['cr','credit','deposit','c','refund'].includes(n))return 'credit';throw new Error('Transaction type is unrecognized. Use DR/CR or debit/credit.');}
export function normalizeRows(parsed,options){
 const m=options.mapping;if(!Number.isInteger(m.date)||m.date<0||!Number.isInteger(m.description)||m.description<0)throw new Error('Select both a date column and a description column.');
 const selected=[m.date,m.description];
 if(options.layout==='split'){if(m.debit<0&&m.credit<0)throw new Error('Select at least a debit or credit column.');selected.push(m.debit,m.credit)}else{if(m.amount<0)throw new Error('Select an amount column.');selected.push(m.amount,m.type)}
 const used=selected.filter(i=>Number.isInteger(i)&&i>=0);if(new Set(used).size!==used.length)throw new Error('Each selected column must have a different role.');
 const transactions=[],issues=[];
 for(const row of parsed.rows){try{
   if(row.cells.length!==parsed.headers.length)throw new Error(`Expected ${parsed.headers.length} columns, found ${row.cells.length}.`);
   const date=parseDate(row.cells[m.date],options.dateFormat);const description=String(row.cells[m.description]||'').trim();if(!description)throw new Error('Transaction description is missing.');
   if(description.length>1500)throw new Error('Description exceeds 1,500 characters.');
   let amount,direction;
   if(options.layout==='split'){
     const debit=m.debit>=0?parseAmount(row.cells[m.debit]):null;const credit=m.credit>=0?parseAmount(row.cells[m.credit]):null;
     if(debit?.paise>0&&credit?.paise>0)throw new Error('Both debit and credit contain a non-zero amount.');
     if(debit?.suffix==='CR'||credit?.suffix==='DR'||credit?.negative)throw new Error('Amount direction conflicts with its debit/credit column.');
     if(!debit&&!credit)throw new Error('Debit and credit amounts are both missing.');
     direction=credit?.paise>0||(!debit&&credit)?'credit':'debit';amount=(direction==='debit'?debit:credit)?.paise??0;
   }else{
     const a=parseAmount(row.cells[m.amount]);if(!a)throw new Error('Amount is missing.');amount=a.paise;
     const type=m.type>=0?typeDirection(row.cells[m.type]):null;const suffix=a.suffix?(a.suffix==='DR'?'debit':'credit'):null;
     if(type&&suffix&&type!==suffix)throw new Error('DR/CR marker conflicts with the transaction type.');
     if(a.negative&&type==='credit')throw new Error('Negative amount conflicts with credit transaction type.');
     direction=type||suffix||(options.signConvention==='positive'?(a.negative?'credit':'debit'):(a.negative?'debit':'credit'));
   }
   transactions.push({id:`row-${row.line}`,line:row.line,date,description,amount,direction,category:categorize(description,direction)});
 }catch(e){issues.push({line:row.line,reason:e.message})}}
 if(!transactions.length)throw new Error(`No valid transactions found. ${issues[0]?`Line ${issues[0].line}: ${issues[0].reason}`:'Check your column mapping.'}`);
 transactions.sort((a,b)=>a.date.localeCompare(b.date)||a.line-b.line);
 return {transactions,issues};
}
export function analyze(transactions){
 const debits=transactions.filter(t=>t.direction==='debit'&&t.amount>0);const credits=transactions.filter(t=>t.direction==='credit');
 const moneyOut=debits.reduce((n,t)=>n+t.amount,0),moneyIn=credits.reduce((n,t)=>n+t.amount,0);
 if(!Number.isSafeInteger(moneyOut)||!Number.isSafeInteger(moneyIn))throw new Error('Statement totals exceed the supported range.');
 const categories=Object.entries(debits.reduce((o,t)=>(o[t.category]=(o[t.category]||0)+t.amount,o),{})).sort((a,b)=>b[1]-a[1]);
 const amounts=debits.map(t=>t.amount).sort((a,b)=>a-b);const n=amounts.length;const median=n?(n%2?amounts[(n-1)/2]:(amounts[n/2-1]+amounts[n/2])/2):0;
 const alerts=[];const groups=new Map();
 for(const t of debits){const key=`${t.date}|${t.description.toLowerCase().replace(/\s+/g,' ').trim()}|${t.amount}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t)}
 for(const group of groups.values())if(group.length>1)alerts.push({id:`duplicate-${group[0].id}`,kind:'duplicate',title:'Possible duplicate payment',description:`${group.length} matching payments on the same day`,amount:group[0].amount,transactions:group,reason:`These ${group.length} outgoing transactions have the same date, description and amount. They could be repeated purchases or a duplicate charge. Compare them with your receipts; none have been removed from your totals.`});
 if(n>=8){const threshold=Math.max(median*5,1000000);for(const t of debits)if(t.amount>threshold)alerts.push({id:`large-${t.id}`,kind:'large',title:'Larger than your usual payments',description:t.description,amount:t.amount,transactions:[t],median,threshold,reason:`This payment exceeds both ₹10,000 and five times the median of your ${n} outgoing transactions in this statement. Large planned purchases and rent can trigger this rule too.`})}
 const dates=transactions.map(t=>t.date).sort();
 return {moneyOut,moneyIn,net:moneyIn-moneyOut,debits:debits.length,credits:credits.length,categories,alerts,median,start:dates[0],end:dates.at(-1)};
}
export function chartBuckets(transactions){
 if(!transactions.length)return [];const sorted=[...transactions].sort((a,b)=>a.date.localeCompare(b.date));const start=Date.parse(sorted[0].date+'T00:00:00Z'),end=Date.parse(sorted.at(-1).date+'T00:00:00Z');const days=Math.round((end-start)/86400000)+1;const step=Math.max(1,Math.ceil(days/15));const buckets=Array.from({length:Math.ceil(days/step)},(_,i)=>({date:new Date(start+i*step*86400000).toISOString().slice(0,10),end:new Date(Math.min(end,start+((i+1)*step-1)*86400000)).toISOString().slice(0,10),amount:0}));
 for(const t of sorted)if(t.direction==='debit')buckets[Math.floor((Date.parse(t.date+'T00:00:00Z')-start)/86400000/step)].amount+=t.amount;return buckets;
}
export function sampleCSV(){
 const rows=[['01','Salary — Acme Studio','','85000'],['01','Rent — July','18000',''],['02','BigBasket groceries','1840',''],['02','Mumbai Metro recharge','500',''],['03','Swiggy dinner','420',''],['03','UPI — Local stationery','185',''],['04','Uber trip','280',''],['04','DMart groceries','1265',''],['05','Spotify Premium','119',''],['05','Zomato lunch','365',''],['06','Airtel mobile bill','649',''],['06','Metro recharge','300',''],['07','Blue Tokai cafe','340',''],['07','UPI — Laundry','250',''],['08','Amazon shopping','1499',''],['08','Blinkit groceries','580',''],['09','Uber trip','320',''],['09','Apollo Pharmacy','740',''],['10','Swiggy dinner','549',''],['10','Swiggy dinner','549',''],['11','DMart groceries','1690',''],['12','Netflix subscription','499',''],['12','Metro recharge','500',''],['13','Zomato dinner','480',''],['13','UPI — Bookshop','650',''],['14','Electricity bill','1840',''],['14','Zepto groceries','430',''],['15','Amazon refund','','499'],['15','Cafe coffee','260',''],['16','Uber trip','310',''],['16','Croma electronics','12999',''],['17','BigBasket groceries','1380',''],['18','Swiggy lunch','390',''],['18','Metro recharge','400',''],['19','Jio broadband','899',''],['19','Myntra shopping','1890',''],['20','UPI — Haircut','400',''],['20','Zomato dinner','620',''],['21','DMart groceries','1540',''],['22','Uber trip','290',''],['22','Spotify audiobook','99',''],['23','Apollo Pharmacy','450',''],['24','Metro recharge','300',''],['24','Blue Tokai cafe','380',''],['25','Blinkit groceries','720',''],['26','Swiggy dinner','510',''],['26','UPI — Local bakery','240',''],['27','Amazon shopping','899',''],['28','Uber trip','350',''],['29','BigBasket groceries','1120',''],['30','Zomato dinner','460',''],['31','Metro recharge','500','']];
 return 'Date,Description,Debit,Credit\r\n'+rows.map(([day,desc,debit,credit])=>`${day}/07/2026,${desc},${debit},${credit}`).join('\r\n');
}
