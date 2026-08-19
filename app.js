
const SUPABASE_URL = "https://uzakmxxdoyvioscprlpz.supabase.co";
const SUPABASE_KEY = "sb_publishable_JyX3k5dC9RxNU1rbOsf4rA_Tdm1rwtB";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const rupiah = n => "Rp" + Number(n || 0).toLocaleString("id-ID", {maximumFractionDigits: 0});
const kg = n => Number(n || 0).toLocaleString("id-ID", {maximumFractionDigits: 0}) + " kg";
const compactKg = n => {
  n = Number(n || 0);
  if (n >= 1_000_000) return (n/1_000_000).toLocaleString("id-ID", {maximumFractionDigits: 2}) + " jt";
  if (n >= 1_000) return (n/1_000).toLocaleString("id-ID", {maximumFractionDigits: 0}) + " rb";
  return n.toLocaleString("id-ID");
};
const num = s => Number(String(s || "0").replace(/[^\d]/g, "")) || 0;
const isoDate = (d,m,y) => `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
const monthMap = {januari:1,februari:2,maret:3,april:4,mei:5,juni:6,juli:7,agustus:8,september:9,oktober:10,november:11,desember:12};
const slots = ["10:00","12:00","15:00","17:00"];
let MASTER_KP_COUNT = 0;
let TONNAGE_PREVIEW = null, PRICE_PREVIEW = null, EXPENSE_PREVIEW = null;

const plotConfig = {displayModeBar:false, responsive:true};
const darkLayout = {
  paper_bgcolor:"rgba(0,0,0,0)",
  plot_bgcolor:"rgba(0,0,0,0)",
  font:{color:"#f1ecdf", family:"Inter, Segoe UI, Arial"},
  margin:{t:20,l:60,r:20,b:40},
  xaxis:{gridcolor:"rgba(255,255,255,.08)", tickfont:{color:"#e5d8ca", size:13}},
  yaxis:{gridcolor:"rgba(255,255,255,.08)", tickfont:{color:"#e5d8ca", size:13}},
  hoverlabel:{bgcolor:"#23231f", bordercolor:"#7aff86", font:{color:"#fff"}}
};

function table(headers, rows, totalLast=false){
  return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${
    rows.map((r,i)=>`<tr class="${totalLast && i===rows.length-1 ? "total-row": ""}">${r.map(c=>`<td>${c ?? ""}</td>`).join("")}</tr>`).join("")
  }</tbody></table>`;
}

async function boot(){
  const {data:{session}} = await db.auth.getSession();
  if(session) await showApp(session.user);
}
async function login(){
  const email = $("email").value.trim();
  const password = $("password").value;
  const {data,error} = await db.auth.signInWithPassword({email, password});
  $("loginMsg").textContent = error ? error.message : "";
  if(!error) await showApp(data.user);
}
async function logout(){
  await db.auth.signOut();
  location.reload();
}
async function showApp(user){
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("userLabel").textContent = user.email;
  bindNav();
  startClock();
  await loadMaster();
  await loadDashboard();
  await loadPrices();
  await loadExpenses();
  await loadHistoryFilters();
}
function startClock(){
  const tick = () => {
    const d = new Date();
    $("liveDate").textContent = d.toLocaleDateString("id-ID", {day:"2-digit", month:"long", year:"numeric"});
    $("liveClock").textContent = d.toLocaleTimeString("id-ID", {hour:"2-digit", minute:"2-digit", second:"2-digit"});
  };
  tick(); setInterval(tick, 1000);
}
function bindNav(){
  document.querySelectorAll(".nav").forEach(btn => btn.addEventListener("click", () => goToPage(btn.dataset.page)));
}
function goToPage(page){
  document.querySelectorAll(".nav").forEach(x => x.classList.toggle("active", x.dataset.page===page));
  document.querySelectorAll(".page").forEach(x => x.classList.remove("active"));
  $("page-" + page).classList.add("active");
  if(page==="dashboard") loadDashboard();
  if(page==="prices") loadPrices();
  if(page==="expenses") loadExpenses();
  if(page==="history") loadHistory();
}

