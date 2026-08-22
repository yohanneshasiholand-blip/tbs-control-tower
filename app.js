
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
  let t=source.match(/(?:Pukul|Jam)\s*(10|12|15|17)\s*(?:[.:]\s*00)?\s*(?:WIB)?/i);

  // Fallback: standalone canonical snapshot clock.
  if(!t){
    t=source.match(/(?:^|\s)(10|12|15|17)\s*[.:]\s*00\s*(?:WIB)?(?:\s|$)/i);
  }

  if(t) time=`${t[1]}:00:00`;

  return (date||time) ? {date,time} : null;
}

function selectedTonnageFallback(){
  const date=$("monitorDate")?.value || null;
  const time=$("tonnageSnapshotTime")?.value || null;
  return {date,time};
}

function resolveTonnageHeader(text){
  const parsed=parseHeader(text)||{};
  const fallback=selectedTonnageFallback();

  const date=parsed.date || fallback.date;
  const time=parsed.time || fallback.time;

  if(!date){
    throw Error("Tanggal snapshot tidak ditemukan. Pilih Tanggal pada filter Monitoring Harian.");
  }
  if(!time){
    throw Error("Waktu snapshot tidak ditemukan. Header seperti 'Pukul 17.00 WIB' seharusnya terbaca; jika tidak, pilih Jam Snapshot 10.00 / 12.00 / 15.00 / 17.00.");
  }

  return {
    date,
    time,
    dateSource:parsed.date?"header WhatsApp":"filter tanggal",
    timeSource:parsed.time?"header WhatsApp":"pilihan jam"
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
  const cleaned=String(text||"").replace(/[＊*_`~]/g,"");
  const hasSnapshotClock=/(?:Pukul|Jam)\s*(?:10|12|15|17)\s*(?:[.:]\s*00)?/i.test(cleaned);
  return !hasSnapshotClock && !!detectClosingKpReport(text);
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
  const reportDate=parseHeader(text)?.date || null;
  if(!reportDate) throw Error("Tanggal closing harian tidak ditemukan.");

  const blocks=[];
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

  const presentKps=[...new Set(finalBlocks.map(b=>b.kp))];
  const missingKps=FALLBACK_KP_CODES.filter(k=>!presentKps.includes(k));

  return {
    mode:finalBlocks.length>1 ? "closing_batch" : "closing_kp",
    date:reportDate,
    kp:finalBlocks.length===1 ? finalBlocks[0].kp : "ALL",
    blocks:finalBlocks,
    rows,
    total,
    trips,
    invalid,
    validTotal:invalid.length===0,
    validTrips:invalid.length===0,
    presentKps,
    missingKps
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
  const isClosing=mode==="closing_kp" || mode==="closing_batch";
  const isBatch=mode==="closing_batch";
  const badge=$("tonnageModeBadge");
  const saveBtn=$("tonnageSaveBtn");
  const timeSelect=$("tonnageSnapshotTime");

  if(badge){
    badge.textContent=isBatch
      ? "CLOSING BANYAK KP"
      : isClosing ? "CLOSING HARIAN PER KP" : "SNAPSHOT 10/12/15/17";
    badge.classList.toggle("closing-mode",isClosing);
  }
  if(saveBtn){
    saveBtn.textContent=isBatch
      ? "Simpan / Update Semua Closing"
      : isClosing ? "Simpan / Update Closing Harian" : "Simpan Snapshot";
  }
  if(timeSelect) timeSelect.disabled=isClosing;
}
function detectTonnageModeLive(){
  const raw=$("tonnageText")?.value||"";
  if(!raw.trim()){
    setTonnageInputMode("snapshot");
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

function previewTonnage(){
  try{
    const raw=$("tonnageText").value;
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

      $("tonnagePreview").textContent=
        `MODE: ${p.mode==="closing_batch"?"CLOSING BANYAK KP":"CLOSING HARIAN PER KP"}\n`+
        `Tanggal: ${p.date}\n`+
        `KP terbaca: ${p.blocks.length}\n`+
        `Total tonase paste: ${kg(p.total)}\n`+
        `Total trip detail: ${p.trips}\n`+
        `Validasi: ${p.invalid.length===0?"SEMUA KP COCOK ✓":`${p.invalid.length} KP PERLU CEK ✕`}\n`+
        `KP belum ada dalam paste: ${p.missingKps.length ? p.missingKps.join(", ") : "Tidak ada"}\n\n`+
        blockText;
      return;
    }

    $("tonnagePreview").textContent=
      `MODE: SNAPSHOT WHATSAPP\nSNAPSHOT ${p.date} ${p.time.slice(0,5)}\n`+
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
  if(p.mode==="closing_kp" || p.mode==="closing_batch"){
    if(p.invalid?.length){
      return alert(
        "SIMPAN DIBLOKIR.\n\n"+
        p.invalid.map(b=>
          `${b.kp}: detail ${kg(b.total)} vs TOTAL ${b.declared==null?"-":kg(b.declared)}`+
          `${b.declaredTrips==null?"":` • trip ${b.trips} vs ${b.declaredTrips}`}`
        ).join("\n")+
        "\n\nPerbaiki KP yang tidak cocok sebelum menyimpan."
      );
    }

    const payload=p.blocks.flatMap(b=>b.rows.map(r=>({
      report_date:p.date,
      kp_code:b.kp,
      supplier_name:r.supplier_name,
      tonnage_kg:Number(r.tonnage_kg||0),
      trip_count:Number(r.trip_count||0),
      source_file:`WHATSAPP:CLOSING:${b.kp}`
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
  const {data:s,error}=await db.from("monitoring_snapshots").upsert({report_date:p.date,snapshot_time:p.time,total_tonnage_kg:p.declared??p.total,total_trips:p.trips,raw_text:$("tonnageText").value,status:"validated"},{onConflict:"report_date,snapshot_time"}).select().single();
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
  if(!h?.date) throw Error("Tanggal biaya tidak ditemukan.");

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
      expense_date:h.date,
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
          expense_date:h.date,
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
    date:h.date,
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
function previewExpense(){
  try{
    EXPENSE_PREVIEW=parseExpense($("expenseText").value);

    const p=EXPENSE_PREVIEW;
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

    $("expensePreview").textContent=
      `Tanggal efektif: ${p.date}\n`+
      `KP: ${p.kp} (${p.kpSource})\n`+
      `Baris biaya: ${p.rows.length}\n`+
      `Total detail: ${rupiah(p.total)}\n`+
      `${validation}`+
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

  const {error}=await db.from("unit_expenses").insert(
    EXPENSE_PREVIEW.rows.map(x=>({
      ...x,
      raw_text:$("expenseText").value
    }))
  );
  if(error) return alert(error.message);

  alert(
    `Pengeluaran tersimpan.\n`+
    `KP: ${EXPENSE_PREVIEW.kp}\n`+
    `Total: ${rupiah(EXPENSE_PREVIEW.total)}`
  );

  EXPENSE_PREVIEW=null;
  $("expenseText").value="";
  $("expensePreview").textContent="Belum ada preview.";
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
      daily:[],recognized:false,
      reason:!kp
        ? "KP tidak terdeteksi"
        : !cols
          ? "Header transaksi bertingkat (No / No Polisi / Tonase) tidak ditemukan"
          : "Periode laporan tidak terdeteksi"
    };
  }

  const supplier=inferSupplierFromReport(aoa,fileName,kp);
  if(!supplier || supplier==="UNKNOWN"){
    return {daily:[],recognized:false,reason:"Supplier/Agen tidak terdeteksi"};
  }

  const dailyMap=new Map();
  let lastInPeriodDate=null;
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

    const paymentDate=cols.date>=0 ? parseOperationalDate(row[cols.date]) : null;
    let rowDate=null;

    if(paymentDate && dateInPeriod(paymentDate,period)){
      // Use payment date only when it belongs to the report's own period.
      rowDate=paymentDate;
      lastInPeriodDate=paymentDate;
    }else if(paymentDate && !dateInPeriod(paymentDate,period)){
      // Payment in the next month still belongs to this report period.
      // Clamp it to period end so it does not leak into another month.
      rowDate=period.end;
      outsidePeriodPayments++;
    }else{
      blankPaymentDates++;
      // For blank date, use the last in-period date; for the first row use the
      // next in-period date; if neither exists, use the report start.
      rowDate=lastInPeriodDate ||
        findNextTransactionDate(aoa,r,cols.date,period) ||
        period.start;
    }

    const proof=cols.bukti>=0 ? String(row[cols.bukti]??"").trim() : "";
    if(!proof) blankProofTransactions++;

    const key=`${rowDate}|${kp}|${supplier}`;
    const prev=dailyMap.get(key)||{
      report_date:rowDate,
      kp_code:kp,
      supplier_name:supplier,
      tonnage_kg:0,
      trip_count:0,
      source_file:fileName
    };
    prev.tonnage_kg+=tonKg;
    prev.trip_count+=1;
    dailyMap.set(key,prev);
    acceptedTransactions++;
  }

  const daily=[...dailyMap.values()];
  const parsedTotal=daily.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
  const declaredTotal=findDeclaredReportTotal(aoa,rawAoa,cols);
  const totalDiff=declaredTotal==null ? null : parsedTotal-declaredTotal;
  const integrityOk=declaredTotal==null ? true : Math.abs(totalDiff)<=1;

  return {
    daily,
    recognized:acceptedTransactions>0,
    kp,supplier,period,
    acceptedTransactions,
    blankProofTransactions,
    skippedNumericRows,
    outsidePeriodPayments,
    blankPaymentDates,
    parsedTotal,
    declaredTotal,
    totalDiff,
    integrityOk,
    reason:acceptedTransactions?"":"Tidak ada baris transaksi valid"
  };
}
function parseMonthlySimpleTable(sheet,sheetName,fileName){
  const rows=XLSX.utils.sheet_to_json(sheet,{defval:null,raw:false});
  const out=[];
  for(const r of rows){
    const kp=canonKP(pickField(r,["kp","kode kp","kantor pencairan","kantor","unit","kode unit"]));
    const supplierRaw=pickField(r,["supplier","agen","jenis spb","spb","do"]);
    const supplier=canonSupplierForKP(kp,supplierRaw)||String(supplierRaw||"ALL").trim()||"ALL";
    const date=parseOperationalDate(pickField(r,["tanggal","date","tgl","report date"]));
    const tonValue=pickField(r,["tonase kg","tonnage kg","tonase","tonnage","berat kg","berat"]);
    const ton=transactionTonnageKg(null,tonValue);
    const trip=parseExcelNumber(pickField(r,["trip","jumlah trip","mobil masuk","jumlah kendaraan","kendaraan"]));
    if(kp && date && ton>0){
      out.push({
        report_date:date,
        kp_code:kp,
        supplier_name:supplier,
        tonnage_kg:ton,
        trip_count:trip==null?1:Math.max(0,Math.round(trip)),
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
  const integrityIssues=[];

  wb.SheetNames.forEach(name=>{
    const sheet=wb.Sheets[name];
    const report=parseMonthlyReportSheet(sheet,name,fileName);

    if(report.recognized && report.daily.length){
      daily.push(...report.daily);
      recognizedSheets++;

      notes.push(
        `${name}: ${report.kp} / ${report.supplier}`+
        ` / periode ${report.period.start} s.d ${report.period.end}`+
        ` / ${report.acceptedTransactions} transaksi`+
        ` / ${report.outsidePeriodPayments} pembayaran di luar periode dialokasikan ke akhir periode`+
        ` / ${report.blankProofTransactions} transaksi tanpa No. Bukti`+
        ` / ${report.skippedNumericRows} baris angka non-transaksi diabaikan`+
        (report.declaredTotal!=null
          ? ` / Total Excel ${kg(report.declaredTotal)} → ${report.integrityOk?"COCOK":"SELISIH"}`
          : "")
      );

      if(!report.integrityOk){
        integrityIssues.push(
          `${name}: hasil parser ${kg(report.parsedTotal)} ≠ Total Excel ${kg(report.declaredTotal)}`
        );
      }
      return;
    }

    const simple=parseMonthlySimpleTable(sheet,name,fileName);
    if(simple.length){
      daily.push(...simple);
      recognizedSheets++;
      notes.push(`${name}: tabel sederhana / ${simple.length} baris`);
    }else{
      notes.push(`${name}: belum dikenali (${report.reason||"format tidak sesuai"})`);
    }
  });

  daily=combineDailyRows(daily);
  return {
    fileName,daily,recognizedSheets,notes,
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

    const selectedDate=$("monitorDate")?.value;
    if(!selectedDate) throw Error("Pilih tanggal Monitoring Harian terlebih dahulu.");

    const previews=[];
    let extracted=[];

    for(const file of files){
      const wb=await readWorkbookFile(file);
      const p=parseMonthlyWorkbook(wb,file.name);
      previews.push(p);

      // Reuse the validated detailed Excel parser, but ONLY take the selected day.
      extracted.push(...(p.daily||[])
        .filter(r=>r.report_date===selectedDate)
        .map(r=>({
          ...r,
          source_file:`DAILY:${file.name}`
        })));
    }

    extracted=combineDailyRows(extracted);

    const badFiles=previews.filter(p=>!p.integrityOk);
    const kpSet=new Set(extracted.map(r=>r.kp_code));
    const supplierSet=new Set(extracted.map(r=>`${r.kp_code}/${r.supplier_name}`));
    const tonTotal=extracted.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);
    const tripTotal=extracted.reduce((a,r)=>a+Number(r.trip_count||0),0);

    DAILY_EXCEL_PREVIEW={
      date:selectedDate,
      files:files.map(f=>f.name),
      daily:extracted,
      fileResults:previews,
      integrityBlocked:badFiles
    };

    $("dailyExcelPreview").textContent=
      `TANGGAL CLOSING: ${selectedDate}\n`+
      `File dipilih: ${files.length}\n`+
      `KP terbaca pada tanggal ini: ${kpSet.size}\n`+
      `Supplier terbaca: ${supplierSet.size}\n`+
      `Baris KP/Supplier: ${extracted.length}\n`+
      `Total trip: ${tripTotal.toLocaleString("id-ID")}\n`+
      `CLOSING TONASE 00.00: ${kg(tonTotal)}\n\n`+
      (extracted.length
        ? `Data ini akan dibandingkan dengan snapshot WhatsApp, dengan acuan utama snapshot 17.00 pada ${selectedDate}.`
        : `PERINGATAN: Tidak ada transaksi tanggal ${selectedDate} di file yang dipilih.`)+
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

  // Daily Excel is authoritative only for this selected date.
  // Upsert by date + KP + supplier avoids duplicate totals.
  const chunkSize=500;
  for(let i=0;i<p.daily.length;i+=chunkSize){
    const {error}=await db.from("kp_daily_history")
      .upsert(p.daily.slice(i,i+chunkSize),{
        onConflict:"report_date,kp_code,supplier_name"
      });
    if(error) return alert("Gagal menyimpan Excel Harian: "+error.message);
  }

  alert(
    `Excel Harian berhasil disimpan.\n`+
    `Tanggal: ${p.date}\n`+
    `Baris KP/Supplier: ${p.daily.length}\n\n`+
    `Data sekarang menjadi closing final dan pembanding snapshot WhatsApp.`
  );

  DAILY_EXCEL_PREVIEW=null;
  if($("dailyExcelFile")) $("dailyExcelFile").value="";
  $("dailyExcelPreview").textContent="Belum ada file closing dipilih.";
  await loadKPDaily($("monitorKp").value||"ALL");
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
    const validation=await validateMonthlyAgainstAnnual(allDaily);
    const integrityBlocked=previews.filter(p=>!p.integrityOk);

    MONTHLY_EXCEL_PREVIEW={
      files:files.map(f=>f.name),
      daily:allDaily,
      fileResults:previews,
      validation,
      integrityBlocked
    };

    const kpSet=new Set(allDaily.map(r=>r.kp_code));
    const supplierSet=new Set(allDaily.map(r=>`${r.kp_code}/${r.supplier_name}`));
    const tripTotal=allDaily.reduce((a,r)=>a+Number(r.trip_count||0),0);
    const tonTotal=allDaily.reduce((a,r)=>a+Number(r.tonnage_kg||0),0);

    const validationText=validation.length
      ? "\n\nVALIDASI vs DATA TAHUNAN:\n"+
        validation.map(v=>{
          const ref=v.reference_kg==null?"-":kg(v.reference_kg);
          const diff=v.diff_kg==null?"-":`${v.diff_kg>=0?"+":""}${kg(v.diff_kg)}`;
          return `• ${v.kp_code} ${String(v.month).padStart(2,"0")}/${v.year}: ${v.status}\n`+
                 `  Bulanan: ${kg(v.parsed_kg)} | Tahunan: ${ref} | Selisih: ${diff}\n`+
                 `  ${v.note}`;
        }).join("\n")
      : "";

    $("monthlyExcelPreview").textContent=
      `FILE DIPILIH: ${files.length}\n`+
      `File terbaca: ${previews.filter(p=>p.daily.length).length}/${files.length}\n`+
      `KP terdeteksi: ${kpSet.size}\n`+
      `Supplier terdeteksi: ${supplierSet.size}\n`+
      `Baris harian supplier: ${allDaily.length}\n`+
      `Total trip: ${tripTotal.toLocaleString("id-ID")}\n`+
      `Total tonase: ${kg(tonTotal)}\n\n`+
      previews.map(p=>`• ${p.fileName}\n  ${p.notes.join("\n  ")}`).join("\n\n")+
      validationText;
  }catch(e){
    MONTHLY_EXCEL_PREVIEW=null;
    $("monthlyExcelPreview").textContent="ERROR: "+e.message;
  }
}
async function replaceRowsFromSameFiles(fileNames){
  for(const fileName of fileNames){
    const {error}=await db.from("kp_daily_history").delete().eq("source_file",fileName);
    if(error) throw error;
  }
}
async function saveMonthlyExcel(){
  if(!MONTHLY_EXCEL_PREVIEW) return alert("Pilih dan preview Excel bulanan dahulu.");
  const p=MONTHLY_EXCEL_PREVIEW;
  if(!p.daily.length) return alert("Tidak ada transaksi yang dapat disimpan.");

  const badFiles=(p.integrityBlocked||[]);
  if(badFiles.length){
    return alert(
      "SIMPAN DIBLOKIR.\n\n"+
      badFiles.map(f=>`${f.fileName}: ${f.integrityIssues.join("; ")}`).join("\n")+
      "\n\nTotal transaksi parser belum sama dengan Total Excel."
    );
  }

  const blocked=(p.validation||[]).filter(v=>v.block);
  if(blocked.length){
    return alert(
      "SIMPAN DIBLOKIR.\n\n"+
      blocked.map(v=>`${v.kp_code}: hasil parser melebihi referensi tahunan.`).join("\n")+
      "\n\nPeriksa file/preview terlebih dahulu."
    );
  }

  // Re-uploading the same source file replaces its prior imported rows.
  // This also removes legacy rows that were previously saved with supplier_name=SPB.
  try{
    await replaceRowsFromSameFiles(p.files);
  }catch(e){
    return alert("Gagal membersihkan versi import lama: "+e.message);
  }

  const chunkSize=500;
  for(let i=0;i<p.daily.length;i+=chunkSize){
    const chunk=p.daily.slice(i,i+chunkSize);
    const {error}=await db.from("kp_daily_history")
      .upsert(chunk,{onConflict:"report_date,kp_code,supplier_name"});
    if(error) return alert("Gagal simpan detail bulanan: "+error.message);
  }

  // IMPORTANT:
  // Monthly detail NEVER writes to historical_summary.
  // historical_summary is authoritative annual/historical workbook data only.
  alert(
    `Upload bulanan berhasil.\n`+
    `File: ${p.files.length}\n`+
    `Baris harian supplier: ${p.daily.length}\n\n`+
    `Historical tahunan tidak diubah.`
  );

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
    daily:["Monitoring • Harian","Snapshot WhatsApp 10.00 / 12.00 / 15.00 / 17.00 dibandingkan dengan Closing Tonase final pukul 00.00."],
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
function closingSourceType(sourceFile){
  const s=String(sourceFile||"");
  if(s.startsWith("WHATSAPP:CLOSING:")) return "whatsapp";
  if(s.startsWith("DAILY:")) return "excel";
  return "other";
}

function summarizeClosingHistory(rows){
  // Canonical rule per date + KP:
  // Closing Excel is authoritative when present for that KP/date.
  // Otherwise use Closing WhatsApp. This prevents double-counting mixed sources.
  const grouped=new Map();
  (rows||[]).forEach(r=>{
    const key=`${r.report_date}|${r.kp_code}`;
    if(!grouped.has(key)) grouped.set(key,{excel:[],whatsapp:[],other:[]});
    grouped.get(key)[closingSourceType(r.source_file)].push(r);
  });

  const selected=[];
  grouped.forEach((g,key)=>{
    const chosen=g.excel.length ? g.excel : g.whatsapp.length ? g.whatsapp : g.other;
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
    if(d.sources.has("excel") && d.sources.has("whatsapp")) d.sourceLabel="Closing Excel + WhatsApp";
    else if(d.sources.has("excel")) d.sourceLabel="Closing Excel";
    else if(d.sources.has("whatsapp")) d.sourceLabel="Closing WhatsApp";
    else d.sourceLabel="Closing Harian";
    d.kpCount=d.kps.size;
  });

  return {selected,byDate};
}

function closingSourceLabelForRows(rows){
  const types=new Set((rows||[]).map(r=>closingSourceType(r.source_file)));
  const kps=new Set((rows||[]).map(r=>r.kp_code));
  let label="Closing Harian";
  if(types.has("excel") && types.has("whatsapp")) label="Closing Excel + WhatsApp";
  else if(types.has("excel")) label="Closing Excel";
  else if(types.has("whatsapp")) label="Closing WhatsApp";
  if(kps.size>1) label+=` (${kps.size} KP)`;
  return label;
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
    .select("report_date,kp_code,supplier_name,tonnage_kg,trip_count,source_file")
    .gte("report_date",start).lte("report_date",end)
    .order("report_date",{ascending:true});
  if(kp!=="ALL") dq=dq.eq("kp_code",kp);

  const {data:daily,error:de}=await dq;
  if(de){
    resetPlotContainer("monthlyMonitorChart");
    $("monthlyMonitorChart").innerHTML=`<div class="chart-empty-state">${de.message}</div>`;
    return;
  }

  if(daily?.length){
    const closing=summarizeClosingHistory(daily);
    const byDate=closing.byDate;
    const dates=Object.keys(byDate).sort();
    const vals=dates.map(d=>byDate[d].tonnage);
    const total=vals.reduce((a,b)=>a+b,0);
    const trips=dates.reduce((a,d)=>a+byDate[d].trips,0);
    const avg=dates.length?total/dates.length:0;
    const sourceSet=new Set(dates.map(d=>byDate[d].sourceLabel));
    const monthSource=sourceSet.size===1?[...sourceSet][0]:"Closing WhatsApp + Excel";

    setMonthlyPanelSummary({
      kp,period:monthLabelId(month),tonnage:total,trips,
      coverage:`${dates.length} hari`,
      tonnageSub:`Akumulasi Closing Harian • rata-rata ${kg(avg)} / hari`,
      tripsSub:`Total trip closing • ${monthSource}`,
      coverageSub:"Hari closing yang sudah tersedia"
    });

    if($("monthlySourceBadge")) $("monthlySourceBadge").textContent=monthSource;

    resetPlotContainer("monthlyMonitorChart");
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

    $("monthlyMonitorTable").innerHTML=table(
      ["Tanggal","Closing Tonase","Trip","KP","Sumber"],
      dates.map(d=>[
        d,
        kg(byDate[d].tonnage),
        byDate[d].trips,
        kp==="ALL"?`${byDate[d].kpCount} KP`:kp,
        byDate[d].sourceLabel
      ])
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
    tripsSub:"Upload/paste closing harian untuk trip",
    coverageSub:rows.length?"Data summary":"Belum ada data"
  });

  if($("monthlySourceBadge")) $("monthlySourceBadge").textContent="Summary Bulanan";

  if(!rows.length){
    resetPlotContainer("monthlyMonitorChart");
    $("monthlyMonitorChart").innerHTML="<div class='chart-empty-state'>Belum ada data. Paste Closing WhatsApp atau Upload Excel Bulanan.</div>";
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
    .select("id,report_date,snapshot_time,total_tonnage_kg,total_trips")
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
      "WhatsApp Snapshot"
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
