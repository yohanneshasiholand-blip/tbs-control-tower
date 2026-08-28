
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
let DAILY_EXCEL_PREVIEW = null, MONTHLY_EXCEL_PREVIEW = null, ANNUAL_EXCEL_PREVIEW = null;
let MONITOR_MODE = "daily";
let EXPENSE_MONITOR_DATA = [];
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
  const ids={
    daily:"sideDaily",
    monthly:"sideMonthly",
    yearly:"sideYearly",
    analysis:"sideAnalysis"
  };
  Object.entries(ids).forEach(([m,id])=>{
    $(id)?.classList.toggle("active",m===mode);
  });
  $("monitoringGroup")?.classList.add("open");
}
function ensureProductionAnalysisRange(){
  const today=localTodayISO();
  if($("monitorRangeStart") && !$("monitorRangeStart").value){
    $("monitorRangeStart").value=`${today.slice(0,7)}-01`;
  }
  if($("monitorRangeEnd") && !$("monitorRangeEnd").value){
    $("monitorRangeEnd").value=today;
  }
}

async function openMonitoringSub(mode){
  MONITOR_MODE=mode;
  setSidebarMonitoringActive(mode);
  if(mode==="analysis") ensureProductionAnalysisRange();
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

async function openExpenseMonitoring(){
  closeSidebarGroups("expenseGroup");
  $("expenseGroup")?.classList.add("open");
  await goToPage("expense-monitor");
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
  if(page==="expense-monitor"){
    $("expenseGroup")?.classList.add("open");
    initExpenseMonitoring();
    loadExpenseMonitoring();
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
  const source=String(text||"")
    .replace(/\u00a0/g," ")
    .replace(/[＊*]/g,"")
    .replace(/\s+/g," ");

  let date=null;
  let d=source.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(d){
    date=isoDate(+d[1],+d[2],+d[3]);
  }else{
    d=source.match(/(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})/i);
    if(d) date=isoDate(+d[1],monthMap[d[2].toLowerCase()],+d[3]);
  }

  let time=null;

  // Primary: "Pukul 17.00 WIB", "Pukul 17:00", "Jam 17.00", including markdown stars.
  let t=source.match(/(?:Pukul|Jam)\s*(00|0|10|12|15|17)\s*(?:[.:]\s*00)?\s*(?:WIB)?/i);

  // Fallback: standalone canonical snapshot clock.
  if(!t){
    t=source.match(/(?:^|\s)(00|0|10|12|15|17)\s*[.:]\s*00\s*(?:WIB)?(?:\s|$)/i);
  }

  if(t){ const hh=String(Number(t[1])).padStart(2,"0"); time=`${hh}:00:00`; }

  return (date||time) ? {date,time} : null;
}

function selectedTonnageFallback(){
  const date=$("tonnageInputDate")?.value || $("monitorDate")?.value || null;
  const time=$("tonnageSnapshotTime")?.value || null;
  return {date,time};
}

function resolveTonnageHeader(text){
  const parsed=parseHeader(text)||{};
  const fallback=selectedTonnageFallback();

  const date=parsed.date || fallback.date;
  const time=parsed.time || fallback.time;
  const dateMismatch=!!(parsed.date && $("tonnageInputDate")?.value && parsed.date!==$("tonnageInputDate").value);
  const timeMismatch=!!(parsed.time && fallback.time && parsed.time!==fallback.time);

  if(!date){
    throw Error("Tanggal data harian tidak ditemukan. Sertakan tanggal di laporan atau pilih Tanggal Data.");
  }
  if(!time){
    throw Error("Jam data tidak ditemukan. Pilih 00.00 / 10.00 / 12.00 / 15.00 / 17.00.");
  }

  return {
    date,
    time,
    dateSource:parsed.date?"header WhatsApp":"pilihan tanggal",
    timeSource:parsed.time?"header WhatsApp":"pilihan jam",
    dateMismatch,
    timeMismatch,
    manualDate:$("tonnageInputDate")?.value||null,
    manualTime:fallback.time||null
  };
}
function cleanTonnageLine(raw){
  return String(raw||"")
    .replace(/\u00a0/g," ")
    .replace(/[＊*_`~]/g,"")   // strip WhatsApp markdown
    .replace(/\s+/g," ")
    .trim();
}

function normalizeClosingKpAlias(raw){
  let s=String(raw||"")
    .toUpperCase()
    .replace(/\u00a0/g," ")
    .replace(/[＊*_`~]/g,"")
    .replace(/\s+/g," ")
    .trim();

  // Operational aliases found in WhatsApp closing reports.
  if(/^LSP\b/.test(s)) return "LSHP";
  if(/^MSB(?:\s*[-]?\s*2)?\b/.test(s)) return "MSB-2";

  // Known headings may include a location after the KP code.
  const patterns=[
    [/^TKWL\s*[- ]?\s*2\b/,"TKWL-2"],
    [/^TKWL\s*[- ]?\s*1\b/,"TKWL-1"],
    [/^ASMJ\s*[- ]?\s*2\b/,"ASMJ-2"],
    [/^ASMJ\s*[- ]?\s*1\b/,"ASMJ-1"],
    [/^KS\s*[- ]?\s*2\b/,"KS2"],
    [/^GSL\s*[- ]?\s*INUMAN\b/,"GSL-INUMAN"],
  ];
  for(const [rx,kp] of patterns){
    if(rx.test(s)) return kp;
  }

  const known=[
    "BMK","FAA","KIP","HKBS","SISL","GSS","SSL","MAN","SSM",
    "GSL","SKA","LBP","LPI","LSHP","PSM","BSN","BSS","KWP"
  ];
  const token=s.split(/\s+/)[0].replace(/[.:,;]+$/,"");
  if(known.includes(token)) return canonKP(token);

  return null;
}

function closingKpFromHeading(raw){
  const line=cleanTonnageLine(raw);
  if(!line || /:/.test(line)) return null;

  // "Berikut tonase di KP. BMK"
  let m=line.match(/\b(?:tonase\s+(?:di\s+)?)KP\s*[.:\-]?\s*(.+)$/i);
  if(m) return normalizeClosingKpAlias(m[1]);

  // "KP. BMK", "KP HKBS", "KP.ASMJ 2", "KP. TKWL 2 Kandis"
  m=line.match(/^KP\s*[.:\-]?\s*(.+)$/i);
  if(m) return normalizeClosingKpAlias(m[1]);

  // Bare operational code such as "KS2" or legacy typo "LSP".
  if(/^(?:KS\s*[- ]?\s*2|LSP|LSHP|MSB(?:\s*[- ]?\s*2)?)$/i.test(line)){
    return normalizeClosingKpAlias(line);
  }

  return null;
}

function detectClosingKpReport(text){
  for(const raw of String(text||"").split(/\r?\n/)){
    const kp=closingKpFromHeading(raw);
    if(kp) return kp;
  }
  return null;
}

function isClosingKpTonnageReport(text){
  const hasKp=!!detectClosingKpReport(text);
  if(!hasKp) return false;

  const parsed=parseHeader(text)||{};
  const selected=$("tonnageSnapshotTime")?.value || null;
  const effectiveTime=parsed.time || selected || null;

  // Explicit intraday time always means snapshot, even when the report has KP headings.
  if(["10:00:00","12:00:00","15:00:00","17:00:00"].includes(effectiveTime)){
    return false;
  }

  // 00.00 is the final daily closing / total day.
  if(effectiveTime==="00:00:00"){
    return true;
  }

  // Legacy KP closing reports often have no clock at all.
  return true;
}


function monthlyCumulativeKpFromText(text){
  const source=String(text||"")
    .replace(/\u00a0/g," ")
    .replace(/[＊*_`~]/g,"")
    .replace(/\s+/g," ")
    .trim();

  // Examples:
  // "Tonase KP. MSB s/d 26 Agustus 2026"
  // "Tonase ASMJ 2 s/d 26 Agustus 2026"
  const m=source.match(/\bTonase\s+(?:KP\s*[.:\-]?\s*)?(.+?)\s+s\s*\/?\s*d\s+\d{1,2}\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4}\b/i);
  if(!m) return null;
  return normalizeClosingKpAlias(m[1]) || canonKP(m[1]);
}

function isMonthlyCumulativeReport(text){
  const source=String(text||"")
    .replace(/\u00a0/g," ")
    .replace(/[＊*_`~]/g,"");
  return /\bTonase\b[\s\S]*\bs\s*\/?\s*d\b/i.test(source) &&
         !!monthlyCumulativeKpFromText(source) &&
         !!parseHeader(source)?.date;
}

function parseMonthlyCumulativeWhatsApp(text){
  const parsed=parseHeader(text)||{};
  const kp=monthlyCumulativeKpFromText(text);
  const manualDate=$("tonnageInputDate")?.value || null;
  const reportDate=parsed.date || manualDate || null;

  if(!kp) throw Error("KP pada laporan tonase s/d tanggal tidak ditemukan.");
  if(!reportDate) throw Error("Tanggal akhir laporan tonase s/d tanggal tidak ditemukan.");

  const periodStart=`${reportDate.slice(0,7)}-01`;
  const dateMismatch=!!(parsed.date && manualDate && parsed.date!==manualDate);

  const rows=[];
  let declared=null;

  for(const raw of String(text||"").split(/\r?\n/)){
    const line=cleanTonnageLine(raw);
    if(!line) continue;

    // Ignore heading / greeting.
    if(/\bTonase\b/i.test(line) && /\bs\s*\/?\s*d\b/i.test(line)) continue;
    if(/^(?:Selamat|Berikut)\b/i.test(line)) continue;

    const colon=line.indexOf(":");
    if(colon<0) continue;

    const label=line.slice(0,colon).trim();
    const valueText=line.slice(colon+1).trim();
    const parsedValue=parseClosingValuePart(valueText);

    if(/^TOTAL\b/i.test(label)){
      declared=parsedValue.amount;
      continue;
    }

    if(!label) continue;
    const supplier=canonSupplierForKP(kp,label) || label;
    rows.push({
      kp_code:kp,
      supplier_name:supplier,
      tonnage_kg:Number(parsedValue.amount||0)
    });
  }

  if(!rows.length) throw Error("Supplier/tonase cumulative tidak terbaca.");

  // Last explicit supplier line wins.
  const map=new Map();
  rows.forEach(r=>{
    const key=String(r.supplier_name||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    map.set(key,r);
  });
  const finalRows=[...map.values()];
  const total=finalRows.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);

  return {
    mode:"mtd_audit",
    kp,
    date:reportDate,
    report_date:reportDate,
    period_start:periodStart,
    rows:finalRows,
    total,
    declared,
    validTotal:declared==null || declared===total,
    dateMismatch,
    timeMismatch:false,
    dateSource:parsed.date?"header WhatsApp":"pilihan tanggal"
  };
}

async function compareMonthlyCumulativeToSystem(p){
  let q=db.from("kp_daily_history")
    .select("report_date,kp_code,supplier_name,tonnage_kg,trip_count,source_file")
    .gte("report_date",p.period_start)
    .lte("report_date",p.report_date)
    .eq("kp_code",p.kp);

  const {data,error}=await q;
  if(error) throw Error("Gagal menghitung MTD sistem: "+error.message);

  const canonical=summarizeClosingHistory(data||[]).selected;
  const systemBySupplier={};
  canonical.forEach(r=>{
    const supplier=canonSupplierForKP(p.kp,r.supplier_name) || r.supplier_name || "ALL";
    const key=String(supplier).toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(!systemBySupplier[key]){
      systemBySupplier[key]={supplier_name:supplier,tonnage_kg:0,trips:0};
    }
    systemBySupplier[key].tonnage_kg+=Number(r.tonnage_kg||0);
    systemBySupplier[key].trips+=Number(r.trip_count||0);
  });

  const waBySupplier={};
  p.rows.forEach(r=>{
    const key=String(r.supplier_name||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    waBySupplier[key]=r;
  });

  const keys=[...new Set([...Object.keys(systemBySupplier),...Object.keys(waBySupplier)])];
  const supplierCompare=keys.map(key=>{
    const sys=systemBySupplier[key]||{supplier_name:waBySupplier[key]?.supplier_name||key,tonnage_kg:0,trips:0};
    const wa=waBySupplier[key]||{supplier_name:sys.supplier_name,tonnage_kg:0};
    const diff=Number(wa.tonnage_kg||0)-Number(sys.tonnage_kg||0);
    return {
      supplier_name:wa.supplier_name||sys.supplier_name,
      whatsapp_kg:Number(wa.tonnage_kg||0),
      system_kg:Number(sys.tonnage_kg||0),
      trips:Number(sys.trips||0),
      diff_kg:diff,
      match:diff===0
    };
  });

  const systemTotal=canonical.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
  const systemTrips=canonical.reduce((a,r)=>a+Number(r.trip_count||0),0);
  const whatsappTotal=p.declared==null ? p.total : p.declared;
  const diff=Number(whatsappTotal||0)-systemTotal;
  const days=[...new Set(canonical.map(r=>r.report_date))].length;

  return {
    systemTotal,
    systemTrips,
    whatsappTotal:Number(whatsappTotal||0),
    diff,
    match:diff===0,
    days,
    supplierCompare,
    sourceLabel:closingSourceLabelForRows(canonical)
  };
}

async function getSystemMtdForDate(kp,date){
  if(!date) return {total:0,trips:0,days:0,rows:[],sourceLabel:"-"};
  const start=`${date.slice(0,7)}-01`;

  let q=db.from("kp_daily_history")
    .select("report_date,kp_code,supplier_name,tonnage_kg,trip_count,source_file")
    .gte("report_date",start)
    .lte("report_date",date);
  if(kp!=="ALL") q=q.eq("kp_code",kp);

  const {data,error}=await q;
  if(error) throw Error("Gagal menghitung MTD: "+error.message);

  const rows=summarizeClosingHistory(data||[]).selected;
  return {
    total:rows.reduce((a,r)=>a+Number(r.tonnage_kg||0),0),
    trips:rows.reduce((a,r)=>a+Number(r.trip_count||0),0),
    days:new Set(rows.map(r=>r.report_date)).size,
    rows,
    sourceLabel:rows.length?closingSourceLabelForRows(rows):"Belum ada Closing"
  };
}

async function getLatestStoredMtdAudit(kp,date){
  if(!date || kp==="ALL") return null;
  const monthStart=`${date.slice(0,7)}-01`;

  const {data,error}=await db.from("monthly_cumulative_snapshots")
    .select("period_start,report_date,kp_code,supplier_name,tonnage_kg,declared_total_kg,created_at")
    .eq("kp_code",kp)
    .gte("report_date",monthStart)
    .lte("report_date",date)
    .order("report_date",{ascending:false})
    .order("created_at",{ascending:false})
    .limit(100);

  if(error) throw Error("Gagal membaca audit MTD WhatsApp: "+error.message);
  if(!data?.length) return null;

  const latestDate=data[0].report_date;
  const rows=data.filter(r=>r.report_date===latestDate);
  const total=rows[0]?.declared_total_kg!=null
    ? Number(rows[0].declared_total_kg)
    : rows.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);

  return {report_date:latestDate,total,rows};
}

async function loadDailyMtdKpis(kp,date){
  if(!$("dailyMtdSystem")) return;

  try{
    const system=await getSystemMtdForDate(kp,date);
    $("dailyMtdSystem").textContent=kg(system.total);
    $("dailyMtdSystemSub").textContent=
      `${date?.slice(0,7)} • ${system.days} hari data • ${kp==="ALL"?"Semua KP":kp}`;

    if(kp==="ALL"){
      $("dailyMtdWa").textContent="—";
      $("dailyMtdWaSub").textContent="Pilih 1 KP untuk membandingkan laporan WA s/d tanggal";
      return;
    }

    const wa=await getLatestStoredMtdAudit(kp,date);
    if(!wa){
      $("dailyMtdWa").textContent="Belum ada";
      $("dailyMtdWaSub").textContent="Paste laporan 'Tonase KP ... s/d tanggal' untuk audit";
      return;
    }

    const sysAtWa=await getSystemMtdForDate(kp,wa.report_date);
    const diff=Number(wa.total||0)-Number(sysAtWa.total||0);
    $("dailyMtdWa").textContent=kg(wa.total);
    $("dailyMtdWaSub").textContent=
      `${wa.report_date} • ${diff===0?"COCOK ✓":`SELISIH ${diff>=0?"+":""}${kg(diff)}`}`;
  }catch(e){
    console.error(e);
    $("dailyMtdSystem").textContent="—";
    $("dailyMtdSystemSub").textContent="Gagal menghitung MTD";
    $("dailyMtdWa").textContent="—";
    $("dailyMtdWaSub").textContent=e.message;
  }
}

function parseClosingValuePart(valueText){
  const s=String(valueText||"")
    .replace(/\u00a0/g," ")
    .replace(/[＊*_`~]/g,"")
    .replace(/\s+/g," ")
    .trim();

  let trips=null;
  const tripMatch=s.match(/\(\s*(\d+|-)\s*\)/);
  if(tripMatch){
    trips=tripMatch[1]==="-" ? 0 : Number(tripMatch[1]);
  }

  // Remove trip parentheses before searching for tonnage so trip numbers
  // can never be mistaken for kg.
  const amountPart=s.replace(/\(\s*(?:\d+|-)\s*\)/g," ");
  let amount=0;

  if(!/^\s*-/.test(amountPart)){
    const amountMatch=amountPart.match(/(\d{1,3}(?:[.,]\d{3})+|\d+)/);
    if(amountMatch) amount=num(amountMatch[1]);
  }

  return {amount,trips};
}

function parseClosingBatchTonnage(text){
  const parsedHeader=parseHeader(text)||{};
  const fallback=selectedTonnageFallback();
  const reportDate=parsedHeader.date || fallback.date || null;
  const reportTime=parsedHeader.time || fallback.time || "00:00:00";
  const dateMismatch=!!(parsedHeader.date && $("tonnageInputDate")?.value && parsedHeader.date!==$("tonnageInputDate").value);
  const timeMismatch=!!(parsedHeader.time && fallback.time && parsedHeader.time!==fallback.time);

  if(!reportDate) throw Error("Tanggal closing harian tidak ditemukan.");
  if(reportTime!=="00:00:00"){
    throw Error("Closing harian harus menggunakan Jam 00.00. Untuk 10/12/15/17 gunakan mode Snapshot.");
  }

  const blocks=[];
  let grandDeclared=null;
  let grandDeclaredTrips=null;
  let current=null;

  for(const raw of String(text||"").split(/\r?\n/)){
    const line=cleanTonnageLine(raw);
    if(!line) continue;

    const headingKp=closingKpFromHeading(line);
    if(headingKp){
      current={
        kp:headingKp,
        rows:[],
        declared:null,
        declaredTrips:null,
        warnings:[]
      };
      blocks.push(current);
      continue;
    }

    // Grand total for the whole day, e.g. TOTAL SELURUH : 4.222.298 (420)
    if(/^TOTAL\s+SELURUH\b/i.test(line)){
      const colon=line.indexOf(":");
      if(colon>=0){
        const parsedGrand=parseClosingValuePart(line.slice(colon+1));
        grandDeclared=parsedGrand.amount;
        grandDeclaredTrips=parsedGrand.trips;
      }
      continue;
    }

    if(!current) continue;

    // Ignore date/greeting lines between blocks.
    if(/\b(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\b/i.test(line)
       && /\b20\d{2}\b/.test(line)) continue;
    if(/^(?:Selamat|Berikut)\b/i.test(line)) continue;

    const colon=line.indexOf(":");
    if(colon<0) continue;

    const label=line.slice(0,colon).trim();
    const valueText=line.slice(colon+1).trim();
    const parsed=parseClosingValuePart(valueText);

    if(/^TOTAL\b/i.test(label)){
      current.declared=parsed.amount;
      current.declaredTrips=parsed.trips; // null means TOTAL did not state trip count.
      continue;
    }

    const supplierRaw=label.trim();
    if(!supplierRaw) continue;

    const supplier=canonSupplierForKP(current.kp,supplierRaw) || supplierRaw;
    current.rows.push({
      kp_code:current.kp,
      supplier_name:supplier,
      tonnage_kg:parsed.amount,
      trip_count:parsed.trips==null ? 0 : parsed.trips
    });
  }

  if(!blocks.length) throw Error("KP closing harian tidak ditemukan.");

  // Consolidate if the same KP appears more than once in one paste.
  const blockMap=new Map();
  for(const b of blocks){
    if(!blockMap.has(b.kp)){
      blockMap.set(b.kp,b);
    }else{
      const x=blockMap.get(b.kp);
      x.rows.push(...b.rows);
      if(b.declared!=null) x.declared=b.declared;
      if(b.declaredTrips!=null) x.declaredTrips=b.declaredTrips;
      x.warnings.push(...b.warnings);
    }
  }

  const finalBlocks=[...blockMap.values()].map(b=>{
    const rowMap=new Map();
    b.rows.forEach(r=>{
      // Last explicit line wins within the KP closing report.
      rowMap.set(
        `${r.kp_code}|${String(r.supplier_name).toUpperCase().replace(/[^A-Z0-9]/g,"")}`,
        r
      );
    });
    b.rows=[...rowMap.values()];

    b.total=b.rows.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
    b.trips=b.rows.reduce((a,r)=>a+Number(r.trip_count||0),0);
    b.validTotal=b.declared==null || b.total===b.declared;

    // Only validate TOTAL trip if the WhatsApp TOTAL explicitly included one.
    b.validTrips=b.declaredTrips==null || b.trips===b.declaredTrips;
    return b;
  });

  const invalid=finalBlocks.filter(b=>!b.validTotal || !b.validTrips);
  const rows=finalBlocks.flatMap(b=>b.rows);
  const total=finalBlocks.reduce((a,b)=>a+b.total,0);
  const trips=finalBlocks.reduce((a,b)=>a+b.trips,0);
  const validGrandTotal=grandDeclared==null || grandDeclared===total;
  const validGrandTrips=grandDeclaredTrips==null || grandDeclaredTrips===trips;

  const presentKps=[...new Set(finalBlocks.map(b=>b.kp))];
  const missingKps=FALLBACK_KP_CODES.filter(k=>!presentKps.includes(k));

  return {
    mode:finalBlocks.length>1 ? "closing_batch" : "closing_kp",
    date:reportDate,
    time:"00:00:00",
    kp:finalBlocks.length===1 ? finalBlocks[0].kp : "ALL",
    blocks:finalBlocks,
    rows,
    total,
    trips,
    grandDeclared,
    grandDeclaredTrips,
    validGrandTotal,
    validGrandTrips,
    invalid,
    validTotal:invalid.length===0 && validGrandTotal,
    validTrips:invalid.length===0 && validGrandTrips,
    presentKps,
    missingKps,
    dateMismatch,
    timeMismatch,
    dateSource:parsedHeader.date?"header WhatsApp":"pilihan tanggal",
    timeSource:parsedHeader.time?"header WhatsApp":"pilihan jam / closing otomatis"
  };
}

function parseClosingKpTonnage(text){
  return parseClosingBatchTonnage(text);
}

function parseTonnage(text){
  const h=resolveTonnageHeader(text);
  let kp=null, rows=[], declared=null;

  for(const raw of String(text||"").split(/\r?\n/)){
    const line=cleanTonnageLine(raw);
    if(!line) continue;

    // KP header. Strip trailing colon/punctuation before canonicalization.
    if(/^KP[.\s:]/i.test(line)){
      kp=canonKP(line.replace(/[:]+$/,"").trim());
      continue;
    }

    // IMPORTANT: detect TOTAL SELURUH before generic supplier parsing.
    // Works for:
    // TOTAL SELURUH : 1.582.407
    // *TOTAL SELURUH : 1.582.407*
    // TOTAL SELURUH: Rp? (numeric only accepted)
    const ts=line.match(/^TOTAL\s+SELURUH\s*:\s*([\d.,]+)/i);
    if(ts){
      declared=num(ts[1]);
      continue;
    }

    // KP subtotal is never a supplier/detail row.
    if(/^TOTAL\s*:/i.test(line)) continue;

    // Supplier row, e.g. "Surya : 95.481 (8)"
    const r=line.match(/^([^:]+)\s*:\s*([\d.,]+|-)\s*(?:\((\d+)\))?/);
    if(kp && r){
      const supplier=r[1].trim();

      // Defensive block: never let any TOTAL-like label enter details.
      if(/^TOTAL\b/i.test(supplier)) continue;

      rows.push({
        kp_code:kp,
        supplier_name:supplier,
        tonnage_kg:r[2]==="-" ? 0 : num(r[2]),
        trip_count:+(r[3]||0)
      });
    }
  }

  // Deduplicate exact KP+supplier within one pasted snapshot by summing only
  // if duplicates are truly repeated supplier lines. TOTAL rows are excluded above.
  const agg=new Map();
  rows.forEach(r=>{
    const key=`${r.kp_code}|${String(r.supplier_name).toUpperCase()}`;
    if(!agg.has(key)){
      agg.set(key,{...r});
    }else{
      const x=agg.get(key);
      x.tonnage_kg+=Number(r.tonnage_kg||0);
      x.trip_count+=Number(r.trip_count||0);
    }
  });
  rows=[...agg.values()];

  const total=rows.reduce((a,b)=>a+Number(b.tonnage_kg||0),0);
  const trips=rows.reduce((a,b)=>a+Number(b.trip_count||0),0);

  return {
    ...h,
    rows,
    total,
    trips,
    declared,
    validTotal:declared==null || declared===total
  };
}
function setTonnageInputMode(mode){
  const isMtd=mode==="mtd_audit";
  const isClosing=mode==="closing_kp" || mode==="closing_batch";
  const isBatch=mode==="closing_batch";
  const badge=$("tonnageModeBadge");
  const saveBtn=$("tonnageSaveBtn");
  const timeSelect=$("tonnageSnapshotTime");

  if(badge){
    badge.textContent=isMtd
      ? "AUDIT MTD / S.D. TANGGAL"
      : isBatch
        ? "CLOSING BANYAK KP"
        : isClosing ? "CLOSING HARIAN PER KP" : "SNAPSHOT 10/12/15/17";
    badge.classList.toggle("closing-mode",isClosing);
    badge.classList.toggle("mtd-mode",isMtd);
  }
  if(saveBtn){
    saveBtn.textContent=isMtd
      ? "Simpan Audit MTD"
      : isBatch
        ? "Simpan / Update Semua Closing"
        : isClosing ? "Simpan / Update Closing Harian" : "Simpan Snapshot";
  }
  if(timeSelect) timeSelect.disabled=isMtd;
}
function detectTonnageModeLive(){
  const raw=$("tonnageText")?.value||"";
  if(!raw.trim()){
    setTonnageInputMode("snapshot");
    return;
  }

  if(isMonthlyCumulativeReport(raw)){
    setTonnageInputMode("mtd_audit");
    return;
  }

  if(isClosingKpTonnageReport(raw)){
    const count=String(raw).split(/\r?\n/)
      .map(closingKpFromHeading)
      .filter(Boolean).length;
    setTonnageInputMode(count>1?"closing_batch":"closing_kp");
  }else{
    setTonnageInputMode("snapshot");
  }
}
async function previewTonnage(){
  try{
    const raw=$("tonnageText").value;

    if(isMonthlyCumulativeReport(raw)){
      TONNAGE_PREVIEW=parseMonthlyCumulativeWhatsApp(raw);
      const p=TONNAGE_PREVIEW;
      p.comparison=await compareMonthlyCumulativeToSystem(p);
      setTonnageInputMode("mtd_audit");

      const c=p.comparison;
      const supplierText=c.supplierCompare.map(x=>
        `${x.supplier_name}\n`+
        `  WhatsApp : ${kg(x.whatsapp_kg)}\n`+
        `  Sistem   : ${kg(x.system_kg)}\n`+
        `  Selisih  : ${x.diff_kg>=0?"+":""}${kg(x.diff_kg)} ${x.match?"✓":"⚠"}`
      ).join("\n\n");

      $("tonnagePreview").textContent=
        `MODE: AUDIT MTD / TONASE S.D. TANGGAL\n`+
        `KP: ${p.kp}\n`+
        `Periode: ${p.period_start} s.d. ${p.report_date}\n`+
        `Tanggal sumber: ${p.dateSource}\n`+
        `${p.dateMismatch?"⚠ Tanggal pilihan manual berbeda dengan laporan — SIMPAN DIBLOKIR\n":""}`+
        `WhatsApp MTD: ${kg(c.whatsappTotal)}\n`+
        `MTD Sistem: ${kg(c.systemTotal)}\n`+
        `Trip Sistem: ${c.systemTrips.toLocaleString("id-ID")}\n`+
        `Hari Closing tersedia: ${c.days}\n`+
        `Sumber sistem: ${c.sourceLabel}\n`+
        `SELISIH: ${c.diff>=0?"+":""}${kg(c.diff)}\n`+
        `STATUS: ${c.match?"COCOK ✓":"SELISIH — PERLU AUDIT ⚠"}\n`+
        `Validasi TOTAL WhatsApp: ${p.validTotal?"COCOK ✓":"TIDAK COCOK ✕"}\n\n`+
        `CATATAN: laporan ini TIDAK menambah tonase. Hanya disimpan sebagai pembanding/audit MTD.\n\n`+
        supplierText;
      return;
    }

    TONNAGE_PREVIEW=isClosingKpTonnageReport(raw)
      ? parseClosingBatchTonnage(raw)
      : parseTonnage(raw);

    const p=TONNAGE_PREVIEW;
    setTonnageInputMode(p.mode||"snapshot");

    if(p.mode==="closing_kp" || p.mode==="closing_batch"){
      const blockText=p.blocks.map(b=>{
        const totalStatus=b.validTotal ? "✓" : "✕";
        const tripStatus=b.validTrips ? "✓" : "✕";
        return [
          `${b.kp}`,
          `  Supplier: ${b.rows.length}`,
          `  Tonase detail: ${kg(b.total)}`,
          `  TOTAL laporan: ${b.declared==null?"tidak ditemukan":kg(b.declared)} ${totalStatus}`,
          `  Trip detail: ${b.trips}`,
          `  Trip TOTAL: ${b.declaredTrips==null?"tidak dicantumkan":b.declaredTrips} ${tripStatus}`
        ].join("\n");
      }).join("\n\n");

      const mismatchText=(p.dateMismatch||p.timeMismatch)
        ? `⚠ PILIHAN MANUAL BERBEDA DENGAN HEADER — SIMPAN DIBLOKIR\n`
        : "";
      const grandText=p.grandDeclared==null
        ? "TOTAL SELURUH: tidak dicantumkan"
        : `TOTAL SELURUH: ${kg(p.grandDeclared)} ${p.validGrandTotal?"✓":"✕"}`;

      $("tonnagePreview").textContent=
        `MODE: ${p.mode==="closing_batch"?"CLOSING BANYAK KP — 00.00":"CLOSING HARIAN PER KP — 00.00"}\n`+
        `Tanggal: ${p.date} (${p.dateSource})\n`+
        `Jam: 00.00 (${p.timeSource})\n`+
        `${mismatchText}`+
        `KP terbaca: ${p.blocks.length}\n`+
        `Total tonase detail: ${kg(p.total)}\n`+
        `${grandText}\n`+
        `Total trip detail: ${p.trips}\n`+
        `Validasi: ${p.validTotal&&p.validTrips?"SEMUA COCOK ✓":"PERLU CEK ✕"}\n`+
        `KP belum ada dalam paste: ${p.missingKps.length ? p.missingKps.join(", ") : "Tidak ada"}\n\n`+
        blockText;
      return;
    }

    const mismatchText=(p.dateMismatch||p.timeMismatch)
      ? `⚠ PILIHAN MANUAL BERBEDA DENGAN HEADER — SIMPAN DIBLOKIR\n`
      : "";
    $("tonnagePreview").textContent=
      `MODE: SNAPSHOT WHATSAPP\nSNAPSHOT ${p.date} ${p.time.slice(0,5)}\n`+
      `Tanggal sumber: ${p.dateSource}\nJam sumber: ${p.timeSource}\n`+
      `${mismatchText}`+
      `KP/Supplier rows: ${p.rows.length}\nTotal parser: ${kg(p.total)}\n`+
      `TOTAL SELURUH: ${p.declared==null?"tidak ditemukan":kg(p.declared)}\nMobil/Trip: ${p.trips}\n`+
      `Validasi total: ${p.validTotal?"OK ✓":"PERLU CEK ⚠"}\n\n`+
      JSON.stringify(p.rows,null,2);
  }catch(e){
    TONNAGE_PREVIEW=null;
    setTonnageInputMode("snapshot");
    $("tonnagePreview").textContent="ERROR: "+e.message;
  }
}
async function saveTonnage(){
  if(!TONNAGE_PREVIEW) return alert("Preview dahulu.");
  const p=TONNAGE_PREVIEW;

  if(p.mode==="mtd_audit"){
    if(p.dateMismatch){
      return alert(
        "SIMPAN AUDIT DIBLOKIR.\n\nTanggal pilihan manual berbeda dengan tanggal laporan WhatsApp."
      );
    }
    if(!p.validTotal){
      return alert(
        "SIMPAN AUDIT DIBLOKIR.\n\n"+
        `Total supplier: ${kg(p.total)}\n`+
        `TOTAL laporan: ${kg(p.declared)}\n\n`+
        "Jumlah supplier harus sama dengan TOTAL."
      );
    }

    const payload=p.rows.map(r=>({
      period_start:p.period_start,
      report_date:p.report_date,
      kp_code:p.kp,
      supplier_name:r.supplier_name,
      tonnage_kg:Number(r.tonnage_kg||0),
      declared_total_kg:p.declared==null?p.total:p.declared,
      source_type:"whatsapp_mtd",
      raw_text:$("tonnageText").value
    }));

    const {data:saved,error}=await db.from("monthly_cumulative_snapshots")
      .upsert(payload,{onConflict:"report_date,kp_code,supplier_name"})
      .select("report_date,kp_code,supplier_name,tonnage_kg,declared_total_kg");

    if(error) return alert("Gagal menyimpan Audit MTD: "+error.message);

    const c=p.comparison || await compareMonthlyCumulativeToSystem(p);

    alert(
      `AUDIT MTD BERHASIL DISIMPAN ✓\n\n`+
      `KP: ${p.kp}\n`+
      `Periode: ${p.period_start} s.d. ${p.report_date}\n`+
      `WhatsApp MTD: ${kg(c.whatsappTotal)}\n`+
      `MTD Sistem: ${kg(c.systemTotal)}\n`+
      `Selisih: ${c.diff>=0?"+":""}${kg(c.diff)}\n`+
      `Status: ${c.match?"COCOK":"SELISIH"}\n\n`+
      `Audit ini TIDAK menambah tonase harian/bulanan.`
    );

    if($("monitorDate")) $("monitorDate").value=p.report_date;
    if($("monitorKp")){
      const hasOption=[...$("monitorKp").options].some(o=>o.value===p.kp);
      if(hasOption) $("monitorKp").value=p.kp;
    }

    TONNAGE_PREVIEW=null;
    $("tonnageText").value="";
    $("tonnagePreview").textContent="Belum ada preview.";
    setTonnageInputMode("snapshot");
    await loadKPDaily(p.kp);
    await loadDashboard();
    return;
  }

  if(p.dateMismatch || p.timeMismatch){
    return alert(
      "SIMPAN DIBLOKIR.\n\n"+
      "Tanggal/jam pilihan manual berbeda dengan header laporan.\n"+
      "Samakan pilihan manual dengan laporan, atau kosongkan pilihan manual agar sistem memakai header otomatis."
    );
  }

  if(p.mode==="closing_kp" || p.mode==="closing_batch"){
    if(p.invalid?.length || p.validGrandTotal===false || p.validGrandTrips===false){
      const grandIssue=p.validGrandTotal===false
        ? `\nTOTAL SELURUH: detail ${kg(p.total)} vs laporan ${kg(p.grandDeclared)}`
        : "";
      const grandTripIssue=p.validGrandTrips===false
        ? `\nTRIP SELURUH: detail ${p.trips} vs laporan ${p.grandDeclaredTrips}`
        : "";
      return alert(
        "SIMPAN DIBLOKIR.\n\n"+
        p.invalid.map(b=>
          `${b.kp}: detail ${kg(b.total)} vs TOTAL ${b.declared==null?"-":kg(b.declared)}`+
          `${b.declaredTrips==null?"":` • trip ${b.trips} vs ${b.declaredTrips}`}`
        ).join("\n")+
        grandIssue+grandTripIssue+
        "\n\nPerbaiki total yang tidak cocok sebelum menyimpan."
      );
    }

    const payload=p.blocks.flatMap(b=>b.rows.map(r=>({
      report_date:p.date,
      kp_code:b.kp,
      supplier_name:r.supplier_name,
      tonnage_kg:Number(r.tonnage_kg||0),
      trip_count:Number(r.trip_count||0),
      source_file:`WHATSAPP:CLOSING:00.00:${b.kp}`
    })));

    const {data:saved,error}=await db.from("kp_daily_history")
      .upsert(payload,{onConflict:"report_date,kp_code,supplier_name"})
      .select("report_date,kp_code,supplier_name,tonnage_kg,trip_count,source_file");

    if(error){
      console.error("Closing save error:",error);
      return alert("Gagal simpan closing harian: "+error.message);
    }

    if(!saved || saved.length!==payload.length){
      console.error("Closing save verification mismatch",{payload,saved});
      return alert(
        `Verifikasi penyimpanan belum lengkap (${saved?.length||0}/${payload.length} baris). `+
        "Jangan input ulang dulu; refresh lalu periksa data."
      );
    }

    if($("monitorDate")) $("monitorDate").value=p.date;
    if($("tonnageInputDate")) $("tonnageInputDate").value=p.date;
    if($("tonnageSnapshotTime")) $("tonnageSnapshotTime").value="00:00:00";

    if($("monitorKp")){
      if(p.blocks.length===1){
        const onlyKp=p.blocks[0].kp;
        const hasOption=[...$("monitorKp").options].some(o=>o.value===onlyKp);
        $("monitorKp").value=hasOption ? onlyKp : "ALL";
      }else{
        $("monitorKp").value="ALL";
      }
    }

    const savedTotal=saved.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
    const savedTrips=saved.reduce((a,r)=>a+Number(r.trip_count||0),0);

    alert(
      `CLOSING HARIAN BERHASIL DISIMPAN ✓\n\n`+
      `Tanggal: ${p.date}\n`+
      `KP: ${p.blocks.length}\n`+
      `Baris supplier: ${saved.length}\n`+
      `Tonase: ${kg(savedTotal)}\n`+
      `Trip: ${savedTrips}\n\n`+
      `Monitoring diarahkan ke ${p.blocks.length===1?p.blocks[0].kp:"Semua KP"} / ${p.date}.`
    );

    TONNAGE_PREVIEW=null;
    $("tonnageText").value="";
    $("tonnagePreview").textContent="Belum ada preview.";
    setTonnageInputMode("snapshot");

    await loadKPDaily(p.blocks.length===1 ? p.blocks[0].kp : "ALL");
    await loadDashboard();
    return;
  }

  if(p.declared!=null && !p.validTotal){
    return alert("SIMPAN DIBLOKIR.\n\n"+`Total detail: ${kg(p.total)}\nTOTAL SELURUH: ${kg(p.declared)}\n\nJumlah detail harus sama dengan TOTAL SELURUH.`);
  }
  const {data:s,error}=await db.from("monitoring_snapshots").upsert({report_date:p.date,snapshot_time:p.time,total_tonnage_kg:p.declared??p.total,total_trips:p.trips,source_type:"whatsapp_paste",raw_text:$("tonnageText").value,status:"validated"},{onConflict:"report_date,snapshot_time"}).select().single();
  if(error) return alert(error.message);
  await db.from("monitoring_snapshot_details").delete().eq("snapshot_id",s.id);
  const {error:e2}=await db.from("monitoring_snapshot_details").insert(p.rows.map(r=>({...r,snapshot_id:s.id})));
  if(e2) return alert(e2.message);
  alert("Snapshot tersimpan."); TONNAGE_PREVIEW=null; $("tonnageText").value=""; await loadDashboard();
}
function cleanPriceLine(raw){
  return String(raw||"")
    .replace(/\u00a0/g," ")
    .replace(/^[\s>*•●▪◦]+/,"")
    .replace(/[*_`~]/g,"")
    .replace(/\s+/g," ")
    .trim();
}
function priceKPFromLine(line){
  const m=cleanPriceLine(line).match(
    /^(?:KP\s*[.\-:]?\s*)?(BMK|FAA|KIP|ASMJ[\s-]?[12]|HKBS|TKWL[\s-]?[12]|SISL|GSS|SSL|MAN|SSM|IIS|GSL(?:[\s-]INUMAN)?|SKA|KS\s*2|LBP|LPI|LSHP|PSM|BSN|MSB\s*2|BSS|KWP)\s*:?[\s]*$/i
  );
  return m ? canonKP(m[1]) : null;
}
function priceNumberToken(s){
  const m=String(s||"").match(/(?:Rp\.?\s*)?(\d{1,2}(?:[.,]\d{3})|\d{4,5})(?!\d)/i);
  if(!m) return null;
  const raw=m[1];
  const n=Number(raw.replace(/[.,]/g,""));
  return Number.isFinite(n) ? n : null;
}
function priceChangeFromLine(line){
  const s=String(line||"");

  // "Naik Rp. 30 menjadi Rp. 3.120"
  let m=s.match(/\b(Naik|Turun)\b\s*(?:Rp\.?\s*)?([\d.,]+)/i);
  if(m){
    const n=Number(m[2].replace(/[.,]/g,""));
    return Number.isFinite(n) ? (m[1].toLowerCase()==="turun" ? -n : n) : null;
  }

  // "(+30)" / "(-30)"
  m=s.match(/\(([+-])\s*(?:Rp\.?\s*)?([\d.,]+)\)/i);
  if(m){
    const n=Number(m[2].replace(/[.,]/g,""));
    return Number.isFinite(n) ? (m[1]==="-" ? -n : n) : null;
  }
  return null;
}

function finalPriceFromLine(line,closed){
  if(closed) return null;
  const s=String(line||"");

  // Highest priority: explicit final price after "menjadi".
  let m=s.match(/\bmenjadi\b\s*(?:Rp\.?\s*)?(\d{1,2}(?:[.,]\d{3})|\d{4,5})(?!\d)/i);
  if(m){
    return Number(m[1].replace(/[.,]/g,""));
  }

  // Pattern: "Rp3.310 Naik Rp20" -> take price before Naik/Turun.
  const beforeChange=s.split(/\b(?:Naik|Turun)\b/i)[0];
  const p=priceNumberToken(beforeChange);
  if(p>0) return p;

  // Fallback: first plausible price token in line, but ignore the
  // Naik/Turun amount if a second price is present.
  const vals=[...s.matchAll(/(?:Rp\.?\s*)?(\d{1,2}(?:[.,]\d{3})|\d{4,5})(?!\d)/gi)]
    .map(x=>Number(x[1].replace(/[.,]/g,"")))
    .filter(n=>Number.isFinite(n) && n>0);

  if(!vals.length) return null;
  if(/\b(?:Naik|Turun)\b/i.test(s) && vals.length>=2) return vals[vals.length-1];
  return vals[0];
}
function supplierSearchToken(s){
  return String(s||"").toUpperCase().replace(/[^A-Z0-9]+/g,"");
}
function priceSuppliersForKP(expr,kp){
  const compact=supplierSearchToken(expr);
  const candidates=(MASTER_SUPPLIER_DATA||[]).filter(s=>(s.master_kp?.code||"")===kp);
  const hits=[];

  for(const s of candidates){
    const aliases=[s.name,s.full_name,...(s.aliases||[])].filter(Boolean);
    if(aliases.some(a=>{
      const tok=supplierSearchToken(a);
      return tok && compact.includes(tok);
    })) hits.push(s.name);
  }

  const unique=[...new Set(hits)];
  if(unique.length) return unique;

  // Fallback when master data has not loaded yet. Do not split a code like MSP-3.
  const protectedExpr=String(expr||"")
    .replace(/MSP\s*-\s*(\d+)/gi,'MSP§$1')
    .replace(/MSB\s*-\s*(\d+)/gi,'MSB§$1');

  return [...new Set(
    protectedExpr
      .split(/\s*(?:\/|&|,|\bdan\b|\+)\s*|\s+-\s+|(?<=[A-Za-z])-(?=[A-Za-z])/i)
      .map(x=>x.replace(/§/g,'-').trim())
      .filter(Boolean)
      .map(x=>canonSupplierForKP(kp,x)||x)
  )];
}
function parsePriceReportDate(text){
  const source=String(text||"")
    .replace(/\u00a0/g," ")
    .replace(/[＊*]/g,"")
    .replace(/\s+/g," ");

  // Price reports often use: "Kamis, 20 Agustus 2026".
  // Resolve Indonesian month names explicitly so month cannot drift.
  let m=source.match(
    /\b(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})\b/i
  );
  if(m){
    const month=monthMap[m[2].toLowerCase()];
    if(month) return isoDate(Number(m[1]),month,Number(m[3]));
  }

  // Numeric Indonesian date fallback: DD/MM/YYYY or DD-MM-YYYY.
  m=source.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if(m){
    return isoDate(Number(m[1]),Number(m[2]),Number(m[3]));
  }

  return null;
}