function canonKP(k){
  return (k || "").toUpperCase().trim()
    .replace(/^KP[.\s]*/,"")
    .replace(/\s*-\s*/g,"-")
    .replace(/^ASMJ\s*([12])$/,"ASMJ-$1")
    .replace(/^TKWL\s*([12])$/,"TKWL-$1")
    .replace(/^MSB\s*2$/,"MSB-2")
    .replace(/^KS\s*2$/,"KS2")
    .replace(/^IIS$/,"SSM");
}
function parseHeader(text){
  let m=text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}).*?Pukul\s*(10|12|15|17)[\.:]00/is);
  if(m) return {date:isoDate(+m[1],+m[2],+m[3]), time:m[4]+":00:00"};
  let d=text.match(/(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})/i);
  if(d) return {date:isoDate(+d[1], monthMap[d[2].toLowerCase()], +d[3])};
  let s=text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  return s ? {date:isoDate(+s[1],+s[2],+s[3])} : null;
}

function parseTonnage(text){
  const h=parseHeader(text); if(!h || !h.time) throw Error("Tanggal/jam snapshot 10/12/15/17 tidak ditemukan.");
  let kp=null, rows=[], declared=null;
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim(); if(!line) continue;
    if(/^KP[.\s]/i.test(line)){ kp=canonKP(line); continue; }
    let ts=line.match(/^TOTAL\s+SELURUH\s*:\s*([\d.,]+)/i);
    if(ts){ declared=num(ts[1]); continue; }
    if(/^TOTAL\s*:/i.test(line)) continue;
    let r=line.match(/^([^:]+)\s*:\s*([\d.,]+|-)\s*(?:\((\d+)\))?/);
    if(kp && r) rows.push({kp_code:kp, supplier_name:r[1].trim(), tonnage_kg:r[2]==="-"?0:num(r[2]), trip_count:+(r[3]||0)});
  }
  const total=rows.reduce((a,b)=>a+b.tonnage_kg,0), trips=rows.reduce((a,b)=>a+b.trip_count,0);
  return {...h, rows, total, trips, declared, validTotal: declared==null || declared===total};
}
function previewTonnage(){
  try{
    TONNAGE_PREVIEW=parseTonnage($("tonnageText").value);
    const p=TONNAGE_PREVIEW;
    $("tonnagePreview").textContent=
      `SNAPSHOT ${p.date} ${p.time.slice(0,5)}\n` +
      `KP/Supplier rows: ${p.rows.length}\n` +
      `Total parser: ${kg(p.total)}\n` +
      `TOTAL SELURUH: ${p.declared==null ? "tidak ditemukan" : kg(p.declared)}\n` +
      `Mobil/Trip: ${p.trips}\n` +
      `Validasi total: ${p.validTotal ? "OK ✓" : "PERLU CEK ⚠"}\n\n` +
      JSON.stringify(p.rows, null, 2);
  }catch(e){ $("tonnagePreview").textContent="ERROR: "+e.message; }
}
async function saveTonnage(){
  if(!TONNAGE_PREVIEW) return alert("Preview dahulu.");
  const p = TONNAGE_PREVIEW;
  const {data:s, error} = await db.from("monitoring_snapshots").upsert({
    report_date:p.date, snapshot_time:p.time, total_tonnage_kg:p.declared ?? p.total,
    total_trips:p.trips, raw_text:$("tonnageText").value, status:p.validTotal ? "validated" : "needs_review"
  }, {onConflict:"report_date,snapshot_time"}).select().single();
  if(error) return alert(error.message);
  await db.from("monitoring_snapshot_details").delete().eq("snapshot_id", s.id);
  const {error:e2} = await db.from("monitoring_snapshot_details").insert(p.rows.map(r => ({...r, snapshot_id:s.id})));
  if(e2) return alert(e2.message);
  alert("Snapshot tersimpan.");
  TONNAGE_PREVIEW=null;
  await loadDashboard();
}

