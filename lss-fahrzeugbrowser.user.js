// ==UserScript==
// @name         LSS Fahrzeugbrowser stabil
// @namespace    itsMartinus99-lss-tools
// @version      2.1.0
// @description  Fahrzeugbrowser für Leitstellenspiel: /api/vehicles als Hauptquelle, LSS-Manager für Typnamen, API v2 nur als Notfall-Fallback; mit Cache-Reset für neue Fahrzeugtypen.
// @author       Martin / ChatGPT
// @match        https://www.leitstellenspiel.de/*
// @match        https://leitstellenspiel.de/*
// @grant        GM_xmlhttpRequest
// @connect      api.lss-manager.de
// ==/UserScript==

(() => {
  'use strict';

  const CONFIG = {
    vehicleTypeApi: 'https://api.lss-manager.de/de_DE/vehicles',
    vehicleTypeCacheKey: 'lss-fahrzeugbrowser.vehicleTypes.de_DE.v3',
    vehicleTypeCacheMs: 6 * 60 * 60 * 1000,
    apiV2PageSize: 500,
    apiV2DelayMs: 150,
    refreshAfterBackalarmMs: 1200
  };

  const MANUAL_TYPE_OVERRIDES = {
    // Neue Autobahnpolizei, bis LSS-Manager den Typ selbst ausliefert.
    184: 'FuStW (AP)'
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
    9: 'Status 9 – Sonderstatus'
  };

  const STATE = {
    open: false,
    loading: false,
    vehicles: [],
    buildings: new Map(),
    vehicleTypes: new Map(),
    missions: new Map(),
    filterType: 'ALL',
    filterStatus: 'ALL',
    search: '',
    apiSource: null,
    typeSource: null,
    warning: null,
    error: null,
    lastUpdate: null
  };

  const CSS = `
    #lss-fb-root {
      position: fixed;
      top: 58px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999998;
      width: min(1120px, calc(100vw - 28px));
      max-height: calc(100vh - 84px);
      display: none;
      overflow: hidden;
      border: 1px solid rgba(148, 163, 184, .25);
      border-radius: 13px;
      background: rgba(8, 13, 22, .98);
      color: #e5e7eb;
      box-shadow: 0 18px 64px rgba(0, 0, 0, .62);
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #lss-fb-root.fb-open { display: block; }
    #lss-fb-root * { box-sizing: border-box; }
    .fb-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 12px 14px; border-bottom: 1px solid rgba(148, 163, 184, .16); }
    .fb-title { font-size: 18px; font-weight: 900; }
    .fb-sub { margin-top: 2px; font-size: 11px; color: #94a3b8; }
    .fb-actions { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
    .fb-btn { border: 1px solid rgba(148, 163, 184, .28); background: rgba(15, 23, 42, .88); color: #e5e7eb; border-radius: 9px; padding: 6px 9px; font-size: 12px; cursor: pointer; }
    .fb-btn:hover { background: rgba(30, 41, 59, .98); }
    .fb-btn-danger { border-color: rgba(239, 68, 68, .45); color: #fecaca; }
    .fb-body { padding: 11px 13px; overflow: auto; max-height: calc(100vh - 145px); }
    .fb-msg { margin-bottom: 10px; border: 1px solid rgba(148, 163, 184, .22); border-radius: 10px; padding: 8px 10px; background: rgba(15, 23, 42, .8); font-size: 12px; }
    .fb-msg.warn { border-color: rgba(234, 179, 8, .45); color: #fde68a; }
    .fb-msg.error { border-color: rgba(239, 68, 68, .45); color: #fecaca; }
    .fb-filters { display: grid; grid-template-columns: 1.1fr .9fr 1.2fr auto; gap: 8px; margin-bottom: 10px; }
    .fb-input, .fb-select { width: 100%; border: 1px solid rgba(148, 163, 184, .25); background: rgba(15, 23, 42, .9); color: #e5e7eb; border-radius: 9px; padding: 8px 9px; font-size: 13px; }
    .fb-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
    .fb-kpi { border: 1px solid rgba(148, 163, 184, .18); background: rgba(15, 23, 42, .75); border-radius: 10px; padding: 8px 10px; }
    .fb-kpi .label { font-size: 11px; color: #a3aab7; }
    .fb-kpi .value { margin-top: 1px; font-size: 20px; font-weight: 900; }
    .fb-table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid rgba(148, 163, 184, .18); border-radius: 10px; overflow: hidden; }
    .fb-table th, .fb-table td { padding: 7px 9px; border-bottom: 1px solid rgba(148, 163, 184, .12); border-right: 1px solid rgba(148, 163, 184, .08); vertical-align: middle; }
    .fb-table th:last-child, .fb-table td:last-child { border-right: 0; }
    .fb-table tr:last-child td { border-bottom: 0; }
    .fb-table th { position: sticky; top: 0; background: rgba(30, 41, 59, .92); font-size: 12px; text-align: left; color: #cbd5e1; }
    .fb-table td { font-size: 13px; }
    .fb-table tr { background: rgba(255, 255, 255, .015); }
    .fb-table tr:hover { background: rgba(255, 255, 255, .055); }
    .fb-status { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: 800; white-space: nowrap; }
    .s1, .s2 { background: rgba(34, 197, 94, .16); color: #86efac; }
    .s3 { background: rgba(234, 179, 8, .16); color: #fde68a; }
    .s4 { background: rgba(239, 68, 68, .16); color: #fca5a5; }
    .s5 { background: rgba(59, 130, 246, .16); color: #bfdbfe; }
    .s6 { background: rgba(148, 163, 184, .18); color: #cbd5e1; }
    .s7, .s8, .s9 { background: rgba(168, 85, 247, .16); color: #ddd6fe; }
    .fb-link { color: #e5e7eb; cursor: pointer; text-decoration: none; }
    .fb-link:hover { text-decoration: underline; }
    .fb-muted { color: #94a3b8; }
    .fb-empty { padding: 24px; text-align: center; color: #94a3b8; }
    .fb-actions-cell { display: flex; gap: 6px; flex-wrap: wrap; }
    .fb-now { font-weight: 750; }
    .fb-now-sub { margin-top: 2px; font-size: 11px; color: #94a3b8; }
    @media (max-width: 900px) {
      #lss-fb-root { width: calc(100vw - 16px); }
      .fb-filters { grid-template-columns: 1fr; }
      .fb-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .fb-hide-mobile { display: none; }
      .fb-table th, .fb-table td { padding: 7px; }
    }
  `;

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function asNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function relativeUrl(url) {
    if (!url) return null;
    const value = String(url);
    if (!value.startsWith('http')) return value;
    const parsed = new URL(value);
    return parsed.pathname + parsed.search;
  }

  function normalizeVehicleList(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.result)) return payload.result;
    if (payload && Array.isArray(payload.vehicles)) return payload.vehicles;
    return [];
  }

  async function fetchGameJson(url) {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
    return response.json();
  }

  function externalJson(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          timeout: 10000,
          onload: response => {
            if (response.status < 200 || response.status >= 300) {
              reject(new Error(`${url} HTTP ${response.status}`));
              return;
            }
            try { resolve(JSON.parse(response.responseText)); }
            catch (err) { reject(err); }
          },
          onerror: () => reject(new Error(`${url} konnte nicht geladen werden`)),
          ontimeout: () => reject(new Error(`${url} Timeout`))
        });
        return;
      }

      fetch(url)
        .then(response => {
          if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
          return response.json();
        })
        .then(resolve)
        .catch(reject);
    });
  }

  function extractTypeName(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value !== 'object') return null;
    return value.caption || value.name || value.title || value.typeName || value.text || value.label || null;
  }

  function addVehicleTypeToMap(map, id, value) {
    const numericId = asNumber(id);
    const name = extractTypeName(value);
    if (numericId !== null && name) map.set(numericId, String(name));
  }

  function walkVehicleTypes(payload, map = new Map()) {
    if (!payload) return map;

    if (Array.isArray(payload)) {
      for (const item of payload) {
        if (!item || typeof item !== 'object') continue;
        const id = item.id ?? item.type ?? item.vehicle_type ?? item.vehicle_type_id;
        addVehicleTypeToMap(map, id, item);
      }
      applyManualTypeOverrides(map);
      return map;
    }

    if (typeof payload === 'object') {
      for (const [key, value] of Object.entries(payload)) {
        if (/^[0-9]+$/.test(key)) addVehicleTypeToMap(map, key, value);

        if (value && typeof value === 'object') {
          const possibleId = value.id ?? value.type ?? value.vehicle_type ?? value.vehicle_type_id;
          if (possibleId !== undefined) addVehicleTypeToMap(map, possibleId, value);

          if (!Array.isArray(value)) walkVehicleTypes(value, map);
        }
      }
    }

    applyManualTypeOverrides(map);
    return map;
  }

  function applyManualTypeOverrides(map) {
    for (const [id, name] of Object.entries(MANUAL_TYPE_OVERRIDES)) {
      const numericId = asNumber(id);
      if (numericId !== null && name) map.set(numericId, String(name));
    }
  }

  function unknownVehicleTypeIds(vehicles = STATE.vehicles, vehicleTypes = STATE.vehicleTypes) {
    const ids = new Set();
    for (const vehicle of vehicles) {
      const type = apiType(vehicle);
      if (type !== null && !vehicleTypes.has(type)) ids.add(type);
    }
    return [...ids].sort((a, b) => a - b);
  }

  function clearVehicleTypeCache() {
    localStorage.removeItem(CONFIG.vehicleTypeCacheKey);
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('lss-fahrzeugbrowser.vehicleTypes.')) localStorage.removeItem(key);
    }
  }

  function debugUnknownTypes() {
    const unknown = unknownVehicleTypeIds();
    if (!unknown.length) {
      console.info('[Fahrzeugbrowser] Keine unbekannten Fahrzeugtypen gefunden.');
      alert('Keine unbekannten Fahrzeugtypen gefunden.');
      return;
    }

    console.table(unknown.map(id => ({
      id,
      exampleVehicles: STATE.vehicles
        .filter(vehicle => apiType(vehicle) === id)
        .slice(0, 5)
        .map(vehicleCaption)
        .join(', ')
    })));

    alert('Unbekannte Fahrzeugtyp-IDs: ' + unknown.join(', ') + '

Die Beispiele stehen in der Browser-Konsole.');
  }

  function loadCachedVehicleTypes() {
    try {
      const cached = JSON.parse(localStorage.getItem(CONFIG.vehicleTypeCacheKey) || 'null');
      if (!cached || !cached.updatedAt || !cached.payload) return null;
      if (Date.now() - cached.updatedAt > CONFIG.vehicleTypeCacheMs) return null;
      const map = walkVehicleTypes(cached.payload);
      return map.size ? map : null;
    } catch (_err) {
      return null;
    }
  }

  async function fetchVehicleTypes(forceReload = false) {
    if (forceReload) clearVehicleTypeCache();

    const cached = forceReload ? null : loadCachedVehicleTypes();
    if (cached) {
      STATE.typeSource = 'LSS-Manager Cache';
      return cached;
    }

    const payload = await externalJson(CONFIG.vehicleTypeApi);
    const map = walkVehicleTypes(payload);

    if (!map.size) throw new Error('Fahrzeugtypen konnten aus LSS-Manager nicht gelesen werden');

    localStorage.setItem(CONFIG.vehicleTypeCacheKey, JSON.stringify({
      updatedAt: Date.now(),
      payload
    }));

    STATE.typeSource = 'LSS-Manager';
    return map;
  }

  async function fetchVehiclesLegacy() {
    const json = await fetchGameJson('/api/vehicles');
    const list = normalizeVehicleList(json).map(vehicle => ({ ...vehicle, __apiSource: 'legacy' }));
    if (!list.length) throw new Error('/api/vehicles lieferte keine Fahrzeuge');
    return list;
  }

  async function fetchVehiclesV2() {
    const all = [];
    let url = `/api/v2/vehicles?limit=${CONFIG.apiV2PageSize}`;

    for (let safety = 0; safety < 120 && url; safety += 1) {
      const json = await fetchGameJson(url);
      all.push(...normalizeVehicleList(json).map(vehicle => ({ ...vehicle, __apiSource: 'v2' })));
      url = relativeUrl(json?.paging?.next_page || json?.pagination?.next_page || json?.next_page || null);
      if (url) await wait(CONFIG.apiV2DelayMs);
    }

    if (!all.length) throw new Error('/api/v2/vehicles lieferte keine Fahrzeuge');
    return all;
  }

  async function fetchAllVehicles() {
    try {
      const vehicles = await fetchVehiclesLegacy();
      STATE.apiSource = '/api/vehicles';
      return vehicles;
    } catch (legacyError) {
      console.warn('[Fahrzeugbrowser] /api/vehicles fehlgeschlagen, nutze API v2 als Notfall-Fallback:', legacyError);
      STATE.warning = `/api/vehicles war nicht erreichbar (${legacyError.message}). API v2 wird nur als Notfall-Fallback genutzt.`;
      const vehicles = await fetchVehiclesV2();
      STATE.apiSource = '/api/v2/vehicles Fallback';
      return vehicles;
    }
  }

  async function fetchBuildings() {
    try {
      const json = await fetchGameJson('/api/buildings');
      const map = new Map();
      if (Array.isArray(json)) {
        for (const building of json) map.set(Number(building.id), building);
      }
      return map;
    } catch (_err) {
      return new Map();
    }
  }

  function apiType(vehicle) {
    return asNumber(vehicle.vehicle_type ?? vehicle.vehicle_type_id ?? vehicle.type ?? vehicle.type_id);
  }

  function typeName(vehicle) {
    const explicit = vehicle.vehicle_type_caption || vehicle.vehicle_type_name || vehicle.type_caption || vehicle.type_name || vehicle.vehicle_type_label;
    if (explicit) return String(explicit);

    const type = apiType(vehicle);
    if (type === null) return 'Fahrzeugtyp ?';

    return STATE.vehicleTypes.get(type) || `Fahrzeugtyp ${type}`;
  }

  function vehicleId(vehicle) {
    return vehicle.id ?? vehicle.vehicle_id;
  }

  function vehicleCaption(vehicle) {
    return vehicle.caption || vehicle.name || `Fahrzeug ${vehicleId(vehicle) ?? '?'}`;
  }

  function buildingId(vehicle) {
    return vehicle.building_id ?? vehicle.station_id ?? vehicle.wache_id ?? vehicle.home_building_id;
  }

  function missionId(vehicle) {
    return vehicle.mission_id ?? vehicle.current_mission_id ?? vehicle.target_mission_id ?? vehicle.missionId ?? vehicle.target_id ?? vehicle.destination_id;
  }

  function fms(vehicle) {
    return asNumber(vehicle.fms_real ?? vehicle.fms ?? vehicle.status ?? vehicle.state ?? vehicle.fms_real_id);
  }

  function fmsLabel(status) {
    return FMS_LABELS[status] || `Status ${status ?? '?'}`;
  }

  function getBuildingName(id) {
    if (!id) return '–';
    const building = STATE.buildings.get(Number(id));
    return building?.caption || building?.name || `Wache ${id}`;
  }

  function extractMissionNameFromText(text) {
    let value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return null;
    value = value.replace(/^\s*Alarm\s+/i, '');
    value = value.replace(/≈\s*[\d.]+.*$/i, '');
    value = value.replace(/Fehlende Fahrzeuge:.*$/i, '');
    value = value.replace(/Fehlendes Personal:.*$/i, '');
    value = value.replace(/Ein Fahrzeug hat einen Sprechwunsch.*$/i, '');
    value = value.replace(/\d+\s+Patienten.*$/i, '');
    value = value.replace(/\d+x\s+Wir benötigen:.*$/i, '');
    value = value.trim();
    const comma = value.indexOf(',');
    if (comma > 3) value = value.slice(0, comma).trim();
    return value || null;
  }

  function scanVisibleMissions() {
    const map = new Map();
    const selectors = ['[id^="mission_"]', '.missionSideBarEntry', '.mission_side_bar_entry', '.mission_list_entry', '.mission_panel'];

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const idMatch = (element.id || '').match(/mission_(\d+)/) || (element.getAttribute('data-mission-id') || '').match(/(\d+)/);
        let foundId = idMatch ? idMatch[1] : null;

        if (!foundId) {
          const link = element.querySelector?.('a[href*="/missions/"]') || (element.matches?.('a[href*="/missions/"]') ? element : null);
          const match = link?.getAttribute('href')?.match(/\/missions\/(\d+)/);
          if (match) foundId = match[1];
        }

        if (!foundId) continue;
        const name = extractMissionNameFromText(element.textContent);
        if (name && !/^Einsatz\s*\d+$/i.test(name)) map.set(String(foundId), name);
      }
    }

    return map;
  }

  function coord(vehicle) {
    const lat = asNumber(vehicle.latitude ?? vehicle.lat ?? vehicle.current_latitude ?? vehicle.current_lat ?? vehicle.target_latitude ?? vehicle.target_lat);
    const lng = asNumber(vehicle.longitude ?? vehicle.lng ?? vehicle.lon ?? vehicle.current_longitude ?? vehicle.current_lng ?? vehicle.target_longitude ?? vehicle.target_lng);
    return lat !== null && lng !== null ? { lat, lng } : null;
  }

  function missionName(vehicle) {
    const explicit = vehicle.mission_caption || vehicle.mission_name || vehicle.mission_title || vehicle.target_caption || vehicle.target_name || vehicle.destination_caption || vehicle.destination_name;
    if (explicit) return String(explicit).replace(/\s+/g, ' ').trim();
    const id = missionId(vehicle);
    if (id && STATE.missions.has(String(id))) return STATE.missions.get(String(id));
    return null;
  }

  function currentLabel(vehicle) {
    const name = missionName(vehicle);
    if (name) return { main: name, sub: 'Einsatz', url: missionId(vehicle) ? `/missions/${missionId(vehicle)}` : null };

    const position = coord(vehicle);
    if (position && [3, 4, 5, 7, 8, 9].includes(fms(vehicle))) {
      return {
        main: 'Position auf Karte',
        sub: `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`,
        url: `https://www.openstreetmap.org/?mlat=${position.lat}&mlon=${position.lng}#map=17/${position.lat}/${position.lng}`
      };
    }

    const home = buildingId(vehicle);
    if (home) return { main: getBuildingName(home), sub: 'Heimatwache', url: `/buildings/${home}` };

    return { main: '–', sub: '', url: null };
  }

  function typeOptions() {
    const map = new Map();
    for (const vehicle of STATE.vehicles) {
      const name = typeName(vehicle);
      map.set(name, (map.get(name) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'));
  }

  function filteredVehicles() {
    const query = STATE.search.trim().toLowerCase();

    return STATE.vehicles.filter(vehicle => {
      const type = typeName(vehicle);
      if (STATE.filterType !== 'ALL' && type !== STATE.filterType) return false;

      const status = fms(vehicle);
      if (STATE.filterStatus !== 'ALL' && String(status) !== STATE.filterStatus) return false;

      if (query) {
        const current = currentLabel(vehicle);
        const haystack = [vehicleCaption(vehicle), type, getBuildingName(buildingId(vehicle)), current.main, current.sub].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    }).sort((a, b) => {
      const fa = fms(a) ?? 99;
      const fb = fms(b) ?? 99;
      if (fa !== fb) return fa - fb;
      return vehicleCaption(a).localeCompare(vehicleCaption(b), 'de');
    });
  }

  function counts(list) {
    const result = { total: list.length, ready: 0, route: 0, scene: 0, sprech: 0, notready: 0 };
    for (const vehicle of list) {
      const status = fms(vehicle);
      if (status === 1 || status === 2) result.ready += 1;
      else if (status === 3) result.route += 1;
      else if (status === 4) result.scene += 1;
      else if (status === 5) result.sprech += 1;
      else if (status === 6) result.notready += 1;
    }
    return result;
  }

  async function refresh(forceTypeReload = false) {
    STATE.loading = true;
    STATE.error = null;
    STATE.warning = null;
    render();

    try {
      let vehicleTypes;
      try {
        vehicleTypes = await fetchVehicleTypes(forceTypeReload);
      } catch (typeError) {
        console.warn('[Fahrzeugbrowser] Fahrzeugtypen konnten nicht geladen werden:', typeError);
        vehicleTypes = loadCachedVehicleTypes() || new Map();
        STATE.typeSource = vehicleTypes.size ? 'alter Cache' : 'nicht geladen';
        STATE.warning = `Fahrzeugtyp-Namen konnten nicht frisch geladen werden (${typeError.message}). Falls kein Cache vorhanden ist, werden Typ-IDs angezeigt.`;
      }

      const [vehicles, buildings] = await Promise.all([fetchAllVehicles(), fetchBuildings()]);

      STATE.vehicleTypes = vehicleTypes;
      STATE.vehicles = vehicles;
      STATE.buildings = buildings;
      STATE.missions = scanVisibleMissions();
      const unknownTypes = unknownVehicleTypeIds(vehicles, vehicleTypes);
      if (unknownTypes.length) {
        const note = `Unbekannte Fahrzeugtyp-ID(s): ${unknownTypes.join(', ')}. Falls das neue Autobahnpolizei-Fahrzeug noch nicht im LSS-Manager steht, bitte ID in MANUAL_TYPE_OVERRIDES eintragen.`;
        STATE.warning = STATE.warning ? `${STATE.warning} ${note}` : note;
      }

      STATE.lastUpdate = new Date();
    } catch (err) {
      STATE.error = err?.message || String(err);
    } finally {
      STATE.loading = false;
      render();
    }
  }

  function openUrl(url) {
    window.open(url, '_blank');
  }

  function findRealBackalarmButton(vehicle) {
    const id = String(vehicleId(vehicle) ?? '');
    const name = vehicleCaption(vehicle).trim();
    const candidates = [...document.querySelectorAll('a, button, input[type="button"], input[type="submit"]')].filter(element => {
      const text = `${element.textContent || element.value || ''} ${element.title || ''} ${element.getAttribute('aria-label') || ''}`.toLowerCase();
      return text.includes('rückalarm') || text.includes('ruckalarm') || text.includes('zurückalarm') || text.includes('zurueckalarm');
    });

    for (const element of candidates) {
      const html = element.outerHTML || '';
      const row = element.closest('tr, .vehicle_row, .vehicle, li, div');
      const rowText = row?.textContent || '';
      if (id && (html.includes(id) || rowText.includes(id))) return element;
      if (name && rowText.includes(name)) return element;
    }

    return null;
  }

  async function alarmBack(vehicle) {
    const realButton = findRealBackalarmButton(vehicle);
    if (realButton) {
      realButton.click();
      setTimeout(refresh, CONFIG.refreshAfterBackalarmMs);
      return;
    }

    const id = missionId(vehicle);
    if (id) {
      openUrl(`/missions/${id}`);
      alert('Ich habe den Einsatz geöffnet. Direktes Rückalarmieren ist nur möglich, wenn der originale Rückalarmieren-Button bereits auf der Seite geladen ist.');
      return;
    }

    alert('Rückalarmieren ist hier nicht möglich, weil kein Einsatz und kein echter Rückalarmieren-Button erkannt wurde.');
  }

  function rowHtml(vehicle) {
    const id = vehicleId(vehicle);
    const home = buildingId(vehicle);
    const mission = missionId(vehicle);
    const status = fms(vehicle);
    const current = currentLabel(vehicle);
    const canBackalarm = id && [3, 4, 5, 7, 8, 9].includes(status);

    const currentHtml = current.url
      ? `<a class="fb-link fb-now" data-open="${escapeHtml(current.url)}">${escapeHtml(current.main)}</a><div class="fb-now-sub">${escapeHtml(current.sub)}</div>`
      : `<span class="fb-now">${escapeHtml(current.main)}</span>`;

    return `
      <tr>
        <td>${id ? `<a class="fb-link" data-open="/vehicles/${escapeHtml(id)}">${escapeHtml(vehicleCaption(vehicle))}</a>` : escapeHtml(vehicleCaption(vehicle))}</td>
        <td>${escapeHtml(typeName(vehicle))}</td>
        <td><span class="fb-status s${status ?? 6}">${escapeHtml(fmsLabel(status))}</span></td>
        <td class="fb-hide-mobile">${home ? `<a class="fb-link" data-open="/buildings/${escapeHtml(home)}">${escapeHtml(getBuildingName(home))}</a>` : '–'}</td>
        <td>${currentHtml}</td>
        <td>
          <div class="fb-actions-cell">
            ${id ? `<button class="fb-btn" data-open="/vehicles/${escapeHtml(id)}">Fahrzeug</button>` : ''}
            ${home ? `<button class="fb-btn" data-open="/buildings/${escapeHtml(home)}">Wache</button>` : ''}
            ${mission ? `<button class="fb-btn" data-open="/missions/${escapeHtml(mission)}">Einsatz</button>` : ''}
            ${canBackalarm ? `<button class="fb-btn fb-btn-danger" data-back="${escapeHtml(id)}">Rückalarmieren</button>` : ''}
          </div>
        </td>
      </tr>`;
  }

  function render() {
    const root = document.getElementById('lss-fb-root');
    if (!root) return;

    root.classList.toggle('fb-open', STATE.open);

    const list = filteredVehicles();
    const count = counts(list);
    const options = typeOptions();
    const sourceText = [STATE.apiSource ? `Fahrzeuge: ${STATE.apiSource}` : null, STATE.typeSource ? `Typen: ${STATE.typeSource}` : null].filter(Boolean).join(' · ');

    root.innerHTML = `
      <div class="fb-head">
        <div>
          <div class="fb-title">Fahrzeugbrowser</div>
          <div class="fb-sub">${STATE.loading ? 'Lade Daten …' : 'Bereit'} · ${STATE.lastUpdate ? STATE.lastUpdate.toLocaleTimeString() : 'noch nicht geladen'}${sourceText ? ` · ${escapeHtml(sourceText)}` : ''}</div>
        </div>
        <div class="fb-actions">
          <button class="fb-btn" data-action="refresh">Aktualisieren</button>
          <button class="fb-btn" data-action="type-reload">Typnamen neu laden</button>
          <button class="fb-btn" data-action="debug-unknown">Unbekannte IDs</button>
          <button class="fb-btn" data-action="close">Schließen</button>
        </div>
      </div>
      <div class="fb-body">
        ${STATE.error ? `<div class="fb-msg error">Fehler: ${escapeHtml(STATE.error)}</div>` : ''}
        ${STATE.warning ? `<div class="fb-msg warn">Hinweis: ${escapeHtml(STATE.warning)}</div>` : ''}

        <div class="fb-filters">
          <select id="fb-type-select" class="fb-select">
            <option value="ALL">Alle Fahrzeugarten (${STATE.vehicles.length})</option>
            ${options.map(([type, amount]) => `<option value="${escapeHtml(type)}" ${STATE.filterType === type ? 'selected' : ''}>${escapeHtml(type)} (${amount})</option>`).join('')}
          </select>
          <select id="fb-status-select" class="fb-select">
            <option value="ALL">Alle Status</option>
            ${[1,2,3,4,5,6,7,8,9].map(status => `<option value="${status}" ${STATE.filterStatus === String(status) ? 'selected' : ''}>${escapeHtml(fmsLabel(status))}</option>`).join('')}
          </select>
          <input id="fb-search" class="fb-input" placeholder="Suche: Fahrzeug, Wache, Einsatz …" value="${escapeHtml(STATE.search)}">
          <button class="fb-btn" data-action="clear">Filter leeren</button>
        </div>

        <div class="fb-kpis">
          <div class="fb-kpi"><div class="label">Angezeigt</div><div class="value">${count.total}</div></div>
          <div class="fb-kpi"><div class="label">Einsatzbereit 1/2</div><div class="value">${count.ready}</div></div>
          <div class="fb-kpi"><div class="label">Anfahrt 3</div><div class="value">${count.route}</div></div>
          <div class="fb-kpi"><div class="label">Einsatzort 4</div><div class="value">${count.scene}</div></div>
          <div class="fb-kpi"><div class="label">Sprechwunsch / n. bereit</div><div class="value">${count.sprech}/${count.notready}</div></div>
        </div>

        ${list.length ? `
          <table class="fb-table">
            <thead>
              <tr>
                <th>Fahrzeug</th>
                <th>Typ</th>
                <th>Status</th>
                <th class="fb-hide-mobile">Heimatwache</th>
                <th>Aktuell</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>${list.map(rowHtml).join('')}</tbody>
          </table>` : '<div class="fb-empty">Keine Fahrzeuge für diese Auswahl gefunden.</div>'}
      </div>`;
  }

  function createRoot() {
    if (document.getElementById('lss-fb-root')) return;

    const root = document.createElement('div');
    root.id = 'lss-fb-root';
    document.body.appendChild(root);

    root.addEventListener('click', event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      if (target.dataset.action === 'refresh') refresh();
      if (target.dataset.action === 'type-reload') refresh(true);
      if (target.dataset.action === 'debug-unknown') debugUnknownTypes();
      if (target.dataset.action === 'close') { STATE.open = false; render(); }
      if (target.dataset.action === 'clear') { STATE.filterType = 'ALL'; STATE.filterStatus = 'ALL'; STATE.search = ''; render(); }
      if (target.dataset.open) openUrl(target.dataset.open);
      if (target.dataset.back) {
        const vehicle = STATE.vehicles.find(item => String(vehicleId(item)) === String(target.dataset.back));
        if (vehicle) alarmBack(vehicle);
      }
    });

    root.addEventListener('change', event => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (target.id === 'fb-type-select') { STATE.filterType = target.value; render(); }
      if (target.id === 'fb-status-select') { STATE.filterStatus = target.value; render(); }
    });

    root.addEventListener('input', event => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.id === 'fb-search') { STATE.search = target.value; render(); }
    });
  }

  function injectStyles() {
    if (document.getElementById('lss-fb-style')) return;
    const style = document.createElement('style');
    style.id = 'lss-fb-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function findProfileDropdownMenu() {
    const candidates = [...document.querySelectorAll('a, button, li, div')].filter(element => {
      const html = (element.innerHTML || '').toLowerCase();
      const className = String(element.className || '').toLowerCase();
      const title = (element.getAttribute('title') || '').toLowerCase();
      const aria = (element.getAttribute('aria-label') || '').toLowerCase();
      const text = (element.textContent || '').trim().toLowerCase();
      return html.includes('glyphicon-user') || html.includes('fa-user') || html.includes('icon-user') || className.includes('glyphicon-user') || className.includes('fa-user') || title.includes('profil') || title.includes('profile') || aria.includes('profil') || aria.includes('profile') || text === 'profil' || text === 'profile';
    });

    for (const candidate of candidates) {
      const parent = candidate.closest('li.dropdown, li, .dropdown');
      const menu = parent?.querySelector('ul.dropdown-menu, .dropdown-menu');
      if (menu) return menu;
    }

    const userIcon = document.querySelector('.glyphicon-user, .fa-user, [class*="user"]');
    const parent = userIcon?.closest('li.dropdown, li, .dropdown');
    return parent?.querySelector('ul.dropdown-menu, .dropdown-menu') || null;
  }

  function findMenuItemByText(text) {
    const wanted = String(text).trim().toLowerCase();

    for (const link of document.querySelectorAll('a')) {
      const label = String(link.textContent || '').trim().toLowerCase();
      if (label.includes(wanted)) return link;
    }

    return null;
  }

  function openFahrzeugbrowser() {
    STATE.open = true;
    STATE.missions = scanVisibleMissions();
    render();
    refresh();
  }

  function insertMenuItem() {
    if (document.getElementById('lss-fb-menu-item')) return;

    const item = document.createElement('li');
    item.id = 'lss-fb-menu-item';
    item.innerHTML = '<a href="#">🚒 Fahrzeugbrowser</a>';

    item.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openFahrzeugbrowser();
    });

    const aaoLink = findMenuItemByText('Alarm und Ausrückeordnung');
    const aaoItem = aaoLink && aaoLink.closest('li');

    if (aaoItem && aaoItem.parentElement) {
      aaoItem.insertAdjacentElement('beforebegin', item);
      return;
    }

    const menu = findProfileDropdownMenu();
    if (menu) {
      const divider = menu.querySelector('li.divider, .divider, .dropdown-divider');
      if (divider) {
        divider.insertAdjacentElement('beforebegin', item);
      } else {
        menu.appendChild(item);
      }
    }
  }

  function boot() {
    injectStyles();
    createRoot();
    insertMenuItem();
    render();
    setInterval(insertMenuItem, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
