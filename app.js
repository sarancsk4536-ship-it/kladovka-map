'use strict';
const SHEET_ID='1bTyx8eIPhnzij_5aPb3AVSiPx8Ky_nJpjnsYHM2aOpc', GID='1117777643';
const CACHE_KEY='kladovka-map-v5-'+GID;
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fold=x=>String(x??'').toLocaleLowerCase('ru').replaceAll('ё','е');
const href=x=>/^https?:\/\//i.test(String(x??''))?esc(x):'';
const num=x=>x===null||x===undefined||String(x).trim()===''?null:Number(String(x).replace(/\s/g,'').replace(',','.'));
const hasCoords=p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
const money=n=>n!==null&&n!==''&&Number.isFinite(num(n))?num(n).toLocaleString('ru-RU')+' ₽':'нет данных';
const known=x=>x!==null&&x!==undefined&&!['','о','o','н/д','нет данных'].includes(fold(x).trim());
let ALL_DATA=SNAPSHOT,DATA=[],visible=[],baseVisible=[],map=null,clusters=null,markers=new Map(),busy=false,limit=60,selected=null;
let neighbourhoodLayer=null,neighbourhoodsEnabled=false,activeArea=null;
let activeNetwork=null,inspectorMode=null,zonesEnabled=false,zone=null,ringLayer=null,areaLayer=null,canvas=null;
let lastLoaded='резервный снимок от 25.10.2026';
const OVERLAY_KEY='kladovka-map-overlays-v1';let overlayDismissed={sync:false,legend:false},mapPopupOpen=false;
try{const p=JSON.parse(localStorage.getItem(OVERLAY_KEY));if(p)overlayDismissed={sync:p.sync===true,legend:p.legend===true};}catch(e){}
function updateMapOverlays(){document.querySelector('.sync-box').hidden=mapPopupOpen||overlayDismissed.sync;document.querySelector('.map-note').hidden=mapPopupOpen||overlayDismissed.legend;$('restore-sync').hidden=mapPopupOpen||!overlayDismissed.sync;$('restore-legend').hidden=mapPopupOpen||!overlayDismissed.legend;}
function dismissMapOverlay(name,hidden){if(!['sync','legend'].includes(name))return;overlayDismissed[name]=hidden;try{localStorage.setItem(OVERLAY_KEY,JSON.stringify(overlayDismissed));}catch(e){}updateMapOverlays();}