function parsePrice(text){
  const explicitDate=parsePriceReportDate(text);
  const h=parseHeader(text);
  const priceDate=explicitDate || h?.date || null;
  if(!priceDate) throw Error("Tanggal harga tidak ditemukan.");

  let kp=null;
  const rows=[];
  const warnings=[];

  for(const raw of String(text||"").split(/\r?\n/)){
    const line=cleanPriceLine(raw);
    if(!line) continue;

    const headingKP=priceKPFromLine(line);
    if(headingKP){
      kp=headingKP;
      continue;
    }

    // Ignore report labels, date-only lines, and totals.
    if(/^laporan\b|^harga\s+tbs\b/i.test(line) && !/Rp\.?\s*\d/i.test(line)) continue;
    if(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(line)) continue;
    if(/^total\b/i.test(line)) continue;
    if(!kp) continue;

    const closed=/\bTUTUP\b|\bCLOSED\b/i.test(line);
    const change=priceChangeFromLine(line);
    const price=finalPriceFromLine(line,closed);

    if(!closed && !(price>0)){
      continue;
    }

    // Supplier expression is always the part before price/change wording.
    let supplierExpr=line
      .split(/\b(?:Naik|Turun)\b/i)[0]
      .replace(/\bTUTUP\b|\bCLOSED\b/ig,"")
      .replace(/(?:Rp\.?\s*)?\d{1,2}(?:[.,]\d{3})|(?:Rp\.?\s*)?\d{4,5}/ig,"")
      .replace(/[:=]+/g," ")
      .replace(/[()]/g," ")
      .replace(/\s+/g," ")
      .trim();

    if(closed){
      supplierExpr=line
        .replace(/\bTUTUP\b|\bCLOSED\b/ig,"")
        .replace(/[:=]+/g," ")
        .replace(/[()]/g," ")
        .replace(/\s+/g," ")
        .trim();
    }

    const suppliers=priceSuppliersForKP(supplierExpr,kp);
    if(!suppliers.length){
      warnings.push(`${kp}: supplier tidak dikenali pada baris "${line}"`);
      continue;
    }

    for(const supplier of suppliers){
      rows.push({
        effective_date:priceDate,
        kp_code:kp,
        supplier_name:supplier,
        price_per_kg:closed ? null : price,
        status:closed ? "closed" : "active",
        change_amount:change,
        raw_line:line
      });
    }
  }

  // Deduplicate same KP/supplier within the pasted report; last explicit line wins.
  const dedup=new Map();
  rows.forEach(r=>dedup.set(`${r.kp_code}|${r.supplier_name}`,r));
  const finalRows=[...dedup.values()];

  if(!finalRows.length) throw Error("Tidak ada baris harga TBS yang dapat dibaca.");
  return {date:priceDate,rows:finalRows,warnings};
}
function previewPrice(){
  try{
    PRICE_PREVIEW=parsePrice($("priceText").value);
    const p=PRICE_PREVIEW;
    const active=p.rows.filter(r=>r.status==="active");
    const closed=p.rows.filter(r=>r.status==="closed");
    const changed=p.rows.filter(r=>r.change_amount!=null);

    $("pricePreview").textContent=
      `Tanggal efektif: ${p.date}\n`+
      `Supplier terbaca: ${p.rows.length}\n`+
      `Harga aktif: ${active.length}\n`+
      `TUTUP: ${closed.length}\n`+
      `Dengan perubahan: ${changed.length}\n`+
      (p.warnings.length ? `Peringatan: ${p.warnings.length}\n${p.warnings.map(x=>"- "+x).join("\n")}\n` : "")+
      `\n`+
      p.rows.map(r=>
        `${r.kp_code} / ${r.supplier_name} : `+
        `${r.status==="closed" ? "TUTUP" : rupiah(r.price_per_kg)+"/kg"}`+
        `${r.change_amount==null ? "" : ` (${r.change_amount>0?"Naik":"Turun"} ${rupiah(Math.abs(r.change_amount))})`}`
      ).join("\n");
  }catch(e){
    PRICE_PREVIEW=null;
    $("pricePreview").textContent="ERROR: "+e.message;
  }
}
async function savePrice(){
  if(!PRICE_PREVIEW) return alert("Preview dahulu.");
  if(PRICE_PREVIEW.warnings?.length){
    return alert("SIMPAN DIBLOKIR. Masih ada supplier/baris harga yang belum dikenali. Periksa Preview.");
  }

  const {error}=await db.from("daily_prices").upsert(
    PRICE_PREVIEW.rows,
    {onConflict:"effective_date,kp_code,supplier_name"}
  );
  if(error) return alert(error.message);

  alert(`Harga tersimpan.\nTanggal: ${PRICE_PREVIEW.date}\nSupplier: ${PRICE_PREVIEW.rows.length}`);
  PRICE_PREVIEW=null;
  $("priceText").value="";
  $("pricePreview").textContent="Belum ada preview.";
  await loadPrices();
  await loadDashboard();
}

