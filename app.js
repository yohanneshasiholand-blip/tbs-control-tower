
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
let MONTHLY_EXCEL_PREVIEW = null, ANNUAL_EXCEL_PREVIEW = null;
let MONITOR_MODE = "daily";
let MASTER_DIRECTORY_DATA = [];
let MASTER_SUPPLIER_DATA = [];

const FALLBACK_KP_CODES = [
  "ASMJ-1","ASMJ-2","BMK","BSN","BSS","FAA","GSL","GSL-INUMAN",
  "GSS","HKBS","KIP","KS2","KWP","LBP","LSHP","MAN","MSB-2","PSM",
  "SISL","SKA","SSL","SSM","TKWL-1","TKWL-2"
];


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

// =========================================================
// SIDEBAR TREE NAVIGATION
// =========================================================
function closeSidebarGroups(exceptId=null){
  ["monitoringGroup","priceGroup","expenseGroup"].forEach(id=>{
    if(id!==exceptId) $(id)?.classList.remove("open");
  });
}
function toggleSidebarGroup(id){
  const el=$(id);
  if(!el) return;
  const willOpen=!el.classList.contains("open");
  closeSidebarGroups(id);
  el.classList.toggle("open",willOpen);
}
function setSidebarMonitoringActive(mode){
  ["daily","monthly","yearly"].forEach(m=>{
    const id=m==="daily"?"sideDaily":m==="monthly"?"sideMonthly":"sideYearly";
    $(id)?.classList.toggle("active",m===mode);
  });
  $("monitoringGroup")?.classList.add("open");
}
async function openMonitoringSub(mode){
  setSidebarMonitoringActive(mode);
  await goToPage("monitoring");
  setMonitorMode(mode);
}
async function openParentPage(page,groupId){
  closeSidebarGroups(groupId);
  $(groupId)?.classList.add("open");
  await goToPage(page);
}
async function focusPageInput(page,inputId){
  await openParentPage(page,page==="prices"?"priceGroup":"expenseGroup");
  setTimeout(()=>{
    const el=$(inputId);
    if(el){
      el.scrollIntoView({behavior:"smooth",block:"center"});
      el.focus();
    }
  },80);
}

function goToPage(page){
  document.querySelectorAll(".nav").forEach(x => x.classList.toggle("active", x.dataset.page===page));
  document.querySelectorAll(".page").forEach(x => x.classList.remove("active"));
  $("page-" + page).classList.add("active");

  if(page==="dashboard" || page==="master"){
    closeSidebarGroups();
  }
  if(page==="monitoring"){
    $("monitoringGroup")?.classList.add("open");
    setSidebarMonitoringActive(MONITOR_MODE);
    loadKPMonitoring();
  }
  if(page==="prices"){
    $("priceGroup")?.classList.add("open");
    loadPrices();
  }
  if(page==="expenses"){
    $("expenseGroup")?.classList.add("open");
    loadExpenses();
  }
  if(page==="history") loadHistory();
  if(page==="dashboard") loadDashboard();
}

