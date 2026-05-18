// ==UserScript==
// @name         LSS Fahrzeugbrowser & Fahrzeugmanager
// @namespace    itsmartinus-lss-tools
// @version      1.3
// @description  Kompakter Fahrzeugbrowser mit Filter nach Fahrzeugart, Standort, Status und Rückalarmieren-Funktion.
// @author       ChatGPT
// @match        https://www.leitstellenspiel.de/*
// @match        https://leitstellenspiel.de/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const VEHICLE_TYPE_NAMES = {
    0:'LF 20',1:'LF 10',2:'DLK',3:'ELW 1',4:'RW',5:'GW-A',6:'LF 8/6',7:'LF 20/16',8:'LF 10/6',9:'LF 16-TS',10:'GW-Öl',11:'GW-L2 Wasser',12:'GW-Mess',13:'SW 1000',14:'SW 2000',15:'SW 2000-Tr',16:'SW-KatS',17:'TLF 2000',18:'TLF 3000',19:'TLF 8/8',20:'TLF 8/18',21:'TLF 16/24-Tr',22:'TLF 16/25',23:'TLF 16/45',24:'TLF 20/40',25:'TLF 20/40-SL',26:'TLF 16',27:'GW-G',28:'RTW',29:'NEF',30:'HLF 20',31:'RTH',32:'FuStW',33:'GW-Höhenrettung',34:'ELW 2',35:'leBefKw',36:'MTW',37:'TSF-W',38:'KTW',39:'GKW',40:'MTW-TZ',41:'MzKW',42:'LKW K 9',43:'BRmG R',44:'Anh DLE',45:'MLW 5',46:'WLF',47:'AB-Rüst',48:'AB-Atemschutz',49:'AB-Öl',50:'GruKw',51:'FüKw',52:'GefKw',53:'Dekon-P',54:'AB-Dekon-P',55:'KdoW-LNA',56:'KdoW-OrgL',57:'FwK',58:'KTW Typ B',59:'ELW 1 (SEG)',60:'GW-San',61:'Polizeihubschrauber',62:'AB-Schlauch',63:'GW-Taucher',64:'GW-Wasserrettung',65:'LKW 7 Lkr 19 tm',66:'Anh MzB',67:'Anh SchlB',68:'Anh MzAB',69:'Tauchkraftwagen',70:'MZB',71:'AB-MZB',72:'WaWe 10',73:'GRTW',74:'NAW',75:'FLF',76:'Rettungstreppe',77:'AB-Gefahrgut',78:'AB-Einsatzleitung',79:'SEK - ZF',80:'SEK - MTF',81:'MEK - ZF',82:'MEK - MTF',83:'GW-Werkfeuerwehr',84:'ULF mit Löscharm',85:'TM 50',86:'Turbolöscher',87:'TLF 4000',88:'KLF',89:'MLF',90:'HLF 10',91:'Rettungshundefahrzeug',92:'Anh Hund',93:'MTW-O',94:'DHuFüKW',95:'Polizeimotorrad',96:'LKW 7 Lbw',97:'MLW 4',98:'Anh SwPu',99:'Anh 7',100:'FuStW (DGL)',101:'GW-L1',102:'GW-L2',103:'MTF-L',104:'LF-L',105:'AB-L',106:'AB-Mulde',107:'AB-Sand',108:'AB-Sonderlöschmittel',109:'AB-Wasser/Schaum',110:'AB-Verpflegung',111:'GW-Verpflegung',112:'GW-Küche',113:'MTW-Verpflegung',114:'FKH',115:'AB-Küche',116:'AB-Verpflegung',117:'Polizeizelle',118:'GW-Lüfter',119:'AB-Lüfter',120:'GW-Großlüfter',121:'ITW',122:'Zivilstreifenwagen',123:'Diensthundestaffel',124:'Betreuungskombi',125:'Bt-LKW',126:'Bt-Kombi',127:'MTW-Bt',128:'MTW-OV',129:'MzGW SB',130:'Anh 7 EGA',131:'Anh Drucklufterzeugung',132:'Anh Lichtmast',133:'AB-Strom',134:'AB-Wasserförderung',135:'AB-Medizin',136:'AB-Lösch',137:'AB-Hochwasser',138:'GW-Hochwasser',139:'MzGW',140:'FGr Räumen',141:'FGr Ortung',142:'Bergungsräumgerät',143:'Radlader',144:'Anh Wechselbrücke',145:'MZB Wasserrettung'
  };

  const FMS_LABELS = {
    1: 'Status 1 – Einsatzbereit über Funk',
    2: 'Status 2 – Einsatzbereit auf Wache',
    3: 'Status 3 – Auf Anfahrt',
    4: 'Status 4 – Am Einsatzort',
    5: 'Status 5 – Sprechwunsch',
    6: 'Status 6 – Nicht einsatzbereit',
    7: 'Status 7 – Patient aufgenommen',
    8: 'Status 8 – Am Krankenhaus',
    9: 'Status 9 – Rückfahrt / Sonderstatus',
  };

  const STATE = {
    open: false,
    vehicles: [],
    buildings: new Map(),
    missions: new Map(),
    filterType: 'ALL',
    filterStatus: 'ALL',
    search: '',
    lastUpdate: null,
    error: null,
    loading: false,
  };

  const css = `
    #lss-vm-root{position:fixed;top:58px;left:50%;transform:translateX(-50%);width:min(980px,calc(100vw - 28px));max-height:calc(100vh - 84px);z-index:999998;background:rgba(9,16,24,.98);color:#e5e7eb;border:1px solid rgba(148,163,184,.25);border-radius:12px;box-shadow:0 18px 64px rgba(0,0,0,.62);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:none;overflow:hidden;backdrop-filter:blur(8px)}
    #lss-vm-root.vm-open{display:block}#lss-vm-root *{box-sizing:border-box}.vm-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 13px;border-bottom:1px solid rgba(148,163,184,.16)}.vm-title{font-size:18px;font-weight:900}.vm-sub{font-size:11px;color:#94a3b8;margin-top:2px}.vm-actions{display:flex;gap:7px;align-items:center}.vm-btn{border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.88);color:#e5e7eb;border-radius:9px;padding:6px 9px;font-size:12px;cursor:pointer}.vm-btn:hover{background:rgba(30,41,59,.98)}.vm-btn.warn{border-color:rgba(239,68,68,.45);color:#fecaca}.vm-body{padding:11px 13px;overflow:auto;max-height:calc(100vh - 145px)}.vm-filters{display:grid;grid-template-columns:1.05fr .9fr 1.2fr auto;gap:8px;margin-bottom:10px}.vm-input,.vm-select{width:100%;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.9);color:#e5e7eb;border-radius:9px;padding:8px 9px;font-size:13px}.vm-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:10px}.vm-kpi{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.75);border-radius:10px;padding:8px 10px}.vm-kpi .label{font-size:11px;color:#a3aab7}.vm-kpi .value{font-size:20px;font-weight:900;margin-top:1px}.vm-table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid rgba(148,163,184,.18);border-radius:10px;overflow:hidden}.vm-table th,.vm-table td{padding:7px 9px;border-bottom:1px solid rgba(148,163,184,.12);border-right:1px solid rgba(148,163,184,.08);vertical-align:middle}.vm-table th:last-child,.vm-table td:last-child{border-right:0}.vm-table tr:last-child td{border-bottom:0}.vm-table th{background:rgba(30,41,59,.72);font-size:12px;text-align:left;color:#cbd5e1}.vm-table td{font-size:13px}.vm-table tr{background:rgba(255,255,255,.015)}.vm-table tr:hover{background:rgba(255,255,255,.055)}.vm-status{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800}.s1,.s2{background:rgba(34,197,94,.16);color:#86efac}.s3{background:rgba(234,179,8,.16);color:#fde68a}.s4{background:rgba(239,68,68,.16);color:#fca5a5}.s5{background:rgba(59,130,246,.16);color:#bfdbfe}.s6{background:rgba(148,163,184,.18);color:#cbd5e1}.s7,.s8,.s9{background:rgba(168,85,247,.16);color:#ddd6fe}.vm-link{color:#e5e7eb;cursor:pointer;text-decoration:none}.vm-link:hover{text-decoration:underline}.vm-muted{color:#94a3b8}.vm-small{font-size:11px;color:#94a3b8}.vm-empty{padding:24px;text-align:center;color:#94a3b8}.vm-profile-item{cursor:pointer!important}.vm-profile-item a{cursor:pointer!important}.vm-actions-cell{display:flex;gap:6px;flex-wrap:wrap}.vm-now{font-weight:750}.vm-now-sub{font-size:11px;color:#94a3b8;margin-top:2px}
    @media(max-width:900px){#lss-vm-root{width:calc(100vw - 16px)}.vm-filters{grid-template-columns:1fr}.vm-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.vm-table{font-size:12px}.vm-table th,.vm-table td{padding:7px}.hide-mobile{display:none}}
  `;

  function injectStyles(){
    if(document.getElementById('lss-vm-style')) return;
    const s=document.createElement('style');
    s.id='lss-vm-style';
    s.textContent=css;
    document.head.appendChild(s);
  }

  function csrfToken(){ return document.querySelector('meta[name="csrf-token"]')?.content || ''; }
  function apiType(v){ const n=Number(v.vehicle_type ?? v.vehicle_type_id ?? v.type); return Number.isFinite(n) ? n : null; }
  function typeName(v){ const n=apiType(v); return v.vehicle_type_caption || v.vehicle_type_name || v.type_caption || v.type_name || v.vehicle_type_label || (n!==null ? VEHICLE_TYPE_NAMES[n] : null) || `Fahrzeugtyp ${n ?? '?'}`; }
  function vehicleCaption(v){ return v.caption || v.name || `Fahrzeug ${v.id}`; }
  function vehicleId(v){ return v.id ?? v.vehicle_id; }
  function buildingId(v){ return v.building_id ?? v.station_id ?? v.wache_id; }
  function missionId(v){ return v.mission_id ?? v.current_mission_id ?? v.target_mission_id ?? v.missionId ?? v.target_id ?? v.destination_id; }
  function fms(v){ const raw=v.fms_real ?? v.fms ?? v.status ?? v.state ?? v.fms_real_id; const n=Number(raw); return Number.isFinite(n) ? n : null; }
  function fmsLabel(n){ return FMS_LABELS[n] || `Status ${n ?? '?'}`; }

  function escapeHtml(s){ return String(s ?? '').replace(/[&<>'"]/g,ch=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[ch])); }

  function normalizeVehicleList(payload){ if(Array.isArray(payload)) return payload; if(payload && Array.isArray(payload.result)) return payload.result; return []; }

  async function fetchAllVehicles(){
    const all=[];
    let url='/api/v2/vehicles?limit=10000';
    for(let safety=0;safety<30 && url;safety++){
      const res=await fetch(url,{credentials:'same-origin'});
      if(!res.ok) throw new Error(`Fahrzeug-API HTTP ${res.status}`);
      const json=await res.json();
      all.push(...normalizeVehicleList(json));
      url=json?.paging?.next_page || null;
      if(url && url.startsWith('http')){ const u=new URL(url); url=u.pathname+u.search; }
      if(url) await new Promise(r=>setTimeout(r,100));
    }
    return all;
  }

  async function fetchBuildings(){
    try{
      const res=await fetch('/api/buildings',{credentials:'same-origin'});
      if(!res.ok) return new Map();
      const json=await res.json();
      const map=new Map();
      if(Array.isArray(json)) for(const b of json) map.set(Number(b.id), b);
      return map;
    }catch(_){ return new Map(); }
  }

  function extractMissionNameFromText(text){
    let t=String(text||'').replace(/\s+/g,' ').trim();
    if(!t) return null;
    t=t.replace(/^\s*Alarm\s+/i,'');
    t=t.replace(/≈\s*[\d.]+.*$/,'');
    t=t.replace(/Fehlende Fahrzeuge:.*$/i,'');
    t=t.replace(/Fehlendes Personal:.*$/i,'');
    t=t.replace(/Ein Fahrzeug hat einen Sprechwunsch.*$/i,'');
    t=t.replace(/\d+\s+Patienten.*$/i,'');
    t=t.replace(/\d+x\s+Wir benötigen:.*$/i,'');
    t=t.trim();
    const comma=t.indexOf(',');
    if(comma>3) t=t.slice(0,comma).trim();
    return t || null;
  }

  function scanVisibleMissions(){
    const map=new Map();
    const selectors=['[id^="mission_"]','.missionSideBarEntry','.mission_side_bar_entry','.mission_list_entry','.mission_panel'];
    for(const sel of selectors){
      for(const el of document.querySelectorAll(sel)){
        const idMatch=(el.id||'').match(/mission_(\d+)/) || (el.getAttribute('data-mission-id')||'').match(/(\d+)/);
        let mid=idMatch ? idMatch[1] : null;
        if(!mid){
          const a=el.querySelector?.('a[href*="/missions/"]') || (el.matches?.('a[href*="/missions/"]') ? el : null);
          const m=a?.getAttribute('href')?.match(/\/missions\/(\d+)/);
          if(m) mid=m[1];
        }
        if(!mid) continue;
        const name=extractMissionNameFromText(el.textContent);
        if(name && !/^Einsatz\s*\d+$/i.test(name)) map.set(String(mid), name);
      }
    }
    return map;
  }

  function getBuildingName(id){ if(!id) return '–'; const b=STATE.buildings.get(Number(id)); return b?.caption || b?.name || `Wache ${id}`; }

  function missionName(v){
    const explicit=v.mission_caption ?? v.mission_name ?? v.mission_title ?? v.target_caption ?? v.target_name ?? v.destination_caption ?? v.destination_name;
    if(explicit) return String(explicit).replace(/\s+/g,' ').trim();
    const mid=missionId(v);
    if(mid && STATE.missions.has(String(mid))) return STATE.missions.get(String(mid));
    return null;
  }

  function coord(v){
    const lat=Number(v.latitude ?? v.lat ?? v.current_latitude ?? v.current_lat ?? v.target_latitude ?? v.target_lat);
    const lng=Number(v.longitude ?? v.lng ?? v.lon ?? v.current_longitude ?? v.current_lng ?? v.target_longitude ?? v.target_lng);
    if(Number.isFinite(lat)&&Number.isFinite(lng)) return {lat,lng};
    return null;
  }

  function currentLabel(v){
    const name=missionName(v);
    if(name) return { main:name, sub:'Einsatz', url: missionId(v) ? `/missions/${missionId(v)}` : null };
    const c=coord(v);
    if(c && [3,4,5,7,8,9].includes(fms(v))) return { main:'Position auf Karte', sub:`${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`, url:`https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=17/${c.lat}/${c.lng}` };
    const bid=buildingId(v);
    if(bid) return { main:getBuildingName(bid), sub:'Heimatwache', url:`/buildings/${bid}` };
    return { main:'–', sub:'', url:null };
  }

  function typeOptions(){
    const map=new Map();
    for(const v of STATE.vehicles){ const t=typeName(v); map.set(t,(map.get(t)||0)+1); }
    return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0],'de'));
  }

  function filteredVehicles(){
    const q=STATE.search.trim().toLowerCase();
    return STATE.vehicles.filter(v=>{
      const t=typeName(v);
      if(STATE.filterType!=='ALL' && t!==STATE.filterType) return false;
      const s=fms(v);
      if(STATE.filterStatus!=='ALL' && String(s)!==STATE.filterStatus) return false;
      if(q){
        const cur=currentLabel(v);
        const hay=[vehicleCaption(v),t,getBuildingName(buildingId(v)),cur.main,cur.sub].join(' ').toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    }).sort((a,b)=>{
      const sa=fms(a)??99, sb=fms(b)??99;
      if(sa!==sb) return sa-sb;
      return vehicleCaption(a).localeCompare(vehicleCaption(b),'de');
    });
  }

  function counts(list){
    const c={total:list.length,ready:0,route:0,scene:0,sprech:0,notready:0};
    for(const v of list){
      const s=fms(v);
      if(s===1||s===2)c.ready++;
      else if(s===3)c.route++;
      else if(s===4)c.scene++;
      else if(s===5)c.sprech++;
      else if(s===6)c.notready++;
    }
    return c;
  }

  async function refresh(){
    STATE.loading=true; STATE.error=null; render();
    try{
      const [vehicles,buildings]=await Promise.all([fetchAllVehicles(),fetchBuildings()]);
      STATE.vehicles=vehicles;
      STATE.buildings=buildings;
      STATE.missions=scanVisibleMissions();
      STATE.lastUpdate=new Date();
    }catch(err){ STATE.error=err?.message || String(err); }
    finally{ STATE.loading=false; render(); }
  }

  function findRealBackalarmButton(v){
    const vid=String(vehicleId(v) ?? '');
    const name=vehicleCaption(v).trim();
    const candidates=[...document.querySelectorAll('a,button,input[type="button"],input[type="submit"]')].filter(el=>{
      const text=((el.textContent||el.value||'')+' '+(el.title||'')+' '+(el.getAttribute('aria-label')||'')).toLowerCase();
      return text.includes('rückalarm') || text.includes('ruckalarm') || text.includes('zurückalarm') || text.includes('zurueckalarm');
    });

    for(const el of candidates){
      const html=(el.outerHTML||'');
      const row=el.closest('tr,.vehicle_row,.vehicle,li,div');
      const rowText=(row?.textContent||'');
      if(vid && (html.includes(vid) || rowText.includes(vid))) return el;
      if(name && rowText.includes(name)) return el;
    }
    return null;
  }

  async function alarmBack(v){
    const realButton=findRealBackalarmButton(v);
    if(realButton){
      realButton.click();
      setTimeout(refresh,900);
      return;
    }

    const mid=missionId(v);
    if(mid){
      openUrl('/missions/'+mid);
      alert('Ich habe den Einsatz geöffnet. Dort bitte einmal den originalen Rückalarmieren-Button nutzen. Ich kann erst direkt klicken, wenn der echte Button im DOM geladen ist.');
      setTimeout(refresh,1200);
      return;
    }

    alert('Rückalarmieren geht hier noch nicht direkt, weil weder der echte Rückalarmieren-Button im DOM noch ein Einsatz erkannt wurde.');
  }

  function openUrl(url){ window.open(url,'_blank'); }

  function rowHtml(v){
    const vid=vehicleId(v);
    const bid=buildingId(v);
    const mid=missionId(v);
    const s=fms(v);
    const statusClass=`s${s ?? 6}`;
    const canAlarmBack=vid && [3,4,5,7,8,9].includes(s);
    const cur=currentLabel(v);
    const curHtml=cur.url ? `<a class="vm-link vm-now" data-open="${escapeHtml(cur.url)}">${escapeHtml(cur.main)}</a><div class="vm-now-sub">${escapeHtml(cur.sub)}</div>` : `<span class="vm-muted">${escapeHtml(cur.main)}</span>`;
    return `<tr>
      <td><strong>${escapeHtml(vehicleCaption(v))}</strong><div class="vm-small">${escapeHtml(typeName(v))}</div></td>
      <td><span class="vm-status ${statusClass}">${escapeHtml(fmsLabel(s))}</span></td>
      <td>${bid ? `<a class="vm-link" data-open="/buildings/${bid}">${escapeHtml(getBuildingName(bid))}</a>` : '<span class="vm-muted">–</span>'}</td>
      <td>${curHtml}</td>
      <td><div class="vm-actions-cell">
        ${vid ? `<button class="vm-btn" data-open="/vehicles/${vid}">Fahrzeug</button>` : ''}
        ${bid ? `<button class="vm-btn" data-open="/buildings/${bid}">Wache</button>` : ''}
        ${mid ? `<button class="vm-btn" data-open="/missions/${mid}">Einsatz</button>` : ''}
        ${canAlarmBack ? `<button class="vm-btn warn" data-back="${vid}">Rückalarmieren</button>` : ''}
      </div></td>
    </tr>`;
  }

  function render(){
    const root=document.getElementById('lss-vm-root');
    if(!root) return;
    root.classList.toggle('vm-open',STATE.open);
    const list=filteredVehicles();
    const c=counts(list);
    const opts=typeOptions();
    root.innerHTML=`
      <div class="vm-head"><div><div class="vm-title">Fahrzeugbrowser</div><div class="vm-sub">${STATE.loading?'Lade Daten …':'Live-Daten aktiv'} · ${STATE.lastUpdate?STATE.lastUpdate.toLocaleTimeString():'–'}${STATE.error?' · Fehler: '+escapeHtml(STATE.error):''}</div></div><div class="vm-actions"><button class="vm-btn" data-action="refresh">Aktualisieren</button><button class="vm-btn" data-action="close">Schließen</button></div></div>
      <div class="vm-body">
        <div class="vm-filters">
          <select class="vm-select" id="vm-type-select"><option value="ALL">Alle Fahrzeugarten (${STATE.vehicles.length})</option>${opts.map(([t,n])=>`<option value="${escapeHtml(t)}" ${STATE.filterType===t?'selected':''}>${escapeHtml(t)} (${n})</option>`).join('')}</select>
          <select class="vm-select" id="vm-status-select"><option value="ALL">Alle Status</option>${[1,2,3,4,5,6,7,8,9].map(s=>`<option value="${s}" ${STATE.filterStatus===String(s)?'selected':''}>${escapeHtml(fmsLabel(s))}</option>`).join('')}</select>
          <input class="vm-input" id="vm-search" placeholder="Suche nach Fahrzeug, Wache, Einsatz …" value="${escapeHtml(STATE.search)}">
          <button class="vm-btn" data-action="clear">Filter leeren</button>
        </div>
        <div class="vm-kpis"><div class="vm-kpi"><div class="label">Angezeigt</div><div class="value">${c.total}</div></div><div class="vm-kpi"><div class="label">Einsatzbereit 1/2</div><div class="value">${c.ready}</div></div><div class="vm-kpi"><div class="label">Anfahrt 3</div><div class="value">${c.route}</div></div><div class="vm-kpi"><div class="label">Einsatzort 4</div><div class="value">${c.scene}</div></div><div class="vm-kpi"><div class="label">Sprechwunsch / n. bereit</div><div class="value">${c.sprech}/${c.notready}</div></div></div>
        <table class="vm-table"><thead><tr><th>Fahrzeug</th><th>Status</th><th>Heimatwache</th><th>Aktuell</th><th>Aktionen</th></tr></thead><tbody>${list.length?list.map(rowHtml).join(''):`<tr><td colspan="5"><div class="vm-empty">Keine Fahrzeuge für diese Auswahl gefunden.</div></td></tr>`}</tbody></table>
      </div>`;
  }

  function createRoot(){
    if(document.getElementById('lss-vm-root')) return;
    const root=document.createElement('div');
    root.id='lss-vm-root';
    document.body.appendChild(root);
    root.addEventListener('click',ev=>{
      const t=ev.target;
      if(!(t instanceof HTMLElement)) return;
      if(t.dataset.action==='refresh') refresh();
      if(t.dataset.action==='close'){ STATE.open=false; render(); }
      if(t.dataset.action==='clear'){ STATE.filterType='ALL'; STATE.filterStatus='ALL'; STATE.search=''; render(); }
      if(t.dataset.open) openUrl(t.dataset.open);
      if(t.dataset.back){ const v=STATE.vehicles.find(x=>String(vehicleId(x))===String(t.dataset.back)); if(v) alarmBack(v); }
    });
    root.addEventListener('change',ev=>{ const t=ev.target; if(!(t instanceof HTMLSelectElement)) return; if(t.id==='vm-type-select'){ STATE.filterType=t.value; render(); } if(t.id==='vm-status-select'){ STATE.filterStatus=t.value; render(); } });
    root.addEventListener('input',ev=>{ const t=ev.target; if(!(t instanceof HTMLInputElement)) return; if(t.id==='vm-search'){ STATE.search=t.value; render(); } });
  }

  function findProfileDropdownMenu(){
    const toggles=[...document.querySelectorAll('a,button,li,div')].filter(el=>{
      const html=(el.innerHTML||'').toLowerCase();
      const cls=(el.className||'').toString().toLowerCase();
      const title=(el.getAttribute('title')||'').toLowerCase();
      const aria=(el.getAttribute('aria-label')||'').toLowerCase();
      const text=(el.textContent||'').trim().toLowerCase();
      return html.includes('glyphicon-user')||html.includes('fa-user')||html.includes('icon-user')||cls.includes('glyphicon-user')||cls.includes('fa-user')||title.includes('profil')||title.includes('profile')||aria.includes('profil')||aria.includes('profile')||text==='profil'||text==='profile';
    });
    for(const toggle of toggles){
      const li=toggle.closest('li.dropdown, li, .dropdown');
      if(li){ const menu=li.querySelector('ul.dropdown-menu, .dropdown-menu'); if(menu) return menu; }
      const controls=toggle.getAttribute('aria-controls') || toggle.getAttribute('data-target') || toggle.getAttribute('href');
      if(controls && controls.startsWith('#')){ const controlled=document.querySelector(controls); const menu=controlled?.matches?.('.dropdown-menu') ? controlled : controlled?.querySelector?.('.dropdown-menu'); if(menu) return menu; }
      let sib=toggle.nextElementSibling; while(sib){ if(sib.matches?.('ul.dropdown-menu, .dropdown-menu')) return sib; sib=sib.nextElementSibling; }
    }
    const userIcon=document.querySelector('.glyphicon-user, .fa-user, [class*="user"]');
    if(userIcon){ const li=userIcon.closest('li.dropdown, li, .dropdown'); const menu=li?.querySelector('ul.dropdown-menu, .dropdown-menu'); if(menu) return menu; }
    return null;
  }

  function insertProfileMenuItem(){
    if(document.getElementById('lss-vm-profile-link')) return;
    const menu=findProfileDropdownMenu();
    if(!menu) return;
    const li=document.createElement('li');
    li.id='lss-vm-profile-link';
    li.className='vm-profile-item';
    li.innerHTML='<a href="#">🚗 Fahrzeugbrowser</a>';
    li.addEventListener('click',ev=>{ ev.preventDefault(); ev.stopPropagation(); STATE.open=true; STATE.missions=scanVisibleMissions(); render(); refresh(); });
    const anchors=[...menu.querySelectorAll('a')];
    const profileSettings=anchors.find(a=>/profil|einstellung|account|benutzer|user|settings/i.test(a.textContent||''));
    const anchorLi=profileSettings?.closest('li');
    if(anchorLi && anchorLi.parentNode===menu) anchorLi.insertAdjacentElement('afterend',li); else menu.appendChild(li);
  }

  function boot(){ injectStyles(); createRoot(); insertProfileMenuItem(); render(); setInterval(insertProfileMenuItem,3000); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
