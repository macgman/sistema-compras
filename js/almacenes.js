/* =====================================================================
   ALMACENES — dos almacenes con inventario INDEPENDIENTE y folio
   consecutivo COMPARTIDO.

   Cómo funciona (resumen):
   · Cada almacén tiene su propia base local (IndexedDB) y su propio nodo en
     Firebase. El almacén principal (ALM1) conserva exactamente la ruta y los
     datos de siempre; el almacén nuevo (ALM2) vive en
       compraPro/almacenes/<sala>/ALM2/...
   · La memoria de la aplicación siempre contiene UN solo almacén. Por eso el
     inventario, el Kardex y los movimientos de un almacén nunca se cruzan con
     los del otro.
   · El contador de folios vive en un nodo aparte y común:
       compraPro/shared/<sala>/folio
     Ventas, vales y entradas de cualquier almacén toman el siguiente número
     de ese mismo contador (20, 21, 22, 23...).
   · Cada usuario tiene un campo almacenId: ALM1, ALM2 o "*" (todos).
     Administrador/MASTER con "*" pueden cambiar de almacén y ver los
     movimientos de ambos juntos (solo lectura).
   ===================================================================== */
(function () {
  'use strict';

  /* ---- Configuración editable: nombres de los almacenes ---- */
  var ALM = {
    ALM1: { id: 'ALM1', nombre: 'Almacén principal', corto: 'Principal' },
    ALM2: { id: 'ALM2', nombre: 'Almacén nuevo', corto: 'Nuevo' }
  };
  var ALL = '*';
  var DB_BASE = 'CompraProDB_v2';

  /* ---- Utilidades de sesión / almacén asignado ---- */
  function sessUser() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_PREFIX + 'session') || 'null'); } catch (e) { return null; }
  }
  function userAlm(u) {
    if (!u) return null;
    if (u.almacenId === ALL) return ALL;
    if (u.almacenId && ALM[u.almacenId]) return u.almacenId;
    if (u.role === 'admin' || u.role === 'master') return ALL;
    return 'ALM1';
  }
  function almNombre(id) { return id === ALL ? 'Todos los almacenes' : (ALM[id] ? ALM[id].nombre : String(id || '')); }

  var active = (function () {
    var u = sessUser();
    if (!u) return 'ALM1';
    var a = userAlm(u);
    if (a !== ALL) return a;
    var saved = sessionStorage.getItem(STORAGE_PREFIX + 'alm_activo');
    return ALM[saved] ? saved : 'ALM1';
  })();
  var switching = false;

  window.almacenActivo = function () { return active; };
  window.almacenesInfo = ALM;

  /* ---- Rutas ---- */
  var origRoomPath = window.getFirebaseRoomPath;
  window.getMainRoomPath = origRoomPath;
  function mainRoomName() { try { return String(origRoomPath()).split('/').pop(); } catch (e) { return ''; } }
  function dataPathFor(id) {
    var m = origRoomPath();
    if (!m) return '';
    return id === 'ALM1' ? m : 'compraPro/almacenes/' + m.split('/').pop() + '/' + id + '/main';
  }
  window.getFirebaseRoomPath = function () { return dataPathFor(active); };

  /* ---- Base local por almacén (misma estructura que la original) ---- */
  window.openDatabase = function () {
    var name = active === 'ALM1' ? DB_BASE : DB_BASE + '__' + active;
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(name, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        ['products', 'ventas', 'movimientos', 'users'].forEach(function (s) {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
        });
        var metaStore = d.objectStoreNames.contains('meta') ? e.target.transaction.objectStore('meta') : d.createObjectStore('meta', { keyPath: 'key' });
        // Un almacén nuevo empieza VACÍO: sin material de muestra ni reinicios heredados.
        if (active !== 'ALM1') {
          metaStore.put({ key: 'catalog_reset_3_0_6', value: true });
          metaStore.put({ key: 'db_seeded', value: true });
        }
      };
      req.onsuccess = function (e) { db = e.target.result; resolve(db); };
      req.onerror = function (e) { reject(e); };
    });
  };

  // La sala compartida es una sola para todo el navegador; el almacén nuevo
  // no debe perderla por tener su propia base local vacía.
  var origGetMeta = window.idbGetMeta;
  window.idbGetMeta = function (key, fallback) {
    return origGetMeta(key, fallback).then(function (v) {
      if (key === 'cloud_room' && !v) {
        try { return localStorage.getItem(STORAGE_PREFIX + 'cloud_room') || v; } catch (e) {}
      }
      return v;
    });
  };

  /* ---- Folio consecutivo COMPARTIDO ---- */
  function sharedBase() { var r = mainRoomName(); return r ? 'compraPro/shared/' + r + '/folio' : ''; }
  window.almFolioSequencePath = function () {
    var b = sharedBase();
    return b ? b + '/sequence' : (getFirebaseRoomPath() + '/data/folioSequence');
  };

  var lastDeniedToast = 0;
  function reportFolioDenied(err) {
    var code = String((err && err.code) || (err && err.message) || '');
    if (!/permission/i.test(code)) return;
    var now = Date.now();
    if (now - lastDeniedToast < 60000) return;
    lastDeniedToast = now;
    try {
      showToast('Firebase no permite usar el folio compartido de los almacenes. Publica las reglas nuevas (database.rules.json) en Firebase → Reglas. Mientras tanto los folios podrían repetirse.', 'error');
    } catch (e) {}
  }

  var sharedFolioRevision = 0;
  var MANUAL_FOLIO_PENDING_KEY = STORAGE_PREFIX + 'folio_manual_pending';

  function readPendingManualFolio() {
    try {
      var pending = JSON.parse(localStorage.getItem(MANUAL_FOLIO_PENDING_KEY) || 'null');
      return pending && pending.value ? pending : null;
    } catch (e) { return null; }
  }
  function clearPendingManualFolio() {
    try { localStorage.removeItem(MANUAL_FOLIO_PENDING_KEY); } catch (e) {}
  }
  function savePendingManualFolio(baseRevision) {
    try {
      localStorage.setItem(MANUAL_FOLIO_PENDING_KEY, JSON.stringify({
        value: String(currentFolio),
        updatedAt: Number(currentFolioUpdatedAt) || Date.now(),
        baseRevision: Number(baseRevision !== undefined ? baseRevision : sharedFolioRevision) || 0,
        createdAt: Date.now()
      }));
    } catch (e) {}
  }

  function pushSharedFolio(force) {
    var b = sharedBase();
    if (!b || !firebaseReady || !firebaseDB || readPendingManualFolio()) return;
    var st = {
      value: currentFolio,
      updatedAt: Number(currentFolioUpdatedAt) || Date.now(),
      sequence: Math.max(0, getFolioNumber(currentFolio) - 1),
      revision: Number(sharedFolioRevision) || 0,
      manual: false,
      clientId: firebaseClientId,
      writtenAt: Date.now(),
      almacen: active
    };
    try {
      firebaseDB.ref(b + '/state').transaction(function (cur) {
        if (cur) {
          // Un cambio manual confirmado tiene prioridad sobre las publicaciones
          // automáticas que todavía conserve una computadora atrasada.
          if ((Number(cur.revision) || 0) > (Number(st.revision) || 0)) return;
          if (!force) {
            var cn = getFolioNumber(cur.value), mn = getFolioNumber(st.value);
            if (cn > mn) return;
            if (cn === mn && Number(cur.updatedAt) >= st.updatedAt) return;
          }
        }
        var out = Object.assign({}, st);
        if (cur && Number(cur.updatedAt) >= out.updatedAt) out.updatedAt = Number(cur.updatedAt) + 1;
        return out;
      }).catch(reportFolioDenied);
    } catch (e) {}
  }

  async function publishManualSharedFolio() {
    var b = sharedBase();
    if (!b || !initFirebase() || !firebaseDB) return false;
    if (!firebaseRoomRef && typeof window.firebaseConnectRoom === 'function') {
      var connected = await window.firebaseConnectRoom();
      if (!connected) return false;
      if (!readPendingManualFolio()) return true;
    }
    var value = String(currentFolio || '');
    var number = getFolioNumber(value);
    if (!number) return false;

    var stateRef = firebaseDB.ref(b + '/state');
    var now = Date.now();
    var result = await fbWithTimeout(stateRef.transaction(function (cur) {
      var revision = Math.max(Number(cur && cur.revision) || 0, Number(sharedFolioRevision) || 0) + 1;
      return {
        value: value,
        updatedAt: Math.max(now, Number(cur && cur.updatedAt) + 1 || 0, Number(currentFolioUpdatedAt) || 0),
        sequence: Math.max(0, number - 1),
        revision: revision,
        manual: true,
        clientId: firebaseClientId,
        writtenAt: Date.now(),
        almacen: active
      };
    }, undefined, false), 8000);
    if (!result || result.__timeout || !result.committed) throw new Error('Firebase no confirmó el cambio manual del folio');

    var state = result.snapshot.val() || {};
    sharedFolioRevision = Number(state.revision) || sharedFolioRevision;
    currentFolioUpdatedAt = Math.max(Number(currentFolioUpdatedAt) || 0, Number(state.updatedAt) || 0);

    // La secuencia se escribe como valor exacto (no con Math.max): un cambio
    // manual válido también puede regresar de F-120 a F-050.
    var sequenceWrite = await fbWithTimeout(firebaseDB.ref(b + '/sequence').set(Math.max(0, number - 1)), 8000);
    if (sequenceWrite && sequenceWrite.__timeout) throw new Error('Tiempo de espera al actualizar el contador compartido');
    // Cierra la autorización de retroceso para que solo este cambio manual
    // concreto pueda bajar el contador; el siguiente retroceso requiere otra
    // revisión manual más nueva.
    var revisionWrite = await fbWithTimeout(firebaseDB.ref(b + '/sequenceRevision').set(Number(state.revision) || sharedFolioRevision || 0), 8000);
    if (revisionWrite && revisionWrite.__timeout) throw new Error('Tiempo de espera al confirmar la revisión del contador');
    clearPendingManualFolio();
    try { localStorage.setItem(STORAGE_PREFIX + 'folio_updated_at', String(currentFolioUpdatedAt)); } catch (e) {}
    await idbSetMeta('folio', currentFolio);
    return true;
  }

  async function flushPendingManualFolio() {
    var pending = readPendingManualFolio();
    if (!pending || !firebaseDB || !initFirebase()) return false;
    var b = sharedBase();
    if (!b) return false;

    try {
      var snap = await fbWithTimeout(firebaseDB.ref(b + '/state').once('value'), 6000);
      if (!snap || snap.__timeout) return false;
      var remote = snap.val() || {};
      var remoteRevision = Number(remote.revision) || 0;
      // Si otro usuario hizo un cambio manual después de que este equipo quedó
      // desconectado, gana la versión más reciente del servidor.
      if (remote.value && remoteRevision > (Number(pending.baseRevision) || 0)) {
        if (String(remote.value) === String(pending.value)) {
          // El estado sí alcanzó Firebase pero pudo fallar la escritura del
          // contador. Completar sequence y sequenceRevision sin volver a
          // incrementar la revisión manual.
          var seqRepair = await fbWithTimeout(firebaseDB.ref(b + '/sequence').set(Math.max(0, getFolioNumber(remote.value) - 1)), 8000);
          if (seqRepair && seqRepair.__timeout) throw new Error('No se pudo reparar el contador compartido');
          var revRepair = await fbWithTimeout(firebaseDB.ref(b + '/sequenceRevision').set(remoteRevision), 8000);
          if (revRepair && revRepair.__timeout) throw new Error('No se pudo confirmar la revisión del contador');
        }
        currentFolio = String(remote.value);
        currentFolioUpdatedAt = Math.max(Number(remote.updatedAt) || 0, Date.now());
        sharedFolioRevision = remoteRevision;
        clearPendingManualFolio();
        await idbSetMeta('folio', currentFolio);
        await idbSetMeta('folio_manual_override', false);
        folioManualOverrideActive = false;
        var fvRemote = document.getElementById('folio-val');
        if (fvRemote) fvRemote.textContent = currentFolio;
        var viRemote = document.getElementById('venta-folio-input');
        if (viRemote && document.activeElement !== viRemote) viRemote.value = currentFolio;
        return true;
      }
      currentFolio = String(pending.value);
      currentFolioUpdatedAt = Math.max(Number(currentFolioUpdatedAt) || 0, Number(pending.updatedAt) || 0);
      return await publishManualSharedFolio();
    } catch (e) {
      console.warn('[ALMACENES] No se pudo publicar el cambio manual pendiente:', e && e.message);
      reportFolioDenied(e);
      return false;
    }
  }

  var sfRef = null, sfPath = '', sfSeqRef = null, sfSeqPath = '';
  var folioUsageRef = null, folioUsagePath = '', folioUsageByUser = {};
  var folioHistoryRef = null, folioHistoryPath = '', folioHistoryByFolio = {};

  function detachSharedFolio() {
    try { if (sfRef) sfRef.off(); } catch (e) {}
    try { if (sfSeqRef) sfSeqRef.off(); } catch (e) {}
    try { if (folioUsageRef) folioUsageRef.off(); } catch (e) {}
    try { if (folioHistoryRef) folioHistoryRef.off(); } catch (e) {}
    sfRef = null; sfPath = '';
    sfSeqRef = null; sfSeqPath = '';
    folioUsageRef = null; folioUsagePath = '';
    folioUsageByUser = {};
    folioHistoryRef = null; folioHistoryPath = '';
    folioHistoryByFolio = {};
    sharedFolioRevision = 0;
  }
  function attachSharedFolio() {
    var b = sharedBase();
    if (!b || !firebaseReady || !firebaseDB) return;
    if (sfRef && sfPath === b && sfSeqRef && sfSeqPath === b + '/sequence') return;
    detachSharedFolio();
    sfPath = b;
    var myRef = firebaseDB.ref(b + '/state');
    sfRef = myRef;
    var first = true;
    myRef.on('value', function (snap) {
      var v = snap.val();
      var wasFirst = first; first = false;
      if (!v || !v.value) {
        if (wasFirst && active === 'ALM1') pushSharedFolio(true);
        return;
      }

      var remoteRevision = Number(v.revision) || 0;
      var pendingManual = readPendingManualFolio();
      if (pendingManual) {
        if (remoteRevision <= (Number(pendingManual.baseRevision) || 0)) return;
        if (String(v.value) === String(pendingManual.value)) {
          setTimeout(function () { flushPendingManualFolio().catch(function () {}); }, 0);
          return;
        }
        clearPendingManualFolio();
      }

      var t = Number(v.updatedAt) || 0;
      var localT = Number(currentFolioUpdatedAt) || 0;
      var remoteNumber = getFolioNumber(v.value);
      var localNumber = getFolioNumber(currentFolio);
      var manualRevisionChanged = remoteRevision > sharedFolioRevision;
      // Los cambios manuales llevan una revisión autoritativa y pueden bajar
      // el consecutivo. Las reservas automáticas siguen siendo monotónicas.
      var acceptRemote = manualRevisionChanged ||
        remoteNumber > localNumber ||
        (remoteNumber === localNumber && remoteNumber > 0 && t > localT);
      sharedFolioRevision = Math.max(sharedFolioRevision, remoteRevision);

      if (acceptRemote) {
        currentFolio = String(v.value);
        currentFolioUpdatedAt = Math.max(t, localT, Date.now());
        folioManualOverrideActive = false;
        idbSetMeta('folio_manual_override', false);
        idbSetMeta('folio', currentFolio);
        try { localStorage.setItem(STORAGE_PREFIX + 'folio_updated_at', String(currentFolioUpdatedAt)); } catch (e) {}
        var fv = document.getElementById('folio-val');
        if (fv) fv.textContent = currentFolio;
        var vi = document.getElementById('venta-folio-input');
        var editing = false;
        try { editing = !!editingVentaId; } catch (e) {}
        if (vi && !editing && document.activeElement !== vi) vi.value = currentFolio;
      }
    }, function (err) {
      if (sfRef === myRef) { sfRef = null; sfPath = ''; }
      console.warn('[ALMACENES] Folio compartido no disponible:', err && err.message);
      reportFolioDenied(err);
    });

    var seqPath = b + '/sequence';
    if (!sfSeqRef || sfSeqPath !== seqPath) {
      try { if (sfSeqRef) sfSeqRef.off(); } catch (e) {}
      sfSeqPath = seqPath;
      sfSeqRef = firebaseDB.ref(seqPath);
      var mySeqRef = sfSeqRef;
      mySeqRef.on('value', function (snap) {
        if (readPendingManualFolio()) return;
        var sequence = Number(snap.val());
        if (!Number.isFinite(sequence) || sequence < 1) return;
        var nextNumber = sequence + 1;
        if (nextNumber <= getFolioNumber(currentFolio)) return;

        currentFolio = buildFolioFromNumber(nextNumber, currentFolio);
        currentFolioUpdatedAt = Math.max(Date.now(), (Number(currentFolioUpdatedAt) || 0) + 1);
        folioManualOverrideActive = false;
        idbSetMeta('folio_manual_override', false);
        idbSetMeta('folio', currentFolio);
        try { localStorage.setItem(STORAGE_PREFIX + 'folio_updated_at', String(currentFolioUpdatedAt)); } catch (e) {}
        var fv = document.getElementById('folio-val');
        if (fv) fv.textContent = currentFolio;
        var vi = document.getElementById('venta-folio-input');
        var editing = false;
        try { editing = !!editingVentaId; } catch (e) {}
        if (vi && !editing && document.activeElement !== vi) vi.value = currentFolio;
        pushSharedFolio(false);
      }, function (err) {
        if (sfSeqRef === mySeqRef) { sfSeqRef = null; sfSeqPath = ''; }
        console.warn('[ALMACENES] Secuencia de folios no disponible:', err && err.message);
        reportFolioDenied(err);
      });
    }
  }

  window.almGetSharedFolioRevision = function () { return sharedFolioRevision; };
  window.almHasSharedFolioAuthority = function () { return !!sharedBase(); };

  function usageKey(user) {
    var raw = user && (user.id !== undefined && user.id !== null ? user.id : user.username);
    return String(raw == null ? '' : raw).replace(/[.#$\/\[\]]/g, '_') || 'unknown';
  }
  function refreshUsersUsageView() {
    var section = document.getElementById('section-config');
    if (section && section.style.display === 'block' && typeof renderUsersTable === 'function') {
      try { renderUsersTable(); } catch (e) {}
    }
  }
  function queueFolioUsage(payload) {
    try {
      var pending = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'folio_usage_pending') || '[]');
      if (!Array.isArray(pending)) pending = [];
      pending.push(payload);
      localStorage.setItem(STORAGE_PREFIX + 'folio_usage_pending', JSON.stringify(pending.slice(-100)));
    } catch (e) {}
  }
  window.almCommitUsedFolio = async function (folio) {
    var number = getFolioNumber(folio);
    var path = window.almFolioSequencePath();
    if (!number || !path || !initFirebase() || !firebaseDB) return false;
    try {
      if (!firebaseRoomRef && typeof window.firebaseConnectRoom === 'function') {
        var connected = await window.firebaseConnectRoom();
        if (!connected) return false;
      }
      var result = await firebaseDB.ref(path).transaction(function (current) {
        return Math.max(Number(current) || 0, number);
      }, undefined, false);
      return !!(result && result.committed);
    } catch (e) {
      reportFolioDenied(e);
      console.warn('[ALMACENES] No se pudo confirmar el folio consumido:', e && e.message);
      return false;
    }
  };

  function folioHistoryKey(folio) {
    return String(folio || '').replace(/[^A-Za-z0-9_-]/g, '_') || 'folio_sin_numero';
  }
  function historyEventId(payload) {
    var identity = payload.eventId || (payload.recordId !== undefined && payload.recordId !== null
      ? [payload.almacen || 'ALM1', payload.type || 'Operación', payload.folio || '', 'record', payload.recordId].join('_')
      : [payload.userKey || 'unknown', payload.almacen || 'ALM1', payload.folio || '', payload.usedAt || 0].join('_'));
    return String(identity).replace(/[^A-Za-z0-9_-]/g, '_');
  }
  async function writeFolioHistory(payload) {
    var b = sharedBase();
    if (!b || !firebaseReady || !firebaseDB) throw new Error('Firebase no disponible');
    var event = {
      eventId: historyEventId(payload),
      folio: String(payload.folio || ''),
      type: String(payload.type || 'Operación'),
      almacen: String(payload.almacen || active),
      userKey: String(payload.userKey || 'unknown'),
      userId: payload.userId !== undefined ? payload.userId : null,
      username: String(payload.username || ''),
      name: String(payload.name || payload.username || 'Usuario'),
      recordId: payload.recordId !== undefined && payload.recordId !== null ? String(payload.recordId) : null,
      recordDate: String(payload.recordDate || ''),
      usedAt: Number(payload.usedAt) || Date.now()
    };
    // Una marca de borrado compartida impide que el backfill de /usage vuelva
    // a crear una referencia que ya fue eliminada.
    var deletedSnap = await fbWithTimeout(firebaseDB.ref(b + '/usedDeleted/' + event.eventId).once('value'), 6000);
    if (!deletedSnap || deletedSnap.__timeout) throw new Error('Tiempo de espera al comprobar el folio eliminado');
    if (deletedSnap && deletedSnap.exists && deletedSnap.exists()) return false;

    var key = folioHistoryKey(event.folio);
    var ref = firebaseDB.ref(b + '/used/' + key);
    var result = await fbWithTimeout(ref.transaction(function (cur) {
      var previous = cur || {};
      var events = Array.isArray(previous.events) ? previous.events.slice() : [];
      var existingIndex = events.findIndex(function (x) { return x && x.eventId === event.eventId; });
      if (existingIndex >= 0) {
        // La fecha del documento puede cambiar al editar una venta/vale.
        // Actualizamos su referencia sin recrear el evento ni invalidar su
        // tombstone compartido.
        var existing = events[existingIndex] || {};
        if (event.recordDate && existing.recordDate !== event.recordDate) {
          events[existingIndex] = Object.assign({}, existing, { recordDate: event.recordDate });
          return {
            folio: event.folio,
            lastUsedAt: Math.max(Number(previous.lastUsedAt) || 0, Number(existing.usedAt) || event.usedAt),
            events: events.slice(0, 30)
          };
        }
        return previous;
      }
      events.unshift(event);
      return {
        folio: event.folio,
        lastUsedAt: Math.max(Number(previous.lastUsedAt) || 0, event.usedAt),
        events: events.slice(0, 30)
      };
    }, undefined, false), 8000);
    if (!result || result.__timeout || !result.committed) throw new Error('No se confirmó el historial compartido del folio');
    folioHistoryByFolio[key] = result.snapshot.val() || {};
    refreshCrossStoreHistoryView();
    return true;
  }
  async function writeFolioUsage(payload) {
    var b = sharedBase();
    if (!b || !firebaseReady || !firebaseDB) throw new Error('Firebase no disponible');
    // El índice compartido por folio permite que el otro almacén vea que este
    // número ya fue consumido, sin copiar la compra ni tocar su inventario.
    var historyWritten = await writeFolioHistory(payload);
    if (!historyWritten) return false;
    var ref = firebaseDB.ref(b + '/usage/' + payload.userKey);
    var result = await fbWithTimeout(ref.transaction(function (cur) {
      var previous = cur || {};
      var eventId = historyEventId(payload);
      var recent = Array.isArray(previous.recent) ? previous.recent.slice() : [];
      if (recent.some(function (x) { return x && x.eventId === eventId; })) return previous;
      var usedAt = Number(payload.usedAt) || Date.now();
      recent.unshift({
        eventId: eventId,
        folio: payload.folio,
        type: payload.type,
        almacen: payload.almacen,
        recordId: payload.recordId !== undefined && payload.recordId !== null ? String(payload.recordId) : null,
        usedAt: usedAt
      });
      return {
        userId: payload.userId,
        username: payload.username,
        name: payload.name,
        lastFolio: payload.folio,
        lastType: payload.type,
        lastAlmacen: payload.almacen,
        lastUsedAt: Math.max(usedAt, Number(previous.lastUsedAt) || 0),
        count: (Number(previous.count) || 0) + 1,
        recent: recent.slice(0, 20)
      };
    }, undefined, false), 8000);
    if (!result || result.__timeout || !result.committed) throw new Error('No se confirmó el registro de uso del folio');
    folioUsageByUser[payload.userKey] = result.snapshot.val();
    refreshUsersUsageView();
    return true;
  }

  function matchesFolioRemoval(event, payload) {
    if (!event) return false;
    if (payload.eventId) return String(event.eventId || '') === String(payload.eventId);
    if (String(event.folio || '') !== String(payload.folio || '')) return false;
    if (String(event.almacen || '') !== String(payload.almacen || active)) return false;
    if (String(event.type || '').toLowerCase() !== String(payload.type || '').toLowerCase()) return false;
    if (payload.recordId !== undefined && payload.recordId !== null && event.recordId !== undefined && event.recordId !== null) {
      return String(event.recordId) === String(payload.recordId);
    }
    // Compatibilidad con los eventos antiguos, que no guardaban el ID de la
    // venta/vale: se retira el uso más reciente que coincida con folio, tipo y almacén.
    return true;
  }

  function sortLegacyRemovalCandidates(candidates, payload) {
    var target = Number(payload && payload.recordId);
    if (Number.isFinite(target) && target > 1000000000000) {
      candidates.sort(function (a, b) {
        return Math.abs((Number(a.usedAt) || 0) - target) - Math.abs((Number(b.usedAt) || 0) - target);
      });
    } else {
      candidates.sort(function (a, b) { return (Number(b.usedAt) || 0) - (Number(a.usedAt) || 0); });
    }
    return candidates;
  }

  async function removeFolioUseFromFirebase(payload) {
    var b = sharedBase();
    if (!b || !firebaseReady || !firebaseDB) throw new Error('Firebase no disponible');
    var key = folioHistoryKey(payload.folio);
    var usedRef = firebaseDB.ref(b + '/used/' + key);
    var usedSnap = await fbWithTimeout(usedRef.once('value'), 6000);
    if (!usedSnap || usedSnap.__timeout) throw new Error('Tiempo de espera al consultar el folio compartido');
    var node = usedSnap.val() || {};
    var events = Array.isArray(node.events) ? node.events.slice() : [];
    var matches = events.filter(function (event) { return matchesFolioRemoval(event, payload); });

    if (payload.recordId !== undefined && payload.recordId !== null) {
      var exact = matches.filter(function (event) {
        return event.recordId !== undefined && event.recordId !== null &&
          String(event.recordId) === String(payload.recordId);
      });
      if (exact.length) {
        matches = exact;
      } else {
        // Los eventos antiguos no guardaban recordId: quitar solo el uso
        // coincidente más reciente, no otros meses que reutilicen el folio.
        matches = sortLegacyRemovalCandidates(
          matches.filter(function (event) { return event.recordId == null; }), payload
        ).slice(0, 1);
      }
    } else if (matches.length > 1) {
      matches.sort(function (a, b) { return (Number(b.usedAt) || 0) - (Number(a.usedAt) || 0); });
      matches = matches.slice(0, 1);
    }

    // Si el índice /used ya no tiene el evento (versiones anteriores), se busca
    // en /usage para que el backfill tampoco pueda resucitarlo.
    if (!matches.length) {
      var usageSnap = await fbWithTimeout(firebaseDB.ref(b + '/usage').once('value'), 6000);
      if (!usageSnap || usageSnap.__timeout) throw new Error('Tiempo de espera al consultar el historial de usuarios');
      var usage = usageSnap.val() || {};
      Object.keys(usage).forEach(function (userKey) {
        var user = usage[userKey] || {};
        (Array.isArray(user.recent) ? user.recent : []).forEach(function (entry) {
          if (!matchesFolioRemoval(entry, payload)) return;
          if (payload.recordId != null && entry.recordId != null && String(entry.recordId) !== String(payload.recordId)) return;
          matches.push(Object.assign({}, entry, {
            userKey: userKey,
            eventId: entry.eventId || historyEventId({
              userKey: userKey, almacen: entry.almacen, folio: entry.folio,
              usedAt: entry.usedAt, type: entry.type, recordId: entry.recordId
            })
          }));
        });
      });
      sortLegacyRemovalCandidates(matches, payload);
      if (matches.length > 1) matches = matches.slice(0, 1);
    }

    if (!matches.length) {
      if (payload.recordId !== undefined && payload.recordId !== null) {
        var notYetWrittenId = historyEventId({
          almacen: payload.almacen,
          type: payload.type,
          folio: payload.folio,
          recordId: payload.recordId
        });
        var pendingDeleteWrite = await fbWithTimeout(firebaseDB.ref(b + '/usedDeleted/' + notYetWrittenId).set({
          eventId: notYetWrittenId,
          folio: String(payload.folio || ''),
          almacen: String(payload.almacen || active),
          recordId: String(payload.recordId),
          deletedAt: Date.now()
        }), 6000);
        if (pendingDeleteWrite && pendingDeleteWrite.__timeout) throw new Error('Tiempo de espera al marcar el folio eliminado');
      }
      return true;
    }

    // Primero se escribe el tombstone del evento; así un listener /usage que
    // llegue tarde no puede volver a indexarlo mientras se completa el borrado.
    for (var i = 0; i < matches.length; i++) {
      var event = matches[i];
      var eventId = String(event.eventId || historyEventId({
        userKey: event.userKey, almacen: event.almacen, folio: event.folio,
        usedAt: event.usedAt, type: event.type, recordId: event.recordId
      }));
      var tombstoneWrite = await fbWithTimeout(firebaseDB.ref(b + '/usedDeleted/' + eventId).set({
        eventId: eventId,
        folio: String(event.folio || payload.folio),
        almacen: String(event.almacen || payload.almacen || active),
        recordId: event.recordId != null ? String(event.recordId) : null,
        deletedAt: Date.now()
      }), 6000);
      if (tombstoneWrite && tombstoneWrite.__timeout) throw new Error('Tiempo de espera al registrar el borrado del folio');

      var removeUsedResult = await fbWithTimeout(usedRef.transaction(function (cur) {
        if (!cur || !Array.isArray(cur.events)) return cur;
        var remaining = cur.events.filter(function (x) { return x && x.eventId !== eventId; });
        if (remaining.length === cur.events.length) return cur;
        if (!remaining.length) return null;
        return Object.assign({}, cur, {
          events: remaining,
          lastUsedAt: remaining.reduce(function (max, x) { return Math.max(max, Number(x.usedAt) || 0); }, 0)
        });
      }, undefined, false), 8000);
      if (!removeUsedResult || removeUsedResult.__timeout || !removeUsedResult.committed) throw new Error('No se pudo quitar la referencia compartida del folio');

      if (event.userKey) {
        var usageRef = firebaseDB.ref(b + '/usage/' + event.userKey);
        var usageResult = await fbWithTimeout(usageRef.transaction(function (cur) {
          if (!cur) return cur;
          var recent = Array.isArray(cur.recent) ? cur.recent.slice() : [];
          var remaining = recent.filter(function (x) { return x && x.eventId !== eventId; });
          if (remaining.length === recent.length) return cur;
          var last = remaining[0] || null;
          return Object.assign({}, cur, {
            count: Math.max(0, (Number(cur.count) || 0) - 1),
            lastFolio: last ? last.folio : null,
            lastType: last ? last.type : null,
            lastAlmacen: last ? last.almacen : null,
            lastUsedAt: last ? (Number(last.usedAt) || 0) : 0,
            recent: remaining.slice(0, 20)
          });
        }, undefined, false), 8000);
        if (usageResult && !usageResult.__timeout && usageResult.committed) {
          folioUsageByUser[event.userKey] = usageResult.snapshot.val() || {};
        }
      }
    }

    var refreshed = await fbWithTimeout(usedRef.once('value'), 6000);
    if (!refreshed || refreshed.__timeout) throw new Error('Tiempo de espera al actualizar el historial');
    folioHistoryByFolio[key] = refreshed.val() || {};
    refreshCrossStoreHistoryView();
    refreshUsersUsageView();
    return true;
  }

  var historyTombstonePruneRunning = false;
  var historyTombstonePruneAt = 0;
  async function pruneDeletedFolioHistoryFromTombstones() {
    if (historyTombstonePruneRunning || Date.now() - historyTombstonePruneAt < 60000) return;
    var b = sharedBase();
    if (!b || !firebaseReady || !firebaseDB) return;
    historyTombstonePruneRunning = true;
    historyTombstonePruneAt = Date.now();
    try {
      var stores = {};
      for (var s = 0; s < 2; s++) {
        var storeId = s === 0 ? 'ALM1' : 'ALM2';
        var path = dataPathFor(storeId) + '/data';
        var reads = await Promise.all([
          fbWithTimeout(firebaseDB.ref(path + '/deletedVentas').once('value'), 6000),
          fbWithTimeout(firebaseDB.ref(path + '/deletedValesManuales').once('value'), 6000)
        ]);
        if (reads.some(function (x) { return !x || x.__timeout; })) return;
        function list(value) {
          if (Array.isArray(value)) return value;
          return value && typeof value === 'object' ? Object.keys(value).map(function (k) { return value[k]; }) : [];
        }
        stores[storeId] = {
          ventas: list(reads[0].val()),
          vales: list(reads[1].val())
        };
      }

      var stale = [];
      Object.keys(folioHistoryByFolio || {}).forEach(function (key) {
        var node = folioHistoryByFolio[key] || {};
        (Array.isArray(node.events) ? node.events : []).forEach(function (event) {
          if (!event || !event.folio || !stores[event.almacen]) return;
          var isVale = String(event.type || '').toLowerCase().indexOf('vale') !== -1;
          var tombstones = isVale ? stores[event.almacen].vales : stores[event.almacen].ventas;
          var deleted = null;
          if (event.recordId !== undefined && event.recordId !== null) {
            deleted = tombstones.find(function (t) { return t && String(t.id) === String(event.recordId); }) || null;
          } else {
            // En versiones anteriores el evento no guardaba recordId. El ID local
            // de ventas/vales es Date.now(), casi simultáneo a usedAt; se usa esa
            // cercanía solo como compatibilidad para limpiar referencias antiguas.
            var eventTime = Number(event.usedAt) || 0;
            deleted = tombstones.find(function (t) {
              var idTime = Number(t && t.id);
              return Number.isFinite(idTime) && idTime > 1000000000000 &&
                Math.abs(eventTime - idTime) <= 30000;
            }) || null;
          }
          if (deleted) {
            stale.push({
              folio: event.folio,
              type: event.type || (isVale ? 'Vale manual' : 'Venta'),
              almacen: event.almacen,
              recordId: event.recordId != null ? String(event.recordId) : String(deleted.id),
              eventId: event.eventId
            });
          }
        });
      });

      for (var i = 0; i < stale.length; i++) {
        try { await removeFolioUseFromFirebase(stale[i]); }
        catch (e) { console.warn('[ALMACENES] No se pudo depurar una referencia eliminada:', e && e.message); }
      }
    } catch (e) {
      // Un usuario de almacén puede no tener permiso para leer el otro almacén;
      // en ese caso se omite la depuración sin afectar el historial normal.
      console.warn('[ALMACENES] No se pudo revisar el historial eliminado:', e && e.message);
    } finally {
      historyTombstonePruneRunning = false;
    }
  }

  function queueFolioHistoryDelete(payload) {
    try {
      var pending = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'folio_history_delete_pending') || '[]');
      if (!Array.isArray(pending)) pending = [];
      var identity = [payload.almacen, payload.type, payload.folio, payload.recordId || 'legacy'].join('|');
      if (!pending.some(function (x) { return [x.almacen, x.type, x.folio, x.recordId || 'legacy'].join('|') === identity; })) {
        pending.push(payload);
      }
      localStorage.setItem(STORAGE_PREFIX + 'folio_history_delete_pending', JSON.stringify(pending.slice(-100)));
    } catch (e) {}
  }
  async function flushPendingFolioHistoryDeletes() {
    var pending = [];
    try {
      pending = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'folio_history_delete_pending') || '[]');
      if (!Array.isArray(pending) || !pending.length) return;
    } catch (e) { return; }
    var remaining = [];
    for (var i = 0; i < pending.length; i++) {
      try { await removeFolioUseFromFirebase(pending[i]); }
      catch (e) { remaining.push(pending[i]); }
    }
    try { localStorage.setItem(STORAGE_PREFIX + 'folio_history_delete_pending', JSON.stringify(remaining)); } catch (e) {}
  }
  window.almRemoveFolioUse = async function (folio, type, recordId) {
    var payload = {
      folio: String(folio || ''),
      type: String(type || 'Operación'),
      almacen: active,
      recordId: recordId !== undefined && recordId !== null ? String(recordId) : null
    };
    if (!payload.folio) return false;
    try {
      if (!initFirebase()) throw new Error('Firebase no disponible');
      if (!firebaseRoomRef && typeof window.firebaseConnectRoom === 'function') {
        var connected = await window.firebaseConnectRoom();
        if (!connected) throw new Error('Sala Firebase no disponible');
      }
      await removeFolioUseFromFirebase(payload);
      return true;
    } catch (e) {
      queueFolioHistoryDelete(payload);
      console.warn('[ALMACENES] El borrado del folio compartido quedó pendiente:', e && e.message);
      return false;
    }
  };