function canonKP(k){
  return (k || "").toUpperCase().trim()
    .replace(/^KP[.\s]*/,"")
    .replace(/\s*-\s*/g,"-")
    .replace(/^ASMJ\s*([12])$/,"ASMJ-$1")
    .replace(/^TKWL\s*([12])$/,"TKWL-$1")
    .replace(/^MSB\s*2$/,"MSB-2")
    .replace(/^KS\s*2$/,"KS2")
    .replace(/^IIS$/,"SSM")
    .replace(/^LPI$/,"LBP");
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

function masterProvinceFromAddress(address){
  const a=String(address||"").toLowerCase();
  if(a.includes("riau")) return "Riau";
  if(a.includes("aceh")) return "Aceh";
  if(a.includes("sumatera utara")) return "Sumatera Utara";
  if(a.includes("sumatera selatan")) return "Sumatera Selatan";
  if(a.includes("lampung")) return "Lampung";
  return "Lainnya";
}
function renderMasterDirectory(){
  if(!$("masterDirectory")) return;

  const search=($("masterSearch")?.value||"").trim().toLowerCase();
  const filter=$("masterFilter")?.value||"ALL";

  let units=MASTER_DIRECTORY_DATA.map(u=>({
    ...u,
    suppliers:MASTER_SUPPLIER_DATA.filter(s=>s.kp_id===u.id)
  }));

  if(filter==="WITH_PIC") units=units.filter(u=>u.unit_head||u.manager_ffb);
  if(filter==="NO_PIC") units=units.filter(u=>!u.unit_head&&!u.manager_ffb);

  if(search){
    units=units.filter(u=>{
      const supplierText=u.suppliers.map(s=>`${s.name} ${s.full_name||""} ${s.category||""}`).join(" ");
      return `${u.code} ${u.name||""} ${u.address||""} ${u.unit_head||""} ${u.manager_ffb||""} ${supplierText}`.toLowerCase().includes(search);
    });
  }

  $("masterDirectory").innerHTML=units.length?units.map(u=>`
    <div class="master-unit-card">
      <div class="master-unit-card-head">
        <div class="master-unit-code">
          <strong>${u.code}</strong>
          <div>
            <span class="master-unit-name">${u.name||u.code}</span>
          </div>
        </div>
        <span class="master-status">${u.active?"AKTIF":"NONAKTIF"}</span>
      </div>
      <div class="master-unit-address">${u.address||"Alamat belum tersedia"}</div>
      <div class="master-unit-meta">
        <div class="master-meta-item">
          <small>Pimpinan Unit</small>
          <b>${u.unit_head||"—"}</b>
        </div>
        <div class="master-meta-item">
          <small>Manager FFB</small>
          <b>${u.manager_ffb||"—"}</b>
        </div>
      </div>
      <div class="master-unit-suppliers">
        ${u.suppliers.length
          ? u.suppliers.map(s=>`<span class="master-supplier-chip" title="${s.full_name||s.name} • ${s.category||"Kategori belum tersedia"}">${s.name}${s.full_name&&s.full_name!==s.name?` • ${s.full_name}`:""}</span>`).join("")
          : '<span class="master-supplier-chip">Belum ada SPB</span>'
        }
      </div>
    </div>`).join("")
    : '<div class="master-empty">Tidak ada master data yang cocok dengan filter.</div>';

  const allUnits=MASTER_DIRECTORY_DATA;
  const regions=new Set(allUnits.map(u=>masterProvinceFromAddress(u.address)).filter(x=>x!=="Lainnya"));
  $("masterUnitCount").textContent=allUnits.filter(u=>u.active).length;
  $("masterSupplierCount").textContent=MASTER_SUPPLIER_DATA.filter(s=>s.active).length;
  $("masterHeadCount").textContent=allUnits.filter(u=>u.unit_head).length;
  $("masterRegionCount").textContent=regions.size;

  $("masterSupplierTable").innerHTML=table(
    ["KP","Kode SPB / DO","Nama Lengkap","Kategori Buah","Status"],
    MASTER_SUPPLIER_DATA
      .filter(s=>s.active)
      .sort((a,b)=>(a.master_kp?.code||"").localeCompare(b.master_kp?.code||"")||a.name.localeCompare(b.name))
      .map(s=>[
        s.master_kp?.code||"",
        s.name,
        s.full_name||s.name,
        s.category||"—",
        s.active?"Aktif":"Nonaktif"
      ])
  );
}
async function loadMaster(){
  const {data:kps,error:kpError}=await db.from("master_kp")
    .select("id,code,name,address,unit_head,manager_ffb,active")
    .eq("active",true)
    .order("code");

  const codes=(!kpError && kps?.length)
    ? kps.map(x=>x.code).filter(Boolean)
    : [...FALLBACK_KP_CODES];

  MASTER_KP_COUNT=codes.length;

  const optionsAll='<option value="ALL">Semua KP</option>' +
    codes.map(code=>`<option value="${code}">${code}</option>`).join("");
  const optionsExpense='<option value="">Pilih KP jika tidak terdeteksi otomatis</option>' +
    codes.map(code=>`<option value="${code}">${code}</option>`).join("");

  if($("expenseKp")) $("expenseKp").innerHTML=optionsExpense;
  if($("historyKp")) $("historyKp").innerHTML=optionsAll;
  if($("monitorKp")) $("monitorKp").innerHTML=optionsAll;

  if(kpError){
    console.warn("Master KP Supabase gagal dimuat; memakai fallback dropdown.",kpError);
    MASTER_DIRECTORY_DATA=codes.map((code,i)=>({id:-(i+1),code,name:code,address:null,unit_head:null,manager_ffb:null,active:true}));
  }else{
    MASTER_DIRECTORY_DATA=kps||[];
  }

  await initKPMonitoringFilters();

  const {data:s,error:supplierError}=await db.from("master_supplier")
    .select("id,kp_id,name,full_name,category,aliases,active,master_kp(code)")
    .order("name");

  MASTER_SUPPLIER_DATA=supplierError?[]:(s||[]);
  renderMasterDirectory();
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



async function openDashboardDetail(page,mode=null){
  if(page==="monitoring" && $("monitorKp") && !$("monitorKp").value) $("monitorKp").value="ALL";
  await goToPage(page);
  if(page==="monitoring" && mode) setMonitorMode(mode);
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
  const {data:expRows} = await db.from("unit_expenses").select("*").eq("expense_date",todayDate);
  const dailyExpenses = expRows || [];
  const dailyExpenseTotal = dailyExpenses.reduce((a,b)=>a+Number(b.amount||0),0);
  $("kpiExpense").textContent = rupiah(dailyExpenseTotal);
  $("kpiExpenseSub").textContent = dailyExpenseTotal ? "Total pengeluaran " + todayDate : "Belum ada pengeluaran pada tanggal snapshot";

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

  const topChart=$("topKpChart");
  if(topChart?.on){
    topChart.removeAllListeners?.("plotly_click");
    topChart.on("plotly_click", async ev=>{
      const code=ev?.points?.[0]?.y;
      if(code && $("monitorKp")){
        $("monitorKp").value=code;
        await goToPage("monitoring");
        setMonitorMode("daily");
      }
    });
  }

  const intraday=$("intradayChart");
  if(intraday?.on){
    intraday.removeAllListeners?.("plotly_click");
    intraday.on("plotly_click", async ()=>{
      if($("monitorKp")) $("monitorKp").value="ALL";
      if($("monitorDate")) $("monitorDate").value=latest.report_date;
      await goToPage("monitoring");
      setMonitorMode("daily");
    });
  }

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
  const clean=y.map(v=>v==null?0:Number(v||0));
  const hasData=clean.some(v=>v>0);
  if(!hasData){
    Plotly.purge(containerId);
    el.innerHTML='<div style="padding:17px 5px;text-align:center;color:#9f9588;font-size:7px">Belum ada data</div>';
    return;
  }
  Plotly.newPlot(containerId,[{
    x,y:clean,type:"bar",
    marker:{color:clean.map(v=>v>0?color:"rgba(255,255,255,.08)")},
    hovertemplate:"<b>%{x}</b><br>%{y:,.0f} kg<extra></extra>"
  }],{
    paper_bgcolor:"rgba(0,0,0,0)",
    plot_bgcolor:"rgba(0,0,0,0)",
    margin:{t:3,l:2,r:2,b:2},
    xaxis:{visible:false,fixedrange:true},
    yaxis:{visible:false,rangemode:"tozero",fixedrange:true},
    bargap:.38,
    showlegend:false
  },plotConfig);
}
async function openTrendDetail(mode){
  const selected=dashboardSelectedKP();
  if($("monitorKp")) $("monitorKp").value=selected;
  await goToPage("monitoring");
  setMonitorMode(mode);
}
async function loadMonitoringTrendIndicators(){
  if(!$("monitorKp")) return;
  const kp=$("monitorKp").value || "ALL";

  // HARIAN: tanggal operasional dari filter Monitoring.
  let dailyDate=$("monitorDate")?.value;
  if(!dailyDate){
    const {data:lastSnap}=await db.from("monitoring_snapshots")
      .select("report_date").order("report_date",{ascending:false}).limit(1);
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

  // BULANAN + TAHUNAN: historical_summary / monthly summary.
  let hq=db.from("historical_summary").select("year,month,kp_code,tonnage_kg");
  if(kp!=="ALL") hq=hq.eq("kp_code",kp);
  const {data:hist}=await hq;
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
  const monthLabels=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];
  const monthlyCurrent=latestMonthIndex>=0?monthTotals[latestMonthIndex]:0;
  let previousMonthIndex=latestMonthIndex-1;
  while(previousMonthIndex>=0 && monthTotals[previousMonthIndex]===0) previousMonthIndex--;
  const monthlyPrevious=previousMonthIndex>=0?monthTotals[previousMonthIndex]:0;

  $("monthlyTrendValue").textContent=kg(monthlyCurrent);
  $("monthlyTrendPeriod").textContent=latestYear
    ? `${kp==="ALL"?"Semua KP":kp} • ${monthLabels[Math.max(latestMonthIndex,0)]} ${latestYear}`
    : `${kp==="ALL"?"Semua KP":kp} • Belum ada data`;
  trendBadge("monthlyTrendBadge",monthlyCurrent,monthlyPrevious,"vs bulan");
  renderMiniTrend("monthlyTrendMini",monthLabels,monthTotals,"#f0b325");

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
  const latestMonths=annualLatest
    ? Object.keys(byYear[annualLatest].months).map(Number).filter(m=>byYear[annualLatest].months[m]>0)
    : [];
  const comparablePrev=annualPrev
    ? latestMonths.reduce((sum,m)=>sum+(byYear[annualPrev].months[m]||0),0)
    : 0;

  $("yearlyTrendValue").textContent=kg(annualCurrent);
  $("yearlyTrendPeriod").textContent=annualLatest
    ? `${kp==="ALL"?"Semua KP":kp} • ${annualLatest}${latestMonths.length<12?` YTD ${latestMonths.length} bln`:""}`
    : `${kp==="ALL"?"Semua KP":kp} • Belum ada data`;
  trendBadge("yearlyTrendBadge",annualCurrent,comparablePrev,annualPrev?`vs ${annualPrev}`:"");
  renderMiniTrend("yearlyTrendMini",annualYears.map(String),annualY,"#b36bff");
}


// =========================================================
// EXCEL IMPORT v4.6: MULTI-FILE + REPORT-STYLE XLS + ANNUAL
// =========================================================
const MONTH_ID = {
  januari:1,februari:2,maret:3,april:4,mei:5,juni:6,juli:7,agustus:8,
  september:9,oktober:10,november:11,desember:12,
  jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,agst:8,
  sep:9,sept:9,oct:10,okt:10,nov:11,dec:12,des:12
};

function parseExcelNumber(v){
  if(v==null || v==="") return null;
  if(typeof v==="number") return Number.isFinite(v)?v:null;
  const s=String(v).trim();
  if(!s || /^#/.test(s)) return null;
  // Indonesian thousands separator: 294.351 -> 294351
  if(/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)){
    const n=Number(s.replace(/\./g,"").replace(",","."));
    return Number.isFinite(n)?n:null;
  }
  const n=Number(s.replace(/\s/g,"").replace(",",".").replace(/[^\d.-]/g,""));
  return Number.isFinite(n)?n:null;
}
function parseOperationalDate(v){
  if(v==null || v==="") return null;
  if(v instanceof Date && !isNaN(v)) return localISODate(v);
  if(typeof v==="number"){
    const p=XLSX.SSF.parse_date_code(v);
    if(p?.y) return `${p.y}-${String(p.m).padStart(2,"0")}-${String(p.d).padStart(2,"0")}`;
  }
  const s=String(v).trim();

  let m=s.match(/^(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})$/i);
  if(m){
    const mon=MONTH_ID[m[2].toLowerCase()];
    return `${m[3]}-${String(mon).padStart(2,"0")}-${String(+m[1]).padStart(2,"0")}`;
  }
  m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(m){
    let y=+m[3]; if(y<100) y+=2000;
    return `${y}-${String(+m[2]).padStart(2,"0")}-${String(+m[1]).padStart(2,"0")}`;
  }
  m=s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if(m) return `${m[1]}-${String(+m[2]).padStart(2,"0")}-${String(+m[3]).padStart(2,"0")}`;
  return null;
}
function normalizeHeaderKey(s){
  return String(s||"").toLowerCase().trim()
    .replace(/\s+/g," ")
    .replace(/[._-]+/g," ");
}
function pickField(row, aliases){
  const map={};
  Object.keys(row||{}).forEach(k=>map[normalizeHeaderKey(k)]=row[k]);
  for(const a of aliases){
    const key=normalizeHeaderKey(a);
    if(key in map) return map[key];
  }
  return null;
}
async function readWorkbookFile(file){
  if(!file) throw Error("File belum dipilih.");
  const buf=await file.arrayBuffer();
  return XLSX.read(buf,{type:"array",cellDates:true});
}
function sheetAOA(sheet){
  return XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:false,blankrows:false});
}
function findTextCell(aoa, regex){
  for(let r=0;r<aoa.length;r++){
    for(let c=0;c<(aoa[r]||[]).length;c++){
      const s=String(aoa[r][c]??"").trim();
      if(regex.test(s)) return {r,c,value:s};
    }
  }
  return null;
}
function inferKPFromText(text,fileName=""){
  const all=(String(text||"")+" "+String(fileName||"")).toUpperCase();
  if(/TKWL\s*2|TKWL\s*KANDIS/.test(all)) return "TKWL-2";
  if(/TKWL\s*1|TKWL\s*SIAK/.test(all)) return "TKWL-1";
  if(/ASMJ\s*2/.test(all)) return "ASMJ-2";
  if(/ASMJ\s*1/.test(all)) return "ASMJ-1";
  if(/MSB\s*2/.test(all)) return "MSB-2";
  if(/\bKS\s*2\b|\bKS2\b/.test(all)) return "KS2";
  if(/\bIIS\b|\bSSM\b/.test(all)) return "SSM";
  if(/\bGSL\s*[- ]\s*INUMAN\b/.test(all)) return "GSL-INUMAN";
  const candidates=FALLBACK_KP_CODES.slice().sort((a,b)=>b.length-a.length);
  for(const code of candidates){
    const variants=[code,code.replace("-"," "),code.replace("-","")];
    if(variants.some(v=>all.includes(v))) return code;
  }
  if(/\bLBP\b|\bLPI\b/.test(all)) return "LBP";
  return null;
}
function inferSupplierFromReport(aoa,fileName=""){
  // Most operational files have a metadata row: Agen | FAJAR
  for(let r=0;r<Math.min(40,aoa.length);r++){
    const row=aoa[r]||[];
    for(let c=0;c<row.length;c++){
      if(/^agen$/i.test(String(row[c]??"").trim())){
        for(let cc=c+1;cc<row.length;cc++){
          const v=String(row[cc]??"").trim();
          if(v) return v;
        }
        for(let rr=r+1;rr<Math.min(r+4,aoa.length);rr++){
          const v=(aoa[rr]||[]).map(x=>String(x??"").trim()).find(Boolean);
          if(v && !/^tanggal$/i.test(v)) return v;
        }
      }
    }
  }
  // filename fallback: remove month/year and common words, then match master aliases/names
  const f=String(fileName||"").replace(/\.(xlsx|xls)$/i,"").toUpperCase();
  const allNames=(MASTER_SUPPLIER_DATA||[]).flatMap(s=>[s.name,...(s.aliases||[])]).filter(Boolean);
  const hit=allNames.sort((a,b)=>String(b).length-String(a).length).find(n=>f.includes(String(n).toUpperCase()));
  return hit || "UNKNOWN";
}
function findTonnageColumn(aoa){
  for(let r=0;r<aoa.length;r++){
    const row=aoa[r]||[];
    for(let c=0;c<row.length;c++){
      if(/\bTONASE\b/i.test(String(row[c]??""))) return {row:r,col:c};
    }
  }
  return null;
}
function parseMonthlyReportSheet(sheet,sheetName,fileName){
  const aoa=sheetAOA(sheet);
  const flat=aoa.flat().filter(v=>v!=null).join(" ");
  const kp=inferKPFromText(flat,fileName);
  const supplier=inferSupplierFromReport(aoa,fileName);
  const tonInfo=findTonnageColumn(aoa);

  if(!kp || !tonInfo) return {daily:[],recognized:false,reason:!kp?"KP tidak terdeteksi":"Kolom TONASE tidak ditemukan"};

  const dailyMap=new Map();
  let lastDate=null;

  for(let r=tonInfo.row+1;r<aoa.length;r++){
    const row=aoa[r]||[];

    // Find date anywhere on row. Some reports merge/format date columns.
    let rowDate=null;
    for(const cell of row){
      const d=parseOperationalDate(cell);
      if(d){ rowDate=d; break; }
    }
    if(rowDate) lastDate=rowDate;

    // Only accept transaction row when tonnage column contains positive numeric value.
    const ton=parseExcelNumber(row[tonInfo.col]);
    if(!(ton>0) || !lastDate) continue;

    // Ignore obvious total/subtotal lines.
    const joined=row.map(x=>String(x??"")).join(" ").toUpperCase();
    if(/\bTOTAL\b|\bJUMLAH\b/.test(joined) && !/NO\.?\s*BUKTI/.test(joined)) continue;

    const key=`${lastDate}|${kp}|${supplier}`;
    const prev=dailyMap.get(key)||{
      report_date:lastDate,kp_code:kp,supplier_name:supplier,
      tonnage_kg:0,trip_count:0,source_file:fileName
    };
    prev.tonnage_kg+=ton;
    prev.trip_count+=1; // business rule: each transaction/trip = 1 mobil masuk
    dailyMap.set(key,prev);
  }

  return {daily:[...dailyMap.values()],recognized:true,kp,supplier};
}
function parseMonthlySimpleTable(sheet,sheetName,fileName){
  const rows=XLSX.utils.sheet_to_json(sheet,{defval:null,raw:false});
  const out=[];
  for(const r of rows){
    const kp=canonKP(pickField(r,["kp","kode kp","kantor pencairan","kantor","unit","kode unit"]));
    const supplier=String(pickField(r,["supplier","agen","jenis spb","spb","do"])||"ALL").trim()||"ALL";
    const date=parseOperationalDate(pickField(r,["tanggal","date","tgl","report date"]));
    const ton=parseExcelNumber(pickField(r,["tonase kg","tonnage kg","tonase","tonnage","berat kg","berat"]));
    const trip=parseExcelNumber(pickField(r,["trip","jumlah trip","mobil masuk","jumlah kendaraan","kendaraan"]));
    if(kp && date && ton>0){
      out.push({
        report_date:date,kp_code:kp,supplier_name:supplier,
        tonnage_kg:ton,trip_count:trip==null?1:Math.max(0,Math.round(trip)),
        source_file:fileName
      });
    }
  }
  return out;
}
function combineDailyRows(rows){
  const m=new Map();
  rows.forEach(r=>{
    const key=`${r.report_date}|${r.kp_code}|${r.supplier_name||"ALL"}`;
    const p=m.get(key)||{...r,tonnage_kg:0,trip_count:0};
    p.tonnage_kg+=Number(r.tonnage_kg||0);
    p.trip_count+=Number(r.trip_count||0);
    m.set(key,p);
  });
  return [...m.values()];
}
function parseMonthlyWorkbook(wb,fileName){
  let daily=[];
  let recognizedSheets=0;
  const notes=[];
  wb.SheetNames.forEach(name=>{
    const sheet=wb.Sheets[name];
    const report=parseMonthlyReportSheet(sheet,name,fileName);
    if(report.recognized && report.daily.length){
      daily.push(...report.daily);
      recognizedSheets++;
      notes.push(`${name}: ${report.kp} / ${report.supplier} / ${report.daily.length} hari`);
      return;
    }
    const simple=parseMonthlySimpleTable(sheet,name,fileName);
    if(simple.length){
      daily.push(...simple);
      recognizedSheets++;
      notes.push(`${name}: tabel sederhana / ${simple.length} baris`);
    }else{
      notes.push(`${name}: belum dikenali`);
    }
  });
  daily=combineDailyRows(daily);
  return {fileName,daily,recognizedSheets,notes};
}
async function previewMonthlyExcels(fileList){
  try{
    const files=[...(fileList||[])];
    if(!files.length) throw Error("Pilih minimal 1 file.");
    const previews=[];
    let allDaily=[];
    for(const file of files){
      const wb=await readWorkbookFile(file);
      const p=parseMonthlyWorkbook(wb,file.name);
      previews.push(p);
      allDaily.push(...p.daily);
    }
    allDaily=combineDailyRows(allDaily);
    MONTHLY_EXCEL_PREVIEW={
      files:files.map(f=>f.name),
      daily:allDaily,
      fileResults:previews
    };
    const kpSet=new Set(allDaily.map(r=>r.kp_code));
    const supplierSet=new Set(allDaily.map(r=>`${r.kp_code}/${r.supplier_name}`));
    const tripTotal=allDaily.reduce((a,r)=>a+Number(r.trip_count||0),0);
    const tonTotal=allDaily.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
    $("monthlyExcelPreview").textContent=
      `FILE DIPILIH: ${files.length}\n`+
      `File terbaca: ${previews.filter(p=>p.daily.length).length}/${files.length}\n`+
      `KP terdeteksi: ${kpSet.size}\n`+
      `Supplier terdeteksi: ${supplierSet.size}\n`+
      `Baris harian supplier: ${allDaily.length}\n`+
      `Total trip: ${tripTotal.toLocaleString("id-ID")}\n`+
      `Total tonase: ${kg(tonTotal)}\n\n`+
      previews.map(p=>`• ${p.fileName}\n  ${p.notes.join("\n  ")}`).join("\n\n");
  }catch(e){
    MONTHLY_EXCEL_PREVIEW=null;
    $("monthlyExcelPreview").textContent="ERROR: "+e.message;
  }
}
async function rebuildMonthlySummaries(dailyRows){
  const affected=new Map();
  dailyRows.forEach(r=>{
    const [y,m]=r.report_date.split("-").map(Number);
    affected.set(`${y}|${m}|${r.kp_code}`,{year:y,month:m,kp_code:r.kp_code});
  });

  for(const a of affected.values()){
    const start=`${a.year}-${String(a.month).padStart(2,"0")}-01`;
    const nextMonth=a.month===12?`${a.year+1}-01-01`:`${a.year}-${String(a.month+1).padStart(2,"0")}-01`;
    const {data,error}=await db.from("kp_daily_history")
      .select("tonnage_kg")
      .eq("kp_code",a.kp_code)
      .gte("report_date",start)
      .lt("report_date",nextMonth);
    if(error) throw error;
    const total=(data||[]).reduce((s,r)=>s+Number(r.tonnage_kg||0),0);
    const src=[...new Set(dailyRows.filter(r=>{
      const [y,m]=r.report_date.split("-").map(Number);
      return y===a.year && m===a.month && r.kp_code===a.kp_code;
    }).map(r=>r.source_file).filter(Boolean))].join("; ");
    const {error:e2}=await db.from("historical_summary").upsert({
      year:a.year,month:a.month,kp_code:a.kp_code,tonnage_kg:total,source_file:src||"Excel Bulanan"
    },{onConflict:"year,month,kp_code"});
    if(e2) throw e2;
  }
}
async function saveMonthlyExcel(){
  if(!MONTHLY_EXCEL_PREVIEW) return alert("Pilih dan preview Excel bulanan dahulu.");
  const p=MONTHLY_EXCEL_PREVIEW;
  if(!p.daily.length) return alert("Tidak ada transaksi yang dapat disimpan.");

  // Chunk to keep Supabase requests stable for many files.
  const chunkSize=500;
  for(let i=0;i<p.daily.length;i+=chunkSize){
    const chunk=p.daily.slice(i,i+chunkSize);
    const {error}=await db.from("kp_daily_history")
      .upsert(chunk,{onConflict:"report_date,kp_code,supplier_name"});
    if(error) return alert("Gagal simpan detail bulanan: "+error.message);
  }

  try{
    await rebuildMonthlySummaries(p.daily);
  }catch(e){
    return alert("Detail tersimpan, tetapi summary gagal dihitung: "+e.message);
  }

  alert(`Upload bulanan berhasil.\nFile: ${p.files.length}\nBaris harian supplier: ${p.daily.length}`);
  MONTHLY_EXCEL_PREVIEW=null;
  if($("monthlyExcelFile")) $("monthlyExcelFile").value="";
  $("monthlyExcelPreview").textContent="Belum ada file bulanan dipilih.";
  await loadKPMonthlyPanel($("monitorKp").value || "ALL");
}

