/* The full, order-independent set of scenarios determines a store's colour. */
const ScenarioColours=(()=>{
 const normal=s=>String(s??'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru').replaceAll('ё','е');
 function key(scenarios){return [...new Set((scenarios||[]).map(normal).filter(Boolean))].sort().join('\u241f');}
 function colour(k){if(!k)return '#818b90';let h=2166136261;for(const c of k){h^=c.codePointAt(0);h=Math.imul(h,16777619);}h>>>=0;return `hsl(${((h*137.50776405)%360).toFixed(3)} ${56+(h>>>8)%18}% ${35+(h>>>19)%13}%)`;}
 function groups(points){const out=new Map();for(const p of points){const k=key(p.scenarios);if(!out.has(k))out.set(k,{key:k,colour:colour(k),scenarios:[...new Set(p.scenarios||[])].sort((a,b)=>a.localeCompare(b,'ru')),count:0});out.get(k).count++;}return [...out.values()].sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));}
 function segments(keys){const counts=new Map();for(const k of keys)counts.set(k,(counts.get(k)||0)+1);let offset=0;return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([key,count])=>{const part={key,count,colour:colour(key),fraction:count/keys.length,offset};offset+=part.fraction;return part;});}
 return {key,colour,groups,segments};
})();
