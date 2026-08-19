
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
let MONITOR_MODE = "daily";
let DASHBOARD_KP = "ALL";
let DASHBOARD_CONTROL_ROWS = [];
let DASHBOARD_LATEST_DATE = null;

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
  if(page==="monitoring") loadKPMonitoring();
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
  if($("monitorKp")) $("monitorKp").innerHTML='<option value="ALL">Semua KP</option>' + (kps||[]).map(x=>`<option>${x.code}</option>`).join("");
  if($("dashboardTrendKp")){
    $("dashboardTrendKp").innerHTML='<option value="ALL">Semua KP</option>' + (kps||[]).map(x=>`<option>${x.code}</option>`).join("");
    const savedKP=localStorage.getItem("tbs_dashboard_kp") || "ALL";
    const validKP=savedKP==="ALL" || (kps||[]).some(x=>x.code===savedKP);
    DASHBOARD_KP=validKP?savedKP:"ALL";
    $("dashboardTrendKp").value=DASHBOARD_KP;
  }
  await initKPMonitoringFilters();
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

function dashboardSelectedKP(){
  return $("dashboardTrendKp")?.value || DASHBOARD_KP || "ALL";
}
async function setDashboardGlobalKP(kp){
  DASHBOARD_KP=kp || "ALL";
  localStorage.setItem("tbs_dashboard_kp",DASHBOARD_KP);
  if($("dashboardTrendKp")) $("dashboardTrendKp").value=DASHBOARD_KP;
  await loadDashboard();
}
async function openDashboardDetail(page,mode=null){
  const kp=dashboardSelectedKP();
  if(page==="monitoring" && $("monitorKp")) $("monitorKp").value=kp;
  await goToPage(page);
  if(page==="monitoring" && mode) setMonitorMode(mode);
}
function bindDashboardPlotClicks(latestDate){
  const intraday=$("intradayChart");
  if(intraday?.on){
    intraday.removeAllListeners?.("plotly_click");
    intraday.on("plotly_click", async ev=>{
      const kp=dashboardSelectedKP();
      if($("monitorKp")) $("monitorKp").value=kp;
      if($("monitorDate")) $("monitorDate").value=latestDate;
      await goToPage("monitoring");
      setMonitorMode("daily");
    });
  }
  const top=$("topKpChart");
  if(top?.on){
    top.removeAllListeners?.("plotly_click");
    top.on("plotly_click", async ev=>{
      const selected=dashboardSelectedKP();
      if(selected==="ALL"){
        const kp=ev?.points?.[0]?.y;
        if(kp) await setDashboardGlobalKP(kp);
      }else{
        if($("monitorKp")) $("monitorKp").value=selected;
        await goToPage("monitoring");
        setMonitorMode("daily");
      }
    });
  }
  const pchart=$("priceTrendChart");
  if(pchart?.on){
    pchart.removeAllListeners?.("plotly_click");
    pchart.on("plotly_click",()=>openDashboardDetail("prices"));
  }
  const edonut=$("expenseDonut");
  if(edonut?.on){
    edonut.removeAllListeners?.("plotly_click");
    edonut.on("plotly_click",()=>openDashboardDetail("expenses"));
  }
}
function updateDashboardContext(kp,date){
  const label=kp==="ALL"?"Semua KP":kp;
  if($("dashboardContextText")) $("dashboardContextText").textContent=`${label} • Snapshot ${date || "-"}`;
  if($("dashboardResetFilter")) $("dashboardResetFilter").classList.toggle("hidden",kp==="ALL");
  if($("intradayPanelTitle")) $("intradayPanelTitle").textContent=`INTRADAY PROGRESS • ${label}`;
  if($("snapshotPanelTitle")) $("snapshotPanelTitle").textContent=`SNAPSHOT STATUS • ${label}`;
  if($("pricePanelTitle")) $("pricePanelTitle").textContent=`HARGA TBS • ${label}`;
  if($("priceWatchTitle")) $("priceWatchTitle").textContent=`PRICE WATCH 7 HARI • ${label}`;
  if($("expensePanelTitle")) $("expensePanelTitle").textContent=`PENGELUARAN • ${label}`;
}
function renderDashboardInsights(ctx){
  const {
    kp,totalAll,totalSelected,trips,activeKPCount,totalKP,
    delta,pct,latestTime,activePriceCount,priceCoveragePct,
    expenseTotal,costKg,leaderKP,leaderSupplier
  }=ctx;
  const items=[];

  if(delta!=null){
    const positive=delta>=0;
    items.push({
      type:positive?"positive":"attention",
      label:positive?"Positive":"Attention",
      text:`Tonase snapshot ${latestTime} ${positive?"naik":"turun"} ${Math.abs(pct||0).toFixed(1)}% (${positive?"+":""}${compactKg(delta)} kg) dibanding snapshot sebelumnya.`,
      sub:"Klik untuk melihat perkembangan intraday.",
      action:"monitoring"
    });
  }else{
    items.push({
      type:"opportunity",label:"Monitoring",
      text:"Baru satu snapshot tersedia. Tren intraday akan semakin jelas setelah snapshot berikutnya masuk.",
      sub:"Menunggu pembanding snapshot.",
      action:"monitoring"
    });
  }

  if(kp==="ALL"){
    const inactive=Math.max(0,totalKP-activeKPCount);
    items.push({
      type:inactive>0?"attention":"positive",
      label:inactive>0?"Attention":"Positive",
      text:inactive>0
        ? `${inactive} dari ${totalKP} KP belum berkontribusi pada snapshot terakhir. ${leaderKP?`${leaderKP} menjadi kontributor tertinggi.`:""}`
        : `Seluruh ${totalKP} KP sudah berkontribusi pada snapshot terakhir.`,
      sub:"Klik bar Top KP untuk memfilter dashboard.",
      action:"monitoring"
    });
  }else{
    const share=totalAll?totalSelected/totalAll*100:0;
    items.push({
      type:share>0?"positive":"attention",
      label:"KP Insight",
      text:`${kp} menyumbang ${share.toFixed(1)}% dari total tonase snapshot perusahaan.${leaderSupplier?` Supplier terbesar: ${leaderSupplier}.`:""}`,
      sub:`${trips.toLocaleString("id-ID")} trip pada snapshot terakhir.`,
      action:"monitoring"
    });
  }

  if(activePriceCount===0){
    items.push({
      type:"attention",label:"Price Coverage",
      text:`Belum ada harga aktif yang cocok untuk ${kp==="ALL"?"supplier pada dashboard":"KP "+kp}.`,
      sub:"Periksa input harga atau kecocokan nama supplier.",
      action:"prices"
    });
  }else{
    items.push({
      type:priceCoveragePct<70?"opportunity":"positive",
      label:priceCoveragePct<70?"Opportunity":"Price Coverage",
      text:`Cakupan harga terhadap tonase yang memiliki pasangan harga sekitar ${priceCoveragePct.toFixed(0)}%. Pengeluaran periode ini ${rupiah(expenseTotal)}${costKg>0?` dengan cost/kg ${rupiah(costKg)}`:""}.`,
      sub:"Klik untuk melihat detail harga.",
      action:"prices"
    });
  }

  $("dashboardInsights").innerHTML=items.slice(0,3).map(x=>`
    <div class="insight-item ${x.type}" onclick="openDashboardDetail('${x.action}','${x.action==="monitoring"?"daily":""}')">
      <div class="insight-label"><span>●</span>${x.label}</div>
      <p>${x.text}</p>
      <small>${x.sub}</small>
    </div>`).join("");
  $("insightContext").textContent=`${kp==="ALL"?"Semua KP":kp} • ${DASHBOARD_LATEST_DATE || "-"}`;
}
function applyControlTableView(){
  const search=($("controlSearch")?.value || "").trim().toLowerCase();
  const sort=$("controlSort")?.value || "tonnage_desc";
  let rows=[...DASHBOARD_CONTROL_ROWS];
  if(search){
    rows=rows.filter(r=>`${r.kp} ${r.supplier}`.toLowerCase().includes(search));
  }
  if(sort==="tonnage_desc") rows.sort((a,b)=>b.tonnage-a.tonnage);
  if(sort==="trip_desc") rows.sort((a,b)=>b.trips-a.trips);
  if(sort==="cost_desc") rows.sort((a,b)=>b.costkg-a.costkg);
  if(sort==="kp_asc") rows.sort((a,b)=>a.kp.localeCompare(b.kp)||b.tonnage-a.tonnage);

  $("controlTable").innerHTML=`<table>
    <thead><tr>
      <th>NO</th><th>KP</th><th>SUPPLIER</th><th>TONASE (KG)</th><th>TRIP</th>
      <th>HARGA (RP/KG)</th><th>NILAI TBS (RP)</th><th>PENGELUARAN KP (RP)</th><th>COST/KG KP (RP)</th>
    </tr></thead>
    <tbody>${rows.map((r,i)=>`
      <tr onclick="setDashboardGlobalKP('${r.kp}')" title="Klik untuk memfilter dashboard ke ${r.kp}">
        <td>${i+1}</td>
        <td><span class="control-filtered-kp">${r.kp}</span></td>
        <td>${r.supplier}</td>
        <td>${r.tonnage.toLocaleString("id-ID")}</td>
        <td>${r.trips.toLocaleString("id-ID")}</td>
        <td>${r.price?r.price.toLocaleString("id-ID"):"-"}</td>
        <td>${r.value?r.value.toLocaleString("id-ID"):"-"}</td>
        <td>${r.expense?r.expense.toLocaleString("id-ID"):"-"}</td>
        <td>${r.costkg?r.costkg.toLocaleString("id-ID",{minimumFractionDigits:2,maximumFractionDigits:2}):"-"}</td>
      </tr>`).join("")}</tbody>
    </table>`;
}