function cleanExpenseLine(raw){
  return String(raw||"")
    .replace(/\u00a0/g," ")
    .replace(/^[\s>*•●▪◦\-–—*]+/,"")
    .replace(/[*_`~]/g,"")
    .replace(/\s+/g," ")
    .trim();
}
function expenseAmountsFromText(s){
  const text=String(s||"");
  const found=[];

  // Standard Indonesian thousands format with dot or comma:
  // 35.000 / 35,000 / 1.250.000 / 1,250,000
  for(const m of text.matchAll(/(?:Rp\.?\s*)?(\d{1,3}(?:(?:\.|,)\d{3})+)(?!\d)/gi)){
    const n=Number(m[1].replace(/[.,]/g,""));
    if(Number.isFinite(n) && n>0) found.push(n);
  }

  // WhatsApp shorthand: 35rb / 35 rb / 35k
  for(const m of text.matchAll(/(?:Rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(rb|ribu|k)\b/gi)){
    const raw=Number(m[1].replace(",","."));
    const n=Math.round(raw*1000);
    if(Number.isFinite(n) && n>0) found.push(n);
  }

  // Plain integer only when explicitly prefixed with Rp.
  if(!found.length){
    for(const m of text.matchAll(/Rp\.?\s*(\d+)(?!\d)/gi)){
      const n=Number(m[1]);
      if(Number.isFinite(n) && n>0) found.push(n);
    }
  }

  return found;
}
function expenseAmountFromText(s){
  const amounts=expenseAmountsFromText(s);
  return amounts.length ? amounts.reduce((a,b)=>a+b,0) : null;
}
function isExpenseTotalLine(line){
  return /^total(?:\s+seluruh)?\b\s*:?\s*/i.test(cleanExpenseLine(line));
}
function extractDeclaredExpenseTotal(text){
  for(const raw of String(text||"").split(/\r?\n/)){
    const line=cleanExpenseLine(raw);
    if(!isExpenseTotalLine(line)) continue;
    const amounts=expenseAmountsFromText(line);
    if(amounts.length) return amounts[amounts.length-1];
  }
  return null;
}
function malformedExpenseAmountCandidate(line){
  // Detect likely mistyped Indonesian thousands such as 35.00 -> 35.000.
  // Never auto-accept by itself; it is only used if it reconciles exactly
  // against the declared report Total.
  const m=String(line||"").match(/(?:Rp\.?\s*)?(\d{1,3})\.(\d{2})(?!\d)/i);
  if(!m) return null;

  const original=`${m[1]}.${m[2]}`;
  const correctedToken=`${m[1]}.${m[2]}0`;
  const corrected=Number(correctedToken.replace(/\./g,""));

  if(!Number.isFinite(corrected) || corrected<=0) return null;
  return {original,correctedToken,corrected};
}

function parseExpense(text){
  const h=parseHeader(text);
  const whatsappDate=h?.date || null;
  const manualDate=$("expenseDate")?.value || null;
  const effectiveDate=whatsappDate || manualDate;
  const dateMismatch=!!(whatsappDate && manualDate && whatsappDate!==manualDate);
  const dateSource=whatsappDate ? "teks WhatsApp" : manualDate ? "pilihan manual" : null;

  if(!effectiveDate){
    throw Error("Tanggal biaya tidak ditemukan. Sertakan tanggal di laporan WhatsApp atau pilih Tanggal Pengeluaran.");
  }

  const kpMatch=String(text||"").match(
    /\b(?:KP\s*[.\-:]?\s*)?(BMK|FAA|KIP|ASMJ[\s-]?[12]|HKBS|TKWL[\s-]?[12]|SISL|GSS|SSL|MAN|SSM|IIS|GSL(?:[\s-]INUMAN)?|SKA|KS\s*2|LBP|LPI|LSHP|PSM|BSN|MSB\s*2|BSS|KWP)\b/i
  );

  const selectedKp=$("expenseKp")?.value || "";
  const kp=kpMatch ? canonKP(kpMatch[1]) : selectedKp;
  const kpSource=kpMatch ? "teks WhatsApp" : selectedKp ? "pilihan manual" : null;

  if(!kp){
    throw Error("KP tidak ada di laporan. Pilih KP/unit terlebih dahulu, lalu Preview lagi.");
  }

  const declaredTotal=extractDeclaredExpenseTotal(text);
  const rows=[];
  const malformedCandidates=[];

  for(const raw of String(text||"").split(/\r?\n/)){
    const line=cleanExpenseLine(raw);
    if(!line) continue;

    if(/^laporan\s+biaya\b/i.test(line)) continue;
    if(isExpenseTotalLine(line)) continue;
    if(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(line)) continue;
    if(/^\d{1,2}\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4}$/i.test(line)) continue;

    let category="Lainnya";
    const cat=line.match(/^(?:(?:B\.\s*|B\s+)|Beban\s+)([^()0-9]+?)(?:\s*\(|\s+\d|$)/i);
    if(cat){
      category=cat[1].trim().replace(/[,:;]+$/,"").trim();
    }

    const amounts=expenseAmountsFromText(line);

    if(!amounts.length){
      const malformed=malformedExpenseAmountCandidate(line);
      if(malformed){
        malformedCandidates.push({line,category,...malformed});
      }
      continue;
    }

    const amount=amounts.reduce((sum,n)=>sum+n,0);

    const paren=line.match(/\((.*)\)/);
    let detail=paren?.[1]?.trim() || line;
    detail=detail
      .replace(/(?:Rp\.?\s*)?\d{1,3}(?:(?:\.|,)\d{3})+/gi,"")
      .replace(/(?:Rp\.?\s*)?\d+(?:[.,]\d+)?\s*(?:rb|ribu|k)\b/gi,"")
      .replace(/\s+/g," ")
      .replace(/\s+,/g,",")
      .trim();

    let subcategory=null;
    if(/pengambilan dana|p\.\s*dana/i.test(line)){
      subcategory="Pengambilan Dana";
    }else if(/\bBBM\b/i.test(line)){
      subcategory="BBM";
    }

    rows.push({
      expense_date:effectiveDate,
      kp_code:kp,
      category,
      subcategory,
      description:detail || line,
      amount,
      corrected_from:null
    });
  }

  let parsedTotal=rows.reduce((sum,r)=>sum+Number(r.amount||0),0);
  const corrections=[];

  // Reconcile malformed amounts only if the declared Total proves the correction.
  if(declaredTotal!=null && parsedTotal!==declaredTotal && malformedCandidates.length){
    let remaining=declaredTotal-parsedTotal;

    for(const c of malformedCandidates){
      if(remaining<=0) break;

      if(c.corrected===remaining){
        const paren=c.line.match(/\((.*)\)/);
        const detail=(paren?.[1] || c.line)
          .replace(c.original,"")
          .replace(/\s+/g," ")
          .trim();

        rows.push({
          expense_date:effectiveDate,
          kp_code:kp,
          category:c.category,
          subcategory:null,
          description:detail || c.line,
          amount:c.corrected,
          corrected_from:c.original
        });

        corrections.push({
          from:c.original,
          to:c.correctedToken,
          amount:c.corrected,
          line:c.line
        });

        parsedTotal+=c.corrected;
        remaining=declaredTotal-parsedTotal;
      }
    }
  }

  if(!rows.length){
    throw Error("Tidak ada baris biaya yang dapat dibaca.");
  }

  const difference=declaredTotal==null ? null : parsedTotal-declaredTotal;
  const totalMatches=declaredTotal==null ? null : Math.abs(difference)<=1;

  return {
    date:effectiveDate,
    whatsappDate,
    manualDate,
    dateSource,
    dateMismatch,
    kp,
    kpSource,
    rows,
    total:parsedTotal,
    declaredTotal,
    difference,
    totalMatches,
    corrections,
    unresolvedMalformed:malformedCandidates.filter(c=>
      !corrections.some(x=>x.line===c.line)
    )
  };
}

function normalizeExpenseRawText(text){
  return String(text||"")
    .replace(/\u00a0/g," ")
    .replace(/[＊*_`~]/g,"")
    .replace(/\r/g,"")
    .split("\n")
    .map(x=>x.trim().replace(/\s+/g," "))
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function normalizeExpenseCompareText(text){
  return String(text||"")
    .toLowerCase()
    .replace(/\u00a0/g," ")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function expenseTransactionKey(row){
  return [
    row.expense_date||"",
    String(row.kp_code||"").toUpperCase(),
    normalizeExpenseCompareText(row.category||""),
    normalizeExpenseCompareText(row.subcategory||""),
    normalizeExpenseCompareText(row.description||""),
    Number(row.amount||0)
  ].join("|");
}

async function checkExpenseDuplicates(preview, rawText){
  const result={
    exactReport:false,
    exactReportExistingCount:0,
    potentialRows:[],
    checked:true
  };

  if(!preview?.date || !preview?.kp) return result;

  const {data:existing,error}=await db.from("unit_expenses")
    .select("id,expense_date,kp_code,category,subcategory,description,amount,raw_text,created_at")
    .eq("expense_date",preview.date)
    .eq("kp_code",preview.kp)
    .order("created_at",{ascending:false})
    .limit(1000);

  if(error){
    console.error("Duplicate expense check failed:",error);
    throw Error("Gagal memeriksa duplikasi pengeluaran: "+error.message);
  }

  const existingRows=existing||[];
  const normalizedNewReport=normalizeExpenseRawText(rawText);

  // Exact-report duplicate:
  // every saved row from one WhatsApp report stores the same raw_text.
  // One matching raw_text is sufficient to prove the report was already saved.
  const exactMatches=existingRows.filter(r=>
    r.raw_text && normalizeExpenseRawText(r.raw_text)===normalizedNewReport
  );

  result.exactReport=exactMatches.length>0;
  result.exactReportExistingCount=exactMatches.length;
  result.exactReportCreatedAt=exactMatches[0]?.created_at || null;

  // Potential transaction duplicates:
  // same date + KP + category + subcategory + description + amount.
  // These are warnings only because legitimate identical purchases can occur.
  const existingKeys=new Map();
  existingRows.forEach(r=>{
    const key=expenseTransactionKey(r);
    if(!existingKeys.has(key)) existingKeys.set(key,[]);
    existingKeys.get(key).push(r);
  });

  result.potentialRows=(preview.rows||[]).map((r,i)=>{
    const key=expenseTransactionKey(r);
    const matches=existingKeys.get(key)||[];
    return matches.length ? {
      index:i,
      row:r,
      matchCount:matches.length,
      lastCreatedAt:matches[0]?.created_at||null
    } : null;
  }).filter(Boolean);

  return result;
}

function formatExpenseDuplicateStatus(dup){
  if(!dup?.checked) return "Belum diperiksa";
  if(dup.exactReport){
    const when=dup.exactReportCreatedAt
      ? new Date(dup.exactReportCreatedAt).toLocaleString("id-ID")
      : "-";
    return [
      "✕ DUPLIKAT LAPORAN",
      `Laporan identik sudah tersimpan (${dup.exactReportExistingCount} baris cocok).`,
      `Terakhir tersimpan: ${when}`,
      "Status: SIMPAN DIBLOKIR"
    ].join("\n");
  }
  if(dup.potentialRows?.length){
    return [
      "⚠ POTENSI TRANSAKSI GANDA",
      `${dup.potentialRows.length} baris mirip dengan transaksi yang sudah ada.`,
      "Ini hanya peringatan; laporan tetap dapat disimpan bila memang transaksi baru."
    ].join("\n");
  }
  return "✓ BELUM PERNAH DISIMPAN";
}

async function previewExpense(){
  try{
    EXPENSE_PREVIEW=parseExpense($("expenseText").value);

    const p=EXPENSE_PREVIEW;
    $("expensePreview").textContent="Memeriksa data dan duplikasi...";

    p.duplicateCheck=await checkExpenseDuplicates(p,$("expenseText").value);

    const validation=p.declaredTotal==null
      ? "Total laporan: tidak dicantumkan"
      : `Total laporan: ${rupiah(p.declaredTotal)}\n`+
        `Selisih: ${rupiah(Math.abs(p.difference||0))}\n`+
        `Status: ${p.totalMatches ? "✓ COCOK" : "✕ TIDAK COCOK"}`;

    const correctionText=p.corrections?.length
      ? `\nKoreksi format otomatis tervalidasi:\n`+
        p.corrections.map(c=>`- ${c.from} → ${c.to} (${rupiah(c.amount)})`).join("\n")
      : "";

    const unresolvedText=p.unresolvedMalformed?.length
      ? `\nFormat nominal belum pasti:\n`+
        p.unresolvedMalformed.map(c=>`- ${c.line}`).join("\n")
      : "";

    const dateValidation=p.dateMismatch
      ? `⚠ Tanggal WhatsApp ${p.whatsappDate} berbeda dengan tanggal pilihan ${p.manualDate}. Simpan akan diblokir.\n`
      : `Tanggal sumber: ${p.dateSource}\n`;

    const dupStatus=formatExpenseDuplicateStatus(p.duplicateCheck);

    const potentialText=p.duplicateCheck?.potentialRows?.length && !p.duplicateCheck?.exactReport
      ? `\n\nDetail potensi transaksi ganda:\n`+
        p.duplicateCheck.potentialRows.map(x=>
          `- ${x.row.category}${x.row.subcategory?" / "+x.row.subcategory:""} | `+
          `${x.row.description||"-"} | ${rupiah(x.row.amount)} `+
          `(sudah ada ${x.matchCount}x)`
        ).join("\n")
      : "";

    $("expensePreview").textContent=
      `Tanggal efektif: ${p.date}\n`+
      `${dateValidation}`+
      `KP: ${p.kp} (${p.kpSource})\n`+
      `Baris biaya: ${p.rows.length}\n`+
      `Total detail: ${rupiah(p.total)}\n`+
      `${validation}\n\n`+
      `DETEKSI DUPLIKAT\n${dupStatus}`+
      `${potentialText}`+
      `${correctionText}`+
      `${unresolvedText}\n\n`+
      p.rows.map((r,i)=>
        `${i+1}. ${r.category}`+
        `${r.subcategory ? " / "+r.subcategory : ""}\n`+
        `   ${r.description}\n`+
        `   ${rupiah(r.amount)}`+
        `${r.corrected_from ? ` [dikoreksi dari ${r.corrected_from}]` : ""}`
      ).join("\n\n");
  }catch(e){
    EXPENSE_PREVIEW=null;
    $("expensePreview").textContent="ERROR: "+e.message;
  }
}
async function saveExpense(){
  if(!EXPENSE_PREVIEW) return alert("Preview dahulu.");

  // Re-check immediately before INSERT to prevent double-click / stale preview.
  let latestDuplicateCheck;
  try{
    latestDuplicateCheck=await checkExpenseDuplicates(
      EXPENSE_PREVIEW,
      $("expenseText").value
    );
  }catch(e){
    return alert(e.message);
  }

  EXPENSE_PREVIEW.duplicateCheck=latestDuplicateCheck;

  if(latestDuplicateCheck.exactReport){
    const when=latestDuplicateCheck.exactReportCreatedAt
      ? new Date(latestDuplicateCheck.exactReportCreatedAt).toLocaleString("id-ID")
      : "-";
    return alert(
      "SIMPAN DIBLOKIR — DUPLIKAT LAPORAN\n\n"+
      `KP: ${EXPENSE_PREVIEW.kp}\n`+
      `Tanggal: ${EXPENSE_PREVIEW.date}\n`+
      `Total: ${rupiah(EXPENSE_PREVIEW.total)}\n`+
      `Sudah tersimpan: ${when}\n\n`+
      "Laporan WhatsApp yang sama tidak disimpan dua kali."
    );
  }

  if(EXPENSE_PREVIEW.dateMismatch){
    return alert(
      "SIMPAN DIBLOKIR.\n\n"+
      `Tanggal WhatsApp: ${EXPENSE_PREVIEW.whatsappDate}\n`+
      `Tanggal pilihan: ${EXPENSE_PREVIEW.manualDate}\n\n`+
      "Samakan tanggal pilihan dengan laporan WhatsApp, atau kosongkan tanggal pilihan agar sistem memakai tanggal WhatsApp."
    );
  }

  if(EXPENSE_PREVIEW.unresolvedMalformed?.length && !EXPENSE_PREVIEW.totalMatches){
    return alert(
      "SIMPAN DIBLOKIR. Ada nominal dengan format tidak pasti dan total belum cocok. Periksa Preview."
    );
  }

  if(EXPENSE_PREVIEW.declaredTotal!=null && !EXPENSE_PREVIEW.totalMatches){
    return alert(
      "SIMPAN DIBLOKIR.\n\n"+
      `Total detail: ${rupiah(EXPENSE_PREVIEW.total)}\n`+
      `Total laporan: ${rupiah(EXPENSE_PREVIEW.declaredTotal)}\n\n`+
      "Jumlah detail belum sama dengan Total laporan."
    );
  }

  if(latestDuplicateCheck.potentialRows?.length){
    const proceed=confirm(
      "PERINGATAN POTENSI TRANSAKSI GANDA\n\n"+
      `${latestDuplicateCheck.potentialRows.length} baris mirip dengan transaksi yang sudah ada `+
      `untuk ${EXPENSE_PREVIEW.kp} tanggal ${EXPENSE_PREVIEW.date}.\n\n`+
      "Jika ini memang laporan/transaksi baru, klik OK untuk lanjut.\n"+
      "Klik Cancel untuk membatalkan."
    );
    if(!proceed) return;
  }

  const {error}=await db.from("unit_expenses").insert(
    EXPENSE_PREVIEW.rows.map(x=>({
      ...x,
      source_type:"whatsapp_paste",
      raw_text:$("expenseText").value
    }))
  );
  if(error) return alert(error.message);

  alert(
    `Pengeluaran tersimpan.\n`+
    `Tanggal: ${EXPENSE_PREVIEW.date}\n`+
    `KP: ${EXPENSE_PREVIEW.kp}\n`+
    `Total: ${rupiah(EXPENSE_PREVIEW.total)}`
  );

  EXPENSE_PREVIEW=null;
  $("expenseText").value="";
  $("expensePreview").textContent="Belum ada preview.";
  await loadExpenses();
  if($("page-expense-monitor")?.classList.contains("active")) await loadExpenseMonitoring();
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
  if($("expenseMonitorKp")) $("expenseMonitorKp").innerHTML=optionsAll;
  if($("historyKp")) $("historyKp").innerHTML=optionsAll;
  if($("monitorKp")) $("monitorKp").innerHTML=optionsAll;
  if($("pasteDetailKp")){
    $("pasteDetailKp").innerHTML='<option value="">Deteksi otomatis / pilih KP</option>'+
      codes.map(code=>`<option value="${code}">${code}</option>`).join("");
  }

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
  syncPasteDetailSuppliers();
  renderMasterDirectory();
}

function normalizedPriceKey(kp,supplier){
  const kpKey=canonKP(kp||"");
  const supplierKey=String(supplier||"")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g,"");
  return `${kpKey}|${supplierKey}`;
}

async function getLatestEffectivePrices(date){
  // Business rule: use the latest explicit price/status effective on or before
  // the snapshot date. ACTIVE carries forward until replaced; CLOSED also
  // carries forward until a later row reopens the supplier.
  const {data,error}=await db.from("daily_prices")
    .select("*")
    .lte("effective_date",date)
    .order("effective_date",{ascending:false})
    .order("created_at",{ascending:false})
    .limit(5000);

  if(error){
    console.error("daily_prices:",error);
    return [];
  }

  const latest={};
  (data||[]).forEach(x=>{
    const key=normalizedPriceKey(x.kp_code,x.supplier_name);
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
  $("kpiPriceSub").textContent = activePrices.length + " supplier dengan harga efektif";
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
  latestPrices.forEach(x=>{
    priceMap[normalizedPriceKey(x.kp_code,x.supplier_name)] = x;
  });
  const expenseByKP = {};
  dailyExpenses.forEach(x=>expenseByKP[x.kp_code] = (expenseByKP[x.kp_code] || 0) + Number(x.amount || 0));

  const controlRows = (detailRows||[])
    .filter(r=>Number(r.tonnage_kg||0) > 0 || Number(r.trip_count||0) > 0)
    .sort((a,b)=>Number(b.tonnage_kg)-Number(a.tonnage_kg))
    .map((r,i)=>{
      const priceRow = priceMap[normalizedPriceKey(r.kp_code,r.supplier_name)] || null;
      const isClosed = priceRow?.status === "closed";
      const price = (!isClosed && priceRow?.price_per_kg != null) ? Number(priceRow.price_per_kg) : 0;
      const value = Number(r.tonnage_kg || 0) * Number(price || 0);
      const exp = expenseByKP[r.kp_code] || 0;
      const costkg = Number(r.tonnage_kg || 0) ? (exp / Number(r.tonnage_kg || 0)) : 0;
      return [
        i+1,
        r.kp_code,
        r.supplier_name,
        Number(r.tonnage_kg || 0).toLocaleString("id-ID"),
        r.trip_count || 0,
        isClosed ? "TUTUP" : (price ? Number(price).toLocaleString("id-ID") : "BELUM ADA"),
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

function localTodayISO(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function initExpenseMonitoring(){
  if($("expenseMonitorMonth") && !$("expenseMonitorMonth").value){
    $("expenseMonitorMonth").value=localTodayISO().slice(0,7);
  }
}
function expenseSourceLabel(row){
  const s=String(row?.source_type||"").toLowerCase();
  if(s==="whatsapp_paste" || !s) return "WhatsApp Paste";
  return row.source_type;
}
function expenseMonthBounds(month){
  const [y,m]=String(month||"").split("-").map(Number);
  if(!y||!m) return null;
  const start=`${y}-${String(m).padStart(2,"0")}-01`;
  const nextM=m===12?1:m+1;
  const nextY=m===12?y+1:y;
  const end=`${nextY}-${String(nextM).padStart(2,"0")}-01`;
  return {start,end};
}
async function loadExpenseMonitoring(){
  if(!$("expenseMonitorMonth")) return;
  initExpenseMonitoring();
  const bounds=expenseMonthBounds($("expenseMonitorMonth").value);
  if(!bounds) return;

  const {data,error}=await db.from("unit_expenses")
    .select("id,expense_date,kp_code,category,subcategory,description,amount,source_type,corrected_from,created_at")
    .gte("expense_date",bounds.start)
    .lt("expense_date",bounds.end)
    .order("expense_date",{ascending:true})
    .order("created_at",{ascending:true});

  if(error){
    console.error(error);
    $("expenseMonitorDetailTable").innerHTML=`<div class="master-empty">Gagal memuat monitoring pengeluaran: ${error.message}</div>`;
    return;
  }

  EXPENSE_MONITOR_DATA=data||[];
  const currentCategory=$("expenseMonitorCategory")?.value||"ALL";
  const cats=[...new Set(EXPENSE_MONITOR_DATA.map(r=>r.category||"Lainnya"))].sort((a,b)=>a.localeCompare(b));
  if($("expenseMonitorCategory")){
    $("expenseMonitorCategory").innerHTML='<option value="ALL">Semua Kategori</option>'+cats.map(c=>`<option value="${c}">${c}</option>`).join("");
    if(cats.includes(currentCategory)) $("expenseMonitorCategory").value=currentCategory;
  }
  renderExpenseMonitoring();
}
function renderExpenseMonitoring(){
  if(!$("expenseMonitorDetailTable")) return;
  const kp=$("expenseMonitorKp")?.value||"ALL";
  const category=$("expenseMonitorCategory")?.value||"ALL";
  const search=($("expenseMonitorSearch")?.value||"").trim().toLowerCase();

  let rows=[...EXPENSE_MONITOR_DATA];
  if(kp!=="ALL") rows=rows.filter(r=>r.kp_code===kp);
  if(category!=="ALL") rows=rows.filter(r=>(r.category||"Lainnya")===category);
  if(search){
    rows=rows.filter(r=>`${r.kp_code} ${r.category||""} ${r.subcategory||""} ${r.description||""}`.toLowerCase().includes(search));
  }

  const total=rows.reduce((a,r)=>a+Number(r.amount||0),0);
  const kps=new Set(rows.map(r=>r.kp_code));
  const days=new Set(rows.map(r=>r.expense_date));
  const avgDay=days.size?total/days.size:0;
  const maxRow=rows.reduce((best,r)=>!best||Number(r.amount||0)>Number(best.amount||0)?r:best,null);

  $("expenseMonitorTotal").textContent=rupiah(total);
  $("expenseMonitorTransactions").textContent=rows.length.toLocaleString("id-ID");
  $("expenseMonitorKpActive").textContent=kps.size.toLocaleString("id-ID");
  $("expenseMonitorDays").textContent=days.size.toLocaleString("id-ID");
  $("expenseMonitorAvg").textContent=rupiah(avgDay);
  $("expenseMonitorLargest").textContent=maxRow?rupiah(maxRow.amount):"Rp0";
  $("expenseMonitorLargestSub").textContent=maxRow?`${maxRow.kp_code} • ${maxRow.category||"Lainnya"}`:"Belum ada data";

  const daily={};
  rows.forEach(r=>daily[r.expense_date]=(daily[r.expense_date]||0)+Number(r.amount||0));
  const dailyDates=Object.keys(daily).sort();
  Plotly.newPlot("expenseMonitorTrend",[{
    x:dailyDates,y:dailyDates.map(d=>daily[d]),type:"bar",
    hovertemplate:"<b>%{x}</b><br>Rp%{y:,.0f}<extra></extra>"
  }],{
    ...darkLayout,margin:{t:16,l:68,r:16,b:48},
    xaxis:{...darkLayout.xaxis,fixedrange:true},
    yaxis:{...darkLayout.yaxis,fixedrange:true,tickformat:"~s",rangemode:"tozero"}
  },plotConfig);

  const catAgg={};
  rows.forEach(r=>{const c=r.category||"Lainnya";catAgg[c]=(catAgg[c]||0)+Number(r.amount||0);});
  const cats=Object.entries(catAgg).sort((a,b)=>a[1]-b[1]);
  Plotly.newPlot("expenseMonitorCategoryChart",[{
    x:cats.map(x=>x[1]),y:cats.map(x=>x[0]),type:"bar",orientation:"h",
    hovertemplate:"<b>%{y}</b><br>Rp%{x:,.0f}<extra></extra>"
  }],{
    ...darkLayout,margin:{t:16,l:125,r:18,b:42},
    xaxis:{...darkLayout.xaxis,fixedrange:true,tickformat:"~s",rangemode:"tozero"},
    yaxis:{...darkLayout.yaxis,fixedrange:true}
  },plotConfig);

  const kpAgg={};
  rows.forEach(r=>kpAgg[r.kp_code]=(kpAgg[r.kp_code]||0)+Number(r.amount||0));
  const topKp=Object.entries(kpAgg).sort((a,b)=>b[1]-a[1]).slice(0,10).reverse();
  Plotly.newPlot("expenseMonitorKpChart",[{
    x:topKp.map(x=>x[1]),y:topKp.map(x=>x[0]),type:"bar",orientation:"h",
    hovertemplate:"<b>%{y}</b><br>Rp%{x:,.0f}<extra></extra>"
  }],{
    ...darkLayout,margin:{t:16,l:70,r:18,b:42},
    xaxis:{...darkLayout.xaxis,fixedrange:true,tickformat:"~s",rangemode:"tozero"},
    yaxis:{...darkLayout.yaxis,fixedrange:true}
  },plotConfig);

  const detailRows=rows
    .sort((a,b)=>b.expense_date.localeCompare(a.expense_date)||Number(b.amount||0)-Number(a.amount||0))
    .map(r=>[
      r.expense_date,r.kp_code,r.category||"Lainnya",r.subcategory||"—",r.description||"—",
      rupiah(r.amount),expenseSourceLabel(r),r.corrected_from?`Koreksi dari ${r.corrected_from}`:"—"
    ]);

  $("expenseMonitorDetailTable").innerHTML=detailRows.length
    ? table(["Tanggal","KP","Kategori","Subkategori","Deskripsi","Nominal","Sumber","Koreksi"],detailRows)
    : '<div class="master-empty">Belum ada pengeluaran untuk filter yang dipilih.</div>';

  const month=$("expenseMonitorMonth")?.value||"-";
  $("expenseMonitorPeriodLabel").textContent=`Periode ${month} • ${rows.length} transaksi`;
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
function annualSheetAOA(sheet){
  // Annual workbook must use the underlying/cached numeric value.
  // raw:false can turn 2,461,462 kg into displayed "2.461" and corrupt totals.
  // raw:true also preserves cached numeric results for formula cells in older sheets.
  return XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:true,blankrows:false});
}
function sheetAOARaw(sheet){
  return XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:true,blankrows:false});
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
function normalizeKpSearchText(s){
  return String(s||"").toUpperCase()
    .replace(/[_]+/g," ")
    .replace(/[^A-Z0-9-]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function hasKpToken(text,token){
  const t=normalizeKpSearchText(text);
  const variants=[
    token,
    token.replace(/-/g," "),
    token.replace(/-/g,"")
  ].map(normalizeKpSearchText).filter(Boolean);

  return variants.some(v=>{
    // exact token/phrase boundary, avoids MAN matching inside unrelated words.
    const escaped=v.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\s+/g,"\\s+");
    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`,"i").test(t);
  });
}
function inferKPFromText(text,fileName=""){
  const file=String(fileName||"").replace(/\.(xlsx|xls)$/i,"");
  const body=String(text||"");

  // Explicit aliases first.
  const aliasRules=[
    {code:"GSL-INUMAN",rx:/GSL[\s_-]*INUMAN/i},
    {code:"TKWL-2",rx:/TKWL[\s_-]*2|TKWL[\s_-]*KANDIS/i},
    {code:"TKWL-1",rx:/TKWL[\s_-]*1|TKWL[\s_-]*SIAK/i},
    {code:"ASMJ-2",rx:/ASMJ[\s_-]*2/i},
    {code:"ASMJ-1",rx:/ASMJ[\s_-]*1/i},
    {code:"MSB-2",rx:/MSB[\s_-]*2/i},
    {code:"KS2",rx:/\bKS[\s_-]*2\b|\bKS2\b/i},
    {code:"SSM",rx:/\bIIS\b|\bSSM\b/i},
    {code:"LBP",rx:/\bLBP\b|\bLPI\b/i}
  ];

  // Filename is the strongest source for monthly operational exports.
  for(const r of aliasRules){
    if(r.rx.test(file)) return r.code;
  }
  const filenameCandidates=FALLBACK_KP_CODES.slice().sort((a,b)=>b.length-a.length);
  for(const code of filenameCandidates){
    if(hasKpToken(file,code)) return code;
  }

  // Then use report title/body, still with exact token boundaries.
  for(const r of aliasRules){
    if(r.rx.test(body)) return r.code;
  }
  for(const code of filenameCandidates){
    if(hasKpToken(body,code)) return code;
  }

  return null;
}
function supplierToken(s){
  return String(s||"").toUpperCase().replace(/[^A-Z0-9]+/g,"").trim();
}
function canonSupplierForKP(kp,value){
  const token=supplierToken(value);
  if(!token || ["AGEN","SPB","DO","SUPPLIER","JENISSPB","UNKNOWN","ALL"].includes(token)) return null;
  const candidates=(MASTER_SUPPLIER_DATA||[]).filter(s=>(s.master_kp?.code||"")===kp);
  for(const s of candidates){
    const names=[s.name,s.full_name,...(s.aliases||[])].filter(Boolean);
    if(names.some(n=>supplierToken(n)===token)) return s.name;
  }
  return String(value||"").trim() || null;
}
function inferSupplierFromReport(aoa,fileName="",kp=""){
  // Primary source: metadata "Agen" near top of operational report.
  for(let r=0;r<Math.min(35,aoa.length);r++){
    const row=aoa[r]||[];
    for(let c=0;c<row.length;c++){
      if(/^agen$/i.test(String(row[c]??"").trim())){
        const candidates=[];
        for(let cc=c+1;cc<row.length;cc++) candidates.push(row[cc]);
        for(let rr=r+1;rr<Math.min(r+3,aoa.length);rr++){
          candidates.push(...(aoa[rr]||[]));
        }
        for(const raw of candidates){
          const v=String(raw??"").trim();
          if(!v) continue;
          const canonical=canonSupplierForKP(kp,v);
          if(canonical) return canonical;
        }
      }
    }
  }

  // Fallback: match supplier name/alias in filename, scoped to selected KP.
  const f=supplierToken(String(fileName||"").replace(/\.(xlsx|xls)$/i,""));
  const candidates=(MASTER_SUPPLIER_DATA||[]).filter(s=>(s.master_kp?.code||"")===kp);
  for(const s of candidates){
    const names=[s.name,s.full_name,...(s.aliases||[])].filter(Boolean)
      .sort((a,b)=>String(b).length-String(a).length);
    if(names.some(n=>f.includes(supplierToken(n)))) return s.name;
  }
  return "UNKNOWN";
}
function findReportColumns(aoa){
  // Operational reports often use a 2-row header, e.g.
  // row 1: NO. BUKTI | NO. POLISI | PEMBELIAN | TANGGAL BAYAR
  // row 2:                         TONASE | HARGA | NILAI PEMBELIAN
  // Therefore inspect each column across up to 3 consecutive header rows.
  for(let r=0;r<Math.min(80,aoa.length);r++){
    const maxCols=Math.max(
      (aoa[r]||[]).length,
      (aoa[r+1]||[]).length,
      (aoa[r+2]||[]).length
    );
    let no=-1,bukti=-1,polisi=-1,tonase=-1,date=-1;

    for(let c=0;c<maxCols;c++){
      const parts=[0,1,2].map(off=>String((aoa[r+off]||[])[c]??"").trim()).filter(Boolean);
      const s=parts.join(" ").toUpperCase().replace(/\s+/g," ");

      if(/^NO$/.test(s) || /^NO\s/.test(s) && !/BUKTI|POLISI/.test(s)) no=c;
      if(/NO\.?\s*BUKTI/.test(s)) bukti=c;
      if(/NO\.?\s*POLISI/.test(s)) polisi=c;
      if(/\bTONASE\b/.test(s)) tonase=c;
      if(/TANGGAL\s*BAYAR|^TANGGAL$|\bTGL\b/.test(s)) date=c;
    }

    // For ASMJ-style reports, proof may exist but is not mandatory on every transaction.
    if(no>=0 && polisi>=0 && tonase>=0){
      return {row:r,headerRows:3,no,bukti,polisi,tonase,date};
    }
  }
  return null;
}
function isTransactionSequence(v){
  if(typeof v==="number") return Number.isFinite(v) && v>0;
  const s=String(v??"").trim();
  return /^\d+$/.test(s) && Number(s)>0;
}
function reportTonnageKg(rawValue,formattedValue){
  // In operational purchase reports, TONASE is already stored as kilograms:
  // examples: 4892, 8512, 26469. Do NOT multiply by 1000.
  if(typeof rawValue==="number" && Number.isFinite(rawValue) && rawValue>0){
    return Math.round(rawValue);
  }
  const n=parseExcelNumber(formattedValue);
  return n>0 ? Math.round(n) : 0;
}
function findReportPeriod(aoa,fileName=""){
  const monthNames="Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember";
  for(let r=0;r<Math.min(30,aoa.length);r++){
    for(const cell of (aoa[r]||[])){
      const s=String(cell??"").trim();
      const m=s.match(new RegExp(
        `(\\d{1,2}\\s+(?:${monthNames})\\s+\\d{4})\\s*(?:s\\.?\\s*d\\.?|sampai|-)\\s*`+
        `(\\d{1,2}\\s+(?:${monthNames})\\s+\\d{4})`,
        "i"
      ));
      if(m){
        const start=parseOperationalDate(m[1]);
        const end=parseOperationalDate(m[2]);
        if(start && end) return {start,end,source:"header"};
      }

      const one=s.match(new RegExp(`(\\d{1,2}\\s+(?:${monthNames})\\s+\\d{4})`,"i"));
      if(one){
        const d=parseOperationalDate(one[1]);
        if(d){
          const [y,mo]=d.split("-").map(Number);
          const last=new Date(y,mo,0).getDate();
          return {
            start:`${y}-${String(mo).padStart(2,"0")}-01`,
            end:`${y}-${String(mo).padStart(2,"0")}-${String(last).padStart(2,"0")}`,
            source:"header-month"
          };
        }
      }
    }
  }

  // Filename fallback, e.g. "SKA DSS JULI 2026.xlsx".
  const f=String(fileName||"");
  const fm=f.match(new RegExp(`(?:${monthNames})\\s+(20\\d{2})`,"i"));
  if(fm){
    const monthWord=(f.match(new RegExp(`(${monthNames})`,"i"))||[])[1];
    const mo=MONTH_ID[String(monthWord||"").toLowerCase()];
    const y=Number(fm[1]);
    if(mo && y){
      const last=new Date(y,mo,0).getDate();
      return {
        start:`${y}-${String(mo).padStart(2,"0")}-01`,
        end:`${y}-${String(mo).padStart(2,"0")}-${String(last).padStart(2,"0")}`,
        source:"filename"
      };
    }
  }
  return null;
}
function dateInPeriod(date,period){
  return !!date && !!period && date>=period.start && date<=period.end;
}
function findNextTransactionDate(aoa,startRow,dateCol,period=null,limit=80){
  if(dateCol<0) return null;
  for(let r=startRow+1;r<Math.min(aoa.length,startRow+limit);r++){
    const d=parseOperationalDate((aoa[r]||[])[dateCol]);
    if(d && (!period || dateInPeriod(d,period))) return d;
  }
  return null;
}
function findDeclaredReportTotal(aoa,rawAoa,cols){
  for(let r=cols.row+1;r<aoa.length;r++){
    const first=String((aoa[r]||[])[cols.no]??"").trim().toUpperCase();
    if(/^TOTAL$|^JUMLAH$/.test(first)){
      const kg=reportTonnageKg((rawAoa[r]||[])[cols.tonase],(aoa[r]||[])[cols.tonase]);
      if(kg>0) return kg;
    }
  }
  return null;
}
function parseMonthlyReportSheet(sheet,sheetName,fileName){
  const aoa=sheetAOA(sheet);
  const rawAoa=sheetAOARaw(sheet);
  const flat=aoa.slice(0,35).flat().filter(v=>v!=null).join(" ");
  const kp=inferKPFromText(flat,fileName);
  const cols=findReportColumns(aoa);
  const period=findReportPeriod(aoa,fileName);

  if(!kp || !cols || !period){
    return {
      daily:[],unassignedRows:[],recognized:false,
      reason:!kp
        ? "KP tidak terdeteksi"
        : !cols
          ? "Header transaksi bertingkat (No / No Polisi / Tonase) tidak ditemukan"
          : "Periode laporan tidak terdeteksi"
    };
  }

  const supplier=inferSupplierFromReport(aoa,fileName,kp);
  if(!supplier || supplier==="UNKNOWN"){
    return {daily:[],unassignedRows:[],recognized:false,reason:"Supplier/Agen tidak terdeteksi"};
  }

  const dailyMap=new Map();
  const unassignedRows=[];
  let acceptedTransactions=0;
  let blankProofTransactions=0;
  let skippedNumericRows=0;
  let outsidePeriodPayments=0;
  let blankPaymentDates=0;

  for(let r=cols.row+1;r<aoa.length;r++){
    const row=aoa[r]||[];
    const rawRow=rawAoa[r]||[];

    const seq=row[cols.no];
    const plate=String(row[cols.polisi]??"").trim();
    const tonKg=reportTonnageKg(rawRow[cols.tonase],row[cols.tonase]);

    // Only numbered vehicle transactions count.
    const validTransaction=isTransactionSequence(seq) && !!plate && tonKg>0;
    if(!validTransaction){
      if(tonKg>0) skippedNumericRows++;
      continue;
    }

    const proof=cols.bukti>=0 ? String(row[cols.bukti]??"").trim() : "";
    if(!proof) blankProofTransactions++;

    const paymentDate=cols.date>=0 ? parseOperationalDate(row[cols.date]) : null;
    let rowDate=null;

    if(paymentDate && dateInPeriod(paymentDate,period)){
      rowDate=paymentDate;
    }else if(paymentDate && !dateInPeriod(paymentDate,period)){
      // Keep legacy operational rule for a dated payment just outside the
      // report window: allocate to period end, but explicitly report it.
      rowDate=period.end;
      outsidePeriodPayments++;
    }else{
      // CRITICAL AUDIT RULE:
      // blank TANGGAL BAYAR is not proof of 1 August / previous date.
      // Keep the transaction unassigned so it cannot inflate a daily closing.
      blankPaymentDates++;
      unassignedRows.push({
        kp_code:kp,
        supplier_name:supplier,
        tonnage_kg:tonKg,
        trip_count:1,
        plate,
        proof:proof||null,
        sequence:seq,
        source_file:`MONTHLY:FINAL:${fileName}`
      });
      continue;
    }

    const key=`${rowDate}|${kp}|${supplier}`;
    const prev=dailyMap.get(key)||{
      report_date:rowDate,
      kp_code:kp,
      supplier_name:supplier,
      tonnage_kg:0,
      trip_count:0,
      source_file:`MONTHLY:FINAL:${fileName}`
    };
    prev.tonnage_kg+=tonKg;
    prev.trip_count+=1;
    dailyMap.set(key,prev);
    acceptedTransactions++;
  }

  const daily=[...dailyMap.values()];
  const parsedTotal=daily.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
  const unassignedTonnage=unassignedRows.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
  const accountedTotal=parsedTotal+unassignedTonnage;
  const declaredTotal=findDeclaredReportTotal(aoa,rawAoa,cols);
  const totalDiff=declaredTotal==null ? null : accountedTotal-declaredTotal;
  const integrityOk=declaredTotal==null ? true : Math.abs(totalDiff)<=1;

  return {
    daily,
    unassignedRows,
    recognized:(acceptedTransactions+unassignedRows.length)>0,
    kp,supplier,period,
    acceptedTransactions,
    blankProofTransactions,
    skippedNumericRows,
    outsidePeriodPayments,
    blankPaymentDates,
    parsedTotal,
    unassignedTonnage,
    accountedTotal,
    declaredTotal,
    totalDiff,
    integrityOk,
    reason:(acceptedTransactions+unassignedRows.length)?"":"Tidak ada baris transaksi valid"
  };
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
  let unassignedRows=[];
  let recognizedSheets=0;
  const notes=[];
  const integrityIssues=[];
  let declaredTotalSum=0;
  let declaredSheets=0;
  let accountedTotalSum=0;

  wb.SheetNames.forEach(name=>{
    const sheet=wb.Sheets[name];
    const report=parseMonthlyReportSheet(sheet,name,fileName);

    if(report.recognized && (report.daily.length || report.unassignedRows?.length)){
      daily.push(...report.daily);
      unassignedRows.push(...(report.unassignedRows||[]));
      recognizedSheets++;
      accountedTotalSum+=Number(report.accountedTotal||0);
      if(report.declaredTotal!=null){
        declaredTotalSum+=Number(report.declaredTotal||0);
        declaredSheets++;
      }

      notes.push(
        `${name}: ${report.kp} / ${report.supplier}`+
        ` / periode ${report.period.start} s.d ${report.period.end}`+
        ` / ${report.acceptedTransactions} transaksi bertanggal`+
        ` / ${report.blankPaymentDates} transaksi tanpa tanggal`+
        (report.unassignedTonnage
          ? ` (${kg(report.unassignedTonnage)} TIDAK dialokasikan otomatis)`
          : "")+
        ` / ${report.outsidePeriodPayments} pembayaran di luar periode dialokasikan ke akhir periode`+
        ` / ${report.blankProofTransactions} transaksi tanpa No. Bukti`+
        ` / ${report.skippedNumericRows} baris angka non-transaksi diabaikan`+
        (report.declaredTotal!=null
          ? ` / Total Excel ${kg(report.declaredTotal)} → ${report.integrityOk?"COCOK (termasuk unassigned)":"SELISIH"}`
          : "")
      );

      if(!report.integrityOk){
        integrityIssues.push(
          `${name}: transaksi bertanggal + unassigned ${kg(report.accountedTotal)} ≠ Total Excel ${kg(report.declaredTotal)}`
        );
      }
      return;
    }

    const simple=parseMonthlySimpleTable(sheet,name,fileName).map(r=>({
      ...r,
      source_file:`MONTHLY:FINAL:${fileName}`
    }));
    if(simple.length){
      daily.push(...simple);
      recognizedSheets++;
      notes.push(`${name}: tabel sederhana / ${simple.length} baris`);
    }else{
      notes.push(`${name}: belum dikenali (${report.reason||"format tidak sesuai"})`);
    }
  });

  daily=combineDailyRows(daily);
  const unassignedTonnage=unassignedRows.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);

  return {
    fileName,daily,unassignedRows,unassignedTonnage,
    recognizedSheets,notes,
    declaredTotalSum:declaredSheets?declaredTotalSum:null,
    declaredSheets,
    accountedTotalSum,
    integrityOk:integrityIssues.length===0,
    integrityIssues
  };
}
function monthlyGroupKey(r){
  const [y,m]=String(r.report_date).split("-").map(Number);
  return `${y}|${m}|${r.kp_code}`;
}
async function validateMonthlyAgainstAnnual(dailyRows){
  const grouped=new Map();
  dailyRows.forEach(r=>{
    const [year,month]=r.report_date.split("-").map(Number);
    const key=`${year}|${month}|${r.kp_code}`;
    const g=grouped.get(key)||{
      year,month,kp_code:r.kp_code,
      parsed_kg:0,trips:0,suppliers:new Set()
    };
    g.parsed_kg+=Number(r.tonnage_kg||0);
    g.trips+=Number(r.trip_count||0);
    g.suppliers.add(r.supplier_name);
    grouped.set(key,g);
  });

  const result=[];
  for(const g of grouped.values()){
    const {data:refData,error}=await db.from("historical_summary")
      .select("tonnage_kg,source_file")
      .eq("year",g.year).eq("month",g.month).eq("kp_code",g.kp_code)
      .maybeSingle();

    if(error){
      result.push({...g,status:"ERROR",reference_kg:null,diff_kg:null,block:false,note:error.message});
      continue;
    }

    if(!refData){
      result.push({
        ...g,status:"TANPA REFERENSI",reference_kg:null,diff_kg:null,block:false,
        note:"Data tahunan belum tersedia untuk pembanding."
      });
      continue;
    }

    const reference=Number(refData.tonnage_kg||0);
    const diff=g.parsed_kg-reference;
    const tolerance=Math.max(1000,reference*0.002); // 0.2% or 1 ton
    const abs=Math.abs(diff);

    let status="BELUM LENGKAP";
    let block=false;
    let note="Total file yang dipilih masih di bawah referensi tahunan; kemungkinan supplier lain belum diupload.";

    if(abs<=tolerance){
      status="COCOK";
      note="Total bulanan sesuai referensi tahunan.";
    }else if(diff>tolerance){
      status="MELEBIHI REFERENSI";
      block=true;
      note="Total hasil parser melebihi referensi tahunan. Simpan diblokir untuk mencegah double count/subtotal.";
    }

    result.push({
      ...g,
      reference_kg:reference,
      diff_kg:diff,
      diff_pct:reference?diff/reference*100:null,
      reference_source:refData.source_file,
      status,block,note
    });
  }
  return result;
}

async function previewDailyExcels(fileList){
  try{
    const files=[...(fileList||[])];
    if(!files.length) throw Error("Pilih minimal 1 file Excel Harian.");

    const previews=[];
    let allRows=[];

    for(const file of files){
      const wb=await readWorkbookFile(file);
      const p=parseMonthlyWorkbook(wb,file.name);
      previews.push(p);
      allRows.push(...(p.daily||[]).map(r=>({
        ...r,
        source_file:`DAILY:${file.name}`
      })));
    }

    const availableDates=[...new Set(allRows.map(r=>r.report_date).filter(Boolean))].sort();
    const manualDate=$("dailyExcelDate")?.value || null;
    let selectedDate=manualDate;

    if(!selectedDate && availableDates.length===1){
      selectedDate=availableDates[0];
      if($("dailyExcelDate")) $("dailyExcelDate").value=selectedDate;
    }
    if(!selectedDate){
      selectedDate=$("monitorDate")?.value || null;
    }
    if(!selectedDate){
      throw Error(
        availableDates.length>1
          ? `File berisi ${availableDates.length} tanggal. Pilih Tanggal Data Harian terlebih dahulu.`
          : "Tanggal data tidak dapat ditentukan. Pilih Tanggal Data Harian."
      );
    }

    const selectedTime=$("dailyExcelTime")?.value || "00:00:00";
    const mode=selectedTime==="00:00:00" ? "closing" : "snapshot";

    let extracted=allRows.filter(r=>r.report_date===selectedDate);
    extracted=combineDailyRows(extracted);

    const badFiles=previews.filter(p=>!p.integrityOk);
    const kpSet=new Set(extracted.map(r=>r.kp_code));
    const supplierSet=new Set(extracted.map(r=>`${r.kp_code}/${r.supplier_name}`));
    const tonTotal=extracted.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
    const tripTotal=extracted.reduce((a,r)=>a+Number(r.trip_count||0),0);

    DAILY_EXCEL_PREVIEW={
      date:selectedDate,
      time:selectedTime,
      mode,
      files:files.map(f=>f.name),
      daily:extracted,
      fileResults:previews,
      integrityBlocked:badFiles,
      availableDates,
      total:tonTotal,
      trips:tripTotal
    };

    if($("monitorDate")) $("monitorDate").value=selectedDate;

    $("dailyExcelPreview").textContent=
      `MODE: ${mode==="closing"?"CLOSING / TOTAL HARIAN":"SNAPSHOT EXCEL"}\n`+
      `Tanggal data: ${selectedDate}${manualDate?" (pilihan manual)":availableDates.length===1?" (otomatis dari file)":" (filter Monitoring)"}\n`+
      `Jam data: ${selectedTime.slice(0,5)}\n`+
      `Tanggal tersedia di file: ${availableDates.length?availableDates.join(", "):"tidak terdeteksi"}\n`+
      `File dipilih: ${files.length}\n`+
      `KP terbaca: ${kpSet.size}\n`+
      `Supplier terbaca: ${supplierSet.size}\n`+
      `Baris KP/Supplier: ${extracted.length}\n`+
      `Total trip: ${tripTotal.toLocaleString("id-ID")}\n`+
      `${mode==="closing"?"TOTAL KESELURUHAN HARI":"TOTAL SNAPSHOT"}: ${kg(tonTotal)}\n\n`+
      (mode==="closing"
        ? `Jam 00.00 akan disimpan sebagai Closing final harian dan menjadi pembanding snapshot 17.00.`
        : `Jam ${selectedTime.slice(0,5)} akan disimpan sebagai snapshot Excel pada tanggal ${selectedDate}.`)+
      (!extracted.length
        ? `\n\nPERINGATAN: Tidak ada transaksi tanggal ${selectedDate} di file yang dipilih.`
        : "")+
      (badFiles.length
        ? `\n\nSIMPAN AKAN DIBLOKIR:\n${badFiles.map(f=>`• ${f.fileName}: ${f.integrityIssues?.join("; ")||"Total parser tidak cocok dengan Total Excel"}`).join("\n")}`
        : "");
  }catch(e){
    DAILY_EXCEL_PREVIEW=null;
    $("dailyExcelPreview").textContent="ERROR: "+e.message;
  }
}
async function saveDailyExcel(){
  if(!DAILY_EXCEL_PREVIEW) return alert("Pilih dan Preview Excel Harian dahulu.");
  const p=DAILY_EXCEL_PREVIEW;

  if(!p.daily.length){
    return alert(`Tidak ada transaksi untuk tanggal ${p.date} pada file yang dipilih.`);
  }

  if((p.integrityBlocked||[]).length){
    return alert(
      "SIMPAN DIBLOKIR.\n\n"+
      p.integrityBlocked.map(f=>`${f.fileName}: total parser belum cocok dengan Total Excel.`).join("\n")
    );
  }

  if(p.mode==="closing"){
    // 00.00 = authoritative final daily total.
    const chunkSize=500;
    for(let i=0;i<p.daily.length;i+=chunkSize){
      const {error}=await db.from("kp_daily_history")
        .upsert(p.daily.slice(i,i+chunkSize),{
          onConflict:"report_date,kp_code,supplier_name"
        });
      if(error) return alert("Gagal menyimpan Closing Excel Harian: "+error.message);
    }

    alert(
      `CLOSING EXCEL 00.00 BERHASIL DISIMPAN ✓\n\n`+
      `Tanggal: ${p.date}\n`+
      `Total: ${kg(p.total)}\n`+
      `Trip: ${p.trips.toLocaleString("id-ID")}\n`+
      `Baris KP/Supplier: ${p.daily.length}\n\n`+
      `Data menjadi total final keseluruhan hari tersebut.`
    );
  }else{
    // 10/12/15/17 = operational snapshot from Excel upload.
    const {data:s,error}=await db.from("monitoring_snapshots").upsert({
      report_date:p.date,
      snapshot_time:p.time,
      total_tonnage_kg:p.total,
      total_trips:p.trips,
      source_type:"excel_upload",
      raw_text:`EXCEL HARIAN: ${p.files.join(", ")}`,
      status:"validated"
    },{onConflict:"report_date,snapshot_time"}).select().single();

    if(error) return alert("Gagal menyimpan Snapshot Excel: "+error.message);

    await db.from("monitoring_snapshot_details").delete().eq("snapshot_id",s.id);
    const payload=p.daily.map(r=>({
      snapshot_id:s.id,
      kp_code:r.kp_code,
      supplier_name:r.supplier_name,
      tonnage_kg:Number(r.tonnage_kg||0),
      trip_count:Number(r.trip_count||0)
    }));
    const {error:e2}=await db.from("monitoring_snapshot_details").insert(payload);
    if(e2) return alert("Snapshot tersimpan, tetapi detail gagal: "+e2.message);

    alert(
      `SNAPSHOT EXCEL BERHASIL DISIMPAN ✓\n\n`+
      `Tanggal: ${p.date}\n`+
      `Jam: ${p.time.slice(0,5)}\n`+
      `Total: ${kg(p.total)}\n`+
      `Trip: ${p.trips.toLocaleString("id-ID")}`
    );
  }

  if($("monitorDate")) $("monitorDate").value=p.date;
  DAILY_EXCEL_PREVIEW=null;
  if($("dailyExcelFile")) $("dailyExcelFile").value="";
  $("dailyExcelPreview").textContent="Belum ada file harian dipilih.";
  await loadKPDaily($("monitorKp").value||"ALL");
  await loadDashboard();
}


function detailPasteNumber(value){
  const s=String(value??"")
    .replace(/[＊*_`]/g,"")
    .replace(/Rp\.?/gi,"")
    .replace(/[^\d,.\-]/g,"")
    .trim();
  if(!s) return 0;

  // Operational report uses Indonesian thousand separators:
  // 5.214 => 5,214 kg; 1.319.451 => 1,319,451 kg.
  if(/^-?\d{1,3}(?:\.\d{3})+$/.test(s)) return Number(s.replace(/\./g,""));
  if(/^-?\d{1,3}(?:,\d{3})+$/.test(s)) return Number(s.replace(/,/g,""));
  if(/^-?\d+$/.test(s)) return Number(s);
  return Number(s.replace(/\./g,"").replace(",", ".")) || 0;
}

function cleanDetailPasteCell(v){
  return String(v??"")
    .replace(/\u00a0/g," ")
    .replace(/[＊*_`]/g,"")
    .replace(/\s+/g," ")
    .trim();
}

function splitDetailPasteLine(raw){
  // Keep the original line intact. Trailing TABs are meaningful because they
  // represent blank Tanggal Bayar / Keterangan cells on HOLD transactions.
  const original=String(raw??"").replace(/\r$/,"");
  if(!original.trim()) return [];

  // Clipboard from browser/internal system: preserve EVERY empty column.
  if(original.includes("\t")){
    return original.split("\t").map(cleanDetailPasteCell);
  }

  const line=original.trim();

  // Markdown table.
  if(line.includes("|")){
    return line
      .replace(/^\s*\|/,"")
      .replace(/\|\s*$/,"")
      .split("|")
      .map(cleanDetailPasteCell);
  }

  // Fallback for plain-text table copied without tabs.
  const m=line.match(
    /^\s*(\d+)\s+([A-Z0-9\/\-]*)\s+([A-Z]{1,2}\s*\d{1,4}\s*[A-Z]{1,3})\s+(.+?)\s+([\d.]+)\s+(Rp\.?\s*[\d.]+)\s+(Rp\.?\s*[\d.]+)(?:\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4}))?(?:\s+(.+?))?\s*$/i
  );
  return m ? m.slice(1).map(cleanDetailPasteCell) : [];
}

function findPasteDetailPeriod(text){
  const monthNames="Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember";
  const source=String(text||"").replace(/\u00a0/g," ");
  const m=source.match(new RegExp(
    `(\\d{1,2}\\s+(?:${monthNames})\\s+\\d{4})\\s*(?:s\\.?\\s*d\\.?|sampai|-)\\s*`+
    `(\\d{1,2}\\s+(?:${monthNames})\\s+\\d{4})`,
    "i"
  ));
  if(!m) return null;
  const start=parseOperationalDate(m[1]);
  const end=parseOperationalDate(m[2]);
  return start&&end ? {start,end} : null;
}

function detailStableKey(row){
  return [
    row.period_start||"",
    canonKP(row.kp_code||""),
    supplierToken(row.supplier_name||""),
    Number(row.sequence_no||0),
    String(row.vehicle_plate||"").toUpperCase().replace(/\s+/g,""),
    Number(row.tonnage_kg||0),
    supplierToken(row.agent_name||"")
  ].join("|");
}

function detailTransactionKey(row){
  // v4.10.4: stable across HOLD -> PAID transition.
  return detailStableKey(row);
}


function detectPasteDetailKp(text){
  const explicit=String(text||"").match(/\b(?:KP|KANTOR)\s*[.:\-]?\s*(ASMJ[\s-]*[12]|TKWL[\s-]*[12]|MSB[\s-]*2|KS[\s-]*2|[A-Z]{2,12}(?:-[A-Z0-9]+)?)\b/i);
  if(explicit) return canonKP(explicit[1]);

  // Fallback to known master token present in the copied report.
  const found=[];
  for(const code of FALLBACK_KP_CODES){
    const rx=new RegExp(`(?:^|[^A-Z0-9])${String(code).replace(/-/g,"[\\s-]*")}(?:[^A-Z0-9]|$)`,"i");
    if(rx.test(String(text||""))) found.push(code);
  }
  return found.length===1 ? found[0] : null;
}

function syncPasteDetailSuppliers(){
  const kp=$("pasteDetailKp")?.value||"";
  const select=$("pasteDetailSupplier");
  if(!select) return;

  const suppliers=(MASTER_SUPPLIER_DATA||[])
    .filter(s=>s.active && (s.master_kp?.code||"")===kp)
    .sort((a,b)=>String(a.name).localeCompare(String(b.name)));

  select.innerHTML='<option value="">Pilih Supplier / SPB</option>'+
    suppliers.map(s=>`<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}${s.full_name&&s.full_name!==s.name?` — ${escapeHtml(s.full_name)}`:""}</option>`).join("");

  if(suppliers.length===1) select.value=suppliers[0].name;
}

function detectPasteDetailMetadata(){
  const raw=$("pasteDetailText")?.value||"";
  if(!$("pasteDetailKp")) return;
  if(!$("pasteDetailKp").value){
    const detected=detectPasteDetailKp(raw);
    if(detected && [...$("pasteDetailKp").options].some(o=>o.value===detected)){
      $("pasteDetailKp").value=detected;
      syncPasteDetailSuppliers();
    }
  }
}

function parsePastedDetailTable(text,kp,supplier){
  if(!kp) throw Error("Pilih KP terlebih dahulu.");
  if(!supplier) throw Error("Pilih Supplier / SPB terlebih dahulu.");

  const period=findPasteDetailPeriod(text);
  const transactions=[];
  let declaredTotal=null;
  let purchaseDeclared=null;
  let ignored=0;
  let paddedHoldRows=0;

  for(const rawLine of String(text||"").split(/\r?\n/)){
    const cells=splitDetailPasteLine(rawLine);
    if(!cells.length) continue;

    const first=cleanDetailPasteCell(cells[0]);
    if(/^[-:]+$/.test(first) || /NO\.?\s*BUKTI|NO\.?\s*POLISI|TONASEHARGA|NAMA PETANI/i.test(cells.join(" "))){
      continue;
    }

    if(/^TOTAL\b/i.test(first)){
      const nums=cells.slice(1).map(detailPasteNumber).filter(n=>n>0);
      if(nums.length) declaredTotal=nums[0];
      const rpCell=cells.slice(1).find(v=>/Rp/i.test(v));
      if(rpCell) purchaseDeclared=detailPasteNumber(rpCell);
      continue;
    }

    if(!/^\d+$/.test(first)){
      ignored++;
      continue;
    }
    if(cells.length<7){
      ignored++;
      continue;
    }

    // Some clipboard implementations omit trailing empty cells entirely.
    // Pad them so index 7 remains Tanggal Bayar and index 8 remains Keterangan.
    const originalCellCount=cells.length;
    while(cells.length<9) cells.push("");
    if(originalCellCount>=7 && originalCellCount<9) paddedHoldRows++;

    const sequence=Number(first);
    const proof=cleanDetailPasteCell(cells[1]);
    const plate=cleanDetailPasteCell(cells[2]).toUpperCase();
    const agent=cleanDetailPasteCell(cells[3]);
    const tonnage=detailPasteNumber(cells[4]);
    const price=detailPasteNumber(cells[5]);
    const purchase=detailPasteNumber(cells[6]);
    const date=parseOperationalDate(cells[7]);
    const payment=cleanDetailPasteCell(cells.slice(8).join(" ")) || null;

    if(!plate || !tonnage){
      ignored++;
      continue;
    }

    const row={
      report_date:date||null,
      period_start:period?.start||null,
      period_end:period?.end||null,
      kp_code:kp,
      supplier_name:supplier,
      sequence_no:sequence,
      proof_no:proof||null,
      vehicle_plate:plate,
      agent_name:agent||null,
      tonnage_kg:Math.round(tonnage),
      price_per_kg:price||null,
      purchase_value:purchase||null,
      payment_method:payment,
      payment_status:date?"paid":"hold",
      trip_count:1,
      raw_line:String(rawLine||"").trim(),
      source_type:"paste_detail"
    };
    row.stable_key=detailStableKey(row);
    row.transaction_key=row.stable_key;
    transactions.push(row);
  }

  if(!transactions.length){
    throw Error("Tidak ada baris transaksi detail yang berhasil dibaca.");
  }

  const paidTransactions=transactions.filter(r=>r.payment_status==="paid");
  const holdTransactions=transactions.filter(r=>r.payment_status==="hold");
  const totalKg=transactions.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
  const paidKg=paidTransactions.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
  const holdKg=holdTransactions.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
  const purchaseTotal=transactions.reduce((a,r)=>a+Number(r.purchase_value||0),0);
  const dates=paidTransactions.map(r=>r.report_date).filter(Boolean).sort();

  return {
    kp,supplier,period,
    transactions,paidTransactions,holdTransactions,
    totalKg,paidKg,holdKg,purchaseTotal,declaredTotal,purchaseDeclared,
    integrityOk:declaredTotal==null || declaredTotal===totalKg,
    purchaseIntegrityOk:purchaseDeclared==null || purchaseDeclared===purchaseTotal,
    ignored,paddedHoldRows,
    startDate:period?.start || dates[0] || null,
    endDate:period?.end || dates[dates.length-1] || null
  };
}

async function fetchExistingDetailStableRows(transactions){
  const keys=[...new Set((transactions||[]).map(r=>r.stable_key).filter(Boolean))];
  if(!keys.length) return new Map();

  const found=new Map();
  const chunkSize=150;
  for(let i=0;i<keys.length;i+=chunkSize){
    const chunk=keys.slice(i,i+chunkSize);
    const {data,error}=await db.from("tonnage_detail_transactions")
      .select("stable_key,report_date,payment_status,proof_no,tonnage_kg,vehicle_plate,agent_name")
      .in("stable_key",chunk);
    if(error) throw Error("Gagal memeriksa double transaksi detail: "+error.message);
    (data||[]).forEach(r=>found.set(r.stable_key,r));
  }
  return found;
}

async function comparePasteDetailPeriodToClosing(parsed){
  if(!parsed.startDate || !parsed.endDate){
    throw Error("Periode laporan tidak terdeteksi. Pastikan baris 'Tanggal ... s.d ...' ikut dicopy.");
  }

  let q=db.from("kp_daily_history")
    .select("report_date,kp_code,supplier_name,tonnage_kg,trip_count,source_file")
    .gte("report_date",parsed.startDate)
    .lte("report_date",parsed.endDate)
    .eq("kp_code",parsed.kp)
    .eq("supplier_name",parsed.supplier)
    .order("report_date",{ascending:true});

  const {data,error}=await q;
  if(error) throw Error("Gagal membaca Closing Harian untuk rekonsiliasi: "+error.message);

  const canonical=summarizeClosingHistory(data||[]).selected;
  const closingTotal=canonical.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
  const closingTrips=canonical.reduce((a,r)=>a+Number(r.trip_count||0),0);
  const closingDays=new Set(canonical.map(r=>r.report_date)).size;

  return {
    closingRows:canonical,
    closingTotal,
    closingTrips,
    closingDays,
    correctionKg:Number(parsed.totalKg||0)-closingTotal,
    correctionTrips:Number(parsed.transactions.length||0)-closingTrips,
    sourceLabel:canonical.length?closingSourceLabelForRows(canonical):"Belum ada Closing"
  };
}


async function fetchExistingDetailTransactions(transactions){
  const found=await fetchExistingDetailStableRows(transactions);
  return new Set(found.keys());
}

function pastedDetailToDaily(parsed){
  const map=new Map();
  (parsed.transactions||[]).forEach(r=>{
    const key=`${r.report_date}|${parsed.kp}|${parsed.supplier}`;
    const prev=map.get(key)||{
      report_date:r.report_date,
      kp_code:parsed.kp,
      supplier_name:parsed.supplier,
      tonnage_kg:0,
      trip_count:0,
      source_file:`PASTE:FINAL:DETAIL:${parsed.kp}:${parsed.supplier}`
    };
    prev.tonnage_kg+=Number(r.tonnage_kg||0);
    prev.trip_count+=1;
    map.set(key,prev);
  });
  return [...map.values()].sort((a,b)=>a.report_date.localeCompare(b.report_date));
}

function monthlyFinalSourceLabel(p=MONTHLY_EXCEL_PREVIEW){
  return p?.sourceMode==="paste_detail" ? "Paste Detail Final" : "Excel Final";
}

function ensureFinalSourceFile(row,p=MONTHLY_EXCEL_PREVIEW){
  const s=String(row?.source_file||"");
  if(s.startsWith("PASTE:FINAL:") || s.startsWith("MONTHLY:FINAL:")) return s;
  return p?.sourceMode==="paste_detail"
    ? `PASTE:FINAL:DETAIL:${row.kp_code}:${row.supplier_name}`
    : `MONTHLY:FINAL:${s||"UPLOAD"}`;
}


function setPasteDetailSaveState(enabled=false){
  const btn=$("pasteDetailSaveBtn");
  if(!btn) return;
  btn.disabled=!enabled;
  btn.classList.toggle("is-ready",!!enabled);
  btn.textContent=enabled ? "Simpan Paste sebagai FINAL" : "Preview dahulu untuk menyimpan";
}

async function savePastedDetailFinal(){
  const p=MONTHLY_EXCEL_PREVIEW;
  if(!p || p.sourceMode!=="paste_detail"){
    return alert(
      "Preview Paste Detail terlebih dahulu.\n\n"+
      "Klik 'Preview Audit Paste Detail', periksa hasil audit, lalu tombol Simpan Paste sebagai FINAL akan aktif."
    );
  }
  if(p.finalBlocked){
    return alert("SIMPAN FINAL DIBLOKIR.\n\nPerbaiki masalah integritas pada Preview terlebih dahulu.");
  }

  const parsed=p.parsedDetail;
  const rec=p.reconciliation;
  if(!parsed?.period){
    return alert("SIMPAN FINAL DIBLOKIR.\n\nPeriode laporan tidak terdeteksi.");
  }

  // Recheck operational Closing immediately before save.
  let latestRec;
  try{
    latestRec=await comparePasteDetailPeriodToClosing(parsed);
  }catch(e){
    return alert(e.message);
  }

  const purchaseWarning=(p.integrityWarnings||[]).length
    ? `\nPERINGATAN NILAI PEMBELIAN:\n${p.integrityWarnings.map(x=>"• "+x.message).join("\n")}\n`
    : "";

  const ok=confirm(
    "KONFIRMASI SIMPAN PASTE FINAL\n\n"+
    `KP / Supplier      : ${parsed.kp} / ${parsed.supplier}\n`+
    `Periode            : ${parsed.startDate} s.d. ${parsed.endDate}\n`+
    `Total Paste Final  : ${kg(parsed.totalKg)}\n`+
    `PAID               : ${kg(parsed.paidKg)} / ${parsed.paidTransactions.length} trip\n`+
    `HOLD               : ${kg(parsed.holdKg)} / ${parsed.holdTransactions.length} trip\n`+
    `Akumulasi Closing  : ${kg(latestRec.closingTotal)}\n`+
    `Koreksi Otomatis   : ${latestRec.correctionKg>=0?"+":""}${kg(latestRec.correctionKg)}\n`+
    purchaseWarning+"\n"+
    "Tonase adalah data utama untuk penyimpanan Final.\n"+
    "Paste Final tidak akan mengganti tanggal Closing Harian.\n"+
    "Koreksi disimpan di level periode agar tidak membuat tanggal transaksi palsu.\n\n"+
    "Klik OK untuk menyimpan."
  );
  if(!ok) return;

  const chunkSize=300;
  let detailWritten=0;

  const detailRows=(parsed.transactions||[]).map(r=>({
    report_date:r.report_date,
    period_start:parsed.startDate,
    period_end:parsed.endDate,
    kp_code:r.kp_code,
    supplier_name:r.supplier_name,
    sequence_no:r.sequence_no,
    proof_no:r.proof_no,
    vehicle_plate:r.vehicle_plate,
    agent_name:r.agent_name,
    tonnage_kg:r.tonnage_kg,
    price_per_kg:r.price_per_kg,
    purchase_value:r.purchase_value,
    payment_method:r.payment_method,
    payment_status:r.payment_status,
    stable_key:r.stable_key,
    transaction_key:r.stable_key,
    raw_line:r.raw_line,
    source_type:"paste_detail"
  }));

  for(let i=0;i<detailRows.length;i+=chunkSize){
    const chunk=detailRows.slice(i,i+chunkSize);
    const {data,error}=await db.from("tonnage_detail_transactions")
      .upsert(chunk,{onConflict:"stable_key"})
      .select("id");
    if(error) return alert("Gagal menyimpan detail transaksi:\n"+error.message);
    detailWritten+=data?.length||chunk.length;
  }

  const recPayload={
    period_start:parsed.startDate,
    period_end:parsed.endDate,
    kp_code:parsed.kp,
    supplier_name:parsed.supplier,
    paste_total_kg:parsed.totalKg,
    paste_trip_count:parsed.transactions.length,
    paid_tonnage_kg:parsed.paidKg,
    paid_trip_count:parsed.paidTransactions.length,
    hold_tonnage_kg:parsed.holdKg,
    hold_trip_count:parsed.holdTransactions.length,
    closing_total_kg:latestRec.closingTotal,
    closing_trip_count:latestRec.closingTrips,
    reconciliation_kg:latestRec.correctionKg,
    reconciliation_trip_count:latestRec.correctionTrips,
    source_type:"paste_detail",
    raw_text:p.rawPaste,
    updated_at:new Date().toISOString()
  };

  const {error:recError}=await db.from("tonnage_period_reconciliation")
    .upsert(recPayload,{onConflict:"period_start,kp_code,supplier_name"});
  if(recError){
    return alert(
      "Detail transaksi sudah tersimpan, tetapi Rekonsiliasi Periode gagal disimpan.\n\n"+
      recError.message
    );
  }

  alert(
    `PASTE DETAIL FINAL BERHASIL DISIMPAN ✓\n\n`+
    `Total Final       : ${kg(parsed.totalKg)}\n`+
    `Trip              : ${parsed.transactions.length}\n`+
    `PAID              : ${kg(parsed.paidKg)} / ${parsed.paidTransactions.length} trip\n`+
    `HOLD              : ${kg(parsed.holdKg)} / ${parsed.holdTransactions.length} trip\n`+
    `Akumulasi Closing : ${kg(latestRec.closingTotal)}\n`+
    `Koreksi Otomatis  : ${latestRec.correctionKg>=0?"+":""}${kg(latestRec.correctionKg)}\n`+
    `Detail tersimpan  : ${detailWritten}\n\n`+
    `Closing Harian tidak diubah. Total Bulanan memakai Paste Final + rekonsiliasi periode.`
  );

  MONTHLY_EXCEL_PREVIEW=null;
  if($("pasteDetailText")) $("pasteDetailText").value="";
  setPasteDetailSaveState(false);
  if($("monthlyConflictSummary")){
    $("monthlyConflictSummary").textContent="Belum ada hasil pemeriksaan.";
    $("monthlyConflictSummary").className="monthly-conflict-summary";
  }
  if($("monthlyFinalAuditBar")) $("monthlyFinalAuditBar").classList.remove("visible");
  if($("monthlyConflictResolution")) $("monthlyConflictResolution").classList.remove("visible");
  $("monthlyExcelPreview").textContent="Belum ada data final dipreview.";

  await loadKPMonthlyPanel($("monitorKp")?.value||parsed.kp);
  if($("monitorRangeStart")?.value && $("monitorRangeEnd")?.value){
    await loadMonitorRangeDetail();
  }
  await loadDashboard();
}

async function previewPastedDetail(){
  try{
    const raw=$("pasteDetailText")?.value||"";
    if(!raw.trim()) throw Error("Paste tabel transaksi dari sistem internal dahulu.");

    detectPasteDetailMetadata();

    const kp=$("pasteDetailKp")?.value||"";
    const supplier=$("pasteDetailSupplier")?.value||"";
    const parsed=parsePastedDetailTable(raw,kp,supplier);

    $("monthlyExcelPreview").textContent="Membaca Paste Detail dan merekonsiliasi Total Periode vs Closing Harian...";

    const [existingStable,reconciliation]=await Promise.all([
      fetchExistingDetailStableRows(parsed.transactions),
      comparePasteDetailPeriodToClosing(parsed)
    ]);

    let exactDuplicateCount=0;
    let holdToPaidCount=0;
    let updateCount=0;
    parsed.transactions.forEach(r=>{
      const old=existingStable.get(r.stable_key);
      if(!old) return;
      const sameStatus=String(old.payment_status||"")==String(r.payment_status||"");
      const sameDate=(old.report_date||null)===(r.report_date||null);
      if(sameStatus && sameDate) exactDuplicateCount++;
      else{
        updateCount++;
        if(old.payment_status==="hold" && r.payment_status==="paid") holdToPaidCount++;
      }
    });

    const integrityBlocked=(!parsed.integrityOk || !parsed.period)
      ? [{
          fileName:"PASTE DETAIL",
          integrityIssues:[
            !parsed.period ? "Periode laporan tidak terdeteksi" : null,
            !parsed.integrityOk
              ? `Total transaksi ${kg(parsed.totalKg)} ≠ Total laporan ${kg(parsed.declaredTotal)} • kurang ${kg(Number(parsed.declaredTotal||0)-Number(parsed.totalKg||0))}`
              : null
          ].filter(Boolean)
        }]
      : [];

    const integrityWarnings=(!parsed.purchaseIntegrityOk)
      ? [{
          type:"purchase_value",
          message:`Nilai pembelian transaksi ${rupiah(parsed.purchaseTotal)} ≠ Total laporan ${rupiah(parsed.purchaseDeclared)}`
        }]
      : [];

    const finalBlocked=integrityBlocked.length>0;

    MONTHLY_EXCEL_PREVIEW={
      files:["PASTE DETAIL SISTEM INTERNAL"],
      daily:[],
      unassignedRows:[],
      unassignedTonnage:0,
      declaredTotalKg:parsed.declaredTotal ?? parsed.totalKg,
      fileResults:[],
      validation:[],
      integrityBlocked,
      integrityWarnings,
      conflictCheck:{fresh:[],same:[],conflicts:[],checked:true},
      finalBlocked,
      conflictDecisions:{},
      conflictSignature:"",
      sourceMode:"paste_detail",
      detailTransactions:parsed.transactions,
      detailDuplicateCount:exactDuplicateCount,
      detailNewCount:parsed.transactions.length-existingStable.size,
      detailUpdateCount:updateCount,
      holdToPaidCount,
      detailPurchaseTotal:parsed.purchaseTotal,
      detailPurchaseDeclared:parsed.purchaseDeclared,
      parsedDetail:parsed,
      reconciliation,
      rawPaste:raw
    };

    const status=finalBlocked ? "FINAL DIBLOKIR" : "SIAP FINAL";
    const corr=reconciliation.correctionKg;
    const corrTrip=reconciliation.correctionTrips;
    const corrLabel=corr===0
      ? "COCOK ✓"
      : corr>0
        ? `KEKURANGAN CLOSING ${kg(corr)}`
        : `CLOSING LEBIH BESAR ${kg(Math.abs(corr))}`;

    $("monthlyExcelPreview").textContent=
      `SUMBER: PASTE DETAIL SISTEM INTERNAL\n`+
      `STATUS: ${status}\n`+
      `KP / Supplier: ${kp} / ${supplier}\n`+
      `Periode: ${parsed.startDate||"-"} s.d. ${parsed.endDate||"-"}\n\n`+

      `TOTAL FINAL PASTE\n`+
      `Transaksi / Trip: ${parsed.transactions.length}\n`+
      `Total tonase: ${kg(parsed.totalKg)}\n`+
      `TOTAL laporan: ${parsed.declaredTotal==null?"tidak ditemukan":kg(parsed.declaredTotal)} ${parsed.integrityOk?"✓":"✕"}\n`+
      `Nilai pembelian: ${rupiah(parsed.purchaseTotal)}\n`+
      `TOTAL nilai laporan: ${parsed.purchaseDeclared==null?"tidak ditemukan":rupiah(parsed.purchaseDeclared)} ${parsed.purchaseIntegrityOk?"✓":"⚠"}\n`+
      `${parsed.purchaseIntegrityOk?"":"PERINGATAN: selisih nilai pembelian tidak memblokir penyimpanan tonase.\n"}\n`+

      `STATUS PEMBAYARAN\n`+
      `PAID / bertanggal: ${parsed.paidTransactions.length} trip • ${kg(parsed.paidKg)}\n`+
      `HOLD / tanggal kosong: ${parsed.holdTransactions.length} trip • ${kg(parsed.holdKg)}\n`+
      `Catatan: HOLD tetap dihitung dalam Total Final, tetapi tidak dialokasikan ke tanggal Closing.\n`+
      `Validasi struktur: ${parsed.ignored===0?"Semua baris transaksi terbaca ✓":`${parsed.ignored} baris non-transaksi/header diabaikan`}\n`+
      `Baris trailing-kosong dipulihkan: ${parsed.paddedHoldRows||0}\n\n`+

      `ANTI-DOUBLE DETAIL\n`+
      `Sudah sama: ${exactDuplicateCount}\n`+
      `Transaksi baru: ${parsed.transactions.length-existingStable.size}\n`+
      `Data diperbarui: ${updateCount}\n`+
      `HOLD → PAID: ${holdToPaidCount}\n\n`+

      `REKONSILIASI OTOMATIS PERIODE\n`+
      `Total Paste Final: ${kg(parsed.totalKg)}\n`+
      `Akumulasi Closing: ${kg(reconciliation.closingTotal)}\n`+
      `Closing tersedia: ${reconciliation.closingDays} hari\n`+
      `Sumber Closing: ${reconciliation.sourceLabel}\n`+
      `Koreksi Otomatis: ${corr>=0?"+":""}${kg(corr)}\n`+
      `Koreksi Trip: ${corrTrip>=0?"+":""}${corrTrip}\n`+
      `STATUS REKONSILIASI: ${corrLabel}\n\n`+
      `PENTING: Koreksi periode TIDAK ditempelkan ke tanggal harian tertentu. `+
      `Closing WA tetap menjadi distribusi operasional harian; Paste Detail menjadi Total Final periode.`;

    if($("monthlyConflictSummary")){
      $("monthlyConflictSummary").textContent=finalBlocked
        ? `✕ FINAL DIBLOKIR • ${integrityBlocked.length} masalah tonase/periode`
        : integrityWarnings.length
          ? `⚠ SIAP FINAL • Tonase valid • ${integrityWarnings.length} peringatan nilai pembelian`
          : corr===0
            ? `✓ COCOK • Paste Final = Akumulasi Closing`
            : corr>0
              ? `✓ SIAP FINAL • Koreksi otomatis +${kg(corr)} karena Closing masih kurang`
              : `⚠ SIAP FINAL • Closing melebihi Paste ${kg(Math.abs(corr))} — tersimpan sebagai rekonsiliasi negatif`;
      $("monthlyConflictSummary").className=
        "monthly-conflict-summary "+(finalBlocked?"has-error":corr===0?"is-safe":"has-conflict");
    }

    // Reuse audit cards but do not show per-date Conflict Resolution for Paste Detail.
    renderMonthlyFinalAuditBar(MONTHLY_EXCEL_PREVIEW);
    if($("monthlyConflictResolution")) $("monthlyConflictResolution").classList.remove("visible");

    setMonthlyAuditCard("monthlyAuditFinalTotal",kg(parsed.totalKg),"Total Final Paste termasuk HOLD",finalBlocked?"audit-warn":"audit-safe");
    setMonthlyAuditCard("monthlyAuditDated",kg(parsed.paidKg),`${parsed.paidTransactions.length} trip PAID / bertanggal`,"audit-info");
    setMonthlyAuditCard("monthlyAuditExisting",kg(reconciliation.closingTotal),`${reconciliation.closingDays} hari Closing operasional`,"audit-info");
    setMonthlyAuditCard(
      "monthlyAuditDifference",
      `${corr>=0?"+":""}${kg(corr)}`,
      corr===0?"Cocok":corr>0?"Kekurangan Closing → Koreksi otomatis":"Closing lebih besar dari Paste",
      corr===0?"audit-safe":"audit-warn"
    );
    setMonthlyAuditCard("monthlyAuditDuplicate",`${exactDuplicateCount}`,`${parsed.transactions.length-existingStable.size} baru • ${updateCount} update`,"audit-safe");
    setMonthlyAuditCard("monthlyAuditConflict","0","Konflik tanggal tidak dipakai untuk Paste Detail","audit-safe");
    setMonthlyAuditCard("monthlyAuditUnassigned",`${parsed.holdTransactions.length}`,`${kg(parsed.holdKg)} HOLD • tetap dihitung Final`,"audit-info");

    if($("monthlyFinalStatus")){
      $("monthlyFinalStatus").textContent=finalBlocked
        ? "FINAL DIBLOKIR — periksa tonase/periode"
        : integrityWarnings.length
          ? "SIAP FINAL — ada peringatan nilai pembelian"
          : "SIAP FINAL — rekonsiliasi periode";
      $("monthlyFinalStatus").className="monthly-final-status "+(finalBlocked?"blocked":"ready");
    }

    setPasteDetailSaveState(!finalBlocked);
  }catch(e){
    MONTHLY_EXCEL_PREVIEW=null;
    $("monthlyExcelPreview").textContent="ERROR PASTE DETAIL: "+e.message;
    if($("monthlyFinalAuditBar")) $("monthlyFinalAuditBar").classList.remove("visible");
    if($("monthlyConflictResolution")) $("monthlyConflictResolution").classList.remove("visible");
    setPasteDetailSaveState(false);
  }
}

function monthlyRowKey(r){
  return `${r.report_date}|${String(r.kp_code||"").toUpperCase()}|${String(r.supplier_name||"ALL").toUpperCase()}`;
}

function monthlyValuesEqual(a,b){
  return Number(a?.tonnage_kg||0)===Number(b?.tonnage_kg||0) &&
         Number(a?.trip_count||0)===Number(b?.trip_count||0);
}

async function fetchExistingMonthlyOverlap(dailyRows){
  if(!dailyRows?.length) return [];

  const dates=dailyRows.map(r=>r.report_date).filter(Boolean).sort();
  const start=dates[0], end=dates[dates.length-1];
  const wantedKeys=new Set(dailyRows.map(monthlyRowKey));
  const pageSize=1000;
  let offset=0;
  const all=[];

  while(true){
    const {data,error}=await db.from("kp_daily_history")
      .select("id,report_date,kp_code,supplier_name,tonnage_kg,trip_count,source_file,created_at")
      .gte("report_date",start)
      .lte("report_date",end)
      .order("report_date",{ascending:true})
      .order("kp_code",{ascending:true})
      .range(offset,offset+pageSize-1);

    if(error) throw Error("Gagal memeriksa overlap data bulanan: "+error.message);

    const rows=data||[];
    all.push(...rows.filter(r=>wantedKeys.has(monthlyRowKey(r))));
    if(rows.length<pageSize) break;
    offset+=pageSize;
    if(offset>30000) break;
  }
  return all;
}

function classifyMonthlyConflicts(dailyRows,existingRows){
  const existingByKey=new Map();
  (existingRows||[]).forEach(r=>existingByKey.set(monthlyRowKey(r),r));

  const fresh=[];
  const same=[];
  const conflicts=[];

  (dailyRows||[]).forEach(incoming=>{
    const existing=existingByKey.get(monthlyRowKey(incoming));
    if(!existing){
      fresh.push({incoming});
      return;
    }

    if(monthlyValuesEqual(incoming,existing)){
      same.push({incoming,existing});
      return;
    }

    conflicts.push({
      incoming,
      existing,
      tonnage_diff:Number(incoming.tonnage_kg||0)-Number(existing.tonnage_kg||0),
      trip_diff:Number(incoming.trip_count||0)-Number(existing.trip_count||0)
    });
  });

  return {fresh,same,conflicts};
}

async function checkMonthlyConflicts(dailyRows){
  const existing=await fetchExistingMonthlyOverlap(dailyRows);
  const classified=classifyMonthlyConflicts(dailyRows,existing);
  return {...classified,existingCount:existing.length,checked:true};
}


function monthlyConflictTotals(c){
  const fresh=c?.fresh||[];
  const same=c?.same||[];
  const conflicts=c?.conflicts||[];

  const newKg=fresh.reduce((a,x)=>a+Number(x.incoming?.tonnage_kg||0),0);
  const sameKg=same.reduce((a,x)=>a+Number(x.incoming?.tonnage_kg||0),0);
  const conflictExcelKg=conflicts.reduce((a,x)=>a+Number(x.incoming?.tonnage_kg||0),0);
  const conflictExistingKg=conflicts.reduce((a,x)=>a+Number(x.existing?.tonnage_kg||0),0);
  const conflictDiffKg=conflictExcelKg-conflictExistingKg;

  const newTrips=fresh.reduce((a,x)=>a+Number(x.incoming?.trip_count||0),0);
  const sameTrips=same.reduce((a,x)=>a+Number(x.incoming?.trip_count||0),0);
  const conflictExcelTrips=conflicts.reduce((a,x)=>a+Number(x.incoming?.trip_count||0),0);
  const conflictExistingTrips=conflicts.reduce((a,x)=>a+Number(x.existing?.trip_count||0),0);

  return {
    newKg,sameKg,conflictExcelKg,conflictExistingKg,conflictDiffKg,
    newTrips,sameTrips,conflictExcelTrips,conflictExistingTrips,
    conflictDiffTrips:conflictExcelTrips-conflictExistingTrips
  };
}

function setMonthlyAuditCard(id,value,sub,status){
  const root=$(id);
  if(!root) return;
  const valueEl=root.querySelector("[data-value]");
  const subEl=root.querySelector("[data-sub]");
  if(valueEl) valueEl.textContent=value;
  if(subEl) subEl.textContent=sub||"";
  root.classList.remove("audit-safe","audit-warn","audit-danger","audit-info");
  if(status) root.classList.add(status);
}


function monthlyConflictSignature(c){
  return (c?.conflicts||[])
    .map(x=>[
      monthlyRowKey(x.incoming),
      Number(x.existing?.tonnage_kg||0),
      Number(x.existing?.trip_count||0),
      Number(x.incoming?.tonnage_kg||0),
      Number(x.incoming?.trip_count||0)
    ].join("~"))
    .sort()
    .join("||");
}

function initMonthlyConflictDecisions(p,{reset=false}={}){
  if(!p) return;
  if(reset || !p.conflictDecisions) p.conflictDecisions={};

  (p.conflictCheck?.conflicts||[]).forEach(x=>{
    const key=monthlyRowKey(x.incoming);
    if(!p.conflictDecisions[key]){
      p.conflictDecisions[key]={
        decision:"",
        manual_tonnage:Number(x.incoming.tonnage_kg||0),
        manual_trips:Number(x.incoming.trip_count||0),
        reason:""
      };
    }
  });

  // Drop decisions for conflicts that no longer exist.
  const active=new Set((p.conflictCheck?.conflicts||[]).map(x=>monthlyRowKey(x.incoming)));
  Object.keys(p.conflictDecisions||{}).forEach(key=>{
    if(!active.has(key)) delete p.conflictDecisions[key];
  });

  p.conflictSignature=monthlyConflictSignature(p.conflictCheck);
}

function monthlyResolutionStats(p){
  const conflicts=p?.conflictCheck?.conflicts||[];
  let unresolved=0,useExcel=0,keep=0,manual=0,invalidManual=0;

  conflicts.forEach(x=>{
    const key=monthlyRowKey(x.incoming);
    const d=p?.conflictDecisions?.[key];
    if(!d?.decision){
      unresolved++;
      return;
    }
    if(d.decision==="use_excel_final") useExcel++;
    else if(d.decision==="keep_existing") keep++;
    else if(d.decision==="manual_edit"){
      manual++;
      const ton=Number(d.manual_tonnage);
      const trips=Number(d.manual_trips);
      if(!Number.isFinite(ton) || ton<0 || !Number.isInteger(trips) || trips<0 || !String(d.reason||"").trim()){
        invalidManual++;
      }
    }
  });

  return {total:conflicts.length,unresolved,useExcel,keep,manual,invalidManual};
}

function refreshMonthlyResolutionStatus(){
  const p=MONTHLY_EXCEL_PREVIEW;
  if(!p) return;
  const s=monthlyResolutionStats(p);

  if($("monthlyResolutionStatus")){
    $("monthlyResolutionStatus").textContent=
      s.total
        ? `Belum diputuskan ${s.unresolved} • Excel ${s.useExcel} • Pertahankan ${s.keep} • Manual ${s.manual}`
        : "Tidak ada konflik";
    $("monthlyResolutionStatus").className=
      "monthly-resolution-status "+(
        s.unresolved||s.invalidManual ? "needs-review" : "resolved"
      );
  }

  if($("monthlyFinalStatus") && !p.finalBlocked){
    if(s.total && (s.unresolved||s.invalidManual)){
      $("monthlyFinalStatus").textContent=
        s.invalidManual
          ? "FINAL DIBLOKIR — lengkapi Edit Manual"
          : `FINAL DIBLOKIR — ${s.unresolved} konflik belum diputuskan`;
      $("monthlyFinalStatus").className="monthly-final-status blocked";
    }else if(s.total){
      $("monthlyFinalStatus").textContent="SIAP FINAL — semua konflik sudah diputuskan";
      $("monthlyFinalStatus").className="monthly-final-status ready";
    }
  }
}

function escapeHtml(v){
  return String(v??"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}


async function loadMonthlyRevisionAudit(){
  if(!$("monthlyRevisionAuditTable")) return;

  const {data,error}=await db.from("tonnage_revision_audit")
    .select("report_date,kp_code,supplier_name,decision,old_tonnage_kg,old_trip_count,final_tonnage_kg,final_trip_count,reason,apply_status,created_at")
    .order("created_at",{ascending:false})
    .limit(50);

  if(error){
    $("monthlyRevisionAuditTable").innerHTML=
      `<div class="master-empty">Audit Trail gagal dimuat: ${escapeHtml(error.message)}</div>`;
    return;
  }

  const label={
    use_excel_final:"Excel Final",
    keep_existing:"Pertahankan",
    manual_edit:"Edit Manual"
  };

  const rows=(data||[]).map(r=>[
    new Date(r.created_at).toLocaleString("id-ID"),
    r.report_date,
    `${r.kp_code} / ${r.supplier_name}`,
    label[r.decision]||r.decision,
    `${kg(r.old_tonnage_kg)} / ${Number(r.old_trip_count||0)} trip`,
    `${kg(r.final_tonnage_kg)} / ${Number(r.final_trip_count||0)} trip`,
    r.reason||"—",
    String(r.apply_status||"").toUpperCase()
  ]);

  $("monthlyRevisionAuditTable").innerHTML=rows.length
    ? table(["Waktu","Tanggal Data","KP / Supplier","Keputusan","Sebelum","Sesudah","Alasan","Status"],rows)
    : '<div class="master-empty">Belum ada revisi konflik yang tercatat.</div>';
}

function renderMonthlyConflictResolution(p){
  const root=$("monthlyConflictResolution");
  const list=$("monthlyConflictResolutionList");
  if(!root || !list) return;

  const conflicts=p?.conflictCheck?.conflicts||[];
  if(!conflicts.length){
    root.classList.remove("visible");
    list.innerHTML="";
    refreshMonthlyResolutionStatus();
    return;
  }

  initMonthlyConflictDecisions(p);

  list.innerHTML=conflicts.map((x,i)=>{
    const n=x.incoming, e=x.existing;
    const key=monthlyRowKey(n);
    const enc=encodeURIComponent(key);
    const d=p.conflictDecisions[key]||{};
    const manual=d.decision==="manual_edit";
    const source=e.source_file||"-";
    const finalLabel=monthlyFinalSourceLabel(p);

    return `
      <article class="monthly-resolution-card" data-resolution-key="${escapeHtml(key)}">
        <div class="monthly-resolution-card-head">
          <div>
            <span class="resolution-index">KONFLIK ${i+1}</span>
            <strong>${escapeHtml(n.report_date)} • ${escapeHtml(n.kp_code)} / ${escapeHtml(n.supplier_name)}</strong>
          </div>
          <span class="resolution-diff ${x.tonnage_diff>=0?"positive":"negative"}">
            ${x.tonnage_diff>=0?"+":""}${kg(x.tonnage_diff)}
          </span>
        </div>

        <div class="monthly-resolution-compare">
          <div class="resolution-old">
            <small>DATA SISTEM</small>
            <strong>${kg(e.tonnage_kg)}</strong>
            <span>${Number(e.trip_count||0)} trip</span>
            <em>${escapeHtml(source)}</em>
          </div>
          <div class="resolution-arrow">→</div>
          <div class="resolution-new">
            <small>${escapeHtml(finalLabel.toUpperCase())}</small>
            <strong>${kg(n.tonnage_kg)}</strong>
            <span>${Number(n.trip_count||0)} trip</span>
            <em>Selisih trip ${x.trip_diff>=0?"+":""}${x.trip_diff}</em>
          </div>
        </div>

        <div class="monthly-resolution-choice">
          <label>
            <span>Keputusan</span>
            <select onchange="setMonthlyConflictDecision('${enc}',this.value)">
              <option value="" ${!d.decision?"selected":""}>Pilih keputusan...</option>
              <option value="use_excel_final" ${d.decision==="use_excel_final"?"selected":""}>Gunakan Data Final</option>
              <option value="keep_existing" ${d.decision==="keep_existing"?"selected":""}>Pertahankan Data Lama</option>
              <option value="manual_edit" ${d.decision==="manual_edit"?"selected":""}>Edit Manual</option>
            </select>
          </label>

          <label class="resolution-reason ${manual?"manual-visible":""}">
            <span>Alasan / Catatan</span>
            <input
              type="text"
              value="${escapeHtml(d.reason||"")}"
              placeholder="${manual?"Wajib untuk Edit Manual":"Opsional"}"
              oninput="setMonthlyConflictReason('${enc}',this.value)"
            >
          </label>
        </div>

        <div class="monthly-manual-fields ${manual?"visible":""}">
          <label>
            <span>Tonase Final (kg)</span>
            <input type="number" min="0" step="1"
              value="${Number((d.manual_tonnage ?? n.tonnage_kg) || 0)}"
              oninput="setMonthlyConflictManual('${enc}','tonnage',this.value)">
          </label>
          <label>
            <span>Trip Final</span>
            <input type="number" min="0" step="1"
              value="${Number((d.manual_trips ?? n.trip_count) || 0)}"
              oninput="setMonthlyConflictManual('${enc}','trips',this.value)">
          </label>
          <div class="manual-edit-note">Edit Manual wajib memiliki alasan dan akan disimpan sebagai <b>Audit Resmi</b>.</div>
        </div>
      </article>
    `;
  }).join("");

  root.classList.add("visible");
  refreshMonthlyResolutionStatus();
  loadMonthlyRevisionAudit();
}

function setMonthlyConflictDecision(encodedKey,value){
  const p=MONTHLY_EXCEL_PREVIEW;
  if(!p) return;
  const key=decodeURIComponent(encodedKey);
  if(!p.conflictDecisions?.[key]) return;

  const d=p.conflictDecisions[key];
  d.decision=value;

  if(value==="use_excel_final" && !d.reason){
    d.reason=`Menggunakan ${monthlyFinalSourceLabel(p)}`;
  }else if(value==="keep_existing" && !d.reason){
    d.reason="Data lama dipertahankan setelah review konflik";
  }else if(value==="manual_edit"){
    if(String(d.reason||"").startsWith("Menggunakan ") || d.reason==="Data lama dipertahankan setelah review konflik"){
      d.reason="";
    }
  }

  renderMonthlyConflictResolution(p);
}

function setMonthlyConflictReason(encodedKey,value){
  const p=MONTHLY_EXCEL_PREVIEW;
  if(!p) return;
  const key=decodeURIComponent(encodedKey);
  if(!p.conflictDecisions?.[key]) return;
  p.conflictDecisions[key].reason=value;
  refreshMonthlyResolutionStatus();
}

function setMonthlyConflictManual(encodedKey,field,value){
  const p=MONTHLY_EXCEL_PREVIEW;
  if(!p) return;
  const key=decodeURIComponent(encodedKey);
  if(!p.conflictDecisions?.[key]) return;

  if(field==="tonnage") p.conflictDecisions[key].manual_tonnage=Number(value);
  if(field==="trips") p.conflictDecisions[key].manual_trips=Number(value);
  refreshMonthlyResolutionStatus();
}

function applyMonthlyConflictBulk(decision){
  const p=MONTHLY_EXCEL_PREVIEW;
  if(!p) return;

  (p.conflictCheck?.conflicts||[]).forEach(x=>{
    const key=monthlyRowKey(x.incoming);
    if(!p.conflictDecisions?.[key]) return;
    p.conflictDecisions[key].decision=decision;
    p.conflictDecisions[key].reason=
      decision==="use_excel_final"
        ? `Menggunakan ${monthlyFinalSourceLabel(p)}`
        : "Data lama dipertahankan setelah review konflik";
  });

  renderMonthlyConflictResolution(p);
}

function buildMonthlyConflictResolution(p){
  const conflicts=p?.conflictCheck?.conflicts||[];
  const rowsToWrite=[];
  const audits=[];
  const decisions={useExcel:0,keep:0,manual:0};

  for(const x of conflicts){
    const n=x.incoming, e=x.existing;
    const key=monthlyRowKey(n);
    const d=p.conflictDecisions?.[key];

    if(!d?.decision){
      throw Error(`Konflik ${n.report_date} ${n.kp_code}/${n.supplier_name} belum diputuskan.`);
    }

    let finalRow=null;
    let finalTonnage=Number(e.tonnage_kg||0);
    let finalTrips=Number(e.trip_count||0);
    let newSource=e.source_file||null;

    if(d.decision==="use_excel_final"){
      decisions.useExcel++;
      finalTonnage=Number(n.tonnage_kg||0);
      finalTrips=Number(n.trip_count||0);
      newSource=ensureFinalSourceFile(n,p);
      finalRow={...n,tonnage_kg:finalTonnage,trip_count:finalTrips,source_file:newSource};
    }else if(d.decision==="keep_existing"){
      decisions.keep++;
    }else if(d.decision==="manual_edit"){
      decisions.manual++;
      finalTonnage=Number(d.manual_tonnage);
      finalTrips=Number(d.manual_trips);

      if(!Number.isFinite(finalTonnage) || finalTonnage<0){
        throw Error(`Tonase manual tidak valid untuk ${n.report_date} ${n.kp_code}/${n.supplier_name}.`);
      }
      if(!Number.isInteger(finalTrips) || finalTrips<0){
        throw Error(`Trip manual harus bilangan bulat untuk ${n.report_date} ${n.kp_code}/${n.supplier_name}.`);
      }
      if(!String(d.reason||"").trim()){
        throw Error(`Alasan Edit Manual wajib diisi untuk ${n.report_date} ${n.kp_code}/${n.supplier_name}.`);
      }

      newSource=`AUDIT:MANUAL:EXCEL_FINAL:${p.files?.[0]||"UPLOAD"}`;
      finalRow={
        ...n,
        tonnage_kg:finalTonnage,
        trip_count:finalTrips,
        source_file:newSource
      };
    }

    if(finalRow) rowsToWrite.push(finalRow);

    audits.push({
      report_date:n.report_date,
      kp_code:n.kp_code,
      supplier_name:n.supplier_name,
      decision:d.decision,
      old_tonnage_kg:Number(e.tonnage_kg||0),
      old_trip_count:Number(e.trip_count||0),
      old_source:e.source_file||null,
      proposed_tonnage_kg:Number(n.tonnage_kg||0),
      proposed_trip_count:Number(n.trip_count||0),
      final_tonnage_kg:finalTonnage,
      final_trip_count:finalTrips,
      new_source:newSource,
      reason:String(d.reason||"").trim() || (
        d.decision==="use_excel_final"
          ? `Menggunakan ${monthlyFinalSourceLabel(p)}`
          : "Data lama dipertahankan setelah review konflik"
      ),
      apply_status:"pending"
    });
  }

  return {rowsToWrite,audits,decisions};
}

function renderMonthlyFinalAuditBar(p){
  if(!$("monthlyFinalAuditBar")) return;

  const c=p?.conflictCheck||{fresh:[],same:[],conflicts:[]};
  const totals=monthlyConflictTotals(c);
  const datedKg=(p?.daily||[]).reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
  const datedTrips=(p?.daily||[]).reduce((a,r)=>a+Number(r.trip_count||0),0);
  const declaredKg=(p?.declaredTotalKg==null) ? null : Number(p.declaredTotalKg);
  const unassignedKg=Number(p?.unassignedTonnage||0);
  const finalBlocked=!!p?.finalBlocked;

  setMonthlyAuditCard(
    "monthlyAuditFinalTotal",
    declaredKg==null ? kg(datedKg+unassignedKg) : kg(declaredKg),
    declaredKg==null ? "Total terhitung dari transaksi Excel" : "TOTAL Excel / nilai final file",
    finalBlocked ? "audit-warn" : "audit-safe"
  );

  setMonthlyAuditCard(
    "monthlyAuditDated",
    kg(datedKg),
    `${datedTrips.toLocaleString("id-ID")} trip bertanggal`,
    "audit-info"
  );

  setMonthlyAuditCard(
    "monthlyAuditExisting",
    kg(totals.sameKg+totals.conflictExistingKg),
    "Nilai sistem pada key yang overlap",
    c.conflicts.length ? "audit-warn" : "audit-info"
  );

  setMonthlyAuditCard(
    "monthlyAuditDifference",
    `${totals.conflictDiffKg>=0?"+":""}${kg(totals.conflictDiffKg)}`,
    `${totals.conflictDiffTrips>=0?"+":""}${totals.conflictDiffTrips} trip pada konflik`,
    c.conflicts.length ? "audit-warn" : "audit-safe"
  );

  setMonthlyAuditCard(
    "monthlyAuditDuplicate",
    p?.sourceMode==="paste_detail" ? `${p.detailDuplicateCount||0}` : `${c.same.length}`,
    p?.sourceMode==="paste_detail"
      ? `${p.detailNewCount||0} transaksi baru • ${c.same.length} agregat harian sama`
      : "Baris identik • tidak double",
    "audit-safe"
  );

  setMonthlyAuditCard(
    "monthlyAuditConflict",
    `${c.conflicts.length}`,
    "Baris berbeda • Excel akan mengganti setelah konfirmasi",
    c.conflicts.length ? "audit-warn" : "audit-safe"
  );

  setMonthlyAuditCard(
    "monthlyAuditUnassigned",
    `${(p?.unassignedRows||[]).length}`,
    unassignedKg ? `${kg(unassignedKg)} tanpa tanggal • SIMPAN DIBLOKIR` : "Tidak ada transaksi tanpa tanggal",
    (p?.unassignedRows||[]).length ? "audit-danger" : "audit-safe"
  );

  const totalChecks=Math.max(1,c.fresh.length+c.same.length+c.conflicts.length);
  const newPct=Math.round(c.fresh.length/totalChecks*100);
  const samePct=Math.round(c.same.length/totalChecks*100);
  const conflictPct=Math.max(0,100-newPct-samePct);

  const newBar=$("monthlyAuditBarNew");
  const sameBar=$("monthlyAuditBarSame");
  const conflictBar=$("monthlyAuditBarConflict");
  if(newBar) newBar.style.width=`${newPct}%`;
  if(sameBar) sameBar.style.width=`${samePct}%`;
  if(conflictBar) conflictBar.style.width=`${conflictPct}%`;

  if($("monthlyAuditBarLegend")){
    $("monthlyAuditBarLegend").textContent=
      `BARU ${c.fresh.length} • SAMA ${c.same.length} • KONFLIK ${c.conflicts.length}`;
  }

  if($("monthlyFinalStatus")){
    $("monthlyFinalStatus").textContent=finalBlocked
      ? "FINAL DIBLOKIR — perbaiki item merah sebelum Simpan"
      : c.conflicts.length
        ? "REVIEW KONFLIK — putuskan setiap baris"
        : "SIAP FINAL — tidak ada konflik";
    $("monthlyFinalStatus").className=
      "monthly-final-status "+(finalBlocked?"blocked":c.conflicts.length?"warning":"ready");
  }

  $("monthlyFinalAuditBar").classList.add("visible");
  renderMonthlyConflictResolution(p);
}

function formatMonthlyConflictPreview(conflictCheck){
  const c=conflictCheck||{fresh:[],same:[],conflicts:[]};
  const lines=[
    "DETEKSI OVERLAP / ANTI-DOUBLE",
    `DATA BARU        : ${c.fresh.length}`,
    `SUDAH SAMA/SKIP : ${c.same.length}`,
    `KONFLIK         : ${c.conflicts.length}`
  ];

  if(c.conflicts.length){
    lines.push("", "DETAIL KONFLIK:");
    c.conflicts.slice(0,60).forEach(x=>{
      const n=x.incoming, e=x.existing;
      lines.push(
        `• ${n.report_date} | ${n.kp_code} / ${n.supplier_name}`,
        `  Tersimpan : ${kg(e.tonnage_kg)} | ${Number(e.trip_count||0)} trip | ${e.source_file||"-"}`,
        `  Excel baru: ${kg(n.tonnage_kg)} | ${Number(n.trip_count||0)} trip`,
        `  Selisih   : ${x.tonnage_diff>=0?"+":""}${kg(x.tonnage_diff)} | ${x.trip_diff>=0?"+":""}${x.trip_diff} trip`
      );
    });
    if(c.conflicts.length>60){
      lines.push(`... ${c.conflicts.length-60} konflik lain tidak ditampilkan di Preview.`);
    }
  }

  if(c.same.length){
    lines.push("", `✓ ${c.same.length} baris identik akan dilewati agar tidak ditulis ulang.`);
  }

  return lines.join("\n");
}

async function previewMonthlyExcels(fileList){
  try{
    setPasteDetailSaveState(false);
    const files=[...(fileList||[])];
    if(!files.length) throw Error("Pilih minimal 1 file.");

    const previews=[];
    let allDaily=[];
    let allUnassigned=[];

    for(const file of files){
      const wb=await readWorkbookFile(file);
      const p=parseMonthlyWorkbook(wb,file.name);
      previews.push(p);
      allDaily.push(...p.daily);
      allUnassigned.push(...(p.unassignedRows||[]));
    }

    allDaily=combineDailyRows(allDaily);

    $("monthlyExcelPreview").textContent=
      "Membaca Excel FINAL dan melakukan audit anti-double / selisih...";

    const [validation,conflictCheck]=await Promise.all([
      validateMonthlyAgainstAnnual(allDaily),
      checkMonthlyConflicts(allDaily)
    ]);
    const integrityBlocked=previews.filter(p=>!p.integrityOk);

    const declaredTotals=previews
      .map(p=>p.declaredTotalSum)
      .filter(v=>v!=null);
    const declaredTotalKg=declaredTotals.length
      ? declaredTotals.reduce((a,b)=>a+Number(b||0),0)
      : null;

    const unassignedTonnage=allUnassigned.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
    const finalBlocked=integrityBlocked.length>0 || allUnassigned.length>0;

    MONTHLY_EXCEL_PREVIEW={
      files:files.map(f=>f.name),
      daily:allDaily,
      unassignedRows:allUnassigned,
      unassignedTonnage,
      declaredTotalKg,
      fileResults:previews,
      validation,
      integrityBlocked,
      conflictCheck,
      finalBlocked,
      conflictDecisions:{},
      conflictSignature:monthlyConflictSignature(conflictCheck)
    };
    initMonthlyConflictDecisions(MONTHLY_EXCEL_PREVIEW,{reset:true});

    const kpSet=new Set(allDaily.map(r=>r.kp_code));
    const supplierSet=new Set(allDaily.map(r=>`${r.kp_code}/${r.supplier_name}`));
    const tripTotal=allDaily.reduce((a,r)=>a+Number(r.trip_count||0),0);
    const tonTotal=allDaily.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
    const totals=monthlyConflictTotals(conflictCheck);

    const validationText=validation.length
      ? "\n\nVALIDASI vs DATA TAHUNAN:\n"+
        validation.map(v=>{
          const ref=v.reference_kg==null?"-":kg(v.reference_kg);
          const diff=v.diff_kg==null?"-":`${v.diff_kg>=0?"+":""}${kg(v.diff_kg)}`;
          return `• ${v.kp_code} ${String(v.month).padStart(2,"0")}/${v.year}: ${v.status}\n`+
                 `  Excel Final: ${kg(v.parsed_kg)} | Tahunan: ${ref} | Selisih: ${diff}\n`+
                 `  ${v.note}`;
        }).join("\n")
      : "";

    const conflictText="\n\n"+formatMonthlyConflictPreview(conflictCheck);

    const unassignedText=allUnassigned.length
      ? `\n\n✕ FINAL DIBLOKIR — TRANSAKSI TANPA TANGGAL\n`+
        `Jumlah: ${allUnassigned.length} transaksi\n`+
        `Tonase: ${kg(unassignedTonnage)}\n`+
        `Excel dianggap FINAL, sehingga semua transaksi harus memiliki tanggal yang dapat dipertanggungjawabkan.\n`+
        `Perbaiki file / tanggal terlebih dahulu sebelum Simpan Final.`
      : `\n\n✓ Semua transaksi memiliki tanggal yang dapat dialokasikan.`;

    const integrityText=integrityBlocked.length
      ? `\n\n✕ FINAL DIBLOKIR — TOTAL FILE TIDAK COCOK\n`+
        integrityBlocked.map(f=>`• ${f.fileName}: ${f.integrityIssues.join("; ")}`).join("\n")
      : `\n\n✓ Integritas total Excel cocok.`;

    const finalStatus=finalBlocked
      ? "DIBLOKIR"
      : conflictCheck.conflicts.length
        ? "SIAP FINAL SETELAH KONFIRMASI KONFLIK"
        : "SIAP FINAL";

    $("monthlyExcelPreview").textContent=
      `STATUS FINAL: ${finalStatus}\n`+
      `FILE DIPILIH: ${files.length}\n`+
      `File terbaca: ${previews.filter(p=>p.daily.length || p.unassignedRows?.length).length}/${files.length}\n`+
      `KP terdeteksi: ${kpSet.size}\n`+
      `Supplier terdeteksi: ${supplierSet.size}\n`+
      `Baris bertanggal: ${allDaily.length}\n`+
      `Total trip bertanggal: ${tripTotal.toLocaleString("id-ID")}\n`+
      `Total tonase bertanggal: ${kg(tonTotal)}\n`+
      `Total Excel Final: ${declaredTotalKg==null?kg(tonTotal+unassignedTonnage):kg(declaredTotalKg)}\n`+
      `Nilai overlap di sistem: ${kg(totals.sameKg+totals.conflictExistingKg)}\n`+
      `Selisih konflik Excel vs sistem: ${totals.conflictDiffKg>=0?"+":""}${kg(totals.conflictDiffKg)}\n\n`+
      previews.map(p=>`• ${p.fileName}\n  ${p.notes.join("\n  ")}`).join("\n\n")+
      integrityText+
      unassignedText+
      conflictText+
      validationText;

    if($("monthlyConflictSummary")){
      const c=conflictCheck;
      $("monthlyConflictSummary").textContent=finalBlocked
        ? `✕ FINAL DIBLOKIR • ${allUnassigned.length} tanpa tanggal • ${integrityBlocked.length} file gagal integritas`
        : c.conflicts.length
          ? `⚠ ${c.conflicts.length} konflik • pilih keputusan pada Conflict Resolution Panel`
          : `✓ Siap FINAL • ${c.same.length} identik akan di-skip`;
      $("monthlyConflictSummary").className=
        "monthly-conflict-summary "+(finalBlocked?"has-error":c.conflicts.length?"has-conflict":"is-safe");
    }

    renderMonthlyFinalAuditBar(MONTHLY_EXCEL_PREVIEW);

  }catch(e){
    MONTHLY_EXCEL_PREVIEW=null;
    $("monthlyExcelPreview").textContent="ERROR: "+e.message;
    if($("monthlyConflictSummary")){
      $("monthlyConflictSummary").textContent="Belum ada hasil pemeriksaan.";
      $("monthlyConflictSummary").className="monthly-conflict-summary";
    }
    if($("monthlyFinalAuditBar")) $("monthlyFinalAuditBar").classList.remove("visible");
    if($("monthlyConflictResolution")) $("monthlyConflictResolution").classList.remove("visible");
  }
}
async function replaceRowsFromSameFiles(fileNames){
  for(const fileName of fileNames){
    const {error}=await db.from("kp_daily_history").delete().eq("source_file",fileName);
    if(error) throw error;
  }
}
async function saveMonthlyExcel(){
  if(!MONTHLY_EXCEL_PREVIEW) return alert("Pilih dan Preview Audit Excel Bulanan dahulu.");
  const p=MONTHLY_EXCEL_PREVIEW;
  if(!p.daily.length) return alert("Tidak ada transaksi bertanggal yang dapat disimpan.");

  const badFiles=(p.integrityBlocked||[]);
  if(badFiles.length){
    return alert(
      "SIMPAN FINAL DIBLOKIR.\n\n"+
      badFiles.map(f=>`${f.fileName}: ${f.integrityIssues.join("; ")}`).join("\n")+
      "\n\nTotal transaksi parser belum sama dengan Total Excel."
    );
  }

  if((p.unassignedRows||[]).length){
    return alert(
      "SIMPAN FINAL DIBLOKIR.\n\n"+
      `${p.unassignedRows.length} transaksi / ${kg(p.unassignedTonnage||0)} belum memiliki tanggal yang dapat dipertanggungjawabkan.\n\n`+
      "Karena Excel Bulanan adalah DATA FINAL, sistem tidak akan menebak tanggal transaksi."
    );
  }

  const blocked=(p.validation||[]).filter(v=>v.block);
  if(blocked.length){
    return alert(
      "SIMPAN FINAL DIBLOKIR.\n\n"+
      blocked.map(v=>`${v.kp_code}: hasil parser melebihi referensi tahunan.`).join("\n")+
      "\n\nPeriksa file/preview terlebih dahulu."
    );
  }

  // Re-check immediately before final save.
  let latestConflict;
  try{
    latestConflict=await checkMonthlyConflicts(p.daily);
  }catch(e){
    return alert(e.message);
  }

  const latestSignature=monthlyConflictSignature(latestConflict);
  if(latestSignature!==p.conflictSignature){
    p.conflictCheck=latestConflict;
    initMonthlyConflictDecisions(p,{reset:true});
    renderMonthlyFinalAuditBar(p);
    return alert(
      "DATA BERUBAH SEJAK PREVIEW.\n\n"+
      "Konflik telah diperiksa ulang dan Conflict Resolution Panel diperbarui.\n"+
      "Silakan review keputusan konflik sekali lagi sebelum Simpan Final."
    );
  }

  p.conflictCheck=latestConflict;

  const s=monthlyResolutionStats(p);
  if(s.unresolved){
    renderMonthlyConflictResolution(p);
    return alert(
      `SIMPAN FINAL DIBLOKIR.\n\n${s.unresolved} konflik belum memiliki keputusan.\n`+
      "Pilih Gunakan Excel Final, Pertahankan Data Lama, atau Edit Manual."
    );
  }
  if(s.invalidManual){
    renderMonthlyConflictResolution(p);
    return alert(
      `SIMPAN FINAL DIBLOKIR.\n\n${s.invalidManual} Edit Manual belum valid.\n`+
      "Pastikan tonase/trip valid dan alasan revisi sudah diisi."
    );
  }

  let resolution;
  try{
    resolution=buildMonthlyConflictResolution(p);
  }catch(e){
    return alert("SIMPAN FINAL DIBLOKIR.\n\n"+e.message);
  }

  const fresh=latestConflict.fresh||[];
  const same=latestConflict.same||[];

  const freshRows=fresh.map(x=>({
    ...x.incoming,
    source_file:ensureFinalSourceFile(x.incoming,p)
  }));

  // Same numeric values are not duplicated, but if the old source was temporary
  // promote the source marker to FINAL so Monthly insight becomes unambiguous.
  const sameRows=same.map(x=>({
    ...x.incoming,
    source_file:ensureFinalSourceFile(x.incoming,p)
  }));

  const rowsToSave=[...freshRows,...sameRows,...resolution.rowsToWrite];

  const finalConfirmation=confirm(
    "KONFIRMASI SIMPAN FINAL\n\n"+
    `Data baru             : ${fresh.length}\n`+
    `Sudah sama / skip     : ${same.length}\n`+
    `Konflik pakai Final   : ${resolution.decisions.useExcel}\n`+
    `Konflik dipertahankan : ${resolution.decisions.keep}\n`+
    `Konflik edit manual   : ${resolution.decisions.manual}\n\n`+
    "Semua keputusan konflik akan disimpan ke Audit Trail.\n\n"+
    "Klik OK untuk menerapkan keputusan."
  );
  if(!finalConfirmation) return;

  // 1) Create pending audit trail before data mutation.
  let auditIds=[];
  if(resolution.audits.length){
    const {data:auditInserted,error:auditError}=await db
      .from("tonnage_revision_audit")
      .insert(resolution.audits)
      .select("id");

    if(auditError){
      return alert("SIMPAN DIBATALKAN — Audit Trail gagal dibuat:\n"+auditError.message);
    }
    auditIds=(auditInserted||[]).map(x=>x.id);
  }

  // 2) Apply new/final rows. Same rows and keep-existing decisions are not rewritten.
  const chunkSize=500;
  for(let i=0;i<rowsToSave.length;i+=chunkSize){
    const chunk=rowsToSave.slice(i,i+chunkSize);
    const {error}=await db.from("kp_daily_history")
      .upsert(chunk,{onConflict:"report_date,kp_code,supplier_name"});

    if(error){
      if(auditIds.length){
        await db.from("tonnage_revision_audit")
          .update({apply_status:"failed",error_message:error.message})
          .in("id",auditIds);
      }
      return alert("Gagal menerapkan Excel Final:\n"+error.message);
    }
  }

  // 3) If source is Paste Detail, store each transaction with a stable fingerprint.
  // Re-pasting the same transaction uses upsert and does not duplicate it.
  let detailWritten=0;
  if(p.sourceMode==="paste_detail" && (p.detailTransactions||[]).length){
    const detailRows=(p.detailTransactions||[]).map(r=>({
      report_date:r.report_date,
      kp_code:r.kp_code,
      supplier_name:r.supplier_name,
      sequence_no:r.sequence_no,
      proof_no:r.proof_no,
      vehicle_plate:r.vehicle_plate,
      agent_name:r.agent_name,
      tonnage_kg:r.tonnage_kg,
      price_per_kg:r.price_per_kg,
      purchase_value:r.purchase_value,
      payment_method:r.payment_method,
      transaction_key:r.transaction_key,
      raw_line:r.raw_line,
      source_type:"paste_detail"
    }));

    for(let i=0;i<detailRows.length;i+=chunkSize){
      const chunk=detailRows.slice(i,i+chunkSize);
      const {data:detailSaved,error:detailError}=await db.from("tonnage_detail_transactions")
        .upsert(chunk,{onConflict:"transaction_key"})
        .select("id");
      if(detailError){
        if(auditIds.length){
          await db.from("tonnage_revision_audit")
            .update({apply_status:"failed",error_message:"Detail transaction: "+detailError.message})
            .in("id",auditIds);
        }
        return alert(
          "Total harian sudah diterapkan, tetapi penyimpanan detail transaksi gagal.\n\n"+
          detailError.message+
          "\n\nJangan paste ulang sebelum memeriksa Monitoring."
        );
      }
      detailWritten+=detailSaved?.length||chunk.length;
    }
  }

  // 4) Mark audit records applied.
  if(auditIds.length){
    const {error:auditUpdateError}=await db.from("tonnage_revision_audit")
      .update({apply_status:"applied",error_message:null})
      .in("id",auditIds);

    if(auditUpdateError){
      alert(
        "Data Final berhasil diterapkan, tetapi status Audit Trail gagal diperbarui.\n"+
        "Detail: "+auditUpdateError.message
      );
    }
  }

  alert(
    `DATA FINAL BERHASIL DIPROSES ✓\n\n`+
    `DATA BARU             : ${fresh.length}\n`+
    `SUDAH SAMA / FINAL   : ${same.length}\n`+
    `PAKAI DATA FINAL    : ${resolution.decisions.useExcel}\n`+
    `PERTAHANKAN DATA LAMA: ${resolution.decisions.keep}\n`+
    `EDIT MANUAL          : ${resolution.decisions.manual}\n`+
    `${p.sourceMode==="paste_detail"?`DETAIL TRANSAKSI     : ${detailWritten}\n`:""}`+
    `AUDIT TRAIL          : ${resolution.audits.length} keputusan\n\n`+
    `Setiap konflik sudah diproses sesuai keputusan Anda.`
  );

  MONTHLY_EXCEL_PREVIEW=null;
  if($("monthlyExcelFile")) $("monthlyExcelFile").value="";
  if($("pasteDetailText")) $("pasteDetailText").value="";
  setPasteDetailSaveState(false);
  if($("monthlyConflictSummary")){
    $("monthlyConflictSummary").textContent="Belum ada hasil pemeriksaan.";
    $("monthlyConflictSummary").className="monthly-conflict-summary";
  }
  if($("monthlyFinalAuditBar")) $("monthlyFinalAuditBar").classList.remove("visible");
  if($("monthlyConflictResolution")) $("monthlyConflictResolution").classList.remove("visible");
  $("monthlyExcelPreview").textContent="Belum ada file bulanan dipilih.";
  await loadKPMonthlyPanel($("monitorKp").value || "ALL");
  if($("monitorRangeStart")?.value && $("monitorRangeEnd")?.value){
    await loadMonitorRangeDetail();
  }
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
  const aoa=annualSheetAOA(sheet);
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
    const annualTotals={};
    years.forEach(y=>{
      annualTotals[y]=summary
        .filter(r=>Number(r.year)===Number(y))
        .reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
    });
    $("annualExcelPreview").textContent=
      `FILE DIPILIH: ${files.length}\n`+
      `Tahun terbaca: ${years.join(", ")||"-"}\n`+
      `Unit/KP historis: ${units.size}\n`+
      `Baris KP/bulan: ${summary.length}\n\n`+
      `TOTAL PER TAHUN (KG):\n`+
      years.map(y=>`• ${y}: ${kg(annualTotals[y])}`).join("\n")+
      `\n\nVALIDASI: angka di atas dibaca dari nilai asli/cached Excel, bukan angka tampilan sel.\n\n`+
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

  const years=[...new Set(p.summary.map(r=>Number(r.year)))];

  // SAFER REBUILD:
  // 1) Upsert the complete annual workbook first.
  // 2) Only after every chunk succeeds, remove stale/contaminating rows whose
  //    source_file is not one of the annual files just uploaded.
  // This avoids leaving a year empty if a network/save error happens mid-upload.
  const chunkSize=500;
  for(let i=0;i<p.summary.length;i+=chunkSize){
    const {error}=await db.from("historical_summary")
      .upsert(p.summary.slice(i,i+chunkSize),{onConflict:"year,month,kp_code"});
    if(error) return alert("Gagal simpan data tahunan: "+error.message);
  }

  for(const y of years){
    let cleanup=db.from("historical_summary").delete().eq("year",y);
    if(p.files.length===1){
      cleanup=cleanup.neq("source_file",p.files[0]);
    }else{
      cleanup=cleanup.not("source_file","in",`(${p.files.map(f=>`"${f.replaceAll('"','')}"`).join(",")})`);
    }
    const {error:cleanupError}=await cleanup;
    if(cleanupError){
      return alert(
        `Data tahunan ${y} sudah tersimpan, tetapi pembersihan data lama gagal: `+
        cleanupError.message
      );
    }
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

  // Default detail range: first day of the latest operational month through latest date.
  if($("monitorRangeStart") && !$("monitorRangeStart").value){
    $("monitorRangeStart").value=`${latestDate.slice(0,7)}-01`;
  }
  if($("monitorRangeEnd") && !$("monitorRangeEnd").value){
    $("monitorRangeEnd").value=latestDate;
  }

  const {data:histYears}=await db.from("historical_summary").select("year");
  const years=[...new Set((histYears||[]).map(x=>Number(x.year)))];
  const currentYear=Number(latestDate.slice(0,4));
  if(!years.includes(currentYear)) years.push(currentYear);
  years.sort((a,b)=>b-a);
  $("monitorYear").innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join("");
  if(years.includes(currentYear)) $("monitorYear").value=String(currentYear);
}
function setMonitorMode(mode){
  if(!["daily","monthly","yearly","analysis"].includes(mode)) mode="daily";
  MONITOR_MODE=mode;
  setSidebarMonitoringActive(mode);

  ["daily","monthly","yearly"].forEach(m=>{
    const panelId=m==="daily"?"monitorDailyPanel":m==="monthly"?"monitorMonthlyPanel":"monitorYearlyPanel";
    $(panelId)?.classList.toggle("active",m===mode);
  });

  const isAnalysis=mode==="analysis";

  // Standard Monitoring summary belongs to Harian/Bulanan/Tahunan only.
  $("monitorBusinessKpiGrid")?.classList.toggle("hidden",isAnalysis);
  $("monitorBusinessSummaryHead")?.classList.toggle("hidden",isAnalysis);
  $("monitorKpPeriodSummaryTable")?.classList.toggle("hidden",isAnalysis);

  // Dedicated meeting-analysis dashboard.
  $("monitorProductionAnalysisPanel")?.classList.toggle("hidden",!isAnalysis);

  $("monitorDateWrap")?.classList.toggle("hidden",mode!=="daily");
  $("monitorMonthWrap")?.classList.toggle("hidden",mode!=="monthly");
  $("monitorYearWrap")?.classList.toggle("hidden",mode!=="yearly");

  const titleMap={
    daily:[
      "Monitoring • Harian",
      "Snapshot WhatsApp 10.00 / 12.00 / 15.00 / 17.00 dibandingkan dengan Closing Tonase final pukul 00.00."
    ],
    monthly:[
      "Monitoring • Bulanan",
      "Analisis tonase bulanan per KP dan upload Excel data bulanan."
    ],
    yearly:[
      "Monitoring • Tahunan",
      "Analisis tonase tahunan per KP dan upload Excel data tahunan."
    ],
    analysis:[
      "Monitoring • Analisa Produksi",
      "Evaluasi produksi untuk meeting: ranking KP, benchmark, kg/trip, HOLD, biaya, tren operasional, dan executive insight."
    ]
  };
  if($("monitorPageTitle")) $("monitorPageTitle").textContent=titleMap[mode][0];
  if($("monitorPageSubtitle")) $("monitorPageSubtitle").textContent=titleMap[mode][1];

  if(isAnalysis) ensureProductionAnalysisRange();
  loadKPMonitoring();
}
function monitorPeriodLabel(mode){
  if(mode==="daily") return $("monitorDate")?.value || "-";
  if(mode==="monthly") return $("monitorMonth")?.value || "-";
  if(mode==="analysis"){
    const a=$("monitorRangeStart")?.value||"-";
    const b=$("monitorRangeEnd")?.value||"-";
    return `${a} s.d. ${b}`;
  }
  return $("monitorYear")?.value || "-";
}

function monitorPeriodBounds(mode){
  if(mode==="daily"){
    const d=$("monitorDate")?.value || null;
    return d ? {start:d,end:d} : null;
  }
  if(mode==="monthly"){
    const m=$("monitorMonth")?.value || null;
    return m ? yearMonthBounds(m) : null;
  }
  const y=Number($("monitorYear")?.value||0);
  return y ? {start:`${y}-01-01`,end:`${y}-12-31`} : null;
}

async function getMonitorExpenseSummary(kp,mode){
  const bounds=monitorPeriodBounds(mode);
  if(!bounds) return {total:0,count:0,categories:0,kpCount:0,rows:[]};

  let q=db.from("unit_expenses")
    .select("expense_date,kp_code,category,amount")
    .gte("expense_date",bounds.start)
    .lte("expense_date",bounds.end);

  if(kp!=="ALL") q=q.eq("kp_code",kp);

  const {data,error}=await q;
  if(error){
    console.error("Monitor expense summary error:",error);
    return {total:0,count:0,categories:0,kpCount:0,rows:[],error:error.message};
  }

  const rows=data||[];
  return {
    total:rows.reduce((a,r)=>a+Number(r.amount||0),0),
    count:rows.length,
    categories:new Set(rows.map(r=>r.category||"Lainnya")).size,
    kpCount:new Set(rows.map(r=>r.kp_code)).size,
    rows
  };
}

function setMonitorPeriodBusinessKpis({kp,mode,tonnage,trips,tonnageSource,expense}){
  const kpLabel=kp==="ALL"?"Semua KP":kp;
  const periodLabel=monitorPeriodLabel(mode);
  const modeLabel=mode==="daily"?"Harian":mode==="monthly"?"Bulanan":"Tahunan";

  if($("monitorPeriodTonnage")){
    $("monitorPeriodTonnage").textContent=kg(tonnage||0);
    $("monitorPeriodTonnageSub").textContent=
      `${kpLabel} • ${modeLabel} ${periodLabel}${tonnageSource?" • "+tonnageSource:""}`;
  }

  if($("monitorPeriodExpense")){
    $("monitorPeriodExpense").textContent=rupiah(expense?.total||0);
    $("monitorPeriodExpenseSub").textContent=
      `${kpLabel} • ${Number(expense?.count||0).toLocaleString("id-ID")} transaksi biaya`;
  }

  if($("monitorPeriodTrip")){
    $("monitorPeriodTrip").textContent=trips==null?"—":Number(trips||0).toLocaleString("id-ID");
    $("monitorPeriodTripSub").textContent=
      trips==null ? "Trip tidak tersedia untuk periode ini" : `${kpLabel} • total trip periode`;
  }

  if($("monitorPeriodExpenseCategories")){
    $("monitorPeriodExpenseCategories").textContent=Number(expense?.categories||0).toLocaleString("id-ID");
    $("monitorPeriodExpenseCategoriesSub").textContent=
      `${Number(expense?.kpCount||0).toLocaleString("id-ID")} KP memiliki pengeluaran`;
  }
}

function groupTonnageRowsByKp(rows){
  const map={};
  (rows||[]).forEach(r=>{
    const kp=r.kp_code;
    if(!kp) return;
    if(!map[kp]) map[kp]={tonnage:0,trips:0};
    map[kp].tonnage+=Number(r.tonnage_kg||0);
    map[kp].trips+=Number(r.trip_count||0);
  });
  return map;
}

function groupExpenseRowsByKp(rows){
  const map={};
  (rows||[]).forEach(r=>{
    const kp=r.kp_code;
    if(!kp) return;
    if(!map[kp]) map[kp]={amount:0,count:0};
    map[kp].amount+=Number(r.amount||0);
    map[kp].count+=1;
  });
  return map;
}

async function loadMonitorKpPeriodTable(mode,selectedKp){
  if(!$("monitorKpPeriodSummaryTable")) return;

  const bounds=monitorPeriodBounds(mode);
  if(!bounds){
    $("monitorKpPeriodSummaryTable").innerHTML=table(["Keterangan"],[["Periode belum dipilih"]]);
    return;
  }

  let tonnageMap={};
  let tripAvailable=true;
  let sourceLabel="";

  if(mode==="daily"){
    const date=bounds.start;

    // Prefer final closing for the day.
    const {data:closingRows}=await db.from("kp_daily_history")
      .select("report_date,kp_code,supplier_name,tonnage_kg,trip_count,source_file")
      .eq("report_date",date);

    const chosen=summarizeClosingHistory(closingRows||[]).selected;
    if(chosen.length){
      tonnageMap=groupTonnageRowsByKp(chosen);
      sourceLabel=closingSourceLabelForRows(chosen);
    }else{
      // No closing yet: use latest snapshot as temporary reference.
      const {data:latestSnaps}=await db.from("monitoring_snapshots")
        .select("id,snapshot_time,source_type")
        .eq("report_date",date)
        .order("snapshot_time",{ascending:false})
        .limit(1);

      const latest=latestSnaps?.[0]||null;
      if(latest){
        const {data:details}=await db.from("monitoring_snapshot_details")
          .select("kp_code,tonnage_kg,trip_count")
          .eq("snapshot_id",latest.id);
        tonnageMap=groupTonnageRowsByKp(details||[]);
        sourceLabel=`Snapshot ${latest.snapshot_time.slice(0,5)}`;
      }else{
        sourceLabel="Belum ada tonase";
      }
    }
  }else if(mode==="monthly"){
    const {data:dailyRows}=await db.from("kp_daily_history")
      .select("report_date,kp_code,supplier_name,tonnage_kg,trip_count,source_file")
      .gte("report_date",bounds.start)
      .lte("report_date",bounds.end);

    if(dailyRows?.length){
      const chosen=summarizeClosingHistory(dailyRows).selected;
      tonnageMap=groupTonnageRowsByKp(chosen);
      sourceLabel=closingSourceLabelForRows(chosen);
    }else{
      const [y,m]=String($("monitorMonth")?.value||"").split("-").map(Number);
      const {data:hist}=await db.from("historical_summary")
        .select("kp_code,tonnage_kg")
        .eq("year",y).eq("month",m);
      (hist||[]).forEach(r=>{
        if(!tonnageMap[r.kp_code]) tonnageMap[r.kp_code]={tonnage:0,trips:0};
        tonnageMap[r.kp_code].tonnage+=Number(r.tonnage_kg||0);
      });
      tripAvailable=false;
      sourceLabel="Summary Bulanan";
    }
  }else{
    const year=Number($("monitorYear")?.value||0);
    const {data:hist}=await db.from("historical_summary")
      .select("kp_code,tonnage_kg")
      .eq("year",year);

    (hist||[]).forEach(r=>{
      if(!tonnageMap[r.kp_code]) tonnageMap[r.kp_code]={tonnage:0,trips:0};
      tonnageMap[r.kp_code].tonnage+=Number(r.tonnage_kg||0);
    });
    tripAvailable=false;
    sourceLabel="Historical Summary";
  }

  let eq=db.from("unit_expenses")
    .select("expense_date,kp_code,amount")
    .gte("expense_date",bounds.start)
    .lte("expense_date",bounds.end);
  const {data:expenseRows,error:expenseError}=await eq;
  if(expenseError){
    console.error("KP period expense table error:",expenseError);
  }
  const expenseMap=groupExpenseRowsByKp(expenseRows||[]);

  const codes=(selectedKp==="ALL"
    ? FALLBACK_KP_CODES
    : [selectedKp]
  ).filter(Boolean);

  const rows=codes.map(code=>{
    const t=tonnageMap[code]||{tonnage:0,trips:0};
    const e=expenseMap[code]||{amount:0,count:0};
    return [
      code,
      kg(t.tonnage),
      tripAvailable ? Number(t.trips||0).toLocaleString("id-ID") : "—",
      rupiah(e.amount),
      Number(e.count||0).toLocaleString("id-ID"),
      sourceLabel
    ];
  });

  $("monitorKpPeriodSummaryTable").innerHTML=table(
    ["KP","Total Tonase","Total Trip","Total Pengeluaran","Transaksi Biaya","Sumber Tonase"],
    rows
  );

  if($("monitorKpPeriodSummaryTitle")){
    $("monitorKpPeriodSummaryTitle").textContent=
      selectedKp==="ALL"
        ? "RINGKASAN TONASE & PENGELUARAN SELURUH KP"
        : `RINGKASAN TONASE & PENGELUARAN • ${selectedKp}`;
  }

  if($("monitorKpPeriodSummaryNote")){
    $("monitorKpPeriodSummaryNote").textContent=
      `${mode==="daily"?"Harian":mode==="monthly"?"Bulanan":"Tahunan"} • ${monitorPeriodLabel(mode)}`;
  }
}


function inclusiveDateCount(start,end){
  if(!start||!end) return 0;
  const a=new Date(`${start}T00:00:00`);
  const b=new Date(`${end}T00:00:00`);
  if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime())||b<a) return 0;
  return Math.floor((b-a)/86400000)+1;
}

function syncMonitorRangeFromActivePeriod(){
  let start=null,end=null;

  if(MONITOR_MODE==="analysis"){
    const today=localTodayISO();
    const reference=$("monitorRangeEnd")?.value || today;
    const ym=reference.slice(0,7);
    const bounds=yearMonthBounds(ym);
    start=bounds.start;
    end=ym===today.slice(0,7) ? today : bounds.end;
  }else if(MONITOR_MODE==="daily"){
    const d=$("monitorDate")?.value||null;
    start=d; end=d;
  }else if(MONITOR_MODE==="monthly"){
    const m=$("monitorMonth")?.value||null;
    if(m){
      const b=yearMonthBounds(m);
      start=b.start; end=b.end;
    }
  }else{
    const y=$("monitorYear")?.value||null;
    if(y){
      start=`${y}-01-01`;
      end=`${y}-12-31`;
    }
  }

  if(start && $("monitorRangeStart")) $("monitorRangeStart").value=start;
  if(end && $("monitorRangeEnd")) $("monitorRangeEnd").value=end;
  return loadMonitorRangeDetail();
}
async function fetchMonitorRangeClosingRows(start,end,kp){
  const pageSize=1000;
  let offset=0;
  const all=[];

  while(true){
    let q=db.from("kp_daily_history")
      .select("report_date,kp_code,supplier_name,tonnage_kg,trip_count,source_file")
      .gte("report_date",start)
      .lte("report_date",end)
      .order("report_date",{ascending:true})
      .order("kp_code",{ascending:true})
      .range(offset,offset+pageSize-1);

    if(kp && kp!=="ALL") q=q.eq("kp_code",kp);

    const {data,error}=await q;
    if(error) throw Error("Gagal membaca Closing Harian untuk range tanggal: "+error.message);

    const rows=data||[];
    all.push(...rows);
    if(rows.length<pageSize) break;
    offset+=pageSize;
    if(offset>20000) break;
  }
  return all;
}

async function fetchMonitorRangeExpenseRows(start,end,kp){
  const pageSize=1000;
  let offset=0;
  const all=[];

  while(true){
    let q=db.from("unit_expenses")
      .select("expense_date,kp_code,category,amount")
      .gte("expense_date",start)
      .lte("expense_date",end)
      .order("expense_date",{ascending:true})
      .order("kp_code",{ascending:true})
      .range(offset,offset+pageSize-1);

    if(kp && kp!=="ALL") q=q.eq("kp_code",kp);

    const {data,error}=await q;
    if(error) throw Error("Gagal membaca Pengeluaran untuk range tanggal: "+error.message);

    const rows=data||[];
    all.push(...rows);
    if(rows.length<pageSize) break;
    offset+=pageSize;
    if(offset>20000) break;
  }
  return all;
}

function setMonitorRangeLoading(){
  [
    "monitorRangeTotalTonnage","monitorRangeClosedTonnage","monitorRangeTotalExpense",
    "monitorRangeTotalTrips","monitorRangeCoverage","prodAvgTrip"
  ].forEach(id=>{ if($(id)) $(id).textContent="..."; });
  if($("prodTopKp")) $("prodTopKp").textContent="...";
  if($("prodBottomKp")) $("prodBottomKp").textContent="...";
  if($("prodInsightBadge")) $("prodInsightBadge").textContent="MENGANALISA...";
  if($("prodExecutiveInsight")) $("prodExecutiveInsight").textContent="Mengolah data produksi dan benchmark KP...";
  ["prodRankingChart","prodProductivityChart","prodTrendChart"].forEach(id=>{
    if($(id)){
      try{ Plotly.purge(id); }catch(e){}
      $(id).innerHTML='<div class="chart-empty-state">Menghitung analisa...</div>';
    }
  });
  if($("monitorRangeDetailTable")){
    $("monitorRangeDetailTable").innerHTML='<div class="master-empty">Menghitung analisa produksi...</div>';
  }
}


async function fetchRangeLiveSnapshot(start,end,kp){
  const today=localTodayISO();
  if(!start || !end || today<start || today>end) return null;

  const {data:snaps,error}=await db.from("monitoring_snapshots")
    .select("id,report_date,snapshot_time,source_type,total_tonnage_kg,total_trips")
    .eq("report_date",today)
    .order("snapshot_time",{ascending:false})
    .limit(1);

  if(error) throw Error("Gagal membaca snapshot LIVE: "+error.message);
  const snap=snaps?.[0]||null;
  if(!snap) return null;

  let q=db.from("monitoring_snapshot_details")
    .select("kp_code,supplier_name,tonnage_kg,trip_count")
    .eq("snapshot_id",snap.id);
  if(kp!=="ALL") q=q.eq("kp_code",kp);

  const {data:details,error:de}=await q;
  if(de) throw Error("Gagal membaca detail snapshot LIVE: "+de.message);

  const rows=details||[];
  const total=rows.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
  const trips=rows.reduce((a,r)=>a+Number(r.trip_count||0),0);

  return {
    id:snap.id,
    date:today,
    time:snap.snapshot_time,
    source_type:snap.source_type,
    rows,
    total,
    trips
  };
}

function groupLiveRowsByKp(rows){
  const map={};
  (rows||[]).forEach(r=>{
    if(!map[r.kp_code]) map[r.kp_code]={tonnage:0,trips:0};
    map[r.kp_code].tonnage+=Number(r.tonnage_kg||0);
    map[r.kp_code].trips+=Number(r.trip_count||0);
  });
  return map;
}


async function fetchRangeFinalReconciliations(start,end,kp){
  let q=db.from("tonnage_period_reconciliation")
    .select("period_start,period_end,kp_code,supplier_name,paste_total_kg,paste_trip_count,hold_tonnage_kg,hold_trip_count,source_type,updated_at")
    .gte("period_start",start)
    .lte("period_end",end)
    .order("period_start",{ascending:true})
    .order("kp_code",{ascending:true})
    .order("supplier_name",{ascending:true});
  if(kp!=="ALL") q=q.eq("kp_code",kp);

  const {data,error}=await q;
  if(error) throw Error("Gagal membaca Data Final Paste untuk range: "+error.message);
  return data||[];
}

function rangeSupplierKey(kp,supplier){
  return `${String(kp||"").toUpperCase()}|${String(supplier||"ALL").toUpperCase()}`;
}

function computeRangeFinalFromReconciliation(selectedClosing,recs){
  const closing=selectedClosing||[];
  const reconciliationRows=[];
  let correctionKg=0;
  let correctionTrips=0;
  let holdKg=0;
  let holdTrips=0;

  (recs||[]).forEach(rec=>{
    const rows=closing.filter(r=>
      r.kp_code===rec.kp_code &&
      String(r.supplier_name||"ALL").toUpperCase()===String(rec.supplier_name||"ALL").toUpperCase() &&
      r.report_date>=rec.period_start &&
      r.report_date<=rec.period_end
    );

    const operationalKg=rows.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
    const operationalTrips=rows.reduce((a,r)=>a+Number(r.trip_count||0),0);
    const corrKg=Number(rec.paste_total_kg||0)-operationalKg;
    const corrTrips=Number(rec.paste_trip_count||0)-operationalTrips;

    correctionKg+=corrKg;
    correctionTrips+=corrTrips;
    holdKg+=Number(rec.hold_tonnage_kg||0);
    holdTrips+=Number(rec.hold_trip_count||0);

    reconciliationRows.push({
      ...rec,
      operational_kg:operationalKg,
      operational_trips:operationalTrips,
      correction_kg:corrKg,
      correction_trips:corrTrips
    });
  });

  const closingKg=closing.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
  const closingTrips=closing.reduce((a,r)=>a+Number(r.trip_count||0),0);

  return {
    finalKg:closingKg+correctionKg,
    finalTrips:closingTrips+correctionTrips,
    closingKg,
    closingTrips,
    correctionKg,
    correctionTrips,
    holdKg,
    holdTrips,
    rows:reconciliationRows
  };
}

function groupRangeReconciliationByKp(selectedClosing,reconciliation){
  const closingByKp=groupTonnageRowsByKp(selectedClosing||[]);
  const recByKp={};

  (reconciliation.rows||[]).forEach(r=>{
    if(!recByKp[r.kp_code]){
      recByKp[r.kp_code]={
        correction:0,correctionTrips:0,hold:0,holdTrips:0,
        recCount:0,suppliers:new Set()
      };
    }
    const x=recByKp[r.kp_code];
    x.correction+=Number(r.correction_kg||0);
    x.correctionTrips+=Number(r.correction_trips||0);
    x.hold+=Number(r.hold_tonnage_kg||0);
    x.holdTrips+=Number(r.hold_trip_count||0);
    x.recCount+=1;
    x.suppliers.add(String(r.supplier_name||"ALL").toUpperCase());
  });

  const result={};
  FALLBACK_KP_CODES.forEach(code=>{
    const c=closingByKp[code]||{tonnage:0,trips:0};
    const r=recByKp[code]||{
      correction:0,correctionTrips:0,hold:0,holdTrips:0,recCount:0,suppliers:new Set()
    };
    result[code]={
      closing:Number(c.tonnage||0),
      closingTrips:Number(c.trips||0),
      final:Number(c.tonnage||0)+Number(r.correction||0),
      finalTrips:Number(c.trips||0)+Number(r.correctionTrips||0),
      correction:Number(r.correction||0),
      hold:Number(r.hold||0),
      holdTrips:Number(r.holdTrips||0),
      recCount:Number(r.recCount||0),
      suppliers:r.suppliers
    };
  });
  return result;
}


function runningMonthBounds(referenceDate){
  const ref=String(referenceDate||localTodayISO());
  const ym=ref.slice(0,7);
  const {start,end}=yearMonthBounds(ym);
  const today=localTodayISO();

  // "Bulan berjalan": for the current month, never project beyond today.
  // For a historical month, use the full month.
  const effectiveEnd=ym===today.slice(0,7) ? (today<end?today:end) : end;
  return {month:ym,start,end:effectiveEnd};
}

async function getRunningMonthKpAverage(referenceDate){
  const bounds=runningMonthBounds(referenceDate);

  const [closingRows,recs]=await Promise.all([
    fetchMonitorRangeClosingRows(bounds.start,bounds.end,"ALL"),
    fetchRangeFinalReconciliations(bounds.start,bounds.end,"ALL")
  ]);

  const selected=summarizeClosingHistory(closingRows,{excludeCurrentMonthly:true}).selected||[];
  const reconciliation=computeRangeFinalFromReconciliation(selected,recs);
  const byKp=groupRangeReconciliationByKp(selected,reconciliation);

  const activeRows=FALLBACK_KP_CODES
    .map(code=>({code,...(byKp[code]||{})}))
    .filter(r=>Number(r.final||0)>0);

  const totalKg=activeRows.reduce((a,r)=>a+Number(r.final||0),0);
  const kpCount=activeRows.length;
  const averageKg=kpCount ? totalKg/kpCount : 0;

  return {
    ...bounds,
    averageKg,
    totalKg,
    kpCount,
    rows:activeRows,
    reconciliationCount:recs.length
  };
}


function productionBenchmarkStatus(value,average){
  if(!average || !value) return {label:"BELUM ADA DATA",ratio:0,className:"no-data"};
  const ratio=value/average;
  if(ratio>1.10) return {label:"DI ATAS RATA-RATA",ratio,className:"above"};
  if(ratio>=0.90) return {label:"NORMAL",ratio,className:"normal"};
  return {label:"PERLU PERHATIAN",ratio,className:"attention"};
}

function buildProductionKpRows(finalByKp,expenseByKp){
  return FALLBACK_KP_CODES.map(code=>{
    const f=finalByKp[code]||{
      closing:0,closingTrips:0,final:0,finalTrips:0,correction:0,
      hold:0,holdTrips:0,recCount:0
    };
    const e=expenseByKp[code]||{amount:0,count:0};
    return {
      kp:code,
      tonnage:Number(f.final||0),
      trips:Number(f.finalTrips||0),
      kgPerTrip:Number(f.finalTrips||0)>0 ? Number(f.final||0)/Number(f.finalTrips||0) : 0,
      closing:Number(f.closing||0),
      correction:Number(f.correction||0),
      hold:Number(f.hold||0),
      holdTrips:Number(f.holdTrips||0),
      expense:Number(e.amount||0),
      expenseCount:Number(e.count||0),
      recCount:Number(f.recCount||0),
      source:Number(f.recCount||0)>0 ? "FINAL PASTE" : Number(f.closing||0)>0 ? "CLOSING / SEMENTARA" : "BELUM ADA DATA"
    };
  });
}

function buildOperationalDailyTrend(rows){
  const map={};
  (rows||[]).forEach(r=>{
    if(!map[r.report_date]) map[r.report_date]={tonnage:0,trips:0,kps:new Set()};
    map[r.report_date].tonnage+=Number(r.tonnage_kg||0);
    map[r.report_date].trips+=Number(r.trip_count||0);
    map[r.report_date].kps.add(r.kp_code);
  });
  return Object.keys(map).sort().map(date=>({
    date,
    tonnage:map[date].tonnage,
    trips:map[date].trips,
    kpCount:map[date].kps.size
  }));
}

function renderProductionAnalysisCharts(activeRows,dailyTrend,selectedKp){
  const rankRows=[...activeRows].sort((a,b)=>b.tonnage-a.tonnage);
  const productivityRows=[...activeRows].filter(r=>r.trips>0).sort((a,b)=>b.kgPerTrip-a.kgPerTrip);

  resetPlotContainer("prodRankingChart");
  if(rankRows.length){
    Plotly.newPlot("prodRankingChart",[{
      x:rankRows.map(r=>r.tonnage),
      y:rankRows.map(r=>r.kp),
      type:"bar",orientation:"h",
      text:rankRows.map(r=>compactKg(r.tonnage)),
      textposition:"auto",
      marker:{color:rankRows.map(r=>r.kp===selectedKp?"#9ee8ff":"#49de5f")},
      customdata:rankRows.map(r=>[r.trips,r.kgPerTrip,r.source]),
      hovertemplate:"<b>%{y}</b><br>%{x:,.0f} kg<br>%{customdata[0]} trip<br>%{customdata[1]:,.0f} kg/trip<br>%{customdata[2]}<extra></extra>"
    }],{
      ...darkLayout,
      margin:{t:15,l:70,r:20,b:38},
      xaxis:{...darkLayout.xaxis,tickformat:"~s",fixedrange:true},
      yaxis:{...darkLayout.yaxis,autorange:"reversed",fixedrange:true},
      showlegend:false
    },plotConfig);
  }else{
    $("prodRankingChart").innerHTML='<div class="chart-empty-state">Belum ada produksi pada periode ini.</div>';
  }

  resetPlotContainer("prodProductivityChart");
  if(productivityRows.length){
    Plotly.newPlot("prodProductivityChart",[{
      x:productivityRows.map(r=>r.kgPerTrip),
      y:productivityRows.map(r=>r.kp),
      type:"bar",orientation:"h",
      text:productivityRows.map(r=>`${Math.round(r.kgPerTrip).toLocaleString("id-ID")} kg`),
      textposition:"auto",
      marker:{color:productivityRows.map(r=>r.kp===selectedKp?"#9ee8ff":"#49de5f")},
      customdata:productivityRows.map(r=>[r.tonnage,r.trips]),
      hovertemplate:"<b>%{y}</b><br>%{x:,.0f} kg/trip<br>%{customdata[0]:,.0f} kg<br>%{customdata[1]} trip<extra></extra>"
    }],{
      ...darkLayout,
      margin:{t:15,l:70,r:20,b:38},
      xaxis:{...darkLayout.xaxis,tickformat:"~s",fixedrange:true},
      yaxis:{...darkLayout.yaxis,autorange:"reversed",fixedrange:true},
      showlegend:false
    },plotConfig);
  }else{
    $("prodProductivityChart").innerHTML='<div class="chart-empty-state">Belum ada data trip untuk analisa produktivitas.</div>';
  }

  resetPlotContainer("prodTrendChart");
  if(dailyTrend.length){
    const rolling=dailyTrend.map((r,i)=>{
      const from=Math.max(0,i-2);
      const arr=dailyTrend.slice(from,i+1);
      return arr.reduce((a,x)=>a+x.tonnage,0)/arr.length;
    });

    Plotly.newPlot("prodTrendChart",[
      {
        x:dailyTrend.map(r=>r.date),
        y:dailyTrend.map(r=>r.tonnage),
        type:"scatter",mode:"lines+markers",
        name:"Closing Harian",
        line:{width:2},
        customdata:dailyTrend.map(r=>[r.trips,r.kpCount]),
        hovertemplate:"%{x}<br>%{y:,.0f} kg<br>%{customdata[0]} trip<br>%{customdata[1]} KP<extra></extra>"
      },
      {
        x:dailyTrend.map(r=>r.date),
        y:rolling,
        type:"scatter",mode:"lines",
        name:"Rata-rata 3 titik",
        line:{width:2,dash:"dot"},
        hovertemplate:"%{x}<br>Rata-rata %{y:,.0f} kg<extra></extra>"
      }
    ],{
      ...darkLayout,
      margin:{t:20,l:60,r:20,b:45},
      xaxis:{...darkLayout.xaxis,fixedrange:true},
      yaxis:{...darkLayout.yaxis,tickformat:"~s",rangemode:"tozero",fixedrange:true},
      legend:{orientation:"h",x:0,y:1.12,font:{size:9,color:"#c8bdaf"}}
    },plotConfig);
  }else{
    $("prodTrendChart").innerHTML='<div class="chart-empty-state">Belum ada Closing harian untuk grafik tren operasional.</div>';
  }
}

function renderExecutiveProductionInsight({
  start,end,scopeLabel,totalTonnage,totalTrips,avgKgPerTrip,
  activeRows,averageKp,top,bottom,bestProductivity,belowCount,
  holdKg,holdTrips,totalExpense,live
}){
  const contributionTop=totalTonnage>0 && top ? top.tonnage/activeRows.reduce((a,r)=>a+r.tonnage,0)*100 : 0;
  const expensePerKg=totalTonnage>0 ? totalExpense/totalTonnage : 0;

  const trendNote=belowCount
    ? `${belowCount} KP berada lebih dari 10% di bawah benchmark rata-rata dan layak menjadi agenda evaluasi.`
    : "Tidak ada KP aktif yang berada lebih dari 10% di bawah benchmark rata-rata.";

  const items=[
    `<b>Produksi ${scopeLabel}</b> untuk ${dateLabelId(start)} s.d. ${dateLabelId(end)} mencapai <b>${kg(totalTonnage)}</b> dari <b>${Number(totalTrips).toLocaleString("id-ID")} trip</b>, atau rata-rata <b>${Math.round(avgKgPerTrip||0).toLocaleString("id-ID")} kg/trip</b>.`,
    top ? `<b>${top.kp}</b> menjadi KP dengan produksi tertinggi sebesar <b>${kg(top.tonnage)}</b>${contributionTop?` dan menyumbang sekitar <b>${contributionTop.toFixed(1)}%</b> dari total KP aktif.`:""}` : "Belum ada KP dengan produksi pada periode ini.",
    bottom ? `<b>${bottom.kp}</b> memiliki produksi terendah di antara KP aktif sebesar <b>${kg(bottom.tonnage)}</b>. ${trendNote}` : trendNote,
    bestProductivity ? `Produktivitas angkutan tertinggi tercatat di <b>${bestProductivity.kp}</b> dengan sekitar <b>${Math.round(bestProductivity.kgPerTrip).toLocaleString("id-ID")} kg/trip</b>.` : "Belum ada data trip yang cukup untuk membandingkan produktivitas.",
    holdKg>0 ? `Terdapat <b>${kg(holdKg)}</b> / <b>${holdTrips.toLocaleString("id-ID")} trip HOLD</b>. Tonase tersebut sudah termasuk produksi final tetapi belum memiliki tanggal pembayaran.` : "Tidak ada HOLD pada data final yang tercakup periode.",
    totalExpense>0 ? `Pengeluaran periode sebesar <b>${rupiah(totalExpense)}</b>, setara sekitar <b>Rp${Math.round(expensePerKg).toLocaleString("id-ID")}/kg</b> terhadap produksi dalam scope analisa.` : "Belum ada pengeluaran tercatat pada periode analisa.",
    live ? `Snapshot LIVE terbaru <b>${live.time.slice(0,5)}</b> tetap dipisahkan dari angka evaluasi final agar bahan meeting tidak mencampur data sementara.` : "Analisa tidak mencampurkan snapshot LIVE ke angka produksi final."
  ];

  if($("prodExecutiveInsight")){
    $("prodExecutiveInsight").innerHTML=
      `<div class="production-insight-period">${scopeLabel} • ${dateLabelId(start)} — ${dateLabelId(end)}</div>`+
      `<div class="production-insight-list">${items.map((x,i)=>`<div class="production-insight-item"><span>${i+1}</span><p>${x}</p></div>`).join("")}</div>`+
      `<div class="production-insight-foot">Catatan evaluasi: status di bawah rata-rata adalah indikator untuk ditinjau bersama target, hari operasi, pasokan, jarak angkut, dan kondisi unit; bukan kesimpulan penyebab.</div>`;
  }
  if($("prodInsightBadge")){
    $("prodInsightBadge").textContent=activeRows.length ? `${activeRows.length} KP AKTIF` : "BELUM ADA DATA";
  }
}

async function loadMonitorRangeDetail(){
  if(!$("monitorRangeStart") || !$("monitorRangeEnd")) return;

  const start=$("monitorRangeStart").value;
  const end=$("monitorRangeEnd").value;
  const kp=$("monitorKp")?.value||"ALL";

  if(!start || !end){
    if($("monitorRangeStatus")) $("monitorRangeStatus").textContent="Pilih tanggal mulai dan tanggal akhir, lalu klik Analisa Produksi.";
    return;
  }
  if(end<start){
    if($("monitorRangeStatus")) $("monitorRangeStatus").textContent="Tanggal Akhir tidak boleh lebih kecil dari Tanggal Mulai.";
    return;
  }

  setMonitorRangeLoading();

  try{
    // Always load company-wide data for benchmark/ranking.
    // Selected KP only changes the main scope KPI and insight focus.
    const [
      allClosingRows,allExpenseRows,allRecs,
      scopeClosingRows,scopeExpenseRows,scopeRecs,scopeLive
    ]=await Promise.all([
      fetchMonitorRangeClosingRows(start,end,"ALL"),
      fetchMonitorRangeExpenseRows(start,end,"ALL"),
      fetchRangeFinalReconciliations(start,end,"ALL"),
      kp==="ALL" ? fetchMonitorRangeClosingRows(start,end,"ALL") : fetchMonitorRangeClosingRows(start,end,kp),
      kp==="ALL" ? fetchMonitorRangeExpenseRows(start,end,"ALL") : fetchMonitorRangeExpenseRows(start,end,kp),
      kp==="ALL" ? fetchRangeFinalReconciliations(start,end,"ALL") : fetchRangeFinalReconciliations(start,end,kp),
      fetchRangeLiveSnapshot(start,end,kp)
    ]);

    const allSelected=summarizeClosingHistory(allClosingRows,{excludeCurrentMonthly:true}).selected||[];
    const allReconciliation=computeRangeFinalFromReconciliation(allSelected,allRecs);
    const allFinalByKp=groupRangeReconciliationByKp(allSelected,allReconciliation);
    const expenseByKp=groupExpenseRowsByKp(allExpenseRows);
    const allRows=buildProductionKpRows(allFinalByKp,expenseByKp);
    const activeRows=allRows.filter(r=>r.tonnage>0);

    const totalCompanyKg=activeRows.reduce((a,r)=>a+r.tonnage,0);
    const totalCompanyTrips=activeRows.reduce((a,r)=>a+r.trips,0);
    const averageKp=activeRows.length ? totalCompanyKg/activeRows.length : 0;

    activeRows.forEach(r=>{
      r.contribution=totalCompanyKg ? r.tonnage/totalCompanyKg : 0;
      r.benchmark=productionBenchmarkStatus(r.tonnage,averageKp);
    });

    const rankRows=[...activeRows].sort((a,b)=>b.tonnage-a.tonnage);
    const top=rankRows[0]||null;
    const bottom=rankRows.length>1 ? rankRows[rankRows.length-1] : rankRows[0]||null;
    const bestProductivity=[...activeRows].filter(r=>r.trips>0).sort((a,b)=>b.kgPerTrip-a.kgPerTrip)[0]||null;
    const belowRows=activeRows.filter(r=>r.benchmark.className==="attention");

    const scopeSelected=kp==="ALL"
      ? allSelected
      : summarizeClosingHistory(scopeClosingRows,{excludeCurrentMonthly:true}).selected||[];
    const scopeReconciliation=kp==="ALL"
      ? allReconciliation
      : computeRangeFinalFromReconciliation(scopeSelected,scopeRecs);

    const totalTonnage=Number(scopeReconciliation.finalKg||0);
    const totalTrips=Number(scopeReconciliation.finalTrips||0);
    const avgKgPerTrip=totalTrips ? totalTonnage/totalTrips : 0;
    const holdKg=Number(scopeReconciliation.holdKg||0);
    const holdTrips=Number(scopeReconciliation.holdTrips||0);
    const totalExpense=scopeExpenseRows.reduce((a,r)=>a+Number(r.amount||0),0);
    const expensePerKg=totalTonnage ? totalExpense/totalTonnage : 0;
    const scopeLabel=kp==="ALL"?"Semua KP":kp;

    const selectedRow=kp==="ALL" ? null : activeRows.find(r=>r.kp===kp)||null;
    const selectedBenchmark=selectedRow?.benchmark||null;

    // Main KPI
    if($("monitorRangeTotalTonnage")) $("monitorRangeTotalTonnage").textContent=kg(totalTonnage);
    if($("monitorRangeClosedTonnage")) $("monitorRangeClosedTonnage").textContent=kg(averageKp);
    if($("monitorRangeTotalTrips")) $("monitorRangeTotalTrips").textContent=Number(totalTrips).toLocaleString("id-ID");
    if($("prodAvgTrip")) $("prodAvgTrip").textContent=`${Math.round(avgKgPerTrip||0).toLocaleString("id-ID")} kg`;
    if($("monitorRangeCoverage")) $("monitorRangeCoverage").textContent=kg(holdKg);
    if($("monitorRangeTotalExpense")) $("monitorRangeTotalExpense").textContent=rupiah(totalExpense);

    if($("prodTopKp")) $("prodTopKp").textContent=top?.kp||"—";
    if($("prodTopKpSub")) $("prodTopKpSub").textContent=top?`${kg(top.tonnage)} • ${top.trips.toLocaleString("id-ID")} trip`:"Belum ada data";
    if($("prodBottomKp")) $("prodBottomKp").textContent=bottom?.kp||"—";
    if($("prodBottomKpSub")) $("prodBottomKpSub").textContent=bottom?`${kg(bottom.tonnage)} • ${bottom.benchmark.label}`:"Belum ada data";

    if($("monitorRangeTonnageSub")){
      $("monitorRangeTonnageSub").textContent=
        kp==="ALL"
          ? `${activeRows.length} KP aktif • sumber final terbaik`
          : selectedBenchmark
            ? `${kp} • ${selectedBenchmark.label} • ${(selectedBenchmark.ratio*100).toFixed(0)}% dari benchmark`
            : `${kp} • belum ada produksi`;
    }
    if($("monitorRangeClosedSub")){
      $("monitorRangeClosedSub").textContent=
        `${activeRows.length} KP aktif • benchmark periode ${dateLabelId(start)}–${dateLabelId(end)}`;
    }
    if($("monitorRangeTripSub")){
      $("monitorRangeTripSub").textContent=
        `Produktivitas ${Math.round(avgKgPerTrip||0).toLocaleString("id-ID")} kg/trip`;
    }
    if($("prodAvgTripSub")){
      $("prodAvgTripSub").textContent=
        kp==="ALL"
          ? `Company-wide • ${totalCompanyTrips.toLocaleString("id-ID")} trip`
          : `${kp} • dibanding benchmark company`;
    }
    if($("monitorRangeCoverageSub")){
      $("monitorRangeCoverageSub").textContent=
        `${holdTrips.toLocaleString("id-ID")} trip HOLD • sudah termasuk produksi final`;
    }
    if($("monitorRangeExpenseSub")){
      $("monitorRangeExpenseSub").textContent=
        `${scopeExpenseRows.length.toLocaleString("id-ID")} transaksi • ± Rp${Math.round(expensePerKg).toLocaleString("id-ID")}/kg`;
    }

    const liveText=scopeLive
      ? ` • LIVE ${scopeLive.time.slice(0,5)} ${kg(scopeLive.total)} tidak masuk final`
      : "";
    if($("monitorRangeStatus")){
      $("monitorRangeStatus").textContent=
        `ANALISA PRODUKSI • ${scopeLabel} • ${dateLabelId(start)} s.d. ${dateLabelId(end)} • `+
        `${kg(totalTonnage)} • ${totalTrips.toLocaleString("id-ID")} trip${liveText}`;
    }

    // Charts: ranking/productivity always company-wide for comparison.
    // Operational trend follows selected scope.
    const trendRows=buildOperationalDailyTrend(scopeSelected);
    renderProductionAnalysisCharts(activeRows,trendRows,kp==="ALL"?null:kp);

    renderExecutiveProductionInsight({
      start,end,scopeLabel,totalTonnage,totalTrips,avgKgPerTrip,
      activeRows,averageKp,top,bottom,bestProductivity,
      belowCount:belowRows.length,
      holdKg,holdTrips,totalExpense,live:scopeLive
    });

    // Ranking table for meeting.
    const tableRows=rankRows.map((r,i)=>{
      const vsAvg=averageKp ? (r.tonnage-averageKp)/averageKp : 0;
      return [
        i+1,
        r.kp,
        kg(r.tonnage),
        r.trips.toLocaleString("id-ID"),
        `${Math.round(r.kgPerTrip).toLocaleString("id-ID")} kg`,
        `${(r.contribution*100).toFixed(1)}%`,
        `${vsAvg>=0?"+":""}${(vsAvg*100).toFixed(1)}%`,
        kg(r.hold),
        rupiah(r.expense),
        r.benchmark.label,
        r.source
      ];
    });

    $("monitorRangeDetailTitle").textContent=
      `RANKING & EVALUASI KP — ${dateLabelId(start)} s.d. ${dateLabelId(end)}`;
    $("monitorRangeDetailTable").innerHTML=tableRows.length
      ? table(
          ["Rank","KP","Produksi","Trip","Kg/Trip","Kontribusi","vs Rata-rata","HOLD","Pengeluaran","Evaluasi","Sumber"],
          tableRows
        )
      : '<div class="master-empty">Belum ada produksi pada periode analisa.</div>';

  }catch(e){
    console.error(e);
    if($("monitorRangeStatus")) $("monitorRangeStatus").textContent="ERROR ANALISA: "+e.message;
    if($("prodInsightBadge")) $("prodInsightBadge").textContent="ERROR";
    if($("prodExecutiveInsight")) $("prodExecutiveInsight").textContent=e.message;
    if($("monitorRangeDetailTable")){
      $("monitorRangeDetailTable").innerHTML=`<div class="master-empty">ERROR: ${e.message}</div>`;
    }
  }
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
function closingSourceType(sourceFile){
  const s=String(sourceFile||"");
  if(s.startsWith("AUDIT:")) return "audit";
  if(s.startsWith("PASTE:FINAL:")) return "paste_final";
  if(s.startsWith("MONTHLY:FINAL:")) return "excel_final";
  if(s.startsWith("DAILY:")) return "excel";
  if(s.startsWith("WHATSAPP:CLOSING:")) return "whatsapp";
  if(s.startsWith("MONTHLY:")) return "monthly";
  // Legacy monthly uploads before source prefixes used raw .xlsx filenames.
  if(/\.xlsx?$/i.test(s)) return "monthly";
  return "other";
}

function closingSourceDisplay(type){
  if(type==="audit") return "Audit Resmi";
  if(type==="paste_final") return "Paste Detail Final";
  if(type==="excel_final") return "Excel Final";
  if(type==="excel") return "Closing Excel";
  if(type==="whatsapp") return "Closing WhatsApp (sementara)";
  if(type==="monthly") return "Excel Bulanan Lama";
  return "Closing Harian";
}

function summarizeClosingHistory(rows,{excludeCurrentMonthly=true}={}){
  // Canonical priority is per Date + KP + Supplier.
  // Excel Bulanan FINAL is authoritative over operational WhatsApp closing.
  const grouped=new Map();
  (rows||[]).forEach(r=>{
    const supplier=String(r.supplier_name||"ALL").toUpperCase();
    const key=`${r.report_date}|${r.kp_code}|${supplier}`;
    if(!grouped.has(key)) grouped.set(key,{
      audit:[],paste_final:[],excel_final:[],excel:[],whatsapp:[],monthly:[],other:[]
    });
    grouped.get(key)[closingSourceType(r.source_file)].push(r);
  });

  const selected=[];
  const today=typeof localTodayISO==="function" ? localTodayISO() : null;

  grouped.forEach(g=>{
    let chosen=
      g.audit.length ? g.audit :
      g.paste_final.length ? g.paste_final :
      g.excel_final.length ? g.excel_final :
      g.excel.length ? g.excel :
      g.whatsapp.length ? g.whatsapp :
      g.monthly.length ? g.monthly :
      g.other;

    // Only legacy monthly-derived rows are excluded on current day.
    // MONTHLY:FINAL is explicitly accepted as final even if uploaded today.
    if(excludeCurrentMonthly && today && chosen.length &&
       chosen.every(r=>closingSourceType(r.source_file)==="monthly") &&
       chosen[0].report_date>=today){
      chosen=[];
    }

    selected.push(...chosen);
  });

  const byDate={};
  selected.forEach(r=>{
    if(!byDate[r.report_date]){
      byDate[r.report_date]={tonnage:0,trips:0,kps:new Set(),sources:new Set()};
    }
    const d=byDate[r.report_date];
    d.tonnage+=Number(r.tonnage_kg||0);
    d.trips+=Number(r.trip_count||0);
    d.kps.add(r.kp_code);
    d.sources.add(closingSourceType(r.source_file));
  });

  Object.values(byDate).forEach(d=>{
    const labels=[...d.sources].map(closingSourceDisplay);
    d.sourceLabel=labels.length ? labels.join(" + ") : "Closing Harian";
    d.kpCount=d.kps.size;
  });

  return {selected,byDate};
}

function closingSourceLabelForRows(rows){
  const types=[...new Set((rows||[]).map(r=>closingSourceType(r.source_file)))];
  const kps=new Set((rows||[]).map(r=>r.kp_code));
  let label=types.length ? types.map(closingSourceDisplay).join(" + ") : "Closing Harian";
  if(kps.size>1) label+=` (${kps.size} KP)`;
  return label;
}

async function loadKPMonitoring(){
  if(!$("monitorKp")) return;
  const kp=$("monitorKp").value || "ALL";

  if(MONITOR_MODE==="analysis"){
    ensureProductionAnalysisRange();
    if($("monitorRangeStart")?.value && $("monitorRangeEnd")?.value){
      await loadMonitorRangeDetail();
    }
    return;
  }

  if(MONITOR_MODE==="daily") await loadKPDaily(kp);
  else if(MONITOR_MODE==="monthly") await loadKPMonthlyPanel(kp);
  else await loadKPYearlyPanel(kp);
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

async function getMonthlyPasteReconciliations(kp,monthStart,monthEnd){
  let q=db.from("tonnage_period_reconciliation")
    .select("period_start,period_end,kp_code,supplier_name,paste_total_kg,paste_trip_count,paid_tonnage_kg,paid_trip_count,hold_tonnage_kg,hold_trip_count,closing_total_kg,closing_trip_count,reconciliation_kg,reconciliation_trip_count,source_type,updated_at")
    .eq("period_start",monthStart)
    .lte("period_end",monthEnd)
    .order("period_end",{ascending:false});
  if(kp!=="ALL") q=q.eq("kp_code",kp);
  const {data,error}=await q;
  if(error){
    console.error("tonnage_period_reconciliation:",error);
    return [];
  }

  // Latest period_end per KP + supplier.
  const latest=new Map();
  (data||[]).forEach(r=>{
    const key=`${r.kp_code}|${String(r.supplier_name||"ALL").toUpperCase()}`;
    if(!latest.has(key)) latest.set(key,r);
  });
  return [...latest.values()];
}

function monthlyFinalWithReconciliation(closingRows,recs,monthEnd){
  const selected=summarizeClosingHistory(closingRows||[]).selected;
  const recByKey=new Map((recs||[]).map(r=>[
    `${r.kp_code}|${String(r.supplier_name||"ALL").toUpperCase()}`,r
  ]));

  const closingByKey=new Map();
  selected.forEach(r=>{
    const key=`${r.kp_code}|${String(r.supplier_name||"ALL").toUpperCase()}`;
    if(!closingByKey.has(key)) closingByKey.set(key,[]);
    closingByKey.get(key).push(r);
  });

  const allKeys=new Set([...closingByKey.keys(),...recByKey.keys()]);
  let total=0,trips=0,holdKg=0,holdTrips=0,correctionKg=0,correctionTrips=0;
  const detail=[];

  allKeys.forEach(key=>{
    const closing=closingByKey.get(key)||[];
    const rec=recByKey.get(key)||null;
    const [kpCode,supplierKey]=key.split("|");

    if(rec){
      const afterRows=closing.filter(r=>r.report_date>rec.period_end && r.report_date<=monthEnd);
      const afterKg=afterRows.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
      const afterTrips=afterRows.reduce((a,r)=>a+Number(r.trip_count||0),0);
      const finalKg=Number(rec.paste_total_kg||0)+afterKg;
      const finalTrips=Number(rec.paste_trip_count||0)+afterTrips;

      total+=finalKg;
      trips+=finalTrips;
      holdKg+=Number(rec.hold_tonnage_kg||0);
      holdTrips+=Number(rec.hold_trip_count||0);
      correctionKg+=Number(rec.reconciliation_kg||0);
      correctionTrips+=Number(rec.reconciliation_trip_count||0);

      detail.push({
        kp_code:rec.kp_code,
        supplier_name:rec.supplier_name,
        period_end:rec.period_end,
        final_kg:finalKg,
        final_trips:finalTrips,
        paste_kg:Number(rec.paste_total_kg||0),
        after_kg:afterKg,
        hold_kg:Number(rec.hold_tonnage_kg||0),
        hold_trips:Number(rec.hold_trip_count||0),
        correction_kg:Number(rec.reconciliation_kg||0),
        source:"Paste Detail Final"
      });
    }else{
      const kgTotal=closing.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
      const tripTotal=closing.reduce((a,r)=>a+Number(r.trip_count||0),0);
      total+=kgTotal;
      trips+=tripTotal;
      if(closing.length){
        detail.push({
          kp_code:kpCode,
          supplier_name:closing[0].supplier_name||supplierKey,
          period_end:null,
          final_kg:kgTotal,
          final_trips:tripTotal,
          paste_kg:0,
          after_kg:0,
          hold_kg:0,
          hold_trips:0,
          correction_kg:0,
          source:"Closing Sementara"
        });
      }
    }
  });

  return {total,trips,holdKg,holdTrips,correctionKg,correctionTrips,detail};
}

async function loadKPMonthlyPanel(kp){
  const month=$("monitorMonth").value;
  if(!month) return;
  const {start,end}=yearMonthBounds(month);
  const [year,monthNum]=month.split("-").map(Number);

  let dq=db.from("kp_daily_history")
    .select("report_date,kp_code,supplier_name,tonnage_kg,trip_count,source_file")
    .gte("report_date",start).lte("report_date",end)
    .order("report_date",{ascending:true});
  if(kp!=="ALL") dq=dq.eq("kp_code",kp);

  const [{data:daily,error:de},recs]=await Promise.all([
    dq,
    getMonthlyPasteReconciliations(kp,start,end)
  ]);

  if(de){
    resetPlotContainer("monthlyMonitorChart");
    $("monthlyMonitorChart").innerHTML=`<div class="chart-empty-state">${de.message}</div>`;
    return;
  }

  if((daily?.length) || recs.length){
    const closing=summarizeClosingHistory(daily||[]);
    const byDate=closing.byDate;
    const dates=Object.keys(byDate).sort();
    const vals=dates.map(d=>byDate[d].tonnage);
    const finalMonth=monthlyFinalWithReconciliation(daily||[],recs,end);

    const closingTotal=vals.reduce((a,b)=>a+b,0);
    const closingTrips=dates.reduce((a,d)=>a+byDate[d].trips,0);
    const total=finalMonth.total;
    const trips=finalMonth.trips;
    const avg=dates.length?closingTotal/dates.length:0;

    const monthlyStatus=recs.length
      ? (finalMonth.detail.some(r=>r.source==="Closing Sementara") ? "FINAL + SEMENTARA" : "FINAL PASTE")
      : "SEMENTARA";

    const monthlyExpense=await getMonitorExpenseSummary(kp,"monthly");
    setMonitorPeriodBusinessKpis({
      kp,mode:"monthly",tonnage:total,trips,
      tonnageSource:recs.length?"Paste Detail Final + Closing":"Closing Harian",
      expense:monthlyExpense
    });
    await loadMonitorKpPeriodTable("monthly",kp);

    setMonthlyPanelSummary({
      kp,period:monthLabelId(month),tonnage:total,trips,
      coverage:`${dates.length} hari Closing`,
      tonnageSub:recs.length
        ? `${monthlyStatus} • Koreksi periode ${finalMonth.correctionKg>=0?"+":""}${kg(finalMonth.correctionKg)}`
        : `SEMENTARA • rata-rata Closing ${kg(avg)} / hari`,
      tripsSub:recs.length
        ? `HOLD ${finalMonth.holdTrips} trip / ${kg(finalMonth.holdKg)}`
        : `${closingTrips} trip Closing`,
      coverageSub:recs.length
        ? `${recs.length} supplier memiliki Paste Final`
        : "Belum ada Paste Final"
    });

    if($("monthlySourceBadge")){
      $("monthlySourceBadge").textContent=monthlyStatus;
      $("monthlySourceBadge").className=
        "monitor-source-badge "+(monthlyStatus==="FINAL PASTE"?"final-source":monthlyStatus==="SEMENTARA"?"temporary-source":"mixed-source");
    }

    resetPlotContainer("monthlyMonitorChart");
    if(dates.length){
      Plotly.newPlot("monthlyMonitorChart",[{
        x:dates.map(d=>d.slice(8,10)),
        y:vals,type:"bar",
        text:vals.map(v=>compactKg(v)),
        textposition:"outside",
        cliponaxis:false,
        marker:{color:"#49de5f"},
        customdata:dates.map(d=>[byDate[d].trips,byDate[d].kpCount,byDate[d].sourceLabel]),
        hovertemplate:"Tanggal %{x}<br>%{y:,.0f} kg<br>%{customdata[0]} trip<br>%{customdata[1]} KP<br>%{customdata[2]}<extra></extra>"
      }],{
        ...darkLayout,
        margin:{t:28,l:58,r:18,b:42},
        xaxis:{...darkLayout.xaxis,fixedrange:true},
        yaxis:{...darkLayout.yaxis,rangemode:"tozero",tickformat:"~s",fixedrange:true},
        showlegend:false
      },plotConfig);
    }else{
      $("monthlyMonitorChart").innerHTML="<div class='chart-empty-state'>Paste Final tersedia, tetapi belum ada distribusi Closing Harian.</div>";
    }

    const dateRows=dates.map(d=>[
      d,
      kg(byDate[d].tonnage),
      byDate[d].trips,
      kp==="ALL"?`${byDate[d].kpCount} KP`:kp,
      byDate[d].sourceLabel
    ]);

    const recRows=finalMonth.detail
      .filter(r=>r.source==="Paste Detail Final")
      .map(r=>[
        `KOREKSI s.d. ${r.period_end}`,
        `${r.kp_code}/${r.supplier_name}`,
        kg(r.final_kg),
        `${r.final_trips} trip`,
        `${r.correction_kg>=0?"+":""}${kg(r.correction_kg)}`,
        `${kg(r.hold_kg)} / ${r.hold_trips} HOLD`,
        "Paste Detail Final"
      ]);

    $("monthlyMonitorTable").innerHTML=
      (dateRows.length
        ? table(["Tanggal","Closing Tonase","Trip","KP","Sumber"],dateRows)
        : "")+
      (recRows.length
        ? `<div class="monthly-reconciliation-table-title">REKONSILIASI FINAL PERIODE</div>`+
          table(["Periode","KP / Supplier","Total Final","Trip Final","Koreksi vs Closing","HOLD","Sumber"],recRows)
        : "");
    return;
  }

  let sq=db.from("historical_summary")
    .select("kp_code,tonnage_kg")
    .eq("year",year).eq("month",monthNum);
  if(kp!=="ALL") sq=sq.eq("kp_code",kp);
  const {data:summary}=await sq;
  const rows=summary||[];
  const total=rows.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);

  const monthlyExpense=await getMonitorExpenseSummary(kp,"monthly");
  setMonitorPeriodBusinessKpis({
    kp,mode:"monthly",tonnage:total,trips:null,
    tonnageSource:rows.length?"Summary Bulanan":"Belum ada tonase",
    expense:monthlyExpense
  });
  await loadMonitorKpPeriodTable("monthly",kp);

  setMonthlyPanelSummary({
    kp,period:monthLabelId(month),tonnage:total,trips:null,
    coverage:`${rows.length} KP`,
    tonnageSub:rows.length?"Summary bulanan tersedia":"Belum ada data",
    tripsSub:"Paste detail atau Closing harian untuk trip",
    coverageSub:rows.length?"Data summary":"Belum ada data"
  });

  if($("monthlySourceBadge")) $("monthlySourceBadge").textContent="Summary Bulanan";

  if(!rows.length){
    resetPlotContainer("monthlyMonitorChart");
    $("monthlyMonitorChart").innerHTML="<div class='chart-empty-state'>Belum ada data. Paste Closing WhatsApp, Paste Detail, atau Upload Excel Bulanan.</div>";
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

  const yearlyExpense=await getMonitorExpenseSummary(kp,"yearly");
  setMonitorPeriodBusinessKpis({
    kp,mode:"yearly",tonnage:total,trips:null,
    tonnageSource:rows.length?"Historical Summary":"Belum ada tonase",
    expense:yearlyExpense
  });
  await loadMonitorKpPeriodTable("yearly",kp);

  setYearlyPanelSummary({
    kp,period:String(year),tonnage:total,
    coverage:`${monthsPresent.size} bulan`,
    tonnageSub:monthsPresent.size?`Rata-rata ${kg(avg)} / bulan`:"Belum ada histori",
    coverageSub:"Bulan historis terbaca dari workbook tahunan"
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
  $("monitorChartTitle").textContent="INTRADAY + CLOSING 00.00";
  $("monitorTableTitle").textContent="DETAIL SNAPSHOT & CLOSING HARIAN";
  $("monitorSourceBadge").textContent="WhatsApp Snapshot + Closing Harian";
  $("monitorRuleNote").textContent="Snapshot 10/12/15/17 = progres intraday; Closing 00.00 = total final harian";

  // WhatsApp snapshots
  const {data:snaps,error}=await db.from("monitoring_snapshots")
    .select("id,report_date,snapshot_time,total_tonnage_kg,total_trips,source_type")
    .eq("report_date",date)
    .order("snapshot_time",{ascending:true});
  if(error){renderMonitorEmpty(error.message);return;}

  // Daily actual comparison data from Excel.
  let dq=db.from("kp_daily_history")
    .select("report_date,kp_code,supplier_name,tonnage_kg,trip_count,source_file")
    .eq("report_date",date);
  if(kp!=="ALL") dq=dq.eq("kp_code",kp);
  const {data:dailyRows,error:dailyErr}=await dq;
  if(dailyErr){renderMonitorEmpty(dailyErr.message);return;}

  const rawActualRows=dailyRows||[];
  const actualRows=summarizeClosingHistory(rawActualRows).selected;
  const actualTonnage=actualRows.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
  const actualTrips=actualRows.reduce((a,r)=>a+Number(r.trip_count||0),0);
  const hasActual=actualRows.length>0;
  const closingKps=[...new Set(actualRows.map(r=>r.kp_code))];
  const hasExcelClosing=actualRows.some(r=>closingSourceType(r.source_file)==="excel");
  const hasWhatsappClosing=actualRows.some(r=>closingSourceType(r.source_file)==="whatsapp");
  const closingSourceLabel=closingSourceLabelForRows(actualRows);
  const isPartialWhatsappClosing=(kp==="ALL" && hasWhatsappClosing && !hasExcelClosing && closingKps.length<MASTER_KP_COUNT);

  let values={};
  if(snaps?.length){
    if(kp==="ALL"){
      snaps.forEach(s=>values[s.id]={
        tonnage:Number(s.total_tonnage_kg||0),
        trips:Number(s.total_trips||0)
      });
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
  }

  const snapList=snaps||[];
  const slotData={};
  snapList.forEach(s=>slotData[s.snapshot_time.slice(0,5)]={...values[s.id],snapshot:s});
  const snapYs=slots.map(slot=>slotData[slot]?.tonnage ?? null);

  const latest=snapList.length ? snapList[snapList.length-1] : null;
  const latestVal=latest ? (values[latest.id]||{tonnage:0,trips:0}) : {tonnage:0,trips:0};

  // Unified KP business summary: final closing is preferred for daily total.
  const dailyExpense=await getMonitorExpenseSummary(kp,"daily");
  const periodTonnage=hasActual ? actualTonnage : latestVal.tonnage;
  const periodTrips=hasActual ? actualTrips : latestVal.trips;
  const periodTonnageSource=hasActual
    ? closingSourceLabel
    : latest ? `Snapshot ${latest.snapshot_time.slice(0,5)}` : "Belum ada tonase";
  setMonitorPeriodBusinessKpis({
    kp,mode:"daily",
    tonnage:periodTonnage,
    trips:periodTrips,
    tonnageSource:periodTonnageSource,
    expense:dailyExpense
  });
  await loadMonitorKpPeriodTable("daily",kp);
  await loadDailyMtdKpis(kp,date);

  // Main KPI continues to represent latest operational snapshot.
  setMonitorSummary({
    kp,
    period:dateLabelId(date),
    tonnage:latest ? latestVal.tonnage : (hasActual ? actualTonnage : 0),
    trips:latest ? latestVal.trips : (hasActual ? actualTrips : 0),
    coverage:`${snapList.length} / 4`,
    tonnageSub:latest
      ? `Snapshot terakhir ${latest.snapshot_time.slice(0,5)}`
      : hasActual ? `Belum ada snapshot — memakai ${closingSourceLabel} sebagai referensi` : "Belum ada data",
    tripsSub:latest
      ? "Trip kumulatif snapshot terakhir"
      : hasActual ? `Trip dari ${closingSourceLabel}` : "Belum ada data",
    coverageSub:hasActual ? `Snapshot tersedia + ${closingSourceLabel}` : "Snapshot tersedia"
  });

  // Comparison KPIs
  if($("dailyActualTonnage")){
    $("dailyActualTonnage").textContent=hasActual ? kg(actualTonnage) : "—";
    $("dailyActualTonnageSub").textContent=hasActual
      ? (isPartialWhatsappClosing ? `${actualTrips.toLocaleString("id-ID")} trip • Closing WhatsApp parsial (${closingKps.length} KP)` : `${actualTrips.toLocaleString("id-ID")} trip • Closing 00.00`)
      : "Upload closing Excel atau paste closing per KP";
  }

  if($("dailySnapshotDiff")){
    const snap17=snapList.find(s=>s.snapshot_time.slice(0,5)==="17:00") || null;
    const compareSnap=snap17 || latest;
    const compareVal=compareSnap ? (values[compareSnap.id]||{tonnage:0,trips:0}) : null;

    if(isPartialWhatsappClosing){
      $("dailySnapshotDiff").textContent="—";
      $("dailySnapshotDiffSub").textContent=`Closing WhatsApp masih parsial (${closingKps.length} KP); belum dibandingkan dengan total snapshot`;
    }else if(hasActual && compareSnap){
      const diff=actualTonnage-compareVal.tonnage;
      const pct=actualTonnage ? (diff/actualTonnage)*100 : 0;
      $("dailySnapshotDiff").textContent=
        `${diff>=0?"+":""}${kg(diff)}`;
      $("dailySnapshotDiffSub").textContent=
        `${pct>=0?"+":""}${pct.toFixed(2)}% • ${compareSnap.snapshot_time.slice(0,5)} → Closing 00.00`;
    }else if(hasActual){
      $("dailySnapshotDiff").textContent="—";
      $("dailySnapshotDiffSub").textContent="Closing tersedia; belum ada snapshot untuk dibandingkan";
    }else{
      $("dailySnapshotDiff").textContent="—";
      $("dailySnapshotDiffSub").textContent="Belum ada Closing 00.00";
    }
  }

  if(!snapList.length && !hasActual){
    renderMonitorEmpty("Belum ada snapshot WhatsApp maupun Excel Harian untuk tanggal ini.");
    return;
  }

  // Chart: 4 snapshots + Total Hari.
  const chartLabels=[...slots,"CLOSING 00.00"];
  const chartValues=[
    ...snapYs.map(v=>v??0),
    hasActual ? actualTonnage : 0
  ];
  const chartTexts=[
    ...snapYs.map(v=>v==null?"Menunggu":compactKg(v)),
    hasActual ? compactKg(actualTonnage) : "Belum Upload"
  ];
  const chartColors=[
    ...snapYs.map(v=>v==null?"rgba(255,255,255,.10)":"#49de5f"),
    hasActual ? "#e9b949" : "rgba(255,255,255,.10)"
  ];

  resetPlotContainer("monitorKpChart");
  Plotly.newPlot("monitorKpChart",[{
    x:chartLabels,
    y:chartValues,
    type:"bar",
    text:chartTexts,
    textposition:"outside",
    cliponaxis:false,
    marker:{color:chartColors},
    hovertemplate:"<b>%{x}</b><br>%{y:,.0f} kg<extra></extra>"
  }],{
    ...darkLayout,
    margin:{t:34,l:58,r:18,b:42},
    xaxis:{
      ...darkLayout.xaxis,
      type:"category",
      categoryorder:"array",
      categoryarray:chartLabels,
      fixedrange:true
    },
    yaxis:{...darkLayout.yaxis,rangemode:"tozero",tickformat:"~s",fixedrange:true},
    showlegend:false
  },plotConfig);

  const rows=snapList.map(s=>{
    const v=values[s.id]||{tonnage:0,trips:0};
    const diff=hasActual ? actualTonnage-v.tonnage : null;
    return [
      s.snapshot_time.slice(0,5),
      kg(v.tonnage),
      v.trips,
      hasActual ? `${diff>=0?"+":""}${kg(diff)}` : "—",
      String(s.source_type||"").toLowerCase().includes("excel")
        ? "Excel Upload"
        : "WhatsApp Snapshot"
    ];
  });

  if(hasActual){
    rows.push([
      "CLOSING 00.00",
      kg(actualTonnage),
      actualTrips,
      "0 kg",
      closingSourceLabel
    ]);
  }

  $("monitorKpTable").innerHTML=table(
    ["Jam / Acuan","Tonase","Trip","Selisih ke Closing 00.00","Sumber"],
    rows
  );
}
async function loadKPMonthly(kp){
  // Legacy route delegates to the current monthly panel renderer so source
  // identification and closing totals remain identical everywhere.
  return loadKPMonthlyPanel(kp);
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