// ---------- ANNUAL ----------
function annualMonthColumns(aoa){
  const map={};
  for(let r=0;r<Math.min(12,aoa.length);r++){
    (aoa[r]||[]).forEach((v,c)=>{
      const key=normalizeHeaderKey(v);
      const m=MONTH_ID[key];
      if(m) map[m]=c;
    });
  }
  // Known operational annual workbook fallback: C:N = Jan:Dec
  if(Object.keys(map).length<6){
    for(let m=1;m<=12;m++) map[m]=m+1;
  }
  return map;
}
function parseAnnualSheet(sheet,sheetName,fileName){
  const aoa=sheetAOA(sheet);
  const yearMatch=String(sheetName).match(/\b(20\d{2})\b/);
  const titleText=aoa.slice(0,5).flat().join(" ");
  const titleYear=titleText.match(/\b(20\d{2})\b/);
  const year=Number(yearMatch?.[1]||titleYear?.[1]);
  if(!year) return [];

  const monthCols=annualMonthColumns(aoa);
  const out=[];
  for(let r=0;r<aoa.length;r++){
    const row=aoa[r]||[];
    let unit=String(row[1]??"").trim();
    if(!unit || /^(unit|nama unit|total|jumlah)$/i.test(unit)) continue;

    const kp=canonKP(unit);
    if(!kp || kp.length>30) continue;

    let numericMonths=0;
    for(let m=1;m<=12;m++){
      const c=monthCols[m];
      const val=parseExcelNumber(row[c]);
      if(val!=null && val>0){
        numericMonths++;
        out.push({year,month:m,kp_code:kp,tonnage_kg:val,source_file:fileName});
      }
    }
    // If no monthly numeric cells, row was not a unit row.
    if(!numericMonths){
      for(let i=out.length-1;i>=0 && out[i]?.kp_code===kp && out[i]?.year===year;i--) out.splice(i,1);
    }
  }
  return out;
}
function combineAnnualRows(rows){
  const m=new Map();
  rows.forEach(r=>{
    const key=`${r.year}|${r.month}|${r.kp_code}`;
    // Annual workbook should have one authoritative value per unit/month;
    // if duplicate across files, latest selected file wins rather than sum.
    m.set(key,r);
  });
  return [...m.values()];
}
function parseAnnualWorkbook(wb,fileName){
  let summary=[];
  const notes=[];
  wb.SheetNames.forEach(name=>{
    const rows=parseAnnualSheet(wb.Sheets[name],name,fileName);
    summary.push(...rows);
    notes.push(`${name}: ${rows.length} KP/bulan terbaca`);
  });
  return {fileName,summary:combineAnnualRows(summary),notes};
}
async function previewAnnualExcels(fileList){
  try{
    const files=[...(fileList||[])];
    if(!files.length) throw Error("Pilih minimal 1 file.");
    const all=[];
    const fileResults=[];
    for(const file of files){
      const wb=await readWorkbookFile(file);
      const p=parseAnnualWorkbook(wb,file.name);
      all.push(...p.summary);
      fileResults.push(p);
    }
    const summary=combineAnnualRows(all);
    ANNUAL_EXCEL_PREVIEW={files:files.map(f=>f.name),summary,fileResults};

    const years=[...new Set(summary.map(r=>r.year))].sort();
    const units=new Set(summary.map(r=>r.kp_code));
    $("annualExcelPreview").textContent=
      `FILE DIPILIH: ${files.length}\n`+
      `Tahun terbaca: ${years.join(", ")||"-"}\n`+
      `Unit/KP historis: ${units.size}\n`+
      `Baris KP/bulan: ${summary.length}\n\n`+
      fileResults.map(p=>`• ${p.fileName}\n  ${p.notes.join("\n  ")}`).join("\n\n");
  }catch(e){
    ANNUAL_EXCEL_PREVIEW=null;
    $("annualExcelPreview").textContent="ERROR: "+e.message;
  }
}
async function saveAnnualExcel(){
  if(!ANNUAL_EXCEL_PREVIEW) return alert("Pilih dan preview Excel tahunan dahulu.");
  const p=ANNUAL_EXCEL_PREVIEW;
  if(!p.summary.length) return alert("Tidak ada data tahunan yang dapat disimpan.");

  const chunkSize=500;
  for(let i=0;i<p.summary.length;i+=chunkSize){
    const {error}=await db.from("historical_summary")
      .upsert(p.summary.slice(i,i+chunkSize),{onConflict:"year,month,kp_code"});
    if(error) return alert("Gagal simpan data tahunan: "+error.message);
  }

  alert(`Upload tahunan berhasil.\nFile: ${p.files.length}\nBaris KP/bulan: ${p.summary.length}`);
  ANNUAL_EXCEL_PREVIEW=null;
  if($("annualExcelFile")) $("annualExcelFile").value="";
  $("annualExcelPreview").textContent="Belum ada file tahunan dipilih.";
  await initKPMonitoringFilters();
  await loadKPYearlyPanel($("monitorKp").value || "ALL");
}


