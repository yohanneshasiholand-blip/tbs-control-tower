/* TBS Supply Control Tower — scoped patch v4.14.2
   Base required: v4.14.1
*/
(function(){
  'use strict';
  const PATCH_BUILD='v4.14.2';

  function escRx(s){
    return String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }

  function activeMasterKpCodes(){
    const rows=(typeof MASTER_DIRECTORY_DATA!=='undefined' ? MASTER_DIRECTORY_DATA : []) || [];
    const fromMaster=rows
      .filter(x=>x && x.active!==false && x.code)
      .map(x=>canonKP(x.code))
      .filter(Boolean);
    const fallback=(typeof FALLBACK_KP_CODES!=='undefined' ? FALLBACK_KP_CODES : []) || [];
    return [...new Set((fromMaster.length ? fromMaster : fallback))]
      .sort((a,b)=>String(b).length-String(a).length);
  }

  function syncMasterCodesIntoLegacyFallback(){
    if(typeof FALLBACK_KP_CODES==='undefined') return;
    activeMasterKpCodes().forEach(code=>{
      if(code && !FALLBACK_KP_CODES.includes(code)) FALLBACK_KP_CODES.push(code);
    });
  }

  function isAmbiguousLegacySingkil(text){
    return /\bSSM\s+SINGKIL\b/i.test(String(text||''));
  }

  function detectMasterKpFromText(text,{exactLine=false}={}){
    const source=String(text||'')
      .replace(/\u00a0/g,' ')
      .replace(/[＊*_`~]/g,' ')
      .toUpperCase();
    if(isAmbiguousLegacySingkil(source)) return null;

    const stripped=source
      .replace(/^\s*KP\s*[.:\-]?\s*/i,'')
      .replace(/[.:,;]+\s*$/,'')
      .trim();

    for(const code of activeMasterKpCodes()){
      const variants=[code,code.replace(/-/g,' '),code.replace(/-/g,'')]
        .map(v=>String(v).toUpperCase());
      for(const v of variants){
        if(exactLine){
          if(stripped===v) return code;
          continue;
        }
        const pattern=escRx(v).replace(/\s+/g,'\\s+');
        const rx=new RegExp(`(?:^|[^A-Z0-9])${pattern}(?:[^A-Z0-9]|$)`,'i');
        if(rx.test(source)) return code;
      }
    }
    return null;
  }

  // ---------- KP NORMALIZATION / DYNAMIC MASTER ----------
  if(typeof canonKP==='function'){
    const baseCanonKP=canonKP;
    canonKP=function(k){
      let s=String(k||'')
        .toUpperCase()
        .replace(/\u00a0/g,' ')
        .replace(/[＊*_`~]/g,'')
        .trim()
        .replace(/^KP\s*[.:\-]?\s*/i,'')
        .replace(/[.:,;]+\s*$/,'')
        .replace(/\s*-\s*/g,'-')
        .replace(/\s+/g,' ')
        .trim();
      s=s
        .replace(/^ASMJ\s*([12])$/,'ASMJ-$1')
        .replace(/^TKWL\s*([12])$/,'TKWL-$1')
        .replace(/^MSB\s*2$/,'MSB-2')
        .replace(/^KS\s*2$/,'KS2')
        .replace(/^IIS$/,'SSM')
        .replace(/^LPI$/,'LBP');
      return s || baseCanonKP(k);
    };
  }

  if(typeof normalizeClosingKpAlias==='function'){
    const baseNormalizeClosingKpAlias=normalizeClosingKpAlias;
    normalizeClosingKpAlias=function(raw){
      if(isAmbiguousLegacySingkil(raw)) return null;
      return detectMasterKpFromText(raw) || baseNormalizeClosingKpAlias(raw);
    };
  }

  if(typeof priceKPFromLine==='function'){
    const basePriceKPFromLine=priceKPFromLine;
    priceKPFromLine=function(line){
      if(isAmbiguousLegacySingkil(line)) return null;
      const cleaned=(typeof cleanPriceLine==='function') ? cleanPriceLine(line) : line;
      return detectMasterKpFromText(cleaned,{exactLine:true}) || basePriceKPFromLine(line);
    };
  }

  // Existing expense parser is retained; only KP resolution is upgraded.
  if(typeof parseExpense==='function'){
    const baseParseExpense=parseExpense;
    parseExpense=function(text){
      const selectedKp=document.getElementById('expenseKp')?.value || '';
      if(isAmbiguousLegacySingkil(text) && !selectedKp){
        throw Error("KP 'SSM SINGKIL' masih ambigu dengan master baru SSM-S. Pilih KP/unit secara manual agar tidak salah masuk histori.");
      }
      const p=baseParseExpense(text);
      const dynamic=isAmbiguousLegacySingkil(text)
        ? (selectedKp ? canonKP(selectedKp) : null)
        : detectMasterKpFromText(text);
      if(dynamic && dynamic!==p.kp){
        p.kp=dynamic;
        p.kpSource=isAmbiguousLegacySingkil(text) ? 'pilihan manual' : 'teks WhatsApp / Master Data';
        p.rows=(p.rows||[]).map(r=>({...r,kp_code:dynamic}));
      }
      return p;
    };
  }

  // ---------- VERSION BADGE ----------
  if(typeof ensureAnalysisSidebarEntry==='function'){
    const baseEnsureAnalysisSidebarEntry=ensureAnalysisSidebarEntry;
    ensureAnalysisSidebarEntry=function(){
      const r=baseEnsureAnalysisSidebarEntry();
      const badge=document.getElementById('buildVersionBadge');
      if(badge) badge.textContent=`BUILD ${PATCH_BUILD}`;
      return r;
    };
  }

  // ---------- MONTHLY: OFFICIAL SUMMARY IS THE HEADLINE ----------
  function ensureMonthlyOfficialAuditBox(){
    let box=document.getElementById('monthlyOfficialAudit');
    if(box) return box;
    const panel=document.getElementById('monitorMonthlyPanel');
    if(!panel) return null;
    const head=panel.querySelector('.monitor-subpanel-head');
    box=document.createElement('article');
    box.id='monthlyOfficialAudit';
    box.className='panel glass monthly-official-audit';
    box.innerHTML=`
      <div class="monthly-official-head">
        <div><span class="subpanel-kicker">SUMBER RESMI BULANAN</span><h3>Historical Summary vs Detail Sistem</h3></div>
        <span class="monitor-source-badge final-source">SUMMARY RESMI</span>
      </div>
      <div class="monthly-official-grid">
        <div><small>SUMMARY RESMI</small><strong id="monthlyOfficialTotal">0 kg</strong><span id="monthlyOfficialTotalSub">-</span></div>
        <div><small>DETAIL SISTEM</small><strong id="monthlyDetailTotal">0 kg</strong><span id="monthlyDetailTotalSub">-</span></div>
        <div><small>COVERAGE DETAIL</small><strong id="monthlyDetailCoverage">0%</strong><span id="monthlyDetailCoverageSub">-</span></div>
        <div><small>SELISIH</small><strong id="monthlyOfficialDiff">0 kg</strong><span id="monthlyOfficialDiffSub">-</span></div>
      </div>`;
    if(head?.nextSibling) panel.insertBefore(box,head.nextSibling); else panel.prepend(box);
    return box;
  }

  async function fetchOfficialMonthlySummary(kp,year,monthNum){
    let q=db.from('historical_summary').select('kp_code,tonnage_kg,source_file')
      .eq('year',year).eq('month',monthNum);
    if(kp!=='ALL') q=q.eq('kp_code',kp);
    const {data,error}=await q;
    if(error) throw Error('Gagal membaca Historical Summary: '+error.message);
    const rows=data||[];
    return {rows,total:rows.reduce((a,r)=>a+Number(r.tonnage_kg||0),0)};
  }

  if(typeof loadKPMonthlyPanel==='function'){
    const baseLoadKPMonthlyPanel=loadKPMonthlyPanel;
    loadKPMonthlyPanel=async function(kp){
      // Keep all v4.14.1 charts, reconciliation, HOLD, conflict logic, etc.
      await baseLoadKPMonthlyPanel(kp);

      const month=document.getElementById('monitorMonth')?.value;
      if(!month) return;
      const [year,monthNum]=month.split('-').map(Number);
      const {start,end}=yearMonthBounds(month);

      let official;
      try{ official=await fetchOfficialMonthlySummary(kp,year,monthNum); }
      catch(e){ console.error(e); return; }
      if(!official.rows.length) return;

      let dq=db.from('kp_daily_history')
        .select('report_date,kp_code,supplier_name,tonnage_kg,trip_count,source_file')
        .gte('report_date',start).lte('report_date',end);
      if(kp!=='ALL') dq=dq.eq('kp_code',kp);

      const [{data:daily},recs]=await Promise.all([
        dq,
        getMonthlyPasteReconciliations(kp,start,end)
      ]);

      const finalMonth=monthlyFinalWithReconciliation(daily||[],recs||[],end);
      const detailTotal=Number(finalMonth.total||0);
      const detailTrips=Number(finalMonth.trips||0);
      const diff=detailTotal-Number(official.total||0);
      const coverage=official.total>0 ? detailTotal/official.total*100 : 0;
      const dayCount=new Set((daily||[]).map(r=>r.report_date)).size;

      ensureMonthlyOfficialAuditBox();
      const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
      set('monthlyOfficialTotal',kg(official.total));
      set('monthlyOfficialTotalSub',`${official.rows.length} KP summary • sumber annual/historical`);
      set('monthlyDetailTotal',kg(detailTotal));
      set('monthlyDetailTotalSub',`${dayCount} hari detail • ${detailTrips.toLocaleString('id-ID')} trip`);
      set('monthlyDetailCoverage',`${coverage.toFixed(1)}%`);
      set('monthlyDetailCoverageSub','Coverage detail terhadap summary resmi');
      set('monthlyOfficialDiff',`${diff>=0?'+':''}${kg(diff)}`);
      set('monthlyOfficialDiffSub',diff===0?'Detail sudah sama dengan summary resmi':diff<0?'Detail sistem masih belum lengkap':'Detail sistem melebihi summary resmi — perlu audit');

      // Critical: official monthly number remains the headline.
      set('monthlyKpiTonnage',kg(official.total));
      set('monthlyKpiTonnageSub',`SUMMARY RESMI • detail ${kg(detailTotal)} • coverage ${coverage.toFixed(1)}%`);
      set('monthlyKpiTrips',detailTrips?detailTrips.toLocaleString('id-ID'):'—');
      set('monthlyKpiTripsSub',detailTrips?'Trip dari detail sistem; bukan dari summary resmi':'Trip belum tersedia');
      set('monthlyKpiCoverage',`${official.rows.length} KP summary`);
      set('monthlyKpiCoverageSub',`${dayCount} hari detail tersedia`);

      const badge=document.getElementById('monthlySourceBadge');
      if(badge){badge.textContent='SUMMARY RESMI + DETAIL';badge.className='monitor-source-badge mixed-source';}

      if(typeof getMonitorExpenseSummary==='function' && typeof setMonitorPeriodBusinessKpis==='function'){
        const expense=await getMonitorExpenseSummary(kp,'monthly');
        setMonitorPeriodBusinessKpis({kp,mode:'monthly',tonnage:official.total,trips:detailTrips||null,tonnageSource:'Historical Summary Resmi',expense});
      }
    };
  }

  // Monthly KP summary table uses official historical_summary when available.
  if(typeof loadMonitorKpPeriodTable==='function'){
    const baseLoadMonitorKpPeriodTable=loadMonitorKpPeriodTable;
    loadMonitorKpPeriodTable=async function(mode,selectedKp){
      if(mode!=='monthly') return baseLoadMonitorKpPeriodTable(mode,selectedKp);
      const month=document.getElementById('monitorMonth')?.value;
      if(!month) return baseLoadMonitorKpPeriodTable(mode,selectedKp);
      const [year,monthNum]=month.split('-').map(Number);

      let q=db.from('historical_summary').select('kp_code,tonnage_kg')
        .eq('year',year).eq('month',monthNum);
      if(selectedKp!=='ALL') q=q.eq('kp_code',selectedKp);
      const {data:hist,error}=await q;
      if(error || !(hist||[]).length) return baseLoadMonitorKpPeriodTable(mode,selectedKp);

      const bounds=yearMonthBounds(month);
      let eq=db.from('unit_expenses').select('expense_date,kp_code,amount')
        .gte('expense_date',bounds.start).lte('expense_date',bounds.end);
      if(selectedKp!=='ALL') eq=eq.eq('kp_code',selectedKp);
      const {data:expenseRows}=await eq;

      const tonnageMap={};
      (hist||[]).forEach(r=>tonnageMap[r.kp_code]=(tonnageMap[r.kp_code]||0)+Number(r.tonnage_kg||0));
      const expenseMap=typeof groupExpenseRowsByKp==='function' ? groupExpenseRowsByKp(expenseRows||[]) : {};
      const codes=selectedKp==='ALL' ? activeMasterKpCodes() : [selectedKp];
      const rows=codes.map(code=>[
        code,kg(tonnageMap[code]||0),'—',rupiah(expenseMap[code]?.amount||0),Number(expenseMap[code]?.count||0).toLocaleString('id-ID'),'Historical Summary Resmi'
      ]);
      const tableEl=document.getElementById('monitorKpPeriodSummaryTable');
      if(tableEl) tableEl.innerHTML=table(['KP','Total Tonase','Total Trip','Total Pengeluaran','Transaksi Biaya','Sumber Tonase'],rows);
      const title=document.getElementById('monitorKpPeriodSummaryTitle');
      if(title) title.textContent=selectedKp==='ALL'?'RINGKASAN RESMI TONASE & PENGELUARAN SELURUH KP':`RINGKASAN RESMI TONASE & PENGELUARAN • ${selectedKp}`;
      const note=document.getElementById('monitorKpPeriodSummaryNote');
      if(note) note.textContent=`Bulanan • ${month} • Historical Summary Resmi`;
    };
  }

  // ---------- MASTER DATA ADD / EDIT UNIT ----------
  function ensureMasterUnitUI(){
    const actions=document.querySelector('#page-master .master-head-actions');
    if(actions && !document.getElementById('masterAddUnitBtn')){
      const btn=document.createElement('button');
      btn.id='masterAddUnitBtn';btn.type='button';btn.className='btn btn-primary master-add-unit-btn';btn.textContent='+ Tambah Kantor Unit';
      btn.addEventListener('click',()=>openMasterUnitModal());actions.prepend(btn);
    }

    if(!document.getElementById('masterUnitModal')){
      const modal=document.createElement('div');
      modal.id='masterUnitModal';modal.className='master-unit-modal hidden';
      modal.innerHTML=`
        <div class="master-unit-modal-backdrop"></div>
        <div class="master-unit-modal-card glass" role="dialog" aria-modal="true">
          <div class="master-unit-modal-head"><div><span class="subpanel-kicker">MASTER DATA</span><h3 id="masterUnitModalTitle">Tambah Kantor Unit</h3><p>Unit yang disimpan langsung masuk dropdown operasional dan parser dinamis.</p></div><button id="masterUnitModalClose" type="button" class="master-unit-modal-close">×</button></div>
          <input id="masterUnitEditId" type="hidden">
          <div class="master-unit-form-grid">
            <label><span>Kode KP *</span><input id="masterUnitCode" maxlength="30" placeholder="Contoh: SSM-S"></label>
            <label><span>Nama Kantor / Perusahaan *</span><input id="masterUnitName" maxlength="160"></label>
            <label class="wide"><span>Alamat</span><input id="masterUnitAddress" maxlength="255"></label>
            <label><span>Pimpinan Unit</span><input id="masterUnitHead" maxlength="160"></label>
            <label><span>Manager FFB</span><input id="masterUnitManager" maxlength="160"></label>
          </div>
          <div id="masterUnitMessage" class="master-unit-message"></div>
          <div class="master-unit-modal-actions"><button id="masterUnitCancelBtn" type="button" class="btn btn-secondary">Batal</button><button id="masterUnitSaveBtn" type="button" class="btn btn-primary">Simpan Kantor Unit</button></div>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('.master-unit-modal-backdrop').addEventListener('click',closeMasterUnitModal);
      document.getElementById('masterUnitModalClose').addEventListener('click',closeMasterUnitModal);
      document.getElementById('masterUnitCancelBtn').addEventListener('click',closeMasterUnitModal);
      document.getElementById('masterUnitSaveBtn').addEventListener('click',saveMasterUnit);
    }
  }

  function addEditButtons(){
    ensureMasterUnitUI();
    document.querySelectorAll('#masterDirectory .master-unit-card').forEach(card=>{
      if(card.querySelector('.master-edit-unit-btn')) return;
      const code=card.querySelector('.master-unit-code strong')?.textContent?.trim();
      const unit=(MASTER_DIRECTORY_DATA||[]).find(x=>x.code===code);
      const head=card.querySelector('.master-unit-card-head');
      if(!unit||!head) return;
      const btn=document.createElement('button');btn.type='button';btn.className='master-edit-unit-btn';btn.textContent='Edit';
      btn.addEventListener('click',()=>openMasterUnitModal(unit.id));head.appendChild(btn);
    });
  }

  function setMasterUnitMessage(text,type=''){
    const el=document.getElementById('masterUnitMessage');if(!el)return;el.textContent=text||'';el.className='master-unit-message'+(type?` ${type}`:'');
  }

  function openMasterUnitModal(unitId=null){
    ensureMasterUnitUI();
    const unit=unitId==null?null:(MASTER_DIRECTORY_DATA||[]).find(x=>String(x.id)===String(unitId));
    document.getElementById('masterUnitEditId').value=unit?.id??'';
    document.getElementById('masterUnitCode').value=unit?.code??'';
    document.getElementById('masterUnitName').value=unit?.name??'';
    document.getElementById('masterUnitAddress').value=unit?.address??'';
    document.getElementById('masterUnitHead').value=unit?.unit_head??'';
    document.getElementById('masterUnitManager').value=unit?.manager_ffb??'';
    document.getElementById('masterUnitCode').disabled=!!unit;
    document.getElementById('masterUnitModalTitle').textContent=unit?`Edit Kantor Unit ${unit.code}`:'Tambah Kantor Unit';
    document.getElementById('masterUnitSaveBtn').textContent=unit?'Simpan Perubahan':'Simpan Kantor Unit';
    setMasterUnitMessage(unit?'Kode KP dikunci saat edit untuk menjaga histori.':'Kode KP harus unik.');
    document.getElementById('masterUnitModal').classList.remove('hidden');document.body.classList.add('modal-open');
    setTimeout(()=>document.getElementById(unit?'masterUnitName':'masterUnitCode')?.focus(),30);
  }

  function closeMasterUnitModal(){
    document.getElementById('masterUnitModal')?.classList.add('hidden');document.body.classList.remove('modal-open');setMasterUnitMessage('');
  }

  async function saveMasterUnit(){
    const id=document.getElementById('masterUnitEditId')?.value||null;
    const existing=id?(MASTER_DIRECTORY_DATA||[]).find(x=>String(x.id)===String(id)):null;
    const code=canonKP(existing?.code||document.getElementById('masterUnitCode')?.value||'');
    const name=String(document.getElementById('masterUnitName')?.value||'').trim();
    const address=String(document.getElementById('masterUnitAddress')?.value||'').trim();
    const unitHead=String(document.getElementById('masterUnitHead')?.value||'').trim();
    const manager=String(document.getElementById('masterUnitManager')?.value||'').trim();
    if(!code)return setMasterUnitMessage('Kode KP wajib diisi.','error');
    if(!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code))return setMasterUnitMessage('Format Kode KP tidak valid. Gunakan huruf, angka, dan tanda -.','error');
    if(!name)return setMasterUnitMessage('Nama Kantor / Perusahaan wajib diisi.','error');

    const btn=document.getElementById('masterUnitSaveBtn');btn.disabled=true;setMasterUnitMessage('Memeriksa kode KP...','working');
    try{
      const {data:dup,error:dupError}=await db.from('master_kp').select('id,code,name').eq('code',code).limit(2);
      if(dupError)throw dupError;
      const duplicate=(dup||[]).find(x=>String(x.id)!==String(id||''));
      if(duplicate)return setMasterUnitMessage(`Kode KP ${code} sudah digunakan oleh ${duplicate.name||duplicate.code}.`,'error');
      const payload={name,address:address||null,unit_head:unitHead||null,manager_ffb:manager||null,active:true};
      const result=id
        ? await db.from('master_kp').update(payload).eq('id',id).select('id,code,name').single()
        : await db.from('master_kp').insert({...payload,code}).select('id,code,name').single();
      if(result.error)throw result.error;
      setMasterUnitMessage(id?'Perubahan berhasil disimpan.':'Kantor unit berhasil ditambahkan.','success');
      await loadMaster();syncMasterCodesIntoLegacyFallback();setTimeout(closeMasterUnitModal,350);
    }catch(e){
      setMasterUnitMessage(e?.code==='23505'?`Kode KP ${code} sudah digunakan.`:'Gagal menyimpan: '+(e?.message||e),'error');
    }finally{btn.disabled=false;}
  }

  window.openMasterUnitModal=openMasterUnitModal;
  window.closeMasterUnitModal=closeMasterUnitModal;
  window.saveMasterUnit=saveMasterUnit;

  if(typeof renderMasterDirectory==='function'){
    const baseRenderMasterDirectory=renderMasterDirectory;
    renderMasterDirectory=function(){const r=baseRenderMasterDirectory();queueMicrotask(addEditButtons);return r;};
  }

  if(typeof loadMaster==='function'){
    const baseLoadMaster=loadMaster;
    loadMaster=async function(){
      const r=await baseLoadMaster.apply(this,arguments);
      syncMasterCodesIntoLegacyFallback();ensureMasterUnitUI();addEditButtons();return r;
    };
  }

  function applyPatch(){
    syncMasterCodesIntoLegacyFallback();ensureMasterUnitUI();addEditButtons();ensureMonthlyOfficialAuditBox();
    const badge=document.getElementById('buildVersionBadge');if(badge)badge.textContent=`BUILD ${PATCH_BUILD}`;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(applyPatch,0),{once:true});else setTimeout(applyPatch,0);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.getElementById('masterUnitModal')?.classList.contains('hidden'))closeMasterUnitModal();});
})();