async function loadDashboard(){
  const kp=dashboardSelectedKP();
  DASHBOARD_KP=kp;

  const {data:s} = await db.from("monitoring_snapshots")
    .select("*")
    .order("report_date",{ascending:false})
    .order("snapshot_time",{ascending:false})
    .limit(80);

  const latest=s?.[0];
  const todayDate=latest?.report_date || localISODate();
  DASHBOARD_LATEST_DATE=todayDate;
  updateDashboardContext(kp,todayDate);

  // -------- Latest detail and operational view --------
  let detailRows=[];
  let byKP={};
  let kpPairs=[];
  let selectedRows=[];
  let selectedTonnage=0;
  let selectedTrips=0;
  let latestAllTonnage=Number(latest?.total_tonnage_kg||0);
  let latestAllTrips=Number(latest?.total_trips||0);

  if(latest){
    const {data:d}=await db.from("monitoring_snapshot_details")
      .select("kp_code,supplier_name,tonnage_kg,trip_count")
      .eq("snapshot_id",latest.id);
    detailRows=d||[];
    detailRows.forEach(r=>{
      if(!byKP[r.kp_code]) byKP[r.kp_code]={tonnage:0,trips:0};
      byKP[r.kp_code].tonnage+=Number(r.tonnage_kg||0);
      byKP[r.kp_code].trips+=Number(r.trip_count||0);
    });
    kpPairs=Object.entries(byKP).sort((a,b)=>b[1].tonnage-a[1].tonnage);
    selectedRows=kp==="ALL"?detailRows:detailRows.filter(r=>r.kp_code===kp);
    selectedTonnage=kp==="ALL"?latestAllTonnage:selectedRows.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
    selectedTrips=kp==="ALL"?latestAllTrips:selectedRows.reduce((a,r)=>a+Number(r.trip_count||0),0);
  }

  // -------- Prices, filtered by global KP --------
  const allLatestPrices=await getLatestEffectivePrices(todayDate);
  const latestPrices=kp==="ALL"?allLatestPrices:allLatestPrices.filter(x=>x.kp_code===kp);
  const activePrices=latestPrices.filter(x=>x.status==="active" && x.price_per_kg!=null);
  const priceMap={};
  allLatestPrices.forEach(x=>priceMap[x.kp_code+"|"+x.supplier_name]=x);

  const pricesOnly=activePrices.map(x=>Number(x.price_per_kg));
  const minPrice=pricesOnly.length?Math.min(...pricesOnly):0;
  const maxPrice=pricesOnly.length?Math.max(...pricesOnly):0;

  let weightedValue=0,weightedKg=0;
  selectedRows.forEach(r=>{
    const p=priceMap[r.kp_code+"|"+r.supplier_name];
    if(p?.status==="active" && p.price_per_kg!=null){
      const t=Number(r.tonnage_kg||0);
      weightedKg+=t;
      weightedValue+=t*Number(p.price_per_kg);
    }
  });
  const simpleAvg=pricesOnly.length?pricesOnly.reduce((a,b)=>a+b,0)/pricesOnly.length:0;
  const avgPrice=weightedKg?weightedValue/weightedKg:simpleAvg;
  const priceCoveragePct=selectedTonnage?weightedKg/selectedTonnage*100:0;

  $("kpiAvgPrice").textContent=rupiah(avgPrice)+" /kg";
  $("kpiPriceSub").textContent=activePrices.length
    ? `${activePrices.length} supplier aktif • coverage ${priceCoveragePct.toFixed(0)}%`
    : "Belum ada harga aktif";
  $("priceMin").textContent=rupiah(minPrice);
  $("priceAvg2").textContent=rupiah(avgPrice);
  $("priceMax").textContent=rupiah(maxPrice);
  $("priceStatus").textContent=activePrices.length?"Aktif":"Belum Ada";
  $("priceActiveCount").textContent=activePrices.length+" supplier";
  $("priceMinDelta").textContent=pricesOnly.length?"Harga minimum aktif":"-";
  $("priceAvgDelta").textContent=weightedKg?"Weighted by tonnage":"Simple average";
  $("priceMaxDelta").textContent=pricesOnly.length?"Harga maksimum aktif":"-";

  // -------- Price watch 7 dates, filtered by KP --------
  let pq=db.from("daily_prices").select("effective_date,kp_code,price_per_kg,status");
  if(kp!=="ALL") pq=pq.eq("kp_code",kp);
  const {data:priceRows}=await pq;
  const trendMap={};
  (priceRows||[]).forEach(x=>{
    if(x.status!=="active" || x.price_per_kg==null) return;
    if(!trendMap[x.effective_date]) trendMap[x.effective_date]=[];
    trendMap[x.effective_date].push(Number(x.price_per_kg));
  });
  const trendDays=Object.keys(trendMap).sort().slice(-7);
  const trendVals=trendDays.map(d=>trendMap[d].reduce((a,b)=>a+b,0)/trendMap[d].length);
  if(trendDays.length){
    Plotly.newPlot("priceTrendChart",[{
      x:trendDays.map(d=>d.slice(8,10)+"/"+d.slice(5,7)),
      y:trendVals,type:"scatter",mode:"lines+markers",
      line:{width:3,color:"#49de5f",shape:"spline"},
      marker:{size:8,color:"#62ff74"},
      fill:"tozeroy",fillcolor:"rgba(73,222,95,.08)",
      hovertemplate:"<b>%{x}</b><br>Rp%{y:,.0f}/kg<extra></extra>"
    }],{
      ...darkLayout,margin:{t:10,l:52,r:14,b:30},
      yaxis:{...darkLayout.yaxis,fixedrange:true},
      xaxis:{...darkLayout.xaxis,fixedrange:true}
    },plotConfig);
  }else{
    Plotly.purge("priceTrendChart");
    $("priceTrendChart").innerHTML="<div style='padding:35px 10px;text-align:center;color:#9f9588'>Belum ada histori harga.</div>";
  }

  // -------- Expenses aligned to dashboard snapshot date --------
  let eq=db.from("unit_expenses").select("*").eq("expense_date",todayDate);
  if(kp!=="ALL") eq=eq.eq("kp_code",kp);
  const {data:expRows}=await eq;
  const dailyExpenses=expRows||[];
  const dailyExpenseTotal=dailyExpenses.reduce((a,b)=>a+Number(b.amount||0),0);
  $("kpiExpense").textContent=rupiah(dailyExpenseTotal);
  $("kpiExpenseSub").textContent=dailyExpenseTotal?`Pengeluaran ${todayDate}`:"Belum ada pengeluaran pada tanggal snapshot";

  const expCat={};
  dailyExpenses.forEach(x=>{
    const k=x.category||"Lainnya";
    expCat[k]=(expCat[k]||0)+Number(x.amount||0);
  });
  const expLabels=Object.keys(expCat);
  const expValues=Object.values(expCat);
  const expColors=["#3b95ff","#45d367","#f0b325","#c9984f","#ff6a5c","#b36bff"];
  if(expValues.length){
    Plotly.newPlot("expenseDonut",[{
      labels:expLabels,values:expValues,type:"pie",hole:.62,
      marker:{colors:expLabels.map((_,i)=>expColors[i%expColors.length])},
      textinfo:"none",
      hovertemplate:"<b>%{label}</b><br>Rp%{value:,.0f}<extra></extra>"
    }],{
      paper_bgcolor:"rgba(0,0,0,0)",plot_bgcolor:"rgba(0,0,0,0)",
      margin:{t:0,l:0,r:0,b:0},showlegend:false,
      annotations:[{text:`<b>${rupiah(dailyExpenseTotal)}</b>`,showarrow:false,font:{size:14,color:"#fff"},x:.5,y:.52}]
    },plotConfig);
    $("expenseLegend").innerHTML=expLabels.map((label,i)=>{
      const val=expCat[label],pct=dailyExpenseTotal?val/dailyExpenseTotal*100:0;
      return `<div class="legend-row"><div class="dot" style="background:${expColors[i%expColors.length]}"></div><div><small>${label}</small><b>${rupiah(val)}</b></div><span>${pct.toFixed(1)}%</span></div>`;
    }).join("");
  }else{
    Plotly.purge("expenseDonut");
    $("expenseDonut").innerHTML="<div style='padding:40px 8px;text-align:center;color:#9f9588'>Belum ada pengeluaran.</div>";
    $("expenseLegend").innerHTML="";
  }

  if(!latest){
    $("kpiTonase").textContent="0 kg";
    $("kpiTonaseSub").textContent="Belum ada snapshot";
    $("kpiTrips").textContent="0";
    $("kpiActiveKP").textContent=`0 / ${MASTER_KP_COUNT}`;
    $("kpiActiveKPTitle").textContent="KP AKTIF";
    $("kpiActiveKPSub").textContent="Belum ada snapshot";
    renderStatusBoxes([],null,kp);
    DASHBOARD_CONTROL_ROWS=[];
    applyControlTableView();
    renderDashboardInsights({
      kp,totalAll:0,totalSelected:0,trips:0,activeKPCount:0,totalKP:MASTER_KP_COUNT,
      delta:null,pct:0,latestTime:"-",activePriceCount:activePrices.length,priceCoveragePct,
      expenseTotal:dailyExpenseTotal,costKg:0,leaderKP:null,leaderSupplier:null
    });
    await loadDashboardTrendIndicators(todayDate);
    return;
  }

  // -------- Main KPI cards --------
  $("kpiTonase").textContent=kg(selectedTonnage);
  $("kpiTonaseSub").textContent=`${kp==="ALL"?"Total":"KP "+kp} hingga ${latest.snapshot_time.slice(0,5)}`;
  $("kpiTrips").textContent=selectedTrips.toLocaleString("id-ID");
  if(kp==="ALL"){
    $("kpiActiveKPTitle").textContent="KP AKTIF";
    $("kpiActiveKP").textContent=kpPairs.length+" / "+MASTER_KP_COUNT;
    $("kpiActiveKPSub").textContent="KP berkontribusi snapshot terakhir";
  }else{
    $("kpiActiveKPTitle").textContent="STATUS KP";
    $("kpiActiveKP").textContent=selectedTonnage>0?"AKTIF":"BELUM AKTIF";
    $("kpiActiveKPSub").textContent=`${kp} • ${selectedRows.filter(r=>Number(r.tonnage_kg||0)>0).length} supplier berkontribusi`;
  }

  // -------- Intraday values filtered by KP --------
  const daySnapshots=(s||[]).filter(x=>x.report_date===latest.report_date).sort((a,b)=>a.snapshot_time.localeCompare(b.snapshot_time));
  let selectedBySnapshot={};
  if(kp==="ALL"){
    daySnapshots.forEach(x=>selectedBySnapshot[x.id]={tonnage:Number(x.total_tonnage_kg||0),trips:Number(x.total_trips||0)});
  }else if(daySnapshots.length){
    const ids=daySnapshots.map(x=>x.id);
    const {data:dayDetail}=await db.from("monitoring_snapshot_details")
      .select("snapshot_id,tonnage_kg,trip_count")
      .in("snapshot_id",ids)
      .eq("kp_code",kp);
    ids.forEach(id=>selectedBySnapshot[id]={tonnage:0,trips:0});
    (dayDetail||[]).forEach(r=>{
      selectedBySnapshot[r.snapshot_id].tonnage+=Number(r.tonnage_kg||0);
      selectedBySnapshot[r.snapshot_id].trips+=Number(r.trip_count||0);
    });
  }

  const slotMap={};
  daySnapshots.forEach(x=>slotMap[x.snapshot_time.slice(0,5)]=selectedBySnapshot[x.id]?.tonnage??0);
  const y=slots.map(slot=>slotMap[slot]??null);
  const actual=daySnapshots.map(x=>selectedBySnapshot[x.id]?.tonnage??0);
  let delta=null,pct=0;
  if(actual.length>1){
    delta=actual.at(-1)-actual.at(-2);
    pct=actual.at(-2)?delta/actual.at(-2)*100:0;
    $("intradayDelta").textContent=`${delta>=0?"+":""}${compactKg(delta)} • ${pct>=0?"+":""}${pct.toFixed(1)}%`;
  }else{
    $("intradayDelta").textContent="Belum ada data sebelumnya";
  }
  $("snapshotFinished").textContent=latest.snapshot_time.slice(0,5)+" WIB";
  $("snapshotProgress").textContent=daySnapshots.length+" / 4";

  Plotly.newPlot("intradayChart",[{
    x:slots,y,type:"scatter",mode:"lines+markers",
    line:{width:3,color:"#49de5f",shape:"spline"},
    marker:{size:11,color:y.map(v=>v==null?"rgba(255,255,255,.18)":"#61ef70"),line:{width:2,color:"#315535"}},
    connectgaps:false,
    hovertemplate:"<b>%{x}</b><br>%{y:,.0f} kg<br>Klik untuk detail<extra></extra>"
  }],{
    ...darkLayout,margin:{t:28,l:60,r:18,b:42},
    xaxis:{...darkLayout.xaxis,fixedrange:true,type:"category",categoryorder:"array",categoryarray:slots},
    yaxis:{...darkLayout.yaxis,fixedrange:true,tickformat:"~s",rangemode:"tozero"},
    showlegend:false
  },plotConfig);

  // -------- Top chart: KP ranking or supplier drilldown --------
  if(kp==="ALL"){
    const top8=kpPairs.slice(0,8);
    $("topKpTitle").textContent="TOP 8 KP SNAPSHOT • KLIK UNTUK FILTER";
    Plotly.newPlot("topKpChart",[{
      x:top8.map(x=>x[1].tonnage),y:top8.map(x=>x[0]),
      type:"bar",orientation:"h",marker:{color:"#4bd85c"},
      hovertemplate:"<b>%{y}</b><br>%{x:,.0f} kg<br>Klik untuk filter KP<extra></extra>"
    }],{
      ...darkLayout,margin:{t:10,l:82,r:10,b:36},
      yaxis:{...darkLayout.yaxis,autorange:"reversed",fixedrange:true},
      xaxis:{...darkLayout.xaxis,fixedrange:true,tickformat:"~s"},showlegend:false
    },plotConfig);
  }else{
    const suppliers=selectedRows
      .filter(r=>Number(r.tonnage_kg||0)>0)
      .sort((a,b)=>Number(b.tonnage_kg||0)-Number(a.tonnage_kg||0))
      .slice(0,8);
    $("topKpTitle").textContent=`TOP SUPPLIER ${kp} • SNAPSHOT ${latest.snapshot_time.slice(0,5)}`;
    Plotly.newPlot("topKpChart",[{
      x:suppliers.map(r=>Number(r.tonnage_kg||0)),y:suppliers.map(r=>r.supplier_name),
      type:"bar",orientation:"h",marker:{color:"#4bd85c"},
      hovertemplate:"<b>%{y}</b><br>%{x:,.0f} kg<extra></extra>"
    }],{
      ...darkLayout,margin:{t:10,l:90,r:10,b:36},
      yaxis:{...darkLayout.yaxis,autorange:"reversed",fixedrange:true},
      xaxis:{...darkLayout.xaxis,fixedrange:true,tickformat:"~s"},showlegend:false
    },plotConfig);
  }

  renderStatusBoxes(daySnapshots,selectedBySnapshot,kp);

  // -------- Control table, searchable/sortable/clickable --------
  const expenseByKP={};
  dailyExpenses.forEach(x=>expenseByKP[x.kp_code]=(expenseByKP[x.kp_code]||0)+Number(x.amount||0));
  const tonnageByKP={};
  detailRows.forEach(r=>tonnageByKP[r.kp_code]=(tonnageByKP[r.kp_code]||0)+Number(r.tonnage_kg||0));

  DASHBOARD_CONTROL_ROWS=selectedRows
    .filter(r=>Number(r.tonnage_kg||0)>0 || Number(r.trip_count||0)>0)
    .map(r=>{
      const price=Number(priceMap[r.kp_code+"|"+r.supplier_name]?.price_per_kg||0);
      const tonnage=Number(r.tonnage_kg||0);
      const expense=expenseByKP[r.kp_code]||0;
      const kpTon=tonnageByKP[r.kp_code]||0;
      const costkg=kpTon?expense/kpTon:0;
      return {
        kp:r.kp_code,supplier:r.supplier_name,
        tonnage,trips:Number(r.trip_count||0),price,
        value:tonnage*price,expense,costkg
      };
    });

  $("controlTitle").textContent=`CONTROL TABLE • ${kp==="ALL"?"SEMUA KP":kp} • ${latest.snapshot_time.slice(0,5)}`;
  applyControlTableView();

  // Monitoring snapshot table mirrors global selection.
  const snapRows=(kp==="ALL"?kpPairs:kpPairs.filter(([code])=>code===kp))
    .map(([code,v])=>[code,kg(v.tonnage),v.trips,latest.snapshot_time.slice(0,5)]);
  if(kp==="ALL") snapRows.push(["TOTAL",kg(latest.total_tonnage_kg),latest.total_trips,latest.snapshot_time.slice(0,5)]);
  $("snapshotTable").innerHTML=table(["KP","Tonase","Mobil / Trip","Jam"],snapRows,kp==="ALL");

  // -------- Insight context --------
  const costKg=selectedTonnage?dailyExpenseTotal/selectedTonnage:0;
  const leaderKP=kpPairs[0]?.[0]||null;
  const leaderSupplier=kp!=="ALL"
    ? selectedRows.filter(r=>Number(r.tonnage_kg||0)>0).sort((a,b)=>Number(b.tonnage_kg||0)-Number(a.tonnage_kg||0))[0]?.supplier_name
    : null;

  renderDashboardInsights({
    kp,totalAll:latestAllTonnage,totalSelected:selectedTonnage,trips:selectedTrips,
    activeKPCount:kpPairs.length,totalKP:MASTER_KP_COUNT,
    delta,pct,latestTime:latest.snapshot_time.slice(0,5),
    activePriceCount:activePrices.length,priceCoveragePct,
    expenseTotal:dailyExpenseTotal,costKg,leaderKP,leaderSupplier
  });

  await loadDashboardTrendIndicators(todayDate);
  bindDashboardPlotClicks(todayDate);
}