let CATALOGUE=RECOMMENDATION_DATA.catalogue||[];
function setCatalogue(rows){CATALOGUE=rows;applyData(ALL_DATA);fillFilters();rebuildMarkers();draw(false);}
function hydrate(p){
 p.category_names=AssortmentModel.split(p.category_names??p.categories??'');
 const inferred=AssortmentModel.derive(p.category_names,CATALOGUE);
 p.categories=inferred.categories;p.unknown_categories=inferred.unknown;p.inactive_categories=inferred.inactive;p.category_links=inferred.links;
 p.scenarios=inferred.scenarios;p.tasks=inferred.tasks.join('\n');
const areas=MapFeatures.areasFor(p,NEIGHBOURHOODS.features);p.areaIds=areas.map(f=>f.properties.id);p.neighbourhood=['Контур не определён','Вне Владивостока'].includes(p.neighbourhood)?'':p.neighbourhood;if(p.neighbourhood?.startsWith('Чуркин')&&!areas.some(f=>f.properties.id==='working-13')){p.neighbourhood='';p.population=null;}p.neighbourhood=areas[0]?.properties.name||p.neighbourhood||'';if(areas.length)p.population=areas[0].properties.population;p.key=/^https?:\/\//.test(p.card||'')?p.card:String(p.row);return p;}
function applyData(rows){ALL_DATA=rows.map(hydrate);DATA=ALL_DATA.filter(MapFeatures.isCompetitor);if(activeNetwork&&!DATA.some(p=>MapFeatures.networkInfo(p).key===activeNetwork))activeNetwork=null;}
applyData(ALL_DATA);
function optionList(id,key,first){
 const el=$(id),value=el.value;
 const counts=new Map();for(const p of DATA){for(const v of key==='scenarios'?p.scenarios:[p[key]||'Не указан'])counts.set(v,(counts.get(v)||0)+1);}
 el.replaceChildren(new Option(first,''));
 for(const [v,n] of [...counts].sort((a,b)=>a[0].localeCompare(b[0],'ru')))el.add(new Option(`${v} · ${n}`,v));
 if([...el.options].some(o=>o.value===value))el.value=value;
}
function fillCategoryFilter(){
 const el=$('category'),value=el.value,chosen=$('scenario').value,counts=new Map();for(const p of DATA)for(const name of p.categories)counts.set(name,(counts.get(name)||0)+1);el.replaceChildren(new Option('Все категории',''));
 for(const scenario of AssortmentModel.targetScenarios(CATALOGUE,chosen,'')){const group=document.createElement('optgroup');group.label=scenario;const names=[...new Set(CATALOGUE.filter(c=>c.scenario===scenario&&AssortmentModel.active(c)&&counts.has(c.name)).map(c=>c.name))].sort((a,b)=>a.localeCompare(b,'ru'));for(const name of names)group.append(new Option(name+' · '+counts.get(name),name));if(names.length)el.append(group);}
 if([...el.options].some(o=>o.value===value))el.value=value;
}
function competitionUniverse(){return $('category').value?DATA.filter(p=>p.categories.includes($('category').value)):DATA;}
function categoryDetails(p){
 const groups=[...new Set(p.category_links.map(x=>x.scenario))];return '<div class="popup-caption">ПРЕДПОЛАГАЕМЫЕ КАТЕГОРИИ · '+p.categories.length+'</div><div class="category-chips">'+p.categories.slice(0,8).map(c=>'<button type="button" data-category-filter="'+esc(c)+'">'+esc(c)+'</button>').join('')+'</div><details class="category-details"><summary>Категории → задачи → сценарии · все '+p.categories.length+'</summary>'+groups.map(sc=>'<div class="category-scenario"><b>'+esc(sc)+'</b><div class="small">Частичное пересечение категорий, не весь сценарий</div>'+[...new Set(p.category_links.filter(x=>x.scenario===sc).map(x=>x.task))].map(task=>'<p><strong>'+esc(task)+'</strong><br>'+p.category_links.filter(x=>x.scenario===sc&&x.task===task).map(x=>'<button type="button" data-category-filter="'+esc(x.category)+'">'+esc(x.category)+'</button>').join(' · ')+'</p>').join('')+'</div>').join('')+'</details>'+(p.unknown_categories.length?'<div class="small evidence">Не найдены в справочнике: '+esc(p.unknown_categories.join('; '))+'. Сценарий для них не назначен.</div>':'')+(p.inactive_categories.length?'<div class="small evidence">Не учитываются: '+esc(p.inactive_categories.join('; '))+', поскольку в ассортименте стоит «нет».</div>':'');
}
function fillFilters(){optionList('city','city','Все населённые пункты');optionList('district','district','Все районы');optionList('format','format','Все форматы');optionList('scenario','scenarios','Все сценарии');optionList('parking','parking','Любая ситуация с парковкой');fillCategoryFilter();fillNeighbourhoodFilter();$('finance-scope').querySelector('option[value=address]').textContent='Есть ориентир по адресу · '+DATA.filter(p=>num(p.location_revenue)!==null).length;}
function link(url,label){return href(url)?`<a href="${href(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';}
function popup(p){
 const access={'residents_only':'только для жителей','handicapped_only':'только для людей с инвалидностью','emobile_only':'только для электромобилей','landing_place':'место высадки','Общедоступная':'общедоступная'}[p.parking_access]||p.parking_access||'не указан';
 const dist=num(p.parking_distance);
 return `<div class="popup-title"><i class="bundle-dot" style="background:${ScenarioColours.colour(ScenarioColours.key(p.scenarios))}"></i>${esc(p.name)}</div><div>${esc(p.address||'Адрес не опубликован')}</div>${p.neighbourhood?'<div class="popup-topline">Микрорайон: <b>'+esc(p.neighbourhood)+'</b></div>':''}<div class="popup-topline">Этаж / помещение: <b>${esc(known(p.floor)?p.floor:'не указан')}</b></div><div class="small">${esc(p.hours||'Время работы не указано')}</div><div class="chips">${p.scenarios.map(s=>`<span>${esc(s)}</span>`).join('')}</div>${categoryDetails(p)}<div class="small evidence">${esc(p.basis)}</div><div class="popup-caption">ПАРКОВКА</div><b>${esc(p.parking)}</b><div class="small">Мест: ${esc(p.parking_spaces||'нет данных')} · Платная: ${esc(p.parking_paid||'нет данных')}${Number.isFinite(dist)?` · ${dist} м по прямой`:''}<br>Доступ: ${esc(known(access)?access:'не указан')}<br>${esc(p.parking_location||'Ближайшая парковка не установлена')}</div><div class="small">Ближайшая нанесённая парковка; принадлежность магазину не подтверждена.</div>${p.contacts?'<div class="popup-caption">КОНТАКТЫ</div><div class="task-lines">'+esc(p.contacts)+'</div>':''}<div class="popup-caption">ЮРЛИЦО И ФИНАНСЫ</div><div>${esc(p.operator_name||'Юрлицо не установлено')}${p.operator_inn?'<br>ИНН '+esc(p.operator_inn):''}</div><div class="small">${esc(p.link_status||'Привязка не установлена')}</div>${p.operator_inn?`<div class="small">Выручка юрлица за 2025: <b>${money(p.revenue)}</b><br>Показатель всего юрлица, не отдельного магазина.</div>`:''}<div class="small evidence"><b>Связь с адресом</b><br>${esc(p.revenue_scope||'Выручка отдельного магазина не установлена')}${num(p.location_revenue)!==null?'<br>Ориентир по связанному юрлицу за 2025: <b>'+money(p.location_revenue)+'</b>':''}<br>Рентабельность места требует затрат, аренды и выручки самого магазина.</div><div class="popup-links">${hasCoords(p)?'<button type="button" class="subtle-btn" data-area-point="'+esc(p.key)+'">Сценарии в 500 м</button>':''}${link(p.card,'2ГИС')}${link(p.parking_url,'Парковка')}${link(p.bfo_url,'ГИР БО')}${link('https://docs.google.com/spreadsheets/d/'+SHEET_ID+'/edit#gid='+GID+'&range=A'+p.row,'Строка таблицы')}</div><details><summary>Источники ассортимента</summary>${(p.sources||[]).map((s,i)=>link(s,'Источник '+(i+1))).join('<br>')}</details>`;
}
function scenarioClusterIcon(cluster){
 const keys=cluster.getAllChildMarkers().map(m=>m.options.scenarioGroup||''),parts=ScenarioColours.segments(keys),mixed=parts.length>1;
 const arcs=parts.map(p=>`<circle cx="20" cy="20" r="16.5" pathLength="100" fill="none" stroke="${p.colour}" stroke-width="5" stroke-dasharray="${p.fraction*100} ${100-p.fraction*100}" stroke-dashoffset="${-p.offset*100}" transform="rotate(-90 20 20)"/>`).join('');
 return L.divIcon({className:'scenario-cluster',iconSize:[40,40],html:`<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="${mixed?'white':parts[0]?.colour||'#818b90'}" stroke="white" stroke-width="2"/>${mixed?arcs:''}</svg><span style="color:${mixed?'#293f34':'white'}" title="${keys.length} магазинов · ${parts.length} наборов сценариев">${keys.length}</span>`});
}
function drawScenarioColourLegend(){
 const groups=ScenarioColours.groups(visible.filter(hasCoords));
 $('scenario-colour-legend').innerHTML=`<b>Цвет — полный набор сценариев</b>${groups.slice(0,3).map(g=>`<div class="bundle-legend-row" title="${esc(g.scenarios.join(' · '))}"><i class="bundle-dot" style="background:${g.colour}"></i><span>${esc(g.scenarios.slice(0,2).join(' · ')||'Не указан')}${g.scenarios.length>2?' +'+(g.scenarios.length-2):''}</span><b>${g.count}</b></div>`).join('')}<button class="legend-open" type="button" data-action="scenario-colours">Все наборы на карте · ${groups.length}</button><div>Разноцветный ободок — разные наборы в кластере.</div>`;
}
function renderScenarioColours(){
 const groups=ScenarioColours.groups(visible.filter(hasCoords));map?.closePopup();openInspector('scenario-colours','Цвета наборов · '+groups.length,`<p class="inspect-sub">Одинаковый полный набор сценариев — одинаковый цвет, независимо от сети и формата магазина. Порядок сценариев и повторы не влияют на цвет.</p><p class="inspect-note">Числа — магазины с координатами в текущих фильтрах. Одноцветный кластер содержит один набор, разноцветный ободок показывает доли разных наборов. При большом числе наборов оттенки могут быть близкими; точный состав указан здесь и в карточках.</p>${groups.map(g=>`<div class="colour-group"><div><i class="bundle-dot" style="background:${g.colour}"></i><b>${g.count} магазинов · ${g.scenarios.length} сценариев</b></div><p>${esc(g.scenarios.join(' · ')||'Сценарии не заполнены')}</p></div>`).join('')||'<p class="empty">В этой выборке нет магазинов с координатами.</p>'}`);
}
function initMap(){
 if(!window.L){$('tile-note').textContent='Карта не запустилась. Список и фильтры доступны; обновите страницу.';return;}
 map=L.map('map',{scrollWheelZoom:true,zoomControl:false}).setView([43.16,131.94],12);
 L.control.zoom({position:'topright'}).addTo(map);
 map.on('popupopen',()=>{mapPopupOpen=true;updateMapOverlays();$('zone-hint').hidden=true;$('inspector').hidden=true;inspectorMode=null;if(window.matchMedia('(max-width:620px)').matches)document.querySelector('.map-wrap').scrollIntoView({behavior:'smooth',block:'start'});});
 map.on('popupclose',()=>{mapPopupOpen=false;updateMapOverlays();});
 let tilesOK=0,tileErrors=0;
 const base=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'});
 base.on('tileload',()=>{tilesOK++;$('tile-note').hidden=true;});
 base.on('tileerror',()=>{tileErrors++;if(tileErrors>3&&!tilesOK){$('tile-note').hidden=false;$('tile-note').textContent='Подложка недоступна. Точки, карточки и список работают. Для улиц нужен доступ к OpenStreetMap.';}});
 base.addTo(map);
 clusters=typeof L.markerClusterGroup==='function'?L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:38,iconCreateFunction:scenarioClusterIcon}):L.featureGroup();
 clusters.addTo(map);
 neighbourhoodLayer=L.layerGroup();
 canvas=L.canvas({padding:.5});ringLayer=L.layerGroup().addTo(map);areaLayer=L.layerGroup().addTo(map);
 map.on('click',e=>{if(window.KladovkaHypotheses?.isPlacing()){window.KladovkaHypotheses.place(e.latlng.lat,e.latlng.lng);return;}if(zonesEnabled)analyseArea({lat:e.latlng.lat,lon:e.latlng.lng},'Выбранное место');});
}
function rebuildMarkers(){
 markers.clear();if(!map)return;clusters.clearLayers();
 for(const p of DATA.filter(hasCoords)){
  const m=L.marker([p.lat,p.lon],{title:p.name,scenarioGroup:ScenarioColours.key(p.scenarios),icon:L.divIcon({className:'map-pin',html:`<i style="background:${ScenarioColours.colour(ScenarioColours.key(p.scenarios))}"></i>`,iconSize:[18,18],iconAnchor:[9,9]})});
  m.bindPopup(()=>popup(p),{maxWidth:370,minWidth:280,maxHeight:440});markers.set(p.key,m);
  m.on('click',()=>{if(zonesEnabled)analyseArea(p,p.name,p.key,false);});
 }
}
function confidence(p){return p.basis?.startsWith('Каталог')?'catalog':p.basis?.startsWith('Гипотеза')?'hypothesis':'rubric';}
function draw(fit=false){
 const q=fold($('search').value);
 const chosenTime=$('open-time').value.split(':').map(Number),now=MapFeatures.vladivostokTime();
 baseVisible=DATA.filter(p=>(!$('city').value||(p.city||'Не указан')===$('city').value)&&(!$('district').value||(p.district||'Не указан')===$('district').value)&&(!$('neighbourhood').value||$('neighbourhood').value==='__outside'&&p.city==='Владивосток'&&!p.areaIds.length||p.areaIds.includes($('neighbourhood').value))&&(!$('format').value||p.format===$('format').value)&&(!$('scenario').value||p.scenarios.includes($('scenario').value))&&(!$('category').value||p.categories.includes($('category').value))&&(!$('parking').value||p.parking===$('parking').value)&&(!$('finance-scope').value||$('finance-scope').value==='address'&&num(p.location_revenue)!==null||$('finance-scope').value==='inn'&&Boolean(p.operator_inn)||$('finance-scope').value==='unknown'&&!p.operator_inn)&&MapFeatures.hoursMatch(p,$('hours-filter').value,Number($('open-day').value),chosenTime[0]*60+chosenTime[1],now)&&(!q||fold([p.name,p.address,p.operator_name,p.operator_inn,p.tasks,p.categories.join(' '),p.neighbourhood,p.scenarios.join(' ')].join(' ')).includes(q)));
 visible=activeNetwork?baseVisible.filter(p=>MapFeatures.networkInfo(p).key===activeNetwork):baseVisible;
 const groups=MapFeatures.groupNetworks(baseVisible);
 const mapped=visible.filter(hasCoords);
 $('count').textContent=`${visible.length.toLocaleString('ru')} магазинов`;
 $('count-meta').textContent=`${mapped.length} на карте · ${visible.length-mapped.length} без координат · ${groups.length} групп в списке`;
 $('total').textContent=DATA.length+' конкурентов · '+(ALL_DATA.length-DATA.length)+' исключено в таблице';
 $('list').innerHTML=groups.slice(0,limit).map(g=>{const scenarios=[...new Set(g.points.flatMap(p=>p.scenarios))],bundles=ScenarioColours.groups(g.points);return `<button class="place network-card ${g.key===activeNetwork?'selected-network':''}" type="button" data-network="${esc(g.key)}"><span class="place-title"><span>${esc(g.title)}<span class="network-swatches" title="${bundles.length} наборов сценариев">${bundles.slice(0,4).map(g=>'<i class="bundle-dot" style="background:'+g.colour+'"></i>').join('')}</span></span><b class="branch-count">${g.points.length}</b></span><span class="place-address">${g.points.length>1?(g.verified?'Сеть':'Группа по названию')+' · выбрать филиал':esc(g.points[0].address||'Адрес не опубликован')}</span><span class="place-scenario">${new Set(g.points.flatMap(p=>p.categories)).size} категорий · ${esc(scenarios.slice(0,3).join(' · '))}${scenarios.length>3?' +'+(scenarios.length-3):''}</span></button>`;}).join('')||'<div class="empty">По выбранным условиям магазинов нет. Измените фильтры.</div>';
 $('more').hidden=groups.length<=limit;
 const network=activeNetwork?MapFeatures.groupNetworks(DATA).find(g=>g.key===activeNetwork):null;
 $('active-network').hidden=!network;
 $('active-network').innerHTML=network?`<b>${esc(network.title)}</b><span>${visible.length} из ${network.points.length} точек</span><button type="button" data-action="network-open">Филиалы</button><button type="button" data-action="network-clear" aria-label="Показать все сети">×</button>`:'';
 $('time-fields').hidden=$('hours-filter').value!=='at';
 if(clusters){clusters.clearLayers();const ms=mapped.map(p=>markers.get(p.key)).filter(Boolean);if(clusters.addLayers)clusters.addLayers(ms);else ms.forEach(m=>clusters.addLayer(m));if(fit&&mapped.length)map.fitBounds(L.latLngBounds(mapped.map(p=>[p.lat,p.lon])),{padding:[38,38],maxZoom:15,animate:false});}
 drawNeighbourhoods();drawRings();if(zone)renderArea(false);if(inspectorMode==='network')renderNetwork();if(inspectorMode==='neighbourhood'&&activeArea)renderNeighbourhood(activeArea,false);drawScenarioColourLegend();if(inspectorMode==='scenario-colours')renderScenarioColours();window.KladovkaRecommendations?.update();window.KladovkaHypotheses?.update();
}
function selectPlace(key){
 const p=DATA.find(p=>p.key===key);if(!p)return;selected=key;
 $('inspector').hidden=true;inspectorMode=null;
 if(zonesEnabled)analyseArea(p,p.name,p.key,false);
 const marker=markers.get(key);
 if(marker&&map&&visible.some(p=>p.key===key)){if(clusters.zoomToShowLayer)clusters.zoomToShowLayer(marker,()=>marker.openPopup());else{map.setView(marker.getLatLng(),16);marker.openPopup();}}
 else if(map&&hasCoords(p)){L.popup({maxWidth:370,minWidth:270,maxHeight:440}).setLatLng([p.lat,p.lon]).setContent(popup(p)).openOn(map);map.setView([p.lat,p.lon],16);}
 else{$('detail-content').innerHTML=popup(p);$('detail').showModal();}
}
function resetFilters(){for(const id of ['search','city','district','neighbourhood','format','scenario','category','parking','finance-scope','hours-filter'])$(id).value='';limit=60;}
function openInspector(mode,title,body){const resetScroll=inspectorMode!==mode||$('inspector-title').textContent!==title;$('inspector').classList.toggle('rec-mode',mode.startsWith('recommendation'));$('inspector').classList.toggle('hyp-mode',mode.startsWith('hypothesi'));inspectorMode=mode;$('inspector-title').textContent=title;$('inspector-body').innerHTML=body;if(resetScroll)$('inspector-body').scrollTop=0;$('inspector').hidden=false;if(window.matchMedia('(max-width:620px)').matches)document.querySelector('.map-wrap').scrollIntoView({behavior:'smooth',block:'start'});}
function selectNetwork(key){activeNetwork=key;map?.closePopup();inspectorMode='network';draw(true);renderNetwork();}
function branchButton(p,metres=null){return `<button class="branch" type="button" data-point="${esc(p.key)}"><b><i class="bundle-dot" style="background:${ScenarioColours.colour(ScenarioColours.key(p.scenarios))}"></i>${esc(p.name)}</b><span>${esc(p.address||'Адрес не опубликован')}${known(p.floor)?' · '+esc(p.floor):''}</span><small>${metres!==null?Math.round(metres)+' м по прямой · ':''}${esc(known(p.hours)?p.hours.split('\n')[0]:'Расписание не указано')}</small></button>`;}
function renderNetwork(){
 const group=MapFeatures.groupNetworks(DATA).find(g=>g.key===activeNetwork);if(!group){$('inspector').hidden=true;return;}
 const rows=baseVisible.filter(p=>MapFeatures.networkInfo(p).key===activeNetwork);
 openInspector('network',group.title,`<p class="inspect-sub">${rows.length} из ${group.points.length} точек с учётом фильтров. Выберите адрес, чтобы открыть карточку.</p>${!group.verified&&group.points.length>1?'<p class="inspect-note">Группировка по названию; единый владелец не подтверждён.</p>':''}<button class="subtle-btn" type="button" data-action="network-all">Все ${group.points.length} точек на карте</button><div class="branch-list">${rows.map(p=>branchButton(p)).join('')||'<p class="inspect-sub">В текущих фильтрах точек нет.</p>'}</div>`);
}
function drawRings(){
 if(!ringLayer)return;ringLayer.clearLayers();
 if(zonesEnabled)for(const p of visible.filter(hasCoords))L.circle([p.lat,p.lon],{radius:500,renderer:canvas,color:'#708853',weight:1,opacity:.55,fillOpacity:.035,interactive:false}).addTo(ringLayer);
 $('zones').setAttribute('aria-pressed',String(zonesEnabled));$('zones').textContent=zonesEnabled?'Зоны 500 м: включены':'Зоны 500 м';$('zone-hint').hidden=!zonesEnabled;$('zone-summary').hidden=!zonesEnabled||!zone;
}
function toggleZones(force){
 zonesEnabled=typeof force==='boolean'?force:!zonesEnabled;
 if(!zonesEnabled){zone=null;areaLayer?.clearLayers();if(inspectorMode==='area'){$('inspector').hidden=true;inspectorMode=null;}}
 drawRings();
}
function analyseArea(centre,title='Выбранное место',excludeKey=null,open=true){
 if(!map)return;toggleZones(true);zone={lat:centre.lat,lon:centre.lon,title,excludeKey,useFilters:zone?.useFilters||false};if(open)map.closePopup();renderArea(open);if(open){map.setView([centre.lat,centre.lon],15);if(window.matchMedia('(min-width:900px)').matches)map.panBy([130,0],{animate:false});}
}
function renderArea(open=true){
 if(!zone||!areaLayer)return;
 const source=zone.useFilters?baseVisible:DATA,near=MapFeatures.neighbours(source,zone,500,zone.excludeKey),scenarios=[...new Set(DATA.flatMap(p=>p.scenarios))],summary=MapFeatures.scenarioSummary(near,scenarios);
 areaLayer.clearLayers();L.circle([zone.lat,zone.lon],{radius:500,renderer:canvas,color:'#965333',weight:2.5,fillOpacity:.07,interactive:false}).addTo(areaLayer);
 L.circleMarker([zone.lat,zone.lon],{radius:5,renderer:canvas,color:'#965333',fillColor:'#fff',fillOpacity:1,interactive:false}).addTo(areaLayer);
 for(const {point:p} of near)L.circleMarker([p.lat,p.lon],{radius:6,renderer:canvas,color:'#fff',weight:2,fillColor:ScenarioColours.colour(ScenarioColours.key(p.scenarios)),fillOpacity:1,bubblingMouseEvents:false}).bindPopup(()=>popup(p),{maxWidth:370,maxHeight:440}).addTo(areaLayer);
 $('zone-summary').hidden=false;
 if(!open&&inspectorMode!=='area')return;
 const documented=near.filter(x=>confidence(x.point)!=='hypothesis').length;
 const body=`<p class="inspect-sub">${esc(zone.title)}<br>${zone.lat.toFixed(5)}, ${zone.lon.toFixed(5)}</p><div class="zone-metric"><b>${near.length}</b><span>магазинов в радиусе 500 м<br>${documented} по источникам · ${near.length-documented} гипотез</span></div><label class="zone-scope"><input id="zone-use-filters" type="checkbox" ${zone.useFilters?'checked':''}> Учитывать фильтры карты</label><p class="inspect-note">${zone.useFilters?'Выборка ограничена текущими фильтрами.':'Все действующие конкуренты из таблицы, независимо от фильтров карты.'} ${zone.excludeKey?'Точка в центре исключена из подсчёта.':''} Расстояние по прямой, не время пути.</p><p class="inspect-sub">Сценарии конкуренции · нажмите для списка точек</p><div class="area-scenarios">${summary.map(s=>`<details class="area-scenario"><summary><span>${esc(s.name)}<small>${s.total?s.documented+' по источникам · '+s.hypothesis+' гипотез':'Не найдены в этой выгрузке'}</small></span><b>${s.total}</b></summary>${near.filter(x=>x.point.scenarios.includes(s.name)).map(x=>branchButton(x.point,x.metres)).join('')}</details>`).join('')}</div><p class="inspect-note">Магазин может участвовать в нескольких сценариях. Ноль означает отсутствие точек в данных, а не отсутствие конкуренции на рынке.</p>`;
 openInspector('area','Конкуренты в 500 метрах',body);
}
function fillNeighbourhoodFilter(){
 const el=$('neighbourhood'),value=el.value;el.replaceChildren(new Option('Все микрорайоны',''));el.add(new Option('Владивосток: вне найденных контуров','__outside'));
 for(const f of [...NEIGHBOURHOODS.features].sort((a,b)=>a.properties.name.localeCompare(b.properties.name,'ru'))){const n=DATA.filter(p=>p.areaIds.includes(f.properties.id)).length;el.add(new Option(`${f.properties.name} · ${n}`,f.properties.id));}
 if([...el.options].some(o=>o.value===value))el.value=value;
}
function toggleNeighbourhoods(force){
 neighbourhoodsEnabled=typeof force==='boolean'?force:!neighbourhoodsEnabled;
 if(map&&neighbourhoodLayer){if(neighbourhoodsEnabled)neighbourhoodLayer.addTo(map);else map.removeLayer(neighbourhoodLayer);}
 $('neighbourhoods').setAttribute('aria-pressed',String(neighbourhoodsEnabled));$('neighbourhoods').textContent=neighbourhoodsEnabled?'Микрорайоны: включены':'Микрорайоны и население';$('neighbourhood-legend').hidden=!neighbourhoodsEnabled;drawNeighbourhoods();
}
function drawNeighbourhoods(){
 if(!neighbourhoodLayer)return;neighbourhoodLayer.clearLayers();if(!neighbourhoodsEnabled)return;
 for(const f of NEIGHBOURHOODS.features){const p=f.properties,n=DATA.filter(s=>s.areaIds.includes(p.id)).length;
 const layer=L.geoJSON(f,{style:{color:activeArea===p.id?'#855f38':'#8a8462',weight:activeArea===p.id?2.8:1.3,dashArray:p.conditional?'5 5':null,fillColor:activeArea===p.id?'#b8a06c':'#c5ca9c',fillOpacity:activeArea===p.id?.22:.10,bubblingMouseEvents:false}});
 layer.bindTooltip(`${esc(p.name)} · ${p.population===null?'население н/д':'≈ '+(p.population===0&&p.population_raw>0?'<100':p.population.toLocaleString('ru-RU'))+' чел.'}<br>${n} конкурентов`,{className:'neighbourhood-label',sticky:true,direction:'top'});
 layer.on('click',e=>{L.DomEvent.stopPropagation(e);renderNeighbourhood(p.id,true);});layer.addTo(neighbourhoodLayer);
 }
}
function renderNeighbourhood(id,zoom=true){
 const f=NEIGHBOURHOODS.features.find(f=>f.properties.id===id);if(!f)return;if(zoom)map?.closePopup();activeArea=id;const p=f.properties;
 const all=DATA.filter(s=>s.areaIds.includes(id)),filtered=baseVisible.filter(s=>s.areaIds.includes(id));
 const counts=MapFeatures.scenarioSummary(all.map(point=>({point})),[...new Set(DATA.flatMap(s=>s.scenarios))]);
 const body=`<p class="inspect-sub">Владивосток · ${esc(p.boundary_status)}</p>${p.conditional?'<p class="inspect-note"><b>Условная граница.</b> '+esc(p.boundary_method)+' Оценка населения относится к рабочему контуру.</p>':''}<div class="population-figure">${p.population===null?'Нет оценки':(p.population===0&&p.population_raw>0?'&lt;100':'≈ '+p.population.toLocaleString('ru-RU'))}</div><div class="small">жителей · модель WorldPop ${p.population_year||'2025'} · сетка 100 м<br>Округлено до сотен, это не перепись микрорайона.</div><div class="neighbourhood-metrics"><div><b>${all.length}</b>конкурентов в контуре</div><div><b>${filtered.length}</b>в текущих фильтрах</div></div><button class="subtle-btn" type="button" data-neighbourhood-filter="${esc(id)}">Показать магазины микрорайона</button><p class="inspect-note">${esc(p.population_kind)}. ${p.area_km2?Number(p.area_km2).toLocaleString('ru-RU')+' км². ':''}Границы справочников могут пересекаться; население разных контуров нельзя складывать. Заселение новых домов после исходных данных модели может учитываться неполно.</p><div class="popup-links">${link(p.source,p.conditional?'Как построена зона':'Контур')}${link(p.anchor_source,'Адрес-ориентир')}${link(p.boundary_correction_source,'Контур для уточнения границы')}${link(p.population_source,'Результат WorldPop')}${link(p.population_docs,'Методика WorldPop')}</div><p class="inspect-sub">Конкуренция по сценариям · все активные точки в контуре</p><div class="area-scenarios">${counts.filter(s=>s.total).map(s=>`<details class="area-scenario"><summary><span>${esc(s.name)}<small>${s.documented} по источникам · ${s.hypothesis} гипотез</small></span><b>${s.total}</b></summary>${all.filter(p=>p.scenarios.includes(s.name)).map(p=>branchButton(p)).join('')}</details>`).join('')||'<p class="small">В этой выгрузке точки не найдены.</p>'}</div><p class="inspect-note">Выручку филиалов сети не распределяем на адреса. Связь выручки с конкретным местом смотрите в карточке магазина.</p>`;
 openInspector('neighbourhood',p.name,body);drawNeighbourhoods();if(zoom&&map){map.fitBounds(L.geoJSON(f).getBounds(),{paddingTopLeft:[35,40],paddingBottomRight:[map.getSize().x>720?390:45,40],maxZoom:15,animate:false});}
}

function parseSheet(resp){
 if(resp.status==='error')throw new Error(resp.errors?.[0]?.detailed_message||'Google не вернул таблицу');
 if(!resp.table?.cols)throw new Error('Ответ без таблицы');
 const labels=resp.table.cols.map(c=>String(c.label||'').trim());
 const required=['Предполагаемые категории','Конкурент / нет','Наименование','Широта магазина','Долгота магазина','Сценарии конкуренции (оценка)','Парковка для фильтра'];
 for(const key of required)if(!labels.includes(key))throw new Error('Изменён заголовок: '+key);
 const idx=new Map(labels.map((h,i)=>[h,i]));
 const get=(r,h,raw=false)=>{const c=r.c[idx.get(h)];return raw?(c?.v??null):(c?.f??c?.v??'');};
 return resp.table.rows.map((r,i)=>hydrate({row:i+2,name:String(get(r,'Наименование')),competitor_status:get(r,'Конкурент / нет'),category_names:get(r,'Предполагаемые категории'),neighbourhood:get(r,'Микрорайон (карта)'),population:num(get(r,'Население микрорайона, оценка 2025',true)),contacts:get(r,'Контакты (2ГИС)'),branch_count:get(r,'Филиалов по 2ГИС',true),location_revenue:get(r,'Выручка по адресу — ориентир юрлица, руб.',true),revenue_scope:get(r,'Статус выручки по адресу'),enrichment_note:get(r,'Источники / что уточнить'),city:get(r,'Населённый пункт'),district:get(r,'Район'),address:get(r,'Адрес'),operator_name:get(r,'Юрлицо / ИП (см. статус)'),operator_inn:String(get(r,'ИНН (см. статус)')).replace(/\s/g,''),link_status:get(r,'Статус привязки'),floor:get(r,'Этаж / помещение'),hours:get(r,'Время работы'),rubrics:get(r,'Описание / ассортимент по рубрикам 2ГИС'),lat:num(get(r,'Широта магазина',true)),lon:num(get(r,'Долгота магазина',true)),parking:get(r,'Парковка для фильтра'),parking_spaces:get(r,'Мест на ближайшей парковке'),parking_paid:get(r,'Ближайшая парковка платная'),parking_access:get(r,'Доступ к ближайшей парковке'),parking_distance:get(r,'До парковки по прямой, м'),parking_location:get(r,'Местоположение ближайшей парковки'),parking_url:get(r,'Карта ближайшей парковки'),format:get(r,'Формат для карты'),scenarios:get(r,'Сценарии конкуренции (оценка)'),tasks:get(r,'Задачи покупателя (примеры)'),basis:get(r,'Основание оценки ассортимента'),sources:String(get(r,'Источники ассортимента')).split('\n').filter(Boolean),card:get(r,'Карточка 2ГИС'),bfo_url:get(r,'Карточка ГИР БО'),revenue:get(r,'Выручка юрлица, руб. — повтор по филиалам',true),income:get(r,'Доходы юрлица ФНС, руб. — повтор',true)})).filter(p=>p.name);
}
function showSync(kind,text){$('sync').dataset.state=kind;$('sync').textContent=text;updateMapOverlays();}
function refresh(){
 if(busy)return;busy=true;$('refresh').disabled=true;showSync('loading','Читаю Google Sheets…');
 const cb='kladovkaRead'+Date.now(),script=document.createElement('script');
 let done=false;
 const cleanup=()=>{clearTimeout(timer);script.remove();busy=false;$('refresh').disabled=false;window[cb]=()=>{};setTimeout(()=>{delete window[cb];},60000);};
 const fail=message=>{if(done)return;done=true;cleanup();showSync('error','Нет связи с таблицей · '+lastLoaded);$('sync-detail').textContent=message+'. Показаны последние доступные данные. Повторная попытка через 5 минут или по кнопке.';};
 const timer=setTimeout(()=>fail('Google не ответил за 25 секунд'),25000);
 window[cb]=resp=>{
  if(done)return;
  try{
   const next=parseSheet(resp);applyData(next);const date=new Date();lastLoaded='загружено '+date.toLocaleString('ru-RU');
   try{localStorage.removeItem('kladovka-map-v4-'+GID);localStorage.setItem(CACHE_KEY,JSON.stringify({schema:5,loaded:date.toISOString(),data:ALL_DATA.map(({category_links,unknown_categories,inactive_categories,categories,scenarios,tasks,...source})=>source)}));}catch(e){}
   fillFilters();rebuildMarkers();draw(false);done=true;cleanup();window.KladovkaRecommendations?.readScenarios(true);
   showSync('ok','Из Google Sheets · '+date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}));
   $('sync-detail').textContent='Автообновление каждые 5 минут, пока карта открыта. Изменения Google могут появляться с небольшой задержкой.';
  }catch(e){fail(e.message);}
 };
 const params=new URLSearchParams({gid:GID,headers:'1',range:'A:AW',tqx:'responseHandler:'+cb+';reqId:'+Date.now()});
 script.src='https://docs.google.com/spreadsheets/d/'+SHEET_ID+'/gviz/tq?'+params;script.referrerPolicy='no-referrer';script.onerror=()=>fail('Не удалось прочитать общедоступный лист');document.head.append(script);
}
try{const cache=JSON.parse(localStorage.getItem(CACHE_KEY));if(cache?.schema===5&&Array.isArray(cache.data)){applyData(cache.data);lastLoaded='кэш от '+new Date(cache.loaded).toLocaleString('ru-RU');}}catch(e){}
const currentTime=MapFeatures.vladivostokTime();$('open-day').value=String(currentTime.day);
initMap();fillFilters();rebuildMarkers();draw(true);showSync('loading',lastLoaded+' · обновляю…');
for(const id of ['city','district','format','scenario','category','parking','finance-scope','hours-filter','open-day','open-time'])$(id).addEventListener('change',()=>{fillCategoryFilter();limit=60;draw(true);});
$('search').addEventListener('input',()=>{limit=60;draw(false);});
$('reset').addEventListener('click',()=>{resetFilters();activeNetwork=null;inspectorMode=null;$('inspector').hidden=true;draw(true);});
$('more').addEventListener('click',()=>{limit+=60;draw(false);});
$('list').addEventListener('click',e=>{const b=e.target.closest('[data-network]');if(b)selectNetwork(b.dataset.network);});
$('zones').addEventListener('click',()=>toggleZones());$('zone-summary').addEventListener('click',()=>renderArea(true));
$('inspector-close').addEventListener('click',()=>{$('inspector').hidden=true;inspectorMode=null;updateMapOverlays();$('zone-hint').hidden=!zonesEnabled;});
$('inspector-body').addEventListener('change',e=>{if(e.target.id==='zone-use-filters'&&zone){zone.useFilters=e.target.checked;renderArea(true);}});
document.addEventListener('click',e=>{
 const closeOverlay=e.target.closest('[data-map-overlay-close]');if(closeOverlay){dismissMapOverlay(closeOverlay.dataset.mapOverlayClose,true);return;}const openOverlay=e.target.closest('[data-map-overlay-open]');if(openOverlay){dismissMapOverlay(openOverlay.dataset.mapOverlayOpen,false);return;}
 const categoryButton=e.target.closest('[data-category-filter]');if(categoryButton){$('scenario').value='';fillCategoryFilter();$('category').value=categoryButton.dataset.categoryFilter;activeNetwork=null;map?.closePopup();draw(true);return;}
 const point=e.target.closest('[data-point]');if(point){selectPlace(point.dataset.point);return;}
 const area=e.target.closest('[data-area-point]');if(area){const p=DATA.find(p=>p.key===area.dataset.areaPoint);if(p)analyseArea(p,p.name,p.key);return;}
 const areaFilter=e.target.closest('[data-neighbourhood-filter]');if(areaFilter){resetFilters();activeNetwork=null;$('neighbourhood').value=areaFilter.dataset.neighbourhoodFilter;draw(true);renderNeighbourhood(areaFilter.dataset.neighbourhoodFilter,false);return;}
 const action=e.target.closest('[data-action]')?.dataset.action;if(action==='scenario-colours')renderScenarioColours();
 if(action==='network-open')renderNetwork();
 if(action==='network-clear'){activeNetwork=null;inspectorMode=null;$('inspector').hidden=true;draw(true);}
 if(action==='network-all'){resetFilters();inspectorMode='network';draw(true);renderNetwork();}
});
$('neighbourhoods').addEventListener('click',()=>toggleNeighbourhoods());
$('neighbourhood').addEventListener('change',()=>{limit=60;draw(false);const f=NEIGHBOURHOODS.features.find(f=>f.properties.id===$('neighbourhood').value);if(f){toggleNeighbourhoods(true);renderNeighbourhood(f.properties.id,true);}});
$('refresh').addEventListener('click',refresh);$('detail-close').addEventListener('click',()=>$('detail').close());
$('csv').addEventListener('click',()=>{
 const quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 const rows=[['Название','Адрес','Этаж','Микрорайон','Статус выручки по адресу','Выручка — ориентир юрлица','Район','Предполагаемые категории','Сценарии конкуренции','Основание оценки','Парковка','Мест','Платная','Доступ','До парковки, м','Широта','Долгота','ИНН','Юрлицо','2ГИС'],...visible.map(p=>[p.name,p.address,p.floor,p.neighbourhood,p.revenue_scope,p.location_revenue,p.district,p.categories.join('; '),p.scenarios.join('; '),p.basis,p.parking,p.parking_spaces,p.parking_paid,p.parking_access,p.parking_distance,p.lat,p.lon,p.operator_inn,p.operator_name,p.card])];
 const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Кладовка — выбранные конкуренты.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
});
refresh();setInterval(()=>{if(!document.hidden)refresh();},300000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(!document.hidden&&['now','late','unknown'].includes($('hours-filter').value))draw(false);},60000);
