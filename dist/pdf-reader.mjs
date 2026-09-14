import {extractTable} from './pdf-engine.mjs';
let library;
export async function readStatementPDF(file,{password='',signal,onProgress=()=>{}}={}){
 library ||= import('./vendor/pdfjs/pdf.mjs');
 const pdfjs=await library;if(signal?.aborted)throw new DOMException('Canceled','AbortError');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
 const bytes=new Uint8Array(await file.arrayBuffer());if(signal?.aborted)throw new DOMException('Canceled','AbortError');
 const task=pdfjs.getDocument({data:bytes,password,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,useWasm:false,enableXfa:false,stopAtErrors:true});
 const abort=()=>{task.destroy().catch(()=>{})};signal?.addEventListener('abort',abort,{once:true});
 try{
  const pdf=await task.promise;if(pdf.numPages>50)throw new Error('This PDF has more than 50 pages. Upload a shorter statement period.');const pages=[];
  for(let p=1;p<=pdf.numPages;p++){if(signal?.aborted)throw new DOMException('Canceled','AbortError');onProgress(`Reading PDF page ${p} of ${pdf.numPages}…`);const page=await pdf.getPage(p);const content=await page.getTextContent();pages.push({number:p,width:page.getViewport({scale:1,rotation:0}).width,items:content.items});page.cleanup()}
  return extractTable(pages);
 }catch(e){if(signal?.aborted)throw new DOMException('Canceled','AbortError');if(e.name==='PasswordException'){const error=new Error(e.code===2?'That password did not unlock the PDF. Please try again.':'This PDF is password protected. Enter its password to continue.');error.name='PDFPasswordError';throw error}if(e.name==='InvalidPDFException')throw new Error('This file could not be read as a PDF. Download the statement again and retry.');throw e}
 finally{signal?.removeEventListener('abort',abort);await task.destroy().catch(()=>{})}
}