function resetPlotContainer(id){
  const el=$(id);
  if(!el) return;
  try{ Plotly.purge(id); }catch(e){}
  el.innerHTML="";
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
  setSidebarMonitoringActive(mode);

  ["daily","monthly","yearly"].forEach(m=>{
    const panelId=m==="daily"?"monitorDailyPanel":m==="monthly"?"monitorMonthlyPanel":"monitorYearlyPanel";
    $(panelId)?.classList.toggle("active",m===mode);
  });

  $("monitorDateWrap").classList.toggle("hidden",mode!=="daily");
  $("monitorMonthWrap").classList.toggle("hidden",mode!=="monthly");
  $("monitorYearWrap").classList.toggle("hidden",mode!=="yearly");

  const titleMap={
    daily:["Monitoring • Harian","Snapshot operasional per KP pada 10.00, 12.00, 15.00, dan 17.00."],
    monthly:["Monitoring • Bulanan","Analisis tonase bulanan per KP dan upload Excel data bulanan."],
    yearly:["Monitoring • Tahunan","Analisis tonase tahunan per KP dan upload Excel data tahunan."]
  };
  if($("monitorPageTitle")) $("monitorPageTitle").textContent=titleMap[mode][0];
  if($("monitorPageSubtitle")) $("monitorPageSubtitle").textContent=titleMap[mode][1];

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
  if(MONITOR_MODE==="monthly") return loadKPMonthlyPanel(kp);
  return loadKPYearlyPanel(kp);
}