function refreshCrossStoreHistoryView() {
    var section = document.getElementById('section-historial-ventas');
    if (section && section.style.display !== 'none' && typeof window.renderHistorialVentas === 'function') {
      try { window.renderHistorialVentas(); } catch (e) {}
    }
  }
  function backfillLegacyFolioHistory(source) {
    Object.keys(source || {}).forEach(function (userKey) {
      var user = source[userKey] || {};
      (Array.isArray(user.recent) ? user.recent : []).forEach(function (entry) {
        if (!entry || !entry.folio || !entry.almacen) return;
        writeFolioHistory({
          eventId: entry.eventId || ['legacy', userKey, entry.almacen, entry.folio, entry.usedAt || 0].join('_'),
          userKey: userKey,
          userId: user.userId,
          username: user.username,
          name: user.name,
          folio: entry.folio,
          type: entry.type || 'Operación',
          almacen: entry.almacen,
          recordId: entry.recordId,
          usedAt: entry.usedAt
        }).catch(function (e) {
          console.warn('[ALMACENES] No se pudo indexar un folio histórico:', e && e.message);
        });
      });
    });
  }
  function attachFolioHistory() {
    var b = sharedBase();
    if (!b || !firebaseReady || !firebaseDB) return;
    var path = b + '/used';
    if (folioHistoryRef && folioHistoryPath === path) return;
    try { if (folioHistoryRef) folioHistoryRef.off(); } catch (e) {}
    folioHistoryPath = path;
    var myRef = firebaseDB.ref(path);
    folioHistoryRef = myRef;
    myRef.on('value', function (snap) {
      folioHistoryByFolio = snap.val() || {};
      refreshCrossStoreHistoryView();
      pruneDeletedFolioHistoryFromTombstones().catch(function () {});
    }, function (err) {
      if (folioHistoryRef === myRef) { folioHistoryRef = null; folioHistoryPath = ''; }
      console.warn('[ALMACENES] Historial compartido de folios no disponible:', err && err.message);
      reportFolioDenied(err);
    });
  }
  window.almGetCrossStoreFolioRecords = function () {
    var out = [];
    Object.keys(folioHistoryByFolio || {}).forEach(function (key) {
      var node = folioHistoryByFolio[key] || {};
      (Array.isArray(node.events) ? node.events : []).forEach(function (event) {
        if (!event || !event.folio || !event.almacen || event.almacen === active) return;
        out.push(Object.assign({ historyKey: key }, event));
      });
    });
    out.sort(function (a, b) { return (Number(b.usedAt) || 0) - (Number(a.usedAt) || 0); });
    return out;
  };
  async function flushPendingFolioUsage() {
    var pending = [];
    try {
      pending = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'folio_usage_pending') || '[]');
      if (!Array.isArray(pending) || !pending.length) return;
    } catch (e) { return; }
    var remaining = [];
    for (var i = 0; i < pending.length; i++) {
      try {
        if (/^F-/i.test(String(pending[i].folio || '')) && typeof window.almCommitUsedFolio === 'function') {
          await window.almCommitUsedFolio(pending[i].folio);
        }
        await writeFolioUsage(pending[i]);
      } catch (e) { remaining.push(pending[i]); }
    }
    try { localStorage.setItem(STORAGE_PREFIX + 'folio_usage_pending', JSON.stringify(remaining)); } catch (e) {}
  }
  function attachFolioUsage() {
    var b = sharedBase();
    if (!b || !firebaseReady || !firebaseDB) return;
    var path = b + '/usage';
    if (folioUsageRef && folioUsagePath === path) { attachFolioHistory(); return; }
    try { if (folioUsageRef) folioUsageRef.off(); } catch (e) {}
    folioUsagePath = path;
    var myRef = firebaseDB.ref(path);
    folioUsageRef = myRef;
    attachFolioHistory();
    myRef.on('value', function (snap) {
      folioUsageByUser = snap.val() || {};
      refreshUsersUsageView();
      backfillLegacyFolioHistory(folioUsageByUser);
      flushPendingFolioUsage().catch(function () {});
      flushPendingFolioHistoryDeletes().catch(function () {});
    }, function (err) {
      if (folioUsageRef === myRef) { folioUsageRef = null; folioUsagePath = ''; }
      console.warn('[ALMACENES] Uso de folios por usuario no disponible:', err && err.message);
    });
  }
  window.almRegisterFolioUse = async function (folio, type, recordId, recordDate) {
    var user = currentUser || sessUser();
    if (!user || !folio) return false;
    var payload = {
      userKey: usageKey(user),
      userId: user.id !== undefined ? user.id : null,
      username: String(user.username || ''),
      name: String(user.name || user.username || ''),
      folio: String(folio),
      type: String(type || 'Operación'),
      almacen: active,
      recordId: recordId !== undefined && recordId !== null ? String(recordId) : null,
      recordDate: String(recordDate || ''),
      usedAt: Date.now()
    };
    payload.eventId = historyEventId(payload);
    try {
      if (!initFirebase()) throw new Error('Firebase no disponible');
      if (!firebaseRoomRef && typeof window.firebaseConnectRoom === 'function') {
        var ok = await window.firebaseConnectRoom();
        if (!ok) throw new Error('Sala Firebase no disponible');
      }
      // Ventas y vales usan F-###. Confirma el número consumido también cuando
      // fue elegido manualmente y, por ello, no pasó por la reserva automática.
      if (/^F-/i.test(payload.folio) && typeof window.almCommitUsedFolio === 'function') {
        await window.almCommitUsedFolio(payload.folio);
      }
      var saved = await writeFolioUsage(payload);
      if (!saved) return false;
      return true;
    } catch (e) {
      queueFolioUsage(payload);
      console.warn('[ALMACENES] No se pudo sincronizar el folio usado por usuario:', e && e.message);
      return false;
    }
  };

  // Aviso visible cuando no se pudo reservar en el contador compartido y se usa
  // un folio local (podría repetirse en el otro almacén).
  var lastFallbackToast = 0;
  window.almFolioFallbackWarn = function () {
    var now = Date.now();
    if (now - lastFallbackToast < 30000) return;
    lastFallbackToast = now;
    try { showToast('No se pudo reservar el folio en el contador compartido: se usó el folio de esta PC y podría repetirse en el otro almacén. Revisa la conexión y las reglas de Firebase.', 'warning'); } catch (e) {}
  };

  // Prueba qué partes de Firebase puede usar este usuario y dice cuál regla falta.
  var diagOk = {};
  window.almDiagnostico = async function (manual) {
    try {
      if (!initFirebase() || !(currentUser || sessUser())) return null;
      var room = mainRoomName(); if (!room) return null;
      var tests = [
        { key: 'almacen', label: 'datos del almacén (' + dataPathFor(active) + ')', p: dataPathFor(active) + '/folioState' },
        { key: 'state', label: 'estado del folio compartido', p: sharedBase() + '/state' },
        { key: 'sequence', label: 'contador compartido de folios', p: sharedBase() + '/sequence' },
        { key: 'sequenceRevision', label: 'revisión de cambios manuales del contador', p: sharedBase() + '/sequenceRevision' },
        { key: 'usage', label: 'historial de folios por usuario', p: sharedBase() + '/usage' },
        { key: 'used', label: 'historial compartido de folios entre almacenes', p: sharedBase() + '/used' },
        { key: 'usedDeleted', label: 'marcas de eliminación del historial cruzado', p: sharedBase() + '/usedDeleted' },
        { key: 'entradas', label: 'entradas y datos extra del almacén', p: (active === 'ALM1' ? 'compraPro/ext/' + room : 'compraPro/almacenes/' + room + '/' + active + '/ext') + '/cfg' }
      ];
      var denied = [];
      var detail = {};
      for (var i = 0; i < tests.length; i++) {
        try {
          var r = await fbWithTimeout(firebaseDB.ref(tests[i].p).once('value'), 6000);
          if (r && r.__timeout) return null; // sin red: no se puede concluir nada
          if (r && typeof r.val === 'function') detail[tests[i].key] = r.val();
        } catch (e) {
          if (/permission/i.test(String((e && e.code) || '') + ' ' + String((e && e.message) || ''))) denied.push(tests[i].label);
        }
      }
      if (!denied.length) {
        diagOk[active] = true;
        if (manual) {
          var seq = Number(detail.sequence) || 0;
          var stateValue = detail.state && detail.state.value ? String(detail.state.value) : 'sin estado';
          var next = seq > 0 ? buildFolioFromNumber(seq + 1, stateValue) : stateValue;
          showToast('Firebase OK · contador: ' + seq + ' · siguiente: ' + next + ' · estado: ' + stateValue + ' · uso por usuario: lectura permitida.');
        }
        return true;
      }
      showToast('Las reglas de Firebase bloquean: ' + denied.join('; ') + '. Pega database.rules.json en Firebase → Reglas → Publicar (o la fase 2 si ya actualizaste el servidor).', 'error');
      return false;
    } catch (e) { return null; }
  };

  // Reserva el siguiente folio consecutivo (para entradas u otros documentos
  // que no pasan por el flujo de Venta) y deja avanzado el folio visible.
  window.almReserveFolio = async function () {
    var f = await prepareFolioForNewVenta(currentFolio);
    if (typeof window.almCommitUsedFolio === 'function') {
      await window.almCommitUsedFolio(f);
    }
    currentFolio = buildFolioFromNumber(
      Math.max(getFolioNumber(currentFolio), getFolioNumber(f) + 1),
      currentFolio || f
    );
    currentFolioUpdatedAt = Math.max(Date.now(), (Number(currentFolioUpdatedAt) || 0) + 1);
    if (folioManualOverrideActive) {
      folioManualOverrideActive = false;
      await idbSetMeta('folio_manual_override', false);
    }
    await idbSetMeta('folio', currentFolio);
    try { localStorage.setItem(STORAGE_PREFIX + 'folio_updated_at', String(currentFolioUpdatedAt)); } catch (e) {}
    var fv = document.getElementById('folio-val');
    if (fv) fv.textContent = currentFolio;
    pushSharedFolio(false);
    return f;
  };

  // Cambio manual: publica una revisión autoritativa. A diferencia del avance
  // automático, un ajuste manual puede aumentar o disminuir el consecutivo.
  var origSaveFolio = window.saveFolio;
  if (typeof origSaveFolio === 'function') {
    window.saveFolio = async function () {
      var baseRevision = Number(sharedFolioRevision) || 0;
      try {
        if (initFirebase() && sharedBase()) {
          if (!firebaseRoomRef && typeof window.firebaseConnectRoom === 'function') await window.firebaseConnectRoom();
          if (firebaseDB) {
            var beforeSnap = await fbWithTimeout(firebaseDB.ref(sharedBase() + '/state').once('value'), 4000);
            if (beforeSnap && !beforeSnap.__timeout) {
              baseRevision = Number((beforeSnap.val() || {}).revision) || baseRevision;
              sharedFolioRevision = Math.max(sharedFolioRevision, baseRevision);
            }
          }
        }
      } catch (e) {}
      var before = Number(currentFolioUpdatedAt) || 0;
      var beforeValue = String(currentFolio || '');
      var r = await origSaveFolio.apply(this, arguments);
      if (String(currentFolio || '') !== beforeValue || (Number(currentFolioUpdatedAt) || 0) !== before) {
        savePendingManualFolio(baseRevision);
        try {
          var published = await publishManualSharedFolio();
          if (!published) throw new Error('No se confirmó el folio compartido');
        } catch (e) {
          console.warn('[FOLIO] El cambio manual quedó pendiente de sincronización:', e && e.message);
          showToast('Folio guardado en este equipo; el cambio compartido quedó pendiente. Se reintentará al reconectar.', 'warning');
        }
      }
      return r;
    };
  }

  // Cada sincronización publica el estado del folio en el nodo común y, en el
  // almacén nuevo, evita subir la lista de usuarios (esa vive en el principal).
  var origBuildPayload = window.buildFirebasePayload;
  window.buildFirebasePayload = function () {
    var p = origBuildPayload.apply(this, arguments);
    if (active !== 'ALM1') {
      if (p.data) { p.data.users = []; p.data.deletedUsers = []; }
    }
    if (p.meta) p.meta.almacenId = active;
    pushSharedFolio(false);
    return p;
  };

  // Sin sesión no se abre ninguna conexión a un almacén; al iniciar sesión se
  // conecta solo el almacén que corresponde al usuario.
  var origConnect = window.firebaseConnectRoom;
  window.firebaseConnectRoom = function () {
    if (!sessUser()) {
      try { updateCloudBadge('offline', 'Inicia sesión para sincronizar'); } catch (e) {}
      return Promise.resolve(false);
    }
    return origConnect.apply(this, arguments).then(async function (ok) {
      if (ok) {
        // Un ajuste manual hecho sin conexión se publica antes de escuchar el
        // estado remoto, para evitar que un folio antiguo lo sobrescriba.
        try { await flushPendingManualFolio(); } catch (e) {}
        attachSharedFolio();
        attachFolioUsage();
        flushPendingFolioHistoryDeletes().catch(function () {});
        if (!diagOk[active]) setTimeout(function () { window.almDiagnostico(false); }, 2500);
      }
      return ok;
    });
  };

  /* ---- Carga del almacén activo en memoria ---- */
  async function reloadDataset() {
    // Las lecturas de cada almacén son independientes; ejecutarlas en paralelo
    // reduce el tiempo de cambio sin modificar el contenido ni el orden lógico.
    var loaded = await Promise.all([
      idbGetAll('products'),
      idbGetAll('ventas'),
      idbGetAll('movimientos'),
      idbGetMeta('valesManuales', []),
      idbGetMeta('valesInventario', []),
      idbGetMeta('deletedProducts', []),
      idbGetMeta('deletedVentas', []),
      idbGetMeta('deletedValesManuales', []),
      idbGetMeta('deletedMovimientos', [])
    ]);
    products = loaded[0] || [];
    ventas = loaded[1] || [];
    movimientos = loaded[2] || [];
    valesManuales = Array.isArray(loaded[3]) ? loaded[3] : [];
    valesInventario = Array.isArray(loaded[4]) ? loaded[4] : [];
    deletedProducts = Array.isArray(loaded[5]) ? loaded[5] : [];
    deletedVentas = Array.isArray(loaded[6]) ? loaded[6] : [];
    deletedValesManuales = Array.isArray(loaded[7]) ? loaded[7] : [];
    deletedMovimientos = Array.isArray(loaded[8]) ? loaded[8] : [];
    try { sanitizeStoredData(); } catch (e) {}
    products = applyTombstones(products, deletedProducts);
    ventas = applyTombstones(ventas, deletedVentas);
    valesManuales = applyTombstones(valesManuales, deletedValesManuales);
    movimientos = applyTombstones(movimientos, deletedMovimientos);
    try { syncMovimientoClientesFromVentas(); } catch (e) {}
  }

  /* Cambia el almacén activo (solo cuentas con acceso a todos). */
  async function switchAlmacen(id, opts) {
    opts = opts || {};
    if (!ALM[id] || id === active || switching) return;
    switching = true;
    var switchSelect = document.getElementById('alm-switch');
    if (switchSelect) {
      switchSelect.disabled = true;
      switchSelect.title = 'Cargando almacén...';
    }
    document.body.classList.add('almacen-switching');
    try {
      if (opts.flush !== false) {
        // Las operaciones de venta/vale ya guardan en IndexedDB antes de
        // iniciar su sincronización en segundo plano. Aquí solo aseguramos
        // el guardado local (rápido) y esperamos una sincronización que ya
        // estuviera en curso; no iniciamos otra lectura/escritura completa
        // de Firebase por cada cambio de almacén.
        try { if (typeof saveLocalData === 'function') await saveLocalData(); } catch (e) {
          console.warn('[ALMACENES] No se pudo completar el guardado local previo al cambio:', e);
        }
        try {
          if (typeof _bfsPromise !== 'undefined' && _bfsPromise) await _bfsPromise;
        } catch (e) {
          console.warn('[ALMACENES] La sincronización pendiente terminó con aviso:', e);
        }
      }
      try { if (firebaseRoomRef) firebaseRoomRef.off(); } catch (e) {}
      firebaseRoomRef = null; firebaseListeningPath = '';
      if (typeof window.wrExtDetach === 'function') window.wrExtDetach();
      active = id;
      var u = sessUser() || currentUser;
      if (userAlm(u) === ALL) { try { sessionStorage.setItem(STORAGE_PREFIX + 'alm_activo', id); } catch (e) {} }
      try { if (db) db.close(); } catch (e) {}
      db = null;
      await window.openDatabase();
      await reloadDataset();
      if (opts.connect !== false && cloudRoomId) { try { await firebaseConnectRoom(); } catch (e) {} }
      if (typeof window.wrExtAttach === 'function') window.wrExtAttach();
      paintUI();
      altMovs = [];
      try { refreshCurrentView(); } catch (e) {}
      if (opts.silent !== true) {
        try { showSection('dashboard'); } catch (e) {}
        showToast('Almacén activo: ' + almNombre(id));
      }
    } finally {
      switching = false;
      document.body.classList.remove('almacen-switching');
      var activeSelect = document.getElementById('alm-switch');
      if (activeSelect) {
        activeSelect.disabled = false;
        activeSelect.title = 'Cambiar de almacén';
      }
    }
  }
  window.switchAlmacen = switchAlmacen;

  /* ---- Inicio de sesión ---- */
  async function resolveAssigned(user) {
    var a = userAlm(user);
    if (user.almacenId === ALL || (user.almacenId && ALM[user.almacenId])) return a;
    if (user.role === 'admin' || user.role === 'master') return ALL;
    // El servidor aún no envía almacenId: se consulta la lista de usuarios del
    // almacén principal (solo funciona con las reglas de Firebase "fase 1").
    try {
      if (initFirebase() && origRoomPath()) {
        var snap = await fbWithTimeout(firebaseDB.ref(origRoomPath() + '/data/users').once('value'), 6000);
        if (snap && !snap.__timeout) {
          var list = snap.val() || [];
          list = Array.isArray(list) ? list : Object.keys(list).map(function (k) { return list[k]; });
          var me = list.filter(function (x) { return x && String(x.username).toLowerCase() === String(user.username).toLowerCase(); })[0];
          if (me && (me.almacenId === ALL || ALM[me.almacenId])) return me.almacenId;
        }
      }
    } catch (e) {}
    return 'ALM1';
  }

  window.almacenesAfterLogin = async function (user) {
    var a = await resolveAssigned(user);
    user.almacenId = a;
    var target = a;
    if (a === ALL) {
      var saved = sessionStorage.getItem(STORAGE_PREFIX + 'alm_activo');
      target = ALM[saved] ? saved : 'ALM1';
    }
    detachSharedFolio();
    if (target !== active) {
      // Al entrar, lo que hay en memoria es del almacén anterior: no se publica.
      await switchAlmacen(target, { flush: false, connect: false, silent: true });
    }
    try { sessionStorage.setItem(STORAGE_PREFIX + 'alm_activo', target); } catch (e) {}
  };

  /* ---- Usuarios: campo "Almacén asignado" ---- */
  function ensureUserField() {
    var role = document.getElementById('user-role');
    if (!role || document.getElementById('user-almacen')) return;
    var wrap = document.createElement('div');
    wrap.className = 'form-group';
    wrap.id = 'user-almacen-wrap';
    wrap.innerHTML = '<label>Almacén asignado</label><select id="user-almacen">' +
      '<option value="ALM1">' + ALM.ALM1.nombre + '</option>' +
      '<option value="ALM2">' + ALM.ALM2.nombre + '</option>' +
      '<option value="*">Todos los almacenes (solo administrador)</option></select>' +
      '<small style="color:#64748b;">El usuario solo verá y moverá el inventario de su almacén. Los administradores con «Todos» pueden cambiar de almacén.</small>';
    var anchor = role.closest('.form-group') || role.parentNode;
    anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    role.addEventListener('change', function () {
      var sel = document.getElementById('user-almacen');
      if (role.value === 'admin' && sel.value !== ALL) sel.value = ALL;
      if (role.value !== 'admin' && sel.value === ALL) sel.value = 'ALM1';
    });
  }
  window.almacenToUserForm = function (u) {
    ensureUserField();
    var sel = document.getElementById('user-almacen');
    if (!sel) return;
    sel.value = u ? (userAlm(u) || 'ALM1') : 'ALM1';
  };
  window.almacenFromUserForm = function (role) {
    var sel = document.getElementById('user-almacen');
    var v = sel ? sel.value : 'ALM1';
    if (v === ALL && role !== 'admin' && role !== 'master') {
      showToast('Solo un administrador puede tener acceso a todos los almacenes.', 'error');
      return false;
    }
    return v;
  };
  window.almacenUserLabel = function (u) {
    var key = usageKey(u);
    var usage = folioUsageByUser[key];
    var safe = function (v) {
      return typeof esc === 'function' ? esc(v) : String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]);
      });
    };
    var usageLabel = usage && usage.lastFolio
      ? '<br><small style="color:#047857;">Último folio utilizado: <b>' + safe(usage.lastFolio) + '</b> · ' + safe(usage.lastType || 'Operación') + ' · ' + safe(almNombre(usage.lastAlmacen)) + '</small>'
      : '<br><small style="color:#94a3b8;">Folio utilizado: sin registros nuevos</small>';
    return '<br><small style="color:#64748b;">Almacén: ' + almNombre(userAlm(u)) + '</small>' + usageLabel;
  };

  // Los usuarios viven en el almacén principal: administrarlos desde otro
  // almacén escribiría en el lugar equivocado.
  ['saveUserData', 'toggleUserActive', 'deleteUserAccount', 'openUserModal'].forEach(function (name) {
    var f = window[name];
    if (typeof f !== 'function') return;
    window[name] = function () {
      if (active !== 'ALM1') {
        showToast('Cambia al «' + ALM.ALM1.nombre + '» para administrar usuarios.', 'error');
        return;
      }
      return f.apply(this, arguments);
    };
  });

  /* ---- Encabezado: selector / etiqueta del almacén ---- */
  function injectCss() {
    if (document.getElementById('alm-css')) return;
    var st = document.createElement('style');
    st.id = 'alm-css';
    st.textContent =
      '#alm-wrap{display:flex;align-items:center;gap:6px;font-weight:800;font-size:.8rem;color:#065f46}' +
      '#alm-wrap select,#alm-chip{border:1px solid #a7f3d0;background:#ecfdf5;color:#065f46;border-radius:8px;padding:6px 10px;font-weight:800;font-size:.8rem}' +
      'body[data-almacen="ALM2"] #topbar{border-bottom:3px solid #0ea5e9}' +
      'body[data-almacen="ALM2"] #alm-wrap select,body[data-almacen="ALM2"] #alm-chip{background:#e0f2fe;border-color:#7dd3fc;color:#075985}' +
      '#alm-mov-scope{margin-left:8px}';
    document.head.appendChild(st);
  }
  function paintUI() {
    injectCss();
    document.body.setAttribute('data-almacen', active);
    var u = currentUser || sessUser();
    var bar = document.querySelector('#topbar > div:nth-child(2)');
    if (!u || !bar) return;
    var wrap = document.getElementById('alm-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'alm-wrap';
      bar.insertBefore(wrap, bar.firstChild);
    }
    if (userAlm(u) === ALL) {
      wrap.innerHTML = '<i class="fas fa-warehouse"></i><select id="alm-switch" title="Cambiar de almacén">' +
        Object.keys(ALM).map(function (k) { return '<option value="' + k + '"' + (k === active ? ' selected' : '') + '>' + ALM[k].nombre + '</option>'; }).join('') + '</select>';
      document.getElementById('alm-switch').onchange = function () { switchAlmacen(this.value); };
    } else {
      wrap.innerHTML = '<span id="alm-chip"><i class="fas fa-warehouse"></i> ' + almNombre(active) + '</span>';
    }
    if (!document.getElementById('alm-diag')) {
      var btn = document.createElement('button');
      btn.id = 'alm-diag'; btn.type = 'button';
      btn.title = 'Probar la sincronización de almacenes y folios';
      btn.innerHTML = '<i class="fas fa-stethoscope"></i>';
      btn.style.cssText = 'border:1px solid #a7f3d0;background:#fff;color:#065f46;border-radius:8px;padding:6px 9px;cursor:pointer';
      btn.onclick = function () { window.almDiagnostico(true); };
      wrap.appendChild(btn);
    }
    ensureMovScope();
  }
  var origApplyRole = window.applyUserRole;
  window.applyUserRole = function () {
    var r = origApplyRole.apply(this, arguments);
    try { paintUI(); } catch (e) {}
    return r;
  };

  /* ---- Movimientos de ambos almacenes juntos (solo lectura, admin/MASTER) ---- */
  var altMovs = [];
  function otherId() { return active === 'ALM1' ? 'ALM2' : 'ALM1'; }
  function toList(v) { return !v ? [] : (Array.isArray(v) ? v : Object.keys(v).map(function (k) { return v[k]; })); }

  async function loadAltMovs() {
    altMovs = [];
    var p = dataPathFor(otherId());
    if (!p || !initFirebase()) return;
    try {
      var a = await fbWithTimeout(firebaseDB.ref(p + '/data/movimientos').once('value'), 12000);
      var d = await fbWithTimeout(firebaseDB.ref(p + '/data/deletedMovimientos').once('value'), 12000);
      if (a && a.__timeout) { showToast('El otro almacén tardó en responder; intenta de nuevo.', 'warning'); return; }
      var list = toList(a.val()).filter(function (m) { return m && m.id !== undefined; });
      altMovs = applyTombstones(list, toList(d && !d.__timeout ? d.val() : []));
    } catch (e) {
      console.warn('[ALMACENES] No se pudieron leer los movimientos del otro almacén:', e && e.message);
      showToast('No se pudieron leer los movimientos del otro almacén.', 'error');
    }
  }

  function ensureMovScope() {
    var u = currentUser || sessUser();
    var sort = document.getElementById('mov-sort');
    var ex = document.getElementById('alm-mov-scope');
    if (!sort || !u || userAlm(u) !== ALL) { if (ex) ex.remove(); return; }
    if (ex) return;
    var sel = document.createElement('select');
    sel.id = 'alm-mov-scope';
    sel.className = sort.className;
    sel.title = 'Ver movimientos de uno o de ambos almacenes';
    sel.innerHTML = '<option value="actual">Solo este almacén</option><option value="ambos">Ambos almacenes (juntos, solo lectura)</option>';
    sel.onchange = async function () {
      if (sel.value === 'ambos') await loadAltMovs(); else altMovs = [];
      renderMovimientos();
    };
    sort.parentNode.insertBefore(sel, sort.nextSibling);
  }

  var origRenderMov = window.renderMovimientos;
  window.renderMovimientos = function () {
    var sel = document.getElementById('alm-mov-scope');
    var u = currentUser;
    if (!sel || sel.value !== 'ambos' || !u || userAlm(u) !== ALL) return origRenderMov.apply(this, arguments);
    var saved = movimientos;
    var mine = ALM[active].corto, other = ALM[otherId()].corto;
    var altIds = {};
    altMovs.forEach(function (m) { altIds[String(m.id)] = true; });
    movimientos = saved.map(function (m) { return Object.assign({}, m, { user: (m.user || 'Sistema') + ' · ' + mine }); })
      .concat(altMovs.map(function (m) { return Object.assign({}, m, { user: (m.user || 'Sistema') + ' · ' + other }); }));
    var r;
    try { r = origRenderMov.apply(this, arguments); } finally { movimientos = saved; }
    // Los movimientos del otro almacén no se editan ni se borran desde aquí.
    var rows = document.querySelectorAll('#mov-tbody tr');
    Array.prototype.forEach.call(rows, function (tr) {
      var b = tr.querySelector('button[onclick]');
      if (!b) return;
      var m = /'([^']+)'/.exec(b.getAttribute('onclick') || '');
      if (m && altIds[m[1]]) { var last = tr.lastElementChild; if (last) last.innerHTML = '<small style="color:#64748b">Solo lectura</small>'; }
    });
    return r;
  };

  /* ---- Arranque ---- */
  function boot() { injectCss(); ensureUserField(); document.body.setAttribute('data-almacen', active); if (currentUser || sessUser()) { try { paintUI(); } catch (e) {} } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
