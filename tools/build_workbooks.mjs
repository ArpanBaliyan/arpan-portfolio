/* Author the ten downloadable workbooks using the bundled Artifact Tool. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dependencyRoot=process.env.ARTIFACT_NODE_MODULES;
const req=createRequire(dependencyRoot?path.join(dependencyRoot,'artifact-loader.cjs'):import.meta.url);
const {Workbook,SpreadsheetFile}=await import(pathToFileURL(req.resolve('@oai/artifact-tool')).href);
const projects=JSON.parse(await fs.readFile(path.join(root,'data/catalog.json'),'utf8'));
const preview=path.resolve(root,'../../work/previews');await fs.mkdir(preview,{recursive:true});
const col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s};
function style(sh,range){const r=sh.getRange(range);r.format.font={name:'Arial',size:10,color:'#173D49'};r.format.rowHeight=23;r.format.verticalAlignment='center';sh.showGridLines=false;sh.tabColor='#174958'}
for(const p of projects){
 const w=Workbook.create(),s=w.worksheets.add(p.id==='cash-flow'?'Forecast':'Overview'),r=w.worksheets.add('Records');
 const keys=p.dictionary.map(d=>d.field),n=p.data.length,last=n+1,rows=p.data.map(row=>keys.map(k=>Array.isArray(row[k])?row[k].join('; '):['week','due_date'].includes(k)&&typeof row[k]==='string'&&/^\d{4}-/.test(row[k])?new Date(row[k]+'T12:00:00Z'):row[k]));
 r.getRangeByIndexes(0,0,n+1,keys.length).values=[keys,...rows];style(r,`A1:${col(keys.length-1)}${last}`);
 r.getRange(`A1:${col(keys.length-1)}1`).format={fill:'#174958',font:{name:'Arial',bold:true,color:'#FFFFFF',size:10},rowHeight:31};
 r.getRange(`A1:${col(keys.length-1)}${last}`).format.columnWidth=28;
 keys.forEach((k,i)=>{const letter=col(i),range=r.getRange(`${letter}2:${letter}${last}`);if(k.endsWith('_usd'))range.setNumberFormat('$#,##0.00;($#,##0.00);"-"');else if(k.endsWith('_pct'))range.setNumberFormat('0.0"%"');else if(['week','due_date'].includes(k)&&typeof p.data[0][k]==='string'&&/^\d{4}-/.test(p.data[0][k]))range.setNumberFormat('mm/dd/yy');else if(typeof p.data[0][k]==='number')range.setNumberFormat('#,##0');else range.setNumberFormat('@');if(['customer','client','reason','issue','meeting','module'].includes(k))r.getRange(`${letter}1:${letter}${last}`).format.columnWidth=38;if(['next_action','decision','finding','proposed_fix','evidence_required','assumption','discovery_question'].includes(k))r.getRange(`${letter}1:${letter}${last}`).format.columnWidth=80;});
 r.tables.add(`A1:${col(keys.length-1)}${last}`,true,'Records_'+p.id.replaceAll('-','_'));r.freezePanes.freezeRows(1);
 style(s,'A1:H28');s.getRange('A1:A28').format.columnWidth=45;s.getRange('B1:H28').format.columnWidth=19;
 s.mergeCells('A2:D2');s.getRange('A2').values=[[p.name]];s.getRange('A2').format.font={name:'Arial',size:15,bold:true,color:'#173D49'};
 s.getRange('A3').values=[['Fictional case study as of 30 Oct 2026']];s.getRange('A3').format.font={italic:true,color:'#55727A',size:10};
 if(p.id==='cash-flow'){
  s.getRange('A5:B8').values=[['Opening cash (USD)',125000],['Receipt factor',1],['Refund factor',1],['Receipt shortfall','Deferred beyond the forecast horizon']];
  s.getRange('B5:B7').format.font={color:'#0000FF',size:10};s.getRange('B5').setNumberFormat('$#,##0');s.getRange('B6:B7').setNumberFormat('0%');s.getRange('B5:B7').format.fill='#FFF3D2';s.getRange('B8:H8').format.columnWidth=20;
  s.getRange('A10:H10').values=[['Week starting','Opening cash','Receipts','Suppliers','Payroll','Refunds','Other payments','Closing cash']];
  for(let i=0;i<n;i++){const rr=i+11,sr=i+2;s.getRange(`A${rr}`).values=[[new Date(p.data[i].week+'T12:00:00Z')]];s.getRange(`A${rr}`).setNumberFormat('mm/dd/yy');s.getRange(`B${rr}:H${rr}`).formulas=[[i===0?'=$B$5':`=H${rr-1}`,`=Records!B${sr}*$B$6`,`=Records!C${sr}`,`=Records!D${sr}`,`=Records!E${sr}*$B$7`,`=Records!F${sr}`,`=B${rr}+C${rr}-D${rr}-E${rr}-F${rr}-G${rr}`]];}
  s.getRange('B11:H23').setNumberFormat('$#,##0;($#,##0);"-"');s.getRange('A25:B26').values=[['Lowest closing cash',null],['Final closing cash',null]];s.getRange('B25').formulas=[['=MIN(H11:H23)']];s.getRange('B26').formulas=[['=H23']];s.getRange('B25:B26').setNumberFormat('$#,##0');s.getRange('A10:H10').format={fill:'#174958',font:{name:'Arial',color:'#FFFFFF',bold:true},rowHeight:32};
 }else{
  const ml=col(keys.indexOf(p.metric)),gl=col(keys.indexOf(p.group));
  s.getRange('A5:B6').values=[['Fictional '+p.countLabel,null],[p.metricLabel,null]];s.getRange('B5').formulas=[[`=COUNTA(Records!A2:A${last})`]];
  s.getRange('B6').formulas=[[p.unit==='COUNT'?`=COUNTIFS(Records!${col(keys.indexOf('status'))}2:${col(keys.indexOf('status'))}${last},"<>Done",Records!${col(keys.indexOf('status'))}2:${col(keys.indexOf('status'))}${last},"<>Closed",Records!${col(keys.indexOf('status'))}2:${col(keys.indexOf('status'))}${last},"<>Applied")`:`=${['PCT','HOURS'].includes(p.unit)?'AVERAGE':'SUM'}(Records!${ml}2:${ml}${last})`]];
  s.getRange('B6').setNumberFormat(p.unit==='USD'?'$#,##0.00':p.unit==='PCT'?'0.0"%"':p.unit==='HOURS'?'0.0" hours"':'#,##0');
  s.getRange('A9:C9').values=[[p.group.replaceAll('_',' '),'Records',p.unit==='COUNT'?'Share of records':p.metricLabel]];
  const groups=[...new Set(p.data.map(row=>row[p.group]))].sort();
  groups.forEach((g,i)=>{const rr=10+i;s.getRange(`A${rr}`).values=[[g]];s.getRange(`B${rr}`).formulas=[[`=COUNTIFS(Records!${gl}$2:${gl}$${last},A${rr})`]];s.getRange(`C${rr}`).formulas=[[p.unit==='COUNT'?`=B${rr}/$B$5`:`=${['PCT','HOURS'].includes(p.unit)?'AVERAGEIFS':'SUMIFS'}(Records!${ml}$2:${ml}$${last},Records!${gl}$2:${gl}$${last},A${rr})`]]});
  s.getRange(`C10:C${9+groups.length}`).setNumberFormat(p.unit==='COUNT'?'0.0%':p.unit==='PCT'?'0.0"%"':p.unit==='USD'?'$#,##0.00':'0.0');
  s.getRange('A9:C9').format={fill:'#174958',font:{name:'Arial',bold:true,color:'#FFFFFF',size:10},rowHeight:42,wrapText:true};
  const noteRow=Math.max(20,groups.length+12);s.getRange(`A${noteRow}`).values=[['Source: seeded fictional portfolio dataset.']];s.getRange(`A${noteRow+1}`).values=[['Edit the Records tab. The summary formulas update.']];
 }
 w.recalculate();
 const inspection=await w.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?',options:{useRegex:true,maxResults:10},summary:p.id+' formula check'});
 if(inspection.ndjson.includes('"error"'))throw new Error(inspection.ndjson);
 const output=await SpreadsheetFile.exportXlsx(w);await output.save(path.join(root,'projects',p.id,'workbook.xlsx'));
 for(const [sheetName,range] of [[s.name,p.id==='cash-flow'?'A1:H16':'A1:D18'],['Records','A1:D10']]){
  const image=await w.render({sheetName,range,scale:1,format:'png'});await fs.writeFile(path.join(preview,p.id+'-'+sheetName+'.png'),new Uint8Array(await image.arrayBuffer()));
 }
 console.log(p.id+': workbook and two sheet previews exported');
}
