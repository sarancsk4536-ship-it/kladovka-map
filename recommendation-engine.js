/* Reproducible, explicitly provisional location prioritisation. Population is
   precomputed from WorldPop 2025; competitor membership comes from live filters. */
const RecommendationEngine=(()=>{
 const valid=p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 function spatialIndex(points,step=.01){
  const bins=new Map();for(const p of points.filter(valid)){const k=Math.floor(p.lat/step)+':'+Math.floor(p.lon/step);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(p);}
  return {near(centre,radius){const dlat=radius/110500,dlon=dlat/Math.max(.1,Math.cos(centre.lat*Math.PI/180)),out=[];for(let y=Math.floor((centre.lat-dlat)/step);y<=Math.floor((centre.lat+dlat)/step);y++)for(let x=Math.floor((centre.lon-dlon)/step);x<=Math.floor((centre.lon+dlon)/step);x++)for(const p of bins.get(y+':'+x)||[]){const metres=MapFeatures.distance(centre,p);if(metres<=radius)out.push({point:p,metres});}return out.sort((a,b)=>a.metres-b.metres);}};
 }
 function coverage(near,scenarios){
  const evidence=new Set(),hypotheses=new Set();for(const {point:p}of near)for(const s of p.scenarios||[]){if(/^(Каталог|Рубрик)/.test(String(p.basis||'').trim()))evidence.add(s);else hypotheses.add(s);}
  return {documented:scenarios.filter(s=>evidence.has(s)),uncertain:scenarios.filter(s=>!evidence.has(s)&&hypotheses.has(s)),missing:scenarios.filter(s=>!evidence.has(s)&&!hypotheses.has(s))};
 }
 function floorPenalty(floor,penalty=15){return floor==='upper'?penalty:0;}
 function score(population,missing,total,{populationTarget=10000,populationWeight=60,floor='unknown',upperFloorPenalty=15}={}){
  if(!Number.isFinite(population)||population<0||!Number.isFinite(populationTarget)||populationTarget<=0||!total)return null;
  const popPoints=clamp(populationWeight,0,100)*clamp(population/populationTarget,0,1),gapPoints=(100-clamp(populationWeight,0,100))*clamp(missing/total,0,1),penalty=floorPenalty(floor,upperFloorPenalty);
  return {score:clamp(popPoints+gapPoints-penalty,0,100),popPoints,gapPoints,penalty,firstFloorScore:clamp(popPoints+gapPoints,0,100),upperFloorScore:clamp(popPoints+gapPoints-upperFloorPenalty,0,100)};
 }
 function inScope(p,{city='',district='',neighbourhood=''}={}){return Boolean((!city||p.city===city||p.cityNames?.includes(city))&&(!district||p.district===district)&&(neighbourhood==='__outside'?(p.city==='Владивосток'||p.cityNames?.includes('Владивосток'))&&!p.areaIds?.length:!neighbourhood||p.areaIds?.includes(neighbourhood)));}
 function rank({candidates,competitors,allCompetitors,scenarios,radius=500,minPopulation=1000,populationTarget=10000,populationWeight=60,upperFloorPenalty=15,defaultFloor='unknown',assumptions={},scope={},limit=10,separation=500}){
  const index=spatialIndex(competitors.filter(MapFeatures.isCompetitor)),allIndex=spatialIndex(allCompetitors.filter(MapFeatures.isCompetitor)),eligible=candidates.filter(p=>valid(p)&&inScope(p,scope)&&Number.isFinite(p.population500)&&p.population500>=minPopulation),rows=[];
  for(const p of eligible){const near=index.near(p,radius),gap=coverage(near,scenarios),floor=assumptions[p.id]?.floor||defaultFloor,parts=score(p.population500,gap.missing.length,scenarios.length,{populationTarget,populationWeight,floor,upperFloorPenalty});if(parts)rows.push({...p,...parts,floor,coverage:gap,competitorCount:near.length});}
  rows.sort((a,b)=>b.score-a.score||b.population500-a.population500||String(a.id).localeCompare(String(b.id)));
  const chosen=[];for(const row of rows){if(chosen.every(p=>MapFeatures.distance(p,row)>=separation)){const allNear=allIndex.near(row,radius);chosen.push({...row,allCoverage:coverage(allNear,scenarios),allCompetitorCount:allNear.length});if(chosen.length>=limit)break;}}
  return {rows:chosen,eligibleCount:eligible.length,evaluatedCount:rows.length,selectedCompetitors:competitors.length,unlocatedSelected:competitors.filter(p=>!valid(p)).length};
 }
 function parkingEvidence(candidate,points,maxDistance=500){
  const seen=new Set(),spots=[];
  for(const p of points){const text=String(p.parking_location||''),m=text.match(/(-?\d{1,2}\.\d+)\s*[,;]\s*(-?\d{2,3}\.\d+)/);if(!m)continue;const lat=Number(m[1]),lon=Number(m[2]),key=lat.toFixed(5)+','+lon.toFixed(5);if(seen.has(key))continue;seen.add(key);const spot={lat,lon,status:p.parking,access:p.parking_access,spaces:p.parking_spaces,url:p.parking_url,sourceStore:p.name};if(!valid(spot)||Math.abs(lat)>90||Math.abs(lon)>180)continue;const metres=MapFeatures.distance(candidate,spot);if(metres<=maxDistance)spots.push({...spot,metres});}
  spots.sort((a,b)=>(a.status==='Общедоступная рядом'?0:1)-(b.status==='Общедоступная рядом'?0:1)||a.metres-b.metres);return spots[0]||null;
 }
 return {spatialIndex,coverage,score,floorPenalty,inScope,rank,parkingEvidence};
})();
