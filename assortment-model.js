/* One category dictionary for assortment, competitor tasks, filters and recommendations. */
(function(root){
 'use strict';
 const normal=x=>String(x??'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru').replaceAll('ё','е');
 const unique=a=>[...new Set(a.filter(Boolean))];
 const split=x=>unique((Array.isArray(x)?x:String(x??'').split(/[;\n]/)).map(x=>String(x).trim()).filter(Boolean));
 function index(rows){
  const byName=new Map();
  for(const r of rows||[]){if(!r.name||!r.scenario||!r.task)continue;const k=normal(r.name);if(!byName.has(k))byName.set(k,[]);byName.get(k).push(r);}
  return byName;
 }
 const active=r=>normal(r.planned)!=='нет';
 function derive(names,rows){
  const lookup=index(rows),categories=[],unknown=[],inactive=[],links=[];
  for(const name of split(names)){const all=lookup.get(normal(name));if(!all){unknown.push(name);continue;}const valid=all.filter(active);if(!valid.length){inactive.push(all[0].name);continue;}categories.push(valid[0].name);for(const r of valid)links.push({category:r.name,scenario:r.scenario,task:r.task});}
  return {categories:unique(categories),unknown:unique(unknown),inactive:unique(inactive),links,scenarios:unique(links.map(x=>x.scenario)),tasks:unique(links.map(x=>x.task))};
 }
 function fromSheet(table){
  const labels=table?.cols?.map(x=>String(x.label||'').trim())||[],get=(r,h)=>String(r.c?.[labels.indexOf(h)]?.v??'').trim();
  for(const h of ['Общий сценарий','Задача','Категория','Входит в ассортимент'])if(!labels.includes(h))throw Error('Не прочитан столбец ассортимента: '+h);
  const rows=(table.rows||[]).map((r,i)=>({row:i+2,scenario:get(r,'Общий сценарий'),task:get(r,'Задача'),name:get(r,'Категория'),planned:get(r,'Входит в ассортимент')})).filter(r=>r.name&&r.scenario&&r.task);
  if(!rows.length)throw Error('Справочник категорий пуст');return rows;
 }
 function targetScenarios(rows,scenario,category){
  const base=unique((rows||[]).filter(active).filter(x=>!category||normal(x.name)===normal(category)).map(x=>x.scenario));return scenario?base.filter(x=>x===scenario):base;
 }
 const api={normal,split,derive,fromSheet,targetScenarios,active};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AssortmentModel=api;
})(typeof window!=='undefined'?window:this);