function parsePrice(text){
  const h=parseHeader(text); if(!h) throw Error("Tanggal harga tidak ditemukan.");
  let kp=null, rows=[];
  const kpHead=/^(BMK|FAA|KIP|ASMJ[\s-]?[12]?|HKBS|TKWL[\s-]?[12]|SISL|GSS|SSL|MAN|SSM|IIS|GSL(?:-INUMAN)?|SKA|KS\s*2|LPI|LSHP|PSM|BSN|MSB\s*2|BSS|KWP)\s*$/i;
  for(const raw of text.split(/\r?\n/)){
    let line=raw.trim(); if(!line) continue;
    if(kpHead.test(line)){ kp=canonKP(line); continue; }
    if(!kp) continue;
    const closed=/TUTUP/i.test(line);
    const pm=line.match(/Rp\.?\s*([\d.]+)/gi);
    const price=pm?.length ? num(pm[pm.length-1]) : null;
    let left=line.split(/(?:Naik|Turun|Rp\.?|TUTUP|\()/i)[0].trim().replace(/\s*-\s*$/, "");
    let names=left.split(/\s*-\s*/).map(x=>x.trim()).filter(Boolean);
    if(!names.length) continue;
    names.forEach(n=>rows.push({effective_date:h.date, kp_code:kp, supplier_name:n, price_per_kg:closed?null:price, status:closed?"closed":"active", raw_line:line}));
  }
  return {date:h.date, rows};
}
function previewPrice(){
  try{
    PRICE_PREVIEW=parsePrice($("priceText").value);
    $("pricePreview").textContent=`Tanggal efektif: ${PRICE_PREVIEW.date}\nBaris harga: ${PRICE_PREVIEW.rows.length}\n\n`+JSON.stringify(PRICE_PREVIEW.rows,null,2);
  }catch(e){ $("pricePreview").textContent="ERROR: "+e.message; }
}
async function savePrice(){
  if(!PRICE_PREVIEW) return alert("Preview dahulu.");
  const {error}=await db.from("daily_prices").upsert(PRICE_PREVIEW.rows,{onConflict:"effective_date,kp_code,supplier_name"});
  if(error) return alert(error.message);
  alert("Harga tersimpan.");
  PRICE_PREVIEW=null;
  await loadPrices();
  await loadDashboard();
}

function parseExpense(text){
  const h=parseHeader(text); if(!h) throw Error("Tanggal biaya tidak ditemukan.");
  let kpMatch=text.match(/\b(KP\s*)?(BMK|FAA|KIP|ASMJ[\s-]?[12]|HKBS|TKWL[\s-]?[12]|SISL|GSS|SSL|MAN|SSM|IIS|GSL|SKA|KS\s*2|LPI|LSHP|PSM|BSN|MSB\s*2|BSS|KWP)\b/i);
  let kp=kpMatch ? canonKP(kpMatch[0]) : $("expenseKp").value;
  if(!kp) throw Error("KP tidak ditemukan. Pilih KP manual.");
  let category="Lainnya", rows=[];
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim(); if(!line || /^total/i.test(line)) continue;
    let cat=line.match(/(?:B\.|beban)\s*([^(]+)/i);
    if(cat) category=cat[1].trim();
    let amounts=[...line.matchAll(/(\d{1,3}(?:\.\d{3})+)/g)].map(m=>num(m[1]));
    if(!amounts.length) continue;
    if(amounts.length>1 && /:\s*\d/.test(line)) amounts=amounts.slice(0,-1);
    amounts.forEach(a=>rows.push({
      expense_date:h.date, kp_code:kp, category,
      subcategory:/pengambilan dana|p\.\s*dana/i.test(line) ? "Pengambilan Dana" : /bbm/i.test(line) ? "BBM" : null,
      description:line, amount:a
    }));
  }
  return {date:h.date, kp, rows, total:rows.reduce((a,b)=>a+b.amount,0)};
}
function previewExpense(){
  try{
    EXPENSE_PREVIEW=parseExpense($("expenseText").value);
    $("expensePreview").textContent=`Tanggal: ${EXPENSE_PREVIEW.date}\nKP: ${EXPENSE_PREVIEW.kp}\nTotal parser: ${rupiah(EXPENSE_PREVIEW.total)}\n\n`+JSON.stringify(EXPENSE_PREVIEW.rows,null,2);
  }catch(e){ $("expensePreview").textContent="ERROR: "+e.message; }
}
async function saveExpense(){
  if(!EXPENSE_PREVIEW) return alert("Preview dahulu.");
  const {error}=await db.from("unit_expenses").insert(EXPENSE_PREVIEW.rows.map(x=>({...x, raw_text:$("expenseText").value})));
  if(error) return alert(error.message);
  alert("Pengeluaran tersimpan.");
  EXPENSE_PREVIEW=null;
  await loadExpenses();
  await loadDashboard();
}

async function loadMaster(){
  const {data:kps}=await db.from("master_kp").select("code").eq("active",true).order("code");
  MASTER_KP_COUNT=(kps||[]).length;
  $("expenseKp").innerHTML='<option value="">Pilih KP jika tidak terdeteksi otomatis</option>' + (kps||[]).map(x=>`<option>${x.code}</option>`).join("");
  $("historyKp").innerHTML='<option value="ALL">Semua KP</option>' + (kps||[]).map(x=>`<option>${x.code}</option>`).join("");
  const {data:s}=await db.from("master_supplier").select("name,master_kp(code)").order("name");
  $("masterTable").innerHTML=table(["KP","Supplier"], (s||[]).map(x=>[x.master_kp?.code || "", x.name]));
}

async function getLatestEffectivePrices(date){
  const {data}=await db.from("daily_prices").select("*").lte("effective_date",date).order("effective_date",{ascending:false}).limit(2000);
  const latest={};
  (data||[]).forEach(x=>{
    const key=x.kp_code+"|"+x.supplier_name;
    if(!latest[key]) latest[key]=x;
  });
  return Object.values(latest);
}

async function loadDashboard(){
  const {data:s} = await db.from("monitoring_snapshots").select("*").order("report_date",{ascending:false}).order("snapshot_time",{ascending:false}).limit(50);
  const latest=s?.[0];
  const todayDate = latest?.report_date || new Date().toISOString().slice(0,10);

  // Prices
  const latestPrices = await getLatestEffectivePrices(todayDate);
  const activePrices = latestPrices.filter(x=>x.status==="active" && x.price_per_kg != null);
  const pricesOnly = activePrices.map(x=>Number(x.price_per_kg));
  const avgPrice = pricesOnly.length ? pricesOnly.reduce((a,b)=>a+b,0)/pricesOnly.length : 0;
  const minPrice = pricesOnly.length ? Math.min(...pricesOnly) : 0;
  const maxPrice = pricesOnly.length ? Math.max(...pricesOnly) : 0;

  $("kpiAvgPrice").textContent = rupiah(avgPrice) + " /kg";
  $("kpiPriceSub").textContent = activePrices.length + " supplier aktif";
  $("priceMin").textContent = rupiah(minPrice);
  $("priceAvg2").textContent = rupiah(avgPrice);
  $("priceMax").textContent = rupiah(maxPrice);
  $("priceStatus").textContent = activePrices.length ? "Aktif" : "Belum Ada";
  $("priceActiveCount").textContent = activePrices.length + " supplier";
  $("priceMinDelta").textContent = pricesOnly.length ? "Harga minimum aktif" : "-";
  $("priceAvgDelta").textContent = pricesOnly.length ? "Rata-rata tertimbang" : "-";
  $("priceMaxDelta").textContent = pricesOnly.length ? "Harga maksimum aktif" : "-";

  // Price trend 7 days
  const {data:priceRows} = await db.from("daily_prices").select("effective_date,price_per_kg,status");
  const trendMap={};
  (priceRows||[]).forEach(x=>{
    if(x.status!=="active" || x.price_per_kg==null) return;
    if(!trendMap[x.effective_date]) trendMap[x.effective_date]=[];
    trendMap[x.effective_date].push(Number(x.price_per_kg));
  });
  const trendDays = Object.keys(trendMap).sort().slice(-7);
  const trendVals = trendDays.map(d=>trendMap[d].reduce((a,b)=>a+b,0)/trendMap[d].length);
  Plotly.newPlot("priceTrendChart", [{
    x:trendDays.map(d=>d.slice(8,10)+"/"+d.slice(5,7)),
    y:trendVals,
    type:"scatter", mode:"lines+markers",
    line:{width:3,color:"#49de5f",shape:"spline"},
    marker:{size:9,color:"#62ff74"},
    fill:"tozeroy", fillcolor:"rgba(73,222,95,.08)",
    hovertemplate:"<b>%{x}</b><br>Rp%{y:,.0f}/kg<extra></extra>"
  }], {
    ...darkLayout,
    margin:{t:10,l:52,r:14,b:30},
    yaxis:{...darkLayout.yaxis, fixedrange:true},
    xaxis:{...darkLayout.xaxis, fixedrange:true}
  }, plotConfig);

  // Expenses
  const {data:expRows} = await db.from("unit_expenses").select("*").order("expense_date",{ascending:false}).limit(1000);
  const latestExpenseDate = expRows?.[0]?.expense_date || todayDate;
  const dailyExpenses = (expRows||[]).filter(x=>x.expense_date===latestExpenseDate);
  const dailyExpenseTotal = dailyExpenses.reduce((a,b)=>a+Number(b.amount||0),0);
  $("kpiExpense").textContent = rupiah(dailyExpenseTotal);
  $("kpiExpenseSub").textContent = "Total pengeluaran " + latestExpenseDate;

  const expCat={};
  dailyExpenses.forEach(x=>{ const k=x.category || "Lainnya"; expCat[k]=(expCat[k]||0)+Number(x.amount||0); });
  const expLabels = Object.keys(expCat);
  const expValues = Object.values(expCat);
  const expColors = ["#3b95ff","#45d367","#f0b325","#c9984f","#ff6a5c","#b36bff"];
  if(expValues.length){
    Plotly.newPlot("expenseDonut", [{
      labels:expLabels, values:expValues, type:"pie", hole:.62,
      marker:{colors:expLabels.map((_,i)=>expColors[i % expColors.length])},
      textinfo:"none",
      hovertemplate:"<b>%{label}</b><br>Rp%{value:,.0f}<extra></extra>"
    }], {
      paper_bgcolor:"rgba(0,0,0,0)",
      plot_bgcolor:"rgba(0,0,0,0)",
      margin:{t:0,l:0,r:0,b:0},
      showlegend:false,
      annotations:[{
        text:`<b>${rupiah(dailyExpenseTotal).replace("Rp","Rp")}<\/b>`,
        showarrow:false,font:{size:16,color:"#fff"},x:0.5,y:0.52
      },{
        text:"Juta", showarrow:false, font:{size:12,color:"#ddd0c1"}, x:0.5, y:0.40
      }]
    }, plotConfig);
    $("expenseLegend").innerHTML = expLabels.map((label,i)=>{
      const val = expCat[label];
      const pct = dailyExpenseTotal ? ((val/dailyExpenseTotal)*100).toFixed(1) : "0.0";
      return `<div class="legend-row"><div class="dot" style="background:${expColors[i%expColors.length]}"></div><div><small>${label}</small><b>${rupiah(val)}</b></div><span>${pct}%</span></div>`;
    }).join("");
  } else {
    $("expenseDonut").innerHTML = "<div style='padding:40px;color:#ddd0c1'>Belum ada pengeluaran.</div>";
    $("expenseLegend").innerHTML = "";
  }

  if(!latest){
    $("kpiTonase").textContent="0 kg";
    $("kpiTonaseSub").textContent="Belum ada snapshot";
    $("kpiTrips").textContent="0";
    $("kpiActiveKP").textContent=`0 / ${MASTER_KP_COUNT}`;
    renderStatusBoxes([]);
    $("controlTable").innerHTML = table(["NO","KP","SUPPLIER","TONASE (KG)","TRIP","HARGA (RP/KG)","NILAI TBS (RP)","PENGELUARAN (RP)","COST/KG"], []);
    return;
  }

  $("kpiTonase").textContent = kg(latest.total_tonnage_kg);
  $("kpiTonaseSub").textContent = "Total tonase hingga " + latest.snapshot_time.slice(0,5);
  $("kpiTrips").textContent = latest.total_trips;

  const daySnapshots = (s||[]).filter(x=>x.report_date===latest.report_date).sort((a,b)=>a.snapshot_time.localeCompare(b.snapshot_time));
  const slotMap = {};
  daySnapshots.forEach(x=>slotMap[x.snapshot_time.slice(0,5)] = Number(x.total_tonnage_kg));
  const y = slots.map(slot=>slotMap[slot] ?? null);

  const doneCount = daySnapshots.length;
  $("snapshotFinished").textContent = latest.snapshot_time.slice(0,5) + " WIB";
  $("snapshotProgress").textContent = doneCount + " / 4";

  const actual = daySnapshots.map(x=>Number(x.total_tonnage_kg));
  if(actual.length > 1){
    const delta = actual.at(-1) - actual.at(-2);
    const pct = actual.at(-2) ? (delta/actual.at(-2))*100 : 0;
    $("intradayDelta").textContent = (delta>=0?"+":"") + compactKg(delta) + " • " + (pct>=0?"+":"") + pct.toFixed(1) + "%";
  } else {
    $("intradayDelta").textContent = "Belum ada data sebelumnya";
  }

  Plotly.newPlot("intradayChart", [
    {
      x:slots, y:y, type:"scatter", mode:"lines+markers+text",
      text:y.map((v,i)=>v==null ? "Menunggu" : (i===0 || y[i-1]==null ? compactKg(v)+" kg" : "")),
      textposition:"top center",
      line:{width:3,color:"#c6c6c6",dash:"dash",shape:"spline"},
      marker:{
        size:12,
        color:y.map(v=>v==null ? "rgba(255,255,255,.18)" : "#49de5f"),
        line:{width:2,color:y.map(v=>v==null ? "rgba(255,255,255,.28)" : "#49de5f")}
      },
      hovertemplate:"<b>%{x}</b><br>%{y:,.0f} kg<extra></extra>"
    }
  ], {
    ...darkLayout,
    margin:{t:38,l:64,r:18,b:46},
    xaxis:{...darkLayout.xaxis, fixedrange:true, type:"category", categoryorder:"array", categoryarray:slots},
    yaxis:{...darkLayout.yaxis, fixedrange:true, tickformat:"~s", rangemode:"tozero"},
    showlegend:false
  }, plotConfig);

  const {data:detailRows} = await db.from("monitoring_snapshot_details").select("kp_code,supplier_name,tonnage_kg,trip_count").eq("snapshot_id", latest.id);
  const byKP = {};
  (detailRows||[]).forEach(r=>{
    if(!byKP[r.kp_code]) byKP[r.kp_code] = {tonnage:0, trips:0};
    byKP[r.kp_code].tonnage += Number(r.tonnage_kg||0);
    byKP[r.kp_code].trips += Number(r.trip_count||0);
  });
  const kpPairs = Object.entries(byKP).sort((a,b)=>b[1].tonnage-a[1].tonnage);
  $("kpiActiveKP").textContent = kpPairs.length + " / " + MASTER_KP_COUNT;

  const top8 = kpPairs.slice(0,8);
  Plotly.newPlot("topKpChart", [{
    x:top8.map(x=>x[1].tonnage),
    y:top8.map(x=>x[0]),
    type:"bar", orientation:"h",
    marker:{color:"#4bd85c"},
    hovertemplate:"<b>%{y}</b><br>%{x:,.0f} kg<extra></extra>"
  }], {
    ...darkLayout,
    margin:{t:10,l:82,r:10,b:36},
    yaxis:{...darkLayout.yaxis, autorange:"reversed", fixedrange:true},
    xaxis:{...darkLayout.xaxis, fixedrange:true, tickformat:"~s"},
    showlegend:false
  }, plotConfig);

  renderStatusBoxes(daySnapshots);

  // Control table
  const priceMap = {};
  latestPrices.forEach(x=>priceMap[x.kp_code + "|" + x.supplier_name] = x);
  const expenseByKP = {};
  dailyExpenses.forEach(x=>expenseByKP[x.kp_code] = (expenseByKP[x.kp_code] || 0) + Number(x.amount || 0));

  const controlRows = (detailRows||[])
    .filter(r=>Number(r.tonnage_kg||0) > 0 || Number(r.trip_count||0) > 0)
    .sort((a,b)=>Number(b.tonnage_kg)-Number(a.tonnage_kg))
    .map((r,i)=>{
      const price = priceMap[r.kp_code + "|" + r.supplier_name]?.price_per_kg || 0;
      const value = Number(r.tonnage_kg || 0) * Number(price || 0);
      const exp = expenseByKP[r.kp_code] || 0;
      const costkg = Number(r.tonnage_kg || 0) ? (exp / Number(r.tonnage_kg || 0)) : 0;
      return [
        i+1,
        r.kp_code,
        r.supplier_name,
        Number(r.tonnage_kg || 0).toLocaleString("id-ID"),
        r.trip_count || 0,
        price ? Number(price).toLocaleString("id-ID") : "-",
        value ? Number(value).toLocaleString("id-ID") : "-",
        exp ? exp.toLocaleString("id-ID") : "-",
        costkg ? costkg.toLocaleString("id-ID", {minimumFractionDigits:2, maximumFractionDigits:2}) : "-"
      ];
    });
  $("controlTitle").textContent = `CONTROL TABLE - SNAPSHOT TERAKHIR (${latest.snapshot_time.slice(0,5)})`;
  $("controlTable").innerHTML = table(
    ["NO","KP","SUPPLIER","TONASE (KG)","TRIP","HARGA (RP/KG)","NILAI TBS (RP)","PENGELUARAN (RP)","COST/KG (RP)"],
    controlRows
  );

  // Snapshot table in monitoring page
  const snapRows = kpPairs.map(([kp,v])=>[kp, kg(v.tonnage), v.trips, latest.snapshot_time.slice(0,5)]);
  snapRows.push(["TOTAL", kg(latest.total_tonnage_kg), latest.total_trips, latest.snapshot_time.slice(0,5)]);
  $("snapshotTable").innerHTML = table(["KP","Tonase","Mobil / Trip","Jam"], snapRows, true);
}

function renderStatusBoxes(daySnapshots){
  const map = {};
  daySnapshots.forEach(x=>map[x.snapshot_time.slice(0,5)] = x);
  $("snapshotStatus").innerHTML = slots.map(slot=>{
    const s = map[slot];
    return `<div class="status-box ${s ? "done" : ""}">
      <div class="slot ${s ? "" : "wait"}">${slot}</div>
      <div class="status-val">${s ? compactKg(s.total_tonnage_kg) : "Menunggu"}</div>
      <div class="status-sub">${s ? (s.total_trips + " trip") : "Menunggu"}</div>
    </div>`;
  }).join("");
}

async function loadPrices(){
  const refDate = new Date().toISOString().slice(0,10);
  const latest = await getLatestEffectivePrices(refDate);
  $("priceTable").innerHTML = table(
    ["KP","Supplier","Harga","Status","Tanggal Berlaku"],
    latest.sort((a,b)=>a.kp_code.localeCompare(b.kp_code) || a.supplier_name.localeCompare(b.supplier_name)).map(x=>[
      x.kp_code, x.supplier_name,
      x.status==="closed" ? "TUTUP" : rupiah(x.price_per_kg),
      x.status==="closed" ? "Closed" : "Active",
      x.effective_date
    ])
  );
}
async function loadExpenses(){
  const {data} = await db.from("unit_expenses").select("*").order("expense_date",{ascending:false}).limit(1500);
  const agg = {};
  (data||[]).forEach(x=>agg[x.kp_code] = (agg[x.kp_code] || 0) + Number(x.amount||0));
  $("expenseTable").innerHTML = table(["KP","Total Pengeluaran"], Object.entries(agg).sort((a,b)=>b[1]-a[1]).map(([kp,val])=>[kp, rupiah(val)]));
}
async function loadHistoryFilters(){
  const {data} = await db.from("historical_summary").select("year");
  const years = [...new Set((data||[]).map(x=>x.year))].sort((a,b)=>b-a);
  $("historyYear").innerHTML = years.map(y=>`<option>${y}</option>`).join("");
  await loadHistory();
}
async function loadHistory(){
  const year = $("historyYear").value;
  if(!year) return;
  let q = db.from("historical_summary").select("*").eq("year", year);
  if($("historyKp").value !== "ALL") q = q.eq("kp_code", $("historyKp").value);
  const {data} = await q;
  const rows = data || [];
  const monthly = Array(12).fill(0);
  rows.forEach(x=>monthly[x.month-1] += Number(x.tonnage_kg||0));
  const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];
  Plotly.newPlot("historyChart", [{
    x:months, y:monthly, type:"scatter", mode:"lines+markers",
    line:{width:3,color:"#49de5f",shape:"spline"},
    marker:{size:8,color:"#66ff79"},
    fill:"tozeroy", fillcolor:"rgba(73,222,95,.06)",
    hovertemplate:"<b>%{x}</b><br>%{y:,.0f} kg<extra></extra>"
  }], {
    ...darkLayout,
    xaxis:{...darkLayout.xaxis, fixedrange:true},
    yaxis:{...darkLayout.yaxis, fixedrange:true, tickformat:"~s", rangemode:"tozero"}
  }, plotConfig);

  const agg = {};
  rows.forEach(x=>agg[x.kp_code] = (agg[x.kp_code] || 0) + Number(x.tonnage_kg || 0));
  const top = Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,10);
  Plotly.newPlot("historyTopChart", [{
    x:top.map(x=>x[1]),
    y:top.map(x=>x[0]),
    type:"bar", orientation:"h",
    marker:{color:"#4bd85c"}
  }], {
    ...darkLayout,
    yaxis:{...darkLayout.yaxis, autorange:"reversed", fixedrange:true},
    xaxis:{...darkLayout.xaxis, fixedrange:true, tickformat:"~s"}
  }, plotConfig);

  $("historyTable").innerHTML = table(["KP","Bulan","Tonase"], rows.sort((a,b)=>a.kp_code.localeCompare(b.kp_code) || a.month-b.month).map(x=>[
    x.kp_code, x.month, kg(x.tonnage_kg)
  ]));
}

boot();