function renderStatusBoxes(daySnapshots,selectedBySnapshot=null,kp="ALL"){
  const map={};
  daySnapshots.forEach(x=>map[x.snapshot_time.slice(0,5)]=x);
  $("snapshotStatus").innerHTML=slots.map(slot=>{
    const s=map[slot];
    const v=s ? (selectedBySnapshot?.[s.id] || {tonnage:Number(s.total_tonnage_kg||0),trips:Number(s.total_trips||0)}) : null;
    return `<div class="status-box ${s?"done":""}" onclick="openDashboardDetail('monitoring','daily')" title="Klik untuk detail snapshot ${slot}">
      <div class="slot ${s?"":"wait"}">${slot}</div>
      <div class="status-val">${s?compactKg(v.tonnage):"Menunggu"}</div>
      <div class="status-sub">${s?`${v.trips} trip`:"Menunggu"}</div>
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




// =========================================================
// DASHBOARD INTERACTIVE TONNAGE TRENDS
// Satu pilihan KP mengendalikan Harian, Bulanan, Tahunan.
// =========================================================
function trendBadge(id,current,previous,comparisonLabel=""){
  const el=$(id);
  if(!el) return;
  current=Number(current||0);
  previous=Number(previous||0);
  if(previous<=0){
    el.className="trend-badge neutral";
    el.textContent="Belum ada pembanding";
    return;
  }
  const pct=(current-previous)/previous*100;
  if(Math.abs(pct)<0.05){
    el.className="trend-badge neutral";
    el.textContent="0.0%";
    return;
  }
  el.className="trend-badge "+(pct>0?"up":"down");
  el.textContent=`${pct>0?"▲":"▼"} ${Math.abs(pct).toFixed(1)}%${comparisonLabel?` ${comparisonLabel}`:""}`;
}
function renderMiniTrend(containerId,x,y,color="#49de5f"){
  const el=$(containerId);
  if(!el) return;
  const hasData=y.some(v=>v!=null && Number(v)>0);
  if(!hasData){
    Plotly.purge(containerId);
    el.innerHTML='<div style="padding:17px 5px;text-align:center;color:#9f9588;font-size:7px">Belum ada data</div>';
    return;
  }
  Plotly.newPlot(containerId,[{
    x,y,type:"scatter",mode:"lines",
    connectgaps:false,
    line:{width:2,color,shape:"spline"},
    fill:"tozeroy",
    fillcolor:"rgba(73,222,95,.075)",
    hovertemplate:"<b>%{x}</b><br>%{y:,.0f} kg<extra></extra>"
  }],{
    paper_bgcolor:"rgba(0,0,0,0)",
    plot_bgcolor:"rgba(0,0,0,0)",
    margin:{t:3,l:2,r:2,b:2},
    xaxis:{visible:false,fixedrange:true},
    yaxis:{visible:false,rangemode:"tozero",fixedrange:true},
    showlegend:false
  },plotConfig);
}
async function openTrendDetail(mode){
  const selected=dashboardSelectedKP();
  if($("monitorKp")) $("monitorKp").value=selected;
  await goToPage("monitoring");
  setMonitorMode(mode);
}
async function loadDashboardTrendIndicators(forceDate=null){
  if(!$("dashboardTrendKp")) return;

  const kp=$("dashboardTrendKp").value || "ALL";

  // -------------------------------------------------------
  // 1) HARIAN: snapshot intraday pada tanggal operasional terbaru
  // -------------------------------------------------------
  let dailyDate=forceDate;
  if(!dailyDate){
    const {data:lastSnap}=await db.from("monitoring_snapshots")
      .select("report_date")
      .order("report_date",{ascending:false})
      .limit(1);
    dailyDate=lastSnap?.[0]?.report_date || localISODate();
  }

  const {data:snaps}=await db.from("monitoring_snapshots")
    .select("id,report_date,snapshot_time,total_tonnage_kg")
    .eq("report_date",dailyDate)
    .order("snapshot_time",{ascending:true});

  const dailyById={};
  if(kp==="ALL"){
    (snaps||[]).forEach(s=>dailyById[s.id]=Number(s.total_tonnage_kg||0));
  }else if(snaps?.length){
    const ids=snaps.map(s=>s.id);
    const {data:d}=await db.from("monitoring_snapshot_details")
      .select("snapshot_id,tonnage_kg")
      .in("snapshot_id",ids)
      .eq("kp_code",kp);
    ids.forEach(id=>dailyById[id]=0);
    (d||[]).forEach(r=>dailyById[r.snapshot_id]=(dailyById[r.snapshot_id]||0)+Number(r.tonnage_kg||0));
  }

  const dailySlotMap={};
  (snaps||[]).forEach(s=>dailySlotMap[s.snapshot_time.slice(0,5)]=dailyById[s.id]||0);
  const dailyY=slots.map(slot=>dailySlotMap[slot] ?? null);
  const dailyActual=(snaps||[]).map(s=>dailyById[s.id]||0);
  const dailyCurrent=dailyActual.at(-1)||0;
  const dailyPrevious=dailyActual.length>1?dailyActual.at(-2):0;

  $("dailyTrendValue").textContent=kg(dailyCurrent);
  $("dailyTrendPeriod").textContent=`${kp==="ALL"?"Semua KP":kp} • ${dailyDate}`;
  trendBadge("dailyTrendBadge",dailyCurrent,dailyPrevious,"vs snapshot");
  renderMiniTrend("dailyTrendMini",slots,dailyY);

  // -------------------------------------------------------
  // 2) BULANAN: Jan-Dec pada tahun histori terbaru
  // -------------------------------------------------------
  let histQuery=db.from("historical_summary").select("year,month,kp_code,tonnage_kg");
  if(kp!=="ALL") histQuery=histQuery.eq("kp_code",kp);
  const {data:hist}=await histQuery;

  const rows=hist||[];
  const years=[...new Set(rows.map(r=>Number(r.year)))].sort((a,b)=>a-b);
  const latestYear=years.at(-1);
  const monthTotals=Array(12).fill(0);

  if(latestYear){
    rows.filter(r=>Number(r.year)===latestYear).forEach(r=>{
      const m=Number(r.month);
      if(m>=1&&m<=12) monthTotals[m-1]+=Number(r.tonnage_kg||0);
    });
  }

  let latestMonthIndex=-1;
  for(let i=11;i>=0;i--){
    if(monthTotals[i]>0){latestMonthIndex=i;break;}
  }
  const monthlyCurrent=latestMonthIndex>=0?monthTotals[latestMonthIndex]:0;
  let previousMonthIndex=latestMonthIndex-1;
  while(previousMonthIndex>=0 && monthTotals[previousMonthIndex]===0) previousMonthIndex--;
  const monthlyPrevious=previousMonthIndex>=0?monthTotals[previousMonthIndex]:0;
  const monthLabels=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];

  $("monthlyTrendValue").textContent=kg(monthlyCurrent);
  $("monthlyTrendPeriod").textContent=latestYear
    ? `${kp==="ALL"?"Semua KP":kp} • ${monthLabels[Math.max(latestMonthIndex,0)]} ${latestYear}`
    : `${kp==="ALL"?"Semua KP":kp} • Belum ada histori`;
  trendBadge("monthlyTrendBadge",monthlyCurrent,monthlyPrevious,"vs bulan");
  renderMiniTrend("monthlyTrendMini",monthLabels,monthTotals,"#f0b325");

  // -------------------------------------------------------
  // 3) TAHUNAN: total per tahun.
  // Badge membandingkan latest year YTD dengan periode bulan
  // yang sama pada tahun sebelumnya agar tidak misleading.
  // -------------------------------------------------------
  const byYear={};
  rows.forEach(r=>{
    const y=Number(r.year),m=Number(r.month),v=Number(r.tonnage_kg||0);
    if(!byYear[y]) byYear[y]={total:0,months:{}};
    byYear[y].total+=v;
    byYear[y].months[m]=(byYear[y].months[m]||0)+v;
  });

  const annualYears=Object.keys(byYear).map(Number).sort((a,b)=>a-b);
  const annualY=annualYears.map(y=>byYear[y].total);
  const annualLatest=annualYears.at(-1);
  const annualPrev=annualYears.length>1?annualYears.at(-2):null;
  const annualCurrent=annualLatest?byYear[annualLatest].total:0;

  let comparablePrev=0;
  let latestMonths=[];
  if(annualLatest){
    latestMonths=Object.keys(byYear[annualLatest].months)
      .map(Number)
      .filter(m=>byYear[annualLatest].months[m]>0)
      .sort((a,b)=>a-b);
  }
  if(annualPrev && latestMonths.length){
    comparablePrev=latestMonths.reduce((sum,m)=>sum+(byYear[annualPrev].months[m]||0),0);
  }

  $("yearlyTrendValue").textContent=kg(annualCurrent);
  $("yearlyTrendPeriod").textContent=annualLatest
    ? `${kp==="ALL"?"Semua KP":kp} • ${annualLatest}${latestMonths.length<12?` YTD ${latestMonths.length} bln`:""}`
    : `${kp==="ALL"?"Semua KP":kp} • Belum ada histori`;
  trendBadge("yearlyTrendBadge",annualCurrent,comparablePrev,annualPrev?`vs ${annualPrev}`:"");
  renderMiniTrend("yearlyTrendMini",annualYears.map(String),annualY,"#b36bff");
}


// =========================================================
// KP MONITORING: HARIAN / BULANAN / TAHUNAN
// =========================================================
function localISODate(d=new Date()){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function monthLabelId(monthValue){
  if(!monthValue) return "-";
  const [y,m]=monthValue.split("-").map(Number);
  return new Date(y,m-1,1).toLocaleDateString("id-ID",{month:"long",year:"numeric"});
}
function dateLabelId(dateValue){
  if(!dateValue) return "-";
  const [y,m,d]=dateValue.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString("id-ID",{day:"2-digit",month:"long",year:"numeric"});
}
function yearMonthBounds(monthValue){
  const [y,m]=monthValue.split("-").map(Number);
  const last=new Date(y,m,0).getDate();
  return {start:`${y}-${String(m).padStart(2,"0")}-01`, end:`${y}-${String(m).padStart(2,"0")}-${String(last).padStart(2,"0")}`};
}
async function initKPMonitoringFilters(){
  if(!$("monitorDate")) return;
  const {data:latest}=await db.from("monitoring_snapshots")
    .select("report_date")
    .order("report_date",{ascending:false})
    .limit(1);
  const latestDate=latest?.[0]?.report_date || localISODate();
  if(!$("monitorDate").value) $("monitorDate").value=latestDate;
  if(!$("monitorMonth").value) $("monitorMonth").value=latestDate.slice(0,7);

  const {data:histYears}=await db.from("historical_summary").select("year");
  const years=[...new Set((histYears||[]).map(x=>Number(x.year)))];
  const currentYear=Number(latestDate.slice(0,4));
  if(!years.includes(currentYear)) years.push(currentYear);
  years.sort((a,b)=>b-a);
  $("monitorYear").innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join("");
  if(years.includes(currentYear)) $("monitorYear").value=String(currentYear);
}
function setMonitorMode(mode){
  MONITOR_MODE=mode;
  ["daily","monthly","yearly"].forEach(m=>{
    const id=m==="daily"?"monitorModeDaily":m==="monthly"?"monitorModeMonthly":"monitorModeYearly";
    $(id)?.classList.toggle("active",m===mode);
  });
  $("monitorDateWrap").classList.toggle("hidden",mode!=="daily");
  $("monitorMonthWrap").classList.toggle("hidden",mode!=="monthly");
  $("monitorYearWrap").classList.toggle("hidden",mode!=="yearly");
  loadKPMonitoring();
}
function setMonitorSummary({kp,period,tonnage,trips,coverage,tonnageSub,tripsSub,coverageSub}){
  $("monitorKpiKp").textContent=kp==="ALL"?"Semua KP":kp;
  $("monitorKpiPeriod").textContent=period;
  $("monitorKpiTonnage").textContent=kg(tonnage);
  $("monitorKpiTonnageSub").textContent=tonnageSub || "-";
  $("monitorKpiTrips").textContent=trips==null?"—":Number(trips).toLocaleString("id-ID");
  $("monitorKpiTripsSub").textContent=tripsSub || "-";
  $("monitorKpiCoverage").textContent=coverage;
  $("monitorKpiCoverageSub").textContent=coverageSub || "-";
}
function renderMonitorEmpty(message){
  Plotly.purge("monitorKpChart");
  $("monitorKpChart").innerHTML=`<div style="padding:55px 20px;text-align:center;color:#c8bdaf">${message}</div>`;
  $("monitorKpTable").innerHTML=table(["Keterangan"],[[message]]);
}
async function loadKPMonitoring(){
  if(!$("monitorKp")) return;
  const kp=$("monitorKp").value || "ALL";
  if(MONITOR_MODE==="daily") return loadKPDaily(kp);
  if(MONITOR_MODE==="monthly") return loadKPMonthly(kp);
  return loadKPYearly(kp);
}
async function loadKPDaily(kp){
  const date=$("monitorDate").value;
  $("monitorChartTitle").textContent="INTRADAY PROGRESS 10 / 12 / 15 / 17";
  $("monitorTableTitle").textContent="DETAIL SNAPSHOT HARIAN";
  $("monitorSourceBadge").textContent="Snapshot WhatsApp";
  $("monitorRuleNote").textContent="Setiap jam = snapshot kumulatif";

  const {data:snaps,error}=await db.from("monitoring_snapshots")
    .select("id,report_date,snapshot_time,total_tonnage_kg,total_trips")
    .eq("report_date",date)
    .order("snapshot_time",{ascending:true});
  if(error){renderMonitorEmpty(error.message);return;}
  if(!snaps?.length){
    setMonitorSummary({kp,period:dateLabelId(date),tonnage:0,trips:0,coverage:"0 / 4",tonnageSub:"Belum ada snapshot",tripsSub:"Belum ada snapshot",coverageSub:"Snapshot tersedia"});
    renderMonitorEmpty("Belum ada data snapshot untuk tanggal ini.");
    return;
  }

  let values={};
  if(kp==="ALL"){
    snaps.forEach(s=>values[s.id]={tonnage:Number(s.total_tonnage_kg||0),trips:Number(s.total_trips||0)});
  }else{
    const ids=snaps.map(s=>s.id);
    const {data:details}=await db.from("monitoring_snapshot_details")
      .select("snapshot_id,tonnage_kg,trip_count")
      .in("snapshot_id",ids)
      .eq("kp_code",kp);
    snaps.forEach(s=>values[s.id]={tonnage:0,trips:0});
    (details||[]).forEach(d=>{
      values[d.snapshot_id].tonnage+=Number(d.tonnage_kg||0);
      values[d.snapshot_id].trips+=Number(d.trip_count||0);
    });
  }

  const slotData={};
  snaps.forEach(s=>slotData[s.snapshot_time.slice(0,5)]={...values[s.id],snapshot:s});
  const ys=slots.map(slot=>slotData[slot]?.tonnage ?? null);
  const latest=snaps[snaps.length-1];
  const latestVal=values[latest.id]||{tonnage:0,trips:0};

  setMonitorSummary({
    kp,period:dateLabelId(date),
    tonnage:latestVal.tonnage,trips:latestVal.trips,
    coverage:`${snaps.length} / 4`,
    tonnageSub:`Snapshot terakhir ${latest.snapshot_time.slice(0,5)}`,
    tripsSub:"Trip kumulatif snapshot terakhir",
    coverageSub:"Snapshot tersedia"
  });

  Plotly.newPlot("monitorKpChart",[{
    x:slots,y:ys,type:"scatter",mode:"lines+markers+text",
    text:ys.map(v=>v==null?"Menunggu":compactKg(v)),
    textposition:"top center",
    line:{width:3,color:"#49de5f",shape:"spline"},
    marker:{size:10,color:ys.map(v=>v==null?"rgba(255,255,255,.22)":"#65f278"),line:{width:2,color:"#203522"}},
    connectgaps:false,
    hovertemplate:"<b>%{x}</b><br>%{y:,.0f} kg<extra></extra>"
  }],{
    ...darkLayout,
    margin:{t:34,l:58,r:18,b:42},
    xaxis:{...darkLayout.xaxis,type:"category",categoryorder:"array",categoryarray:slots,fixedrange:true},
    yaxis:{...darkLayout.yaxis,rangemode:"tozero",tickformat:"~s",fixedrange:true},
    showlegend:false
  },plotConfig);

  $("monitorKpTable").innerHTML=table(
    ["Jam","Tonase","Trip","Status"],
    snaps.map(s=>{
      const v=values[s.id]||{tonnage:0,trips:0};
      return [s.snapshot_time.slice(0,5),kg(v.tonnage),v.trips,"Tersedia"];
    })
  );
}
async function loadKPMonthly(kp){
  const monthValue=$("monitorMonth").value;
  if(!monthValue) return;
  const [year,month]=monthValue.split("-").map(Number);

  $("monitorChartTitle").textContent=kp==="ALL"
    ? "PERBANDINGAN TONASE KP - BULAN TERPILIH"
    : "PERKEMBANGAN BULANAN KP - TAHUN TERPILIH";
  $("monitorTableTitle").textContent="REKAP BULANAN KP";
  $("monitorSourceBadge").textContent="Monthly Summary";
  $("monitorRuleNote").textContent="Detail harian & trip akan diisi dari Excel bulanan";

  // Panel bulanan memakai summary bulanan KP. Tidak menjumlahkan snapshot WhatsApp intraday.
  let q=db.from("historical_summary")
    .select("year,month,kp_code,tonnage_kg")
    .eq("year",year);

  const {data,error}=await q;
  if(error){renderMonitorEmpty(error.message);return;}
  const allRows=data||[];

  if(!allRows.length){
    setMonitorSummary({
      kp,period:monthLabelId(monthValue),tonnage:0,trips:null,
      coverage:"0 KP",
      tonnageSub:"Belum ada data bulanan",
      tripsSub:"Menunggu Excel bulanan",
      coverageSub:"KP dengan data"
    });
    renderMonitorEmpty("Panel bulanan sudah siap. Data akan muncul setelah summary/Excel bulan tersebut tersedia.");
    return;
  }

  // Aggregate current selected month by KP.
  const monthRows=allRows.filter(r=>Number(r.month)===month);
  const byKP={};
  monthRows.forEach(r=>{
    byKP[r.kp_code]=(byKP[r.kp_code]||0)+Number(r.tonnage_kg||0);
  });

  if(kp==="ALL"){
    const pairs=Object.entries(byKP).sort((a,b)=>b[1]-a[1]);
    const total=pairs.reduce((a,b)=>a+b[1],0);
    const active=pairs.filter(([,v])=>v>0).length;
    const avg=active?total/active:0;

    setMonitorSummary({
      kp,period:monthLabelId(monthValue),tonnage:total,trips:null,
      coverage:`${active} KP`,
      tonnageSub:`Rata-rata ${kg(avg)} / KP aktif`,
      tripsSub:"Akan tersedia setelah Excel detail bulanan diupload",
      coverageSub:"KP dengan tonase bulan ini"
    });

    if(!pairs.length){
      renderMonitorEmpty("Belum ada data untuk bulan yang dipilih.");
      return;
    }

    Plotly.newPlot("monitorKpChart",[{
      x:pairs.map(x=>x[1]),
      y:pairs.map(x=>x[0]),
      type:"bar",orientation:"h",
      marker:{color:"#49de5f"},
      hovertemplate:"<b>%{y}</b><br>%{x:,.0f} kg<extra></extra>"
    }],{
      ...darkLayout,
      margin:{t:18,l:74,r:18,b:38},
      xaxis:{...darkLayout.xaxis,tickformat:"~s",fixedrange:true},
      yaxis:{...darkLayout.yaxis,autorange:"reversed",fixedrange:true},
      showlegend:false
    },plotConfig);

    $("monitorKpTable").innerHTML=table(
      ["Ranking","KP","Tonase","Trip"],
      pairs.map(([code,val],i)=>[
        i+1,code,kg(val),'<span style="color:#9e9588">Menunggu Excel</span>'
      ])
    );
  }else{
    // For one KP, show Jan-Dec monthly trend in the selected year,
    // while KPI card remains focused on the selected month.
    const monthly=Array(12).fill(0);
    allRows.filter(r=>r.kp_code===kp).forEach(r=>{
      const m=Number(r.month);
      if(m>=1&&m<=12) monthly[m-1]+=Number(r.tonnage_kg||0);
    });
    const selected=monthly[month-1]||0;
    const present=monthly.filter(v=>v>0).length;
    const previous=month>1?monthly[month-2]:0;
    let deltaText="Tidak ada pembanding bulan sebelumnya";
    if(previous>0){
      const delta=selected-previous;
      const pct=(delta/previous)*100;
      deltaText=`${delta>=0?"+":""}${kg(delta)} (${pct>=0?"+":""}${pct.toFixed(1)}%) vs bulan lalu`;
    }

    setMonitorSummary({
      kp,period:monthLabelId(monthValue),tonnage:selected,trips:null,
      coverage:`${present} bulan`,
      tonnageSub:deltaText,
      tripsSub:"Akan tersedia setelah Excel detail bulanan diupload",
      coverageSub:`Bulan tersedia pada ${year}`
    });

    const labels=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];
    Plotly.newPlot("monitorKpChart",[{
      x:labels,y:monthly,type:"bar",
      marker:{
        color:monthly.map((v,i)=>i===month-1?"#7cff86":v>0?"rgba(73,222,95,.55)":"rgba(255,255,255,.10)")
      },
      hovertemplate:"<b>%{x}</b><br>%{y:,.0f} kg<extra></extra>"
    }],{
      ...darkLayout,
      margin:{t:18,l:58,r:18,b:38},
      xaxis:{...darkLayout.xaxis,fixedrange:true},
      yaxis:{...darkLayout.yaxis,rangemode:"tozero",tickformat:"~s",fixedrange:true},
      showlegend:false
    },plotConfig);

    $("monitorKpTable").innerHTML=table(
      ["Bulan","Tonase","Trip","Sumber"],
      labels.map((label,i)=>[
        label,kg(monthly[i]),
        '<span style="color:#9e9588">—</span>',
        monthly[i]>0?"Summary bulanan":"Belum ada data"
      ])
    );
  }
}

async function loadKPYearly(kp){
  const year=Number($("monitorYear").value);
  $("monitorChartTitle").textContent="TREND TONASE BULANAN JAN–DES";
  $("monitorTableTitle").textContent="REKAP BULANAN TAHUNAN";
  $("monitorSourceBadge").textContent="Historical Summary";
  $("monitorRuleNote").textContent="Trip tidak tersedia pada histori tahunan";

  let q=db.from("historical_summary").select("month,kp_code,tonnage_kg").eq("year",year);
  if(kp!=="ALL") q=q.eq("kp_code",kp);
  const {data,error}=await q;
  if(error){renderMonitorEmpty(error.message);return;}
  const rows=data||[];
  if(!rows.length){
    setMonitorSummary({kp,period:String(year),tonnage:0,trips:null,coverage:"0 bulan",tonnageSub:"Belum ada histori",tripsSub:"Tidak tersedia di historical_summary",coverageSub:"Bulan dengan data"});
    renderMonitorEmpty("Belum ada histori tahunan untuk pilihan ini.");
    return;
  }

  const monthly=Array(12).fill(0);
  const monthsPresent=new Set();
  rows.forEach(r=>{
    const m=Number(r.month);
    if(m>=1&&m<=12){
      monthly[m-1]+=Number(r.tonnage_kg||0);
      monthsPresent.add(m);
    }
  });
  const total=monthly.reduce((a,b)=>a+b,0);
  const avg=monthsPresent.size?total/monthsPresent.size:0;
  const labels=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];

  setMonitorSummary({
    kp,period:String(year),tonnage:total,trips:null,
    coverage:`${monthsPresent.size} bulan`,
    tonnageSub:`Rata-rata ${kg(avg)} / bulan tersedia`,
    tripsSub:"Tidak tersedia pada data histori tahunan",
    coverageSub:"Bulan dengan data"
  });

  Plotly.newPlot("monitorKpChart",[{
    x:labels,y:monthly,type:"bar",
    marker:{color:monthly.map((v,i)=>monthsPresent.has(i+1)?"#49de5f":"rgba(255,255,255,.10)")},
    hovertemplate:"<b>%{x}</b><br>%{y:,.0f} kg<extra></extra>"
  }],{
    ...darkLayout,
    margin:{t:22,l:58,r:18,b:42},
    xaxis:{...darkLayout.xaxis,fixedrange:true},
    yaxis:{...darkLayout.yaxis,rangemode:"tozero",tickformat:"~s",fixedrange:true},
    showlegend:false
  },plotConfig);

  $("monitorKpTable").innerHTML=table(
    ["Bulan","Tonase","Status"],
    labels.map((label,i)=>[
      label,
      kg(monthly[i]),
      monthsPresent.has(i+1)?"Tersedia":"Belum ada data"
    ])
  );
}


boot();
