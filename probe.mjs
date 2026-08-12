import { soakRun, D, HP } from "./truck/game.js";
const stops=[]; const outAt={};
soakRun(3, { cb: {
  park: (s)=> stops.push(`${s.block}:${(s.block==='maple'||s.block==='birch'? s.x : s.z).toFixed(0)}`),
  cameOut: (p,h)=>{ if(p.reg) outAt[p.reg]=(outAt[p.reg]||0)+1; },
  served: (p)=>{ if(p.reg) console.log("   SERVED "+p.reg); },
}});
console.log("stops ("+stops.length+"):", stops.join(" "));
console.log("regular come-outs:", JSON.stringify(outAt));
console.log("regular house positions:");
const hs = HP.buildHouses();
for (const r of D.REGULARS){ const h=hs.find(x=>x.id===r.house);
  const st=HP.STREETS.find(s=>s.id===h.block);
  console.log(`   ${r.id.padEnd(11)} ${r.house.padEnd(12)} along=${(st.axis==='x'?h.x:h.z).toFixed(0)} lane=(${h.lx.toFixed(1)},${h.lz.toFixed(1)})`);
}