function setMonthlyPanelSummary({kp,period,tonnage,trips,coverage,tonnageSub,tripsSub,coverageSub}){
  $("monthlyKpiKp").textContent=kp==="ALL"?"Semua KP":kp;
  $("monthlyKpiPeriod").textContent=period;
  $("monthlyKpiTonnage").textContent=kg(tonnage);
  $("monthlyKpiTonnageSub").textContent=tonnageSub||"-";
  $("monthlyKpiTrips").textContent=trips==null?"—":Number(trips).toLocaleString("id-ID");
  $("monthlyKpiTripsSub").textContent=tripsSub||"-";
  $("monthlyKpiCoverage").textContent=coverage;
  $("monthlyKpiCoverageSub").textContent=coverageSub||"-";
}
function setYearlyPanelSummary({kp,period,tonnage,coverage,tonnageSub,coverageSub}){
  $("yearlyKpiKp").textContent=kp==="ALL"?"Semua KP":kp;
  $("yearlyKpiPeriod").textContent=period;
  $("yearlyKpiTonnage").textContent=kg(tonnage);
  $("yearlyKpiTonnageSub").textContent=tonnageSub||"-";
  $("yearlyKpiCoverage").textContent=coverage;
  $("yearlyKpiCoverageSub").textContent=coverageSub||"-";
}
async function loadKPMonthlyPanel(kp){
  const month=$("monitorMonth").value;
  if(!month) return;
  const {start,end}=yearMonthBounds(month);
  const [year,monthNum]=month.split("-").map(Number);

  let dq=db.from("kp_daily_history")
    .select("report_date,kp_code,supplier_name,tonnage_kg,trip_count")
    .gte("report_date",start).lte("report_date",end)
    .order("report_date",{ascending:true});
  if(kp!=="ALL") dq=dq.eq("kp_code",kp);

  const {data:daily,error:de}=await dq;
  if(de){
    resetPlotContainer("monthlyMonitorChart"); $("monthlyMonitorChart").innerHTML=`<div class="chart-empty-state">${de.message}</div>`;
    return;
  }

  if(daily?.length){
    const byDate={};
    daily.forEach(r=>{
      if(!byDate[r.report_date]) byDate[r.report_date]={tonnage:0,trips:0};
      byDate[r.report_date].tonnage+=Number(r.tonnage_kg||0);
      byDate[r.report_date].trips+=Number(r.trip_count||0);
    });
    const dates=Object.keys(byDate).sort();
    const vals=dates.map(d=>byDate[d].tonnage);
    const total=vals.reduce((a,b)=>a+b,0);
    const trips=dates.reduce((a,d)=>a+byDate[d].trips,0);
    const avg=dates.length?total/dates.length:0;

    setMonthlyPanelSummary({
      kp,period:monthLabelId(month),tonnage:total,trips,
      coverage:`${dates.length} hari`,
      tonnageSub:`Rata-rata ${kg(avg)} / hari data`,
      tripsSub:"Total trip Excel bulanan",
      coverageSub:"Hari dengan data"
    });

    resetPlotContainer("monthlyMonitorChart");
    Plotly.newPlot("monthlyMonitorChart",[{
      x:dates.map(d=>d.slice(8,10)),
      y:vals,type:"bar",
      text:vals.map(v=>compactKg(v)),
      textposition:"outside",
      cliponaxis:false,
      marker:{color:"#49de5f"},
      hovertemplate:"Tanggal %{x}<br>%{y:,.0f} kg<extra></extra>"
    }],{
      ...darkLayout,
      margin:{t:28,l:58,r:18,b:42},
      xaxis:{...darkLayout.xaxis,fixedrange:true},
      yaxis:{...darkLayout.yaxis,rangemode:"tozero",tickformat:"~s",fixedrange:true},
      showlegend:false
    },plotConfig);

    $("monthlyMonitorTable").innerHTML=table(
      ["Tanggal","Tonase","Trip"],
      dates.map(d=>[d,kg(byDate[d].tonnage),byDate[d].trips])
    );
    return;
  }

  let sq=db.from("historical_summary")
    .select("kp_code,tonnage_kg")
    .eq("year",year).eq("month",monthNum);
  if(kp!=="ALL") sq=sq.eq("kp_code",kp);
  const {data:summary}=await sq;
  const rows=summary||[];
  const total=rows.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);

  setMonthlyPanelSummary({
    kp,period:monthLabelId(month),tonnage:total,trips:null,
    coverage:`${rows.length} KP`,
    tonnageSub:rows.length?"Summary bulanan tersedia":"Belum ada data",
    tripsSub:"Upload Excel detail untuk trip",
    coverageSub:rows.length?"Data summary":"Belum ada data"
  });

  if(!rows.length){
    resetPlotContainer("monthlyMonitorChart");
    $("monthlyMonitorChart").innerHTML="<div class='chart-empty-state'>Belum ada data. Upload Excel Bulanan di panel ini.</div>";
    $("monthlyMonitorTable").innerHTML=table(["Keterangan"],[["Belum ada data bulanan"]]);
    return;
  }

  const pairs=rows.map(r=>[r.kp_code,Number(r.tonnage_kg||0)]).sort((a,b)=>b[1]-a[1]);
  resetPlotContainer("monthlyMonitorChart");
    Plotly.newPlot("monthlyMonitorChart",[{
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

  $("monthlyMonitorTable").innerHTML=table(
    ["KP","Tonase","Sumber"],
    pairs.map(([code,val])=>[code,kg(val),"Summary Bulanan"])
  );
}
async function loadKPYearlyPanel(kp){
  const year=Number($("monitorYear").value);
  let q=db.from("historical_summary")
    .select("month,kp_code,tonnage_kg")
    .eq("year",year);
  if(kp!=="ALL") q=q.eq("kp_code",kp);

  const {data,error}=await q;
  if(error){
    resetPlotContainer("yearlyMonitorChart"); $("yearlyMonitorChart").innerHTML=`<div class="chart-empty-state">${error.message}</div>`;
    return;
  }

  const rows=data||[];
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
  setYearlyPanelSummary({
    kp,period:String(year),tonnage:total,
    coverage:`${monthsPresent.size} bulan`,
    tonnageSub:monthsPresent.size?`Rata-rata ${kg(avg)} / bulan`:"Belum ada histori",
    coverageSub:"Bulan dengan data"
  });

  const labels=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];

  if(!rows.length){
    resetPlotContainer("yearlyMonitorChart");
    $("yearlyMonitorChart").innerHTML="<div class='chart-empty-state'>Belum ada histori. Upload Excel Tahunan di panel ini.</div>";
    $("yearlyMonitorTable").innerHTML=table(["Keterangan"],[["Belum ada data tahunan"]]);
    return;
  }

  resetPlotContainer("yearlyMonitorChart");
  Plotly.newPlot("yearlyMonitorChart",[{
    x:labels,y:monthly,type:"bar",
    text:monthly.map((v,i)=>monthsPresent.has(i+1)&&v>0?compactKg(v):""),
    textposition:"outside",
    cliponaxis:false,
    marker:{color:monthly.map((v,i)=>monthsPresent.has(i+1)?"#49de5f":"rgba(255,255,255,.08)")},
    hovertemplate:"<b>%{x}</b><br>%{y:,.0f} kg<extra></extra>"
  }],{
    ...darkLayout,
    margin:{t:28,l:58,r:18,b:42},
    xaxis:{...darkLayout.xaxis,fixedrange:true},
    yaxis:{...darkLayout.yaxis,rangemode:"tozero",tickformat:"~s",fixedrange:true},
    showlegend:false
  },plotConfig);

  $("yearlyMonitorTable").innerHTML=table(
    ["Bulan","Tonase","Status"],
    labels.map((label,i)=>[
      label,kg(monthly[i]),monthsPresent.has(i+1)?"Tersedia":"Belum ada data"
    ])
  );
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

  resetPlotContainer("monitorKpChart");
  Plotly.newPlot("monitorKpChart",[{
    x:slots,y:ys.map(v=>v??0),type:"bar",
    text:ys.map(v=>v==null?"Menunggu":compactKg(v)),
    textposition:"outside",
    cliponaxis:false,
    marker:{color:ys.map(v=>v==null?"rgba(255,255,255,.10)":"#49de5f")},
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
  const month=$("monitorMonth").value;
  const {start,end}=yearMonthBounds(month);
  const [year,monthNum]=month.split("-").map(Number);

  $("monitorChartTitle").textContent=kp==="ALL"
    ? "TONASE HARIAN BULAN TERPILIH"
    : `TONASE HARIAN ${kp} - BULAN TERPILIH`;
  $("monitorTableTitle").textContent="REKAP HARIAN BULANAN";
  $("monitorSourceBadge").textContent="Excel Bulanan";
  $("monitorRuleNote").textContent="Sumber utama: kp_daily_history; fallback ke summary bulanan";

  let dq=db.from("kp_daily_history")
    .select("report_date,kp_code,supplier_name,tonnage_kg,trip_count")
    .gte("report_date",start).lte("report_date",end)
    .order("report_date",{ascending:true});
  if(kp!=="ALL") dq=dq.eq("kp_code",kp);
  const {data:daily,error:dailyErr}=await dq;
  if(dailyErr){renderMonitorEmpty(dailyErr.message);return;}

  if(daily?.length){
    const byDate={};
    daily.forEach(r=>{
      if(!byDate[r.report_date]) byDate[r.report_date]={tonnage:0,trips:0};
      byDate[r.report_date].tonnage+=Number(r.tonnage_kg||0);
      byDate[r.report_date].trips+=Number(r.trip_count||0);
    });
    const dates=Object.keys(byDate).sort();
    const vals=dates.map(d=>byDate[d].tonnage);
    const total=vals.reduce((a,b)=>a+b,0);
    const trips=dates.reduce((a,d)=>a+byDate[d].trips,0);
    const avg=dates.length?total/dates.length:0;

    setMonitorSummary({
      kp,period:monthLabelId(month),tonnage:total,trips,
      coverage:`${dates.length} hari`,
      tonnageSub:`Rata-rata ${kg(avg)} / hari data`,
      tripsSub:"Total trip dari Excel bulanan",
      coverageSub:"Hari dengan data"
    });

    resetPlotContainer("monitorKpChart");
  Plotly.newPlot("monitorKpChart",[{
      x:dates.map(d=>d.slice(8,10)),
      y:vals,type:"bar",
      text:vals.map(v=>compactKg(v)),
      textposition:"outside",
      cliponaxis:false,
      marker:{color:"#49de5f"},
      hovertemplate:"Tanggal %{x}<br>%{y:,.0f} kg<extra></extra>"
    }],{
      ...darkLayout,
      margin:{t:28,l:58,r:18,b:42},
      xaxis:{...darkLayout.xaxis,title:{text:"Tanggal",font:{size:9,color:"#b8aea1"}},fixedrange:true},
      yaxis:{...darkLayout.yaxis,rangemode:"tozero",tickformat:"~s",fixedrange:true},
      showlegend:false
    },plotConfig);

    $("monitorKpTable").innerHTML=table(
      ["Tanggal","Tonase","Trip","Sumber"],
      dates.map(d=>[d,kg(byDate[d].tonnage),byDate[d].trips,"Excel Bulanan"])
    );
    return;
  }

  // Fallback: monthly summary only
  let sq=db.from("historical_summary")
    .select("kp_code,tonnage_kg")
    .eq("year",year).eq("month",monthNum);
  if(kp!=="ALL") sq=sq.eq("kp_code",kp);
  const {data:summary,error}=await sq;
  if(error){renderMonitorEmpty(error.message);return;}
  const rows=summary||[];

  if(!rows.length){
    setMonitorSummary({
      kp,period:monthLabelId(month),tonnage:0,trips:null,
      coverage:"0 hari",
      tonnageSub:"Belum ada data bulanan",
      tripsSub:"Upload Excel bulanan untuk detail trip",
      coverageSub:"Belum ada data"
    });
    renderMonitorEmpty("Belum ada data bulanan. Gunakan tombol Upload Excel Bulanan di atas.");
    return;
  }

  const total=rows.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
  setMonitorSummary({
    kp,period:monthLabelId(month),tonnage:total,trips:null,
    coverage:`${rows.length} KP`,
    tonnageSub:"Summary bulanan tersedia",
    tripsSub:"Trip tidak tersedia di summary",
    coverageSub:"Upload Excel detail untuk grafik harian"
  });

  const pairs=rows.map(r=>[r.kp_code,Number(r.tonnage_kg||0)]).sort((a,b)=>b[1]-a[1]);
  resetPlotContainer("monitorKpChart");
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
    ["KP","Tonase","Trip","Sumber"],
    pairs.map(([code,val])=>[code,kg(val),"—","Summary Bulanan"])
  );
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

  resetPlotContainer("monitorKpChart");
  Plotly.newPlot("monitorKpChart",[{
    x:labels,y:monthly,type:"bar",
    text:monthly.map((v,i)=>monthsPresent.has(i+1)&&v>0?compactKg(v):""),
    textposition:"outside",
    cliponaxis:false,
    marker:{color:monthly.map((v,i)=>monthsPresent.has(i+1)?"#49de5f":"rgba(255,255,255,.08)")},
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
