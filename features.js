/* Geographic distances, branch grouping, and weekly opening-hour interpretation. */
const MapFeatures=(()=>{
 const fold=s=>String(s??'').toLocaleLowerCase('ru').replaceAll('ё','е').replace(/\s+/g,' ').trim();
 const dayNames=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
 const hourCache=new Map();
 function distance(a,b){
  const rad=x=>x*Math.PI/180,lat=rad(b.lat-a.lat),lon=rad(b.lon-a.lon);
  const h=Math.sin(lat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(lon/2)**2;
  return 6371008.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
 }
 function neighbours(points,centre,radius=500,excludeKey=null){return points.filter(p=>p.key!==excludeKey&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(p=>({point:p,metres:distance(centre,p)})).filter(p=>p.metres<=radius).sort((a,b)=>a.metres-b.metres);}
 function scenarioSummary(neighbours,allScenarios){
  const rows=new Map(allScenarios.map(name=>[name,{name,total:0,documented:0,hypothesis:0}]));
  for(const {point:p} of neighbours)for(const name of new Set(p.scenarios)){
   if(!rows.has(name))rows.set(name,{name,total:0,documented:0,hypothesis:0});
   const row=rows.get(name);row.total++;if(p.basis?.startsWith('Гипотеза'))row.hypothesis++;else row.documented++;
  }
  return [...rows.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'ru'));
 }
 function vladivostokTime(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Vladivostok',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const get=t=>parts.find(p=>p.type===t)?.value;
  return {day:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(get('weekday')),minute:Number(get('hour'))*60+Number(get('minute'))};
 }
 function parseHours(text){
  text=String(text??'');if(hourCache.has(text))return hourCache.get(text);
  const week=Array.from({length:7},()=>null),exception=/предварительн|зимний период|апрель.октябрь|санитарн|до последнего рейса/i.test(text);
  const full=/^\s*(круглосуточно|24\s*\/\s*7)\s*$/i.test(text);
  if(full)for(let i=0;i<7;i++)week[i]=[[0,1440]];
  else for(const line of text.split(/[\n;]/)){
   const match=line.trim().match(/^(Пн|Вт|Ср|Чт|Пт|Сб|Вс)(?:\s*[–—-]\s*(Пн|Вт|Ср|Чт|Пт|Сб|Вс))?\s*:\s*(.*)$/i);
   if(!match)continue;
   const start=dayNames.findIndex(d=>fold(d)===fold(match[1])),end=match[2]?dayNames.findIndex(d=>fold(d)===fold(match[2])):start;
   const days=[];for(let d=start;;d=(d+1)%7){days.push(d);if(d===end)break;}
   const body=match[3],intervals=[];
   for(const time of body.matchAll(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/g)){
    const a=Number(time[1])*60+Number(time[2]),b=Number(time[3])*60+Number(time[4]);
    if(Number(time[2])>59||Number(time[4])>59||a>=1440||b>1440)continue;
    intervals.push([a,b===a&&a===0?1440:b]);
   }
   const value=/круглосуточно|24\s*\/\s*7/i.test(body)?[[0,1440]]:intervals.length?intervals:/выходн|закрыт/i.test(body)?[]:null;
   for(const d of days)week[d]=value;
  }
  const result={week,exception,full:!exception&&week.every(intervals=>intervals?.length===1&&intervals[0][0]===0&&intervals[0][1]===1440),hasAny:week.some(v=>v!==null)};
  hourCache.set(text,result);return result;
 }
 function isOpen(text,day,minute){
  const schedule=parseHours(text);if(schedule.exception)return 'unknown';
  const today=schedule.week[day],prev=schedule.week[(day+6)%7];
  if(today?.some(([a,b])=>b>a?minute>=a&&minute<b:minute>=a)||prev?.some(([a,b])=>b<a&&minute<b))return 'open';
  if(today===null)return 'unknown';
  // Before the first opening time, yesterday's missing schedule could still span midnight.
  if(prev===null&&minute<(today[0]?.[0]??0))return 'unknown';
  return 'closed';
 }
 function hoursMatch(point,mode,day,minute,now=vladivostokTime()){
  if(!mode)return true;
  if(mode==='24h')return parseHours(point.hours).full;
  if(mode==='unknown')return isOpen(point.hours,now.day,now.minute)==='unknown';
  if(mode==='now')return isOpen(point.hours,now.day,now.minute)==='open';
  if(mode==='late')return isOpen(point.hours,now.day,21*60)==='open';
  if(mode==='at')return Number.isInteger(day)&&Number.isFinite(minute)&&isOpen(point.hours,day,minute)==='open';
  return true;
 }
 const knownNetworks=new Set(['квартет вкусов','пятерочка','реми','ремисити','близкий','самбери','раз два','светофор','fix price','домовид','универсад','солнышко','юми','tiko','экономыч','мегуми','fixmarket','чудодей','галамарт','kuchenland home','офисная планета','скрепка']);
 const generic=/^(?:мини.?маркет|продуктовый мини.?маркет|(?:продуктовый )?магазин(?: .*)?|супермаркет|универсам|продукты|хозтовары|все для дома|товары для дома|1000 мелочей)$/i;
 function networkInfo(p){
  const title=String(p.network||p.name||'Без названия').trim(),normal=fold(title).replace(/реми\s*сити/,'ремисити');
  if(!p.network&&generic.test(normal))return {key:'point:'+p.key,title,verified:false,individual:true};
  return {key:'name:'+normal,title,verified:knownNetworks.has(normal)||Boolean(p.network),individual:false};
 }
 function groupNetworks(points){
  const groups=new Map();for(const p of points){const info=networkInfo(p);if(!groups.has(info.key))groups.set(info.key,{...info,points:[]});groups.get(info.key).points.push(p);}
  return [...groups.values()].sort((a,b)=>b.points.length-a.points.length||a.title.localeCompare(b.title,'ru'));
 }
 return {distance,neighbours,scenarioSummary,vladivostokTime,parseHours,isOpen,hoursMatch,networkInfo,groupNetworks,dayNames};
})();
