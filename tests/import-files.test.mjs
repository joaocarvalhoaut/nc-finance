// Importação com arquivos reais (XLSX, CSV, PDF), do arquivo ao registro.
// Run: node tests/import-files.test.mjs   (dados fictícios)
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const canvas=require('@napi-rs/canvas');
Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,ImageData:canvas.ImageData,Path2D:canvas.Path2D});
const r=await build({entryPoints:['src/services/localDocumentExtraction/index.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['tesseract.js'],plugins:[{name:'node-pdf-worker',setup(b){
b.onResolve({filter:/pdfjs-dist.*\?url$/},()=>({path:'worker',namespace:'worker'}));
b.onLoad({filter:/.*/,namespace:'worker'},()=>({contents:'export default '+JSON.stringify(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href),loader:'js'}));
b.onResolve({filter:/^pdfjs-dist\/legacy\/build\/pdf.mjs$/},args=>({path:pathToFileURL(require.resolve(args.path)).href,external:true}));
}}]});
const m={exports:{}};new Function('module','exports','require',r.outputFiles[0].text)(m,m.exports,require);
const {lerArquivo,interpretarDocumento}=m.exports;
const ler=async(file)=>interpretarDocumento(await lerArquivo(file));
const silencio=console.log;console.log=(...a)=>{if(!String(a[0]).startsWith('{"source"'))silencio(...a);};

// XLSX com data e número de verdade. Antes a data saía no formato de exibição
// americano ("6/15/26") e não era reconhecida.
const XLSX=require('xlsx');
const aba=XLSX.utils.aoa_to_sheet([['Relatório de cobrança'],[],['Cliente','Documento','Vencimento','Valor','Celular'],['Cliente Ficticio','NF-10',new Date(2026,5,15),1234.5,11987654321],['Segundo Cliente','NF-11',new Date(2026,6,1),99,'(21) 3333-4444 / (21) 99888-7766']],{cellDates:true});
const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,aba,'Vencidos');
const xlsx=await ler(new File([XLSX.write(book,{type:'buffer',bookType:'xlsx'})],'carteira.xlsx'));
assert.equal(xlsx.records.length,2);
assert.deepEqual(xlsx.records.map(x=>x.dueDate),['15/06/2026','01/07/2026']);
assert.deepEqual(xlsx.records.map(x=>x.value),[1234.5,99]);
assert.deepEqual(xlsx.records.map(x=>x.phone),['11987654321','21998887766']);
assert.match(xlsx.resumo,/Planilha, aba “Vencidos”/);

// CSV exportado por ERP em Windows-1252, com acento.
const csv=Buffer.from('Sacado;Vencto;Vlr;Fone\r\nJOSÉ CONCEIÇÃO;20/06/26;1.250,00;31 98877-6655\r\n','latin1');
const c=await ler(new File([csv],'export.csv'));
assert.equal(c.records[0].client,'JOSÉ CONCEIÇÃO');
assert.equal(c.records[0].dueDate,'20/06/2026');
assert.equal(c.records[0].value,1250);

// PDF de relatório em colunas, com uma linha sem telefone.
const {jsPDF}=require('jspdf');const pdf=new jsPDF();pdf.setFontSize(9);
const linha=(y,cols)=>cols.forEach(([x,t])=>t&&pdf.text(t,x,y));
linha(20,[[10,'Sacado'],[80,'Telefone'],[115,'Título'],[140,'Vencimento'],[170,'Valor']]);
linha(28,[[10,'IDERLANDIO JESUS DE OLIVEIRA'],[80,'33988245284'],[115,'4254-2'],[140,'10/05/2026'],[170,'R$ 715,66']]);
linha(34,[[10,'FRANCISCO MOTA'],[80,''],[115,'CH01-3'],[140,'11/05/2026'],[170,'R$ 5.400,00']]);
linha(40,[[10,'MENEZES E BATISTA LTDA ME'],[80,'38 3572-1919'],[115,'4240-2'],[140,'09/05/2026'],[170,'R$ 760,20']]);
pdf.text('Página 1 de 1',10,60);
const p=await ler(new File([pdf.output('arraybuffer')],'relatorio.pdf'));
assert.equal(p.method,'tabela-pdf');
assert.deepEqual(p.records.map(x=>x.client),['IDERLANDIO JESUS DE OLIVEIRA','FRANCISCO MOTA','MENEZES E BATISTA LTDA ME']);
assert.deepEqual(p.records.map(x=>x.phone),['33988245284','','3835721919']);
assert.deepEqual(p.records.map(x=>x.value),[715.66,5400,760.2]);

await assert.rejects(()=>lerArquivo(new File(['invalid'],'arquivo.exe')));
console.log=silencio;
console.log('XLSX, CSV Windows-1252 e PDF em colunas: do arquivo ao registro, validados.');
