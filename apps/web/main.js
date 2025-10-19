import { initOfflineStorage, queueOperation, listOperations, removeOperation } from './offline.js';
import { todayISO, activityDetails, canRecordWeight } from './lib/formatters.js';

const apiBase = '';
const storageKey = 'myhealtybees-state';
const state = {
  token: null,
  user: null,
  hives: [],
  activities: {},
  lastSync: null
};

const loginForm = document.getElementById('loginForm');
const authSection = document.getElementById('authSection');
const dashboard = document.getElementById('dashboard');
const hiveForm = document.getElementById('hiveForm');
const hiveList = document.getElementById('hiveList');
const logoutButton = document.getElementById('logoutButton');
const refreshButton = document.getElementById('refreshButton');
const syncStatus = document.getElementById('syncStatus');
const queenDateInput = document.getElementById('queenDate');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setSyncMessage(message, tone = 'info') {
  syncStatus.textContent = message;
  syncStatus.dataset.tone = tone;
}

function saveState() {
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      token: state.token,
      user: state.user,
      hives: state.hives,
      activities: state.activities,
      lastSync: state.lastSync
    })
  );
}

function loadState() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.token = parsed.token || null;
    state.user = parsed.user || null;
    state.hives = parsed.hives || [];
    state.activities = parsed.activities || {};
    state.lastSync = parsed.lastSync || null;
  } catch (error) {
    console.warn('Konnte lokalen Zustand nicht laden.', error);
  }
}

function isAuthenticated() {
  return Boolean(state.token && state.user);
}

function showDashboard() {
  authSection.hidden = true;
  dashboard.hidden = false;
  logoutButton.hidden = false;
  renderHives();
}

function showAuth() {
  authSection.hidden = false;
  dashboard.hidden = true;
  logoutButton.hidden = true;
  hiveList.innerHTML = '';
}

async function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  headers['Content-Type'] = 'application/json';
  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || `Fehler ${response.status}`);
    }
    return response.json();
  } catch (error) {
    throw error;
  }
}

function renderActivities(hiveId) {
  const items = state.activities[hiveId] || [];
  if (!items.length) {
    return '<p class="muted">Noch keine Einträge vorhanden.</p>';
  }
  return items
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(activity => {
      const lines = [];
      lines.push(`<div class="activity"><h4>${escapeHtml(activity.typeLabel)}</h4>`);
      lines.push(`<p><span class="badge">${escapeHtml(activity.date)}</span></p>`);
      lines.push('<ul>');
      for (const [label, value] of activity.details) {
        lines.push(`<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`);
      }
      if (activity.comment) {
        lines.push(`<li><em>${escapeHtml(activity.comment)}</em></li>`);
      }
      lines.push('</ul></div>');
      return lines.join('');
    })
    .join('');
}

function renderHives() {
  if (!state.hives.length) {
    hiveList.innerHTML = '<p class="muted">Noch keine Völker angelegt.</p>';
    return;
  }
  const markup = state.hives
    .map(hive => {
      const header = `
        <div class="hive-item" data-hive="${hive.id}">
          <div class="hive-meta">
            <h3>${escapeHtml(hive.race)}</h3>
            <span>Königin seit ${escapeHtml(hive.queenDate)}</span>
            <span>Standort: ${escapeHtml(hive.location)}</span>
            <span>Beutenmaß: ${escapeHtml(hive.hiveFormat)}</span>
          </div>
          <section class="activity-section">
            <h4>Aktivitäten</h4>
            <div class="activity-list">${renderActivities(hive.id)}</div>
            <details>
              <summary>Kontrolle erfassen</summary>
              ${controlForm(hive.id)}
            </details>
            <details>
              <summary>Fütterung erfassen</summary>
              ${feedingForm(hive.id)}
            </details>
            <details>
              <summary>Behandlung erfassen</summary>
              ${treatmentForm(hive.id)}
            </details>
            <details>
              <summary>Nachkontrolle erfassen</summary>
              ${followupForm(hive.id)}
            </details>
          </section>
        </div>
      `;
      return header;
    })
    .join('');
  hiveList.innerHTML = markup;
  attachActivityHandlers();
}

function controlForm(hiveId) {
  return `
    <form class="form activity-form" data-hive="${hiveId}" data-type="control">
      <label>Datum
        <input type="date" name="date" max="${todayISO()}" required />
      </label>
      <label>
        Königin vorhanden
        <select name="queenPresent">
          <option value="true">Ja</option>
          <option value="false">Nein</option>
        </select>
      </label>
      <label>Waben gesamt
        <input type="number" name="frameCount" min="1" required />
      </label>
      <label>Davon Brutwaben
        <input type="number" name="broodFrameCount" min="0" required />
      </label>
      <label>Gewicht (kg)
        <input type="number" name="weightKg" min="0" step="0.1" placeholder="Nur Herbst" />
      </label>
      <label>Notizen
        <textarea name="comment" placeholder="Optional"></textarea>
      </label>
      <button type="submit" class="primary">Speichern</button>
    </form>
  `;
}

function feedingForm(hiveId) {
  return `
    <form class="form activity-form" data-hive="${hiveId}" data-type="feeding">
      <label>Datum
        <input type="date" name="date" max="${todayISO()}" required />
      </label>
      <label>Gefütterte Menge (kg)
        <input type="number" name="kilograms" min="0.1" step="0.1" required />
      </label>
      <button type="submit" class="primary">Speichern</button>
    </form>
  `;
}

function treatmentForm(hiveId) {
  return `
    <form class="form activity-form" data-hive="${hiveId}" data-type="treatment">
      <label>Datum
        <input type="date" name="date" max="${todayISO()}" required />
      </label>
      <label>Art der Behandlung
        <select name="treatmentType">
          <option value="ameisensaeure">Ameisensäure</option>
          <option value="oxalsaeure">Oxalsäure</option>
        </select>
      </label>
      <label>Nächste Behandlung
        <input type="date" name="nextTreatmentDate" />
      </label>
      <label>Notizen
        <textarea name="comment" placeholder="Optional"></textarea>
      </label>
      <button type="submit" class="primary">Speichern</button>
    </form>
  `;
}

function followupForm(hiveId) {
  return `
    <form class="form activity-form" data-hive="${hiveId}" data-type="treatment-followup">
      <label>Datum
        <input type="date" name="date" max="${todayISO()}" required />
      </label>
      <label>Nächste Kontrolle
        <input type="date" name="nextControlDate" />
      </label>
      <label>Nächste Behandlung
        <input type="date" name="nextTreatmentDate" />
      </label>
      <label>Milbenbefall
        <select name="miteInfestationLevel">
          <option value="niedrig">Niedrig</option>
          <option value="mittel">Mittel</option>
          <option value="hoch">Hoch</option>
        </select>
      </label>
      <label>Notizen
        <textarea name="comment" placeholder="Optional"></textarea>
      </label>
      <button type="submit" class="primary">Speichern</button>
    </form>
  `;
}

function attachActivityHandlers() {
  document.querySelectorAll('.activity-form').forEach(form => {
    const dateInput = form.querySelector('input[name="date"]');
    const weightInput = form.querySelector('input[name="weightKg"]');
    if (dateInput && weightInput) {
      const toggleWeight = () => {
        const dateValue = dateInput.value || todayISO();
        const enabled = canRecordWeight(dateValue);
        weightInput.disabled = !enabled;
        if (!enabled) {
          weightInput.value = '';
          weightInput.placeholder = 'Nur Herbst';
        }
      };
      dateInput.addEventListener('change', toggleWeight);
      toggleWeight();
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const hiveId = form.dataset.hive;
      const type = form.dataset.type;
      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      payload.date = payload.date || todayISO();
      if (type === 'control') {
        payload.queenPresent = payload.queenPresent === 'true';
        payload.frameCount = Number(payload.frameCount);
        payload.broodFrameCount = Number(payload.broodFrameCount);
        payload.weightKg = payload.weightKg ? Number(payload.weightKg) : null;
      }
      if (type === 'feeding') {
        payload.kilograms = Number(payload.kilograms);
      }
      try {
        await submitActivity(hiveId, type, payload);
        form.reset();
        setSyncMessage('Aktivität gespeichert.', 'success');
      } catch (error) {
        setSyncMessage(error.message, 'error');
      }
    });
  });
}

async function submitActivity(hiveId, type, payload) {
  const body = { type, payload };
  if (!navigator.onLine) {
    await queueActivityOffline(hiveId, type, payload);
    return;
  }
  try {
    const response = await apiFetch(`/api/hives/${hiveId}/activities`, {
      method: 'POST',
      body
    });
    insertActivity(response.activity);
  } catch (error) {
    if (error.message.includes('fetch')) {
      await queueActivityOffline(hiveId, type, payload);
      return;
    }
    throw error;
  }
}

async function queueActivityOffline(hiveId, type, payload) {
  const activity = {
    id: crypto.randomUUID(),
    hiveId,
    userId: state.user ? state.user.id : null,
    type,
    date: payload.date,
    payload,
    comment: payload.comment || ''
  };
  insertActivity({ ...activity, ...payload });
  await queueOperation({
    type: 'create-activity',
    hiveId,
    activityType: type,
    payload
  });
  setSyncMessage('Offline gespeichert – wird synchronisiert sobald du online bist.', 'info');
}

function insertActivity(activity) {
  const details = activityDetails(activity.type, activity);
  const entry = {
    id: activity.id,
    date: activity.date,
    type: activity.type,
    typeLabel: details.typeLabel,
    details: details.details,
    comment: activity.comment || ''
  };
  state.activities[activity.hiveId] = state.activities[activity.hiveId] || [];
  const existingIndex = state.activities[activity.hiveId].findIndex(item => item.id === entry.id);
  if (existingIndex >= 0) {
    state.activities[activity.hiveId][existingIndex] = entry;
  } else {
    state.activities[activity.hiveId].push(entry);
  }
  saveState();
  renderHives();
}

async function loadData() {
  if (!navigator.onLine) {
    setSyncMessage('Offline – es werden lokale Daten angezeigt.');
    renderHives();
    return;
  }
  try {
    const response = await apiFetch('/api/sync', { method: 'GET' });
    state.hives = response.hives || [];
    const grouped = {};
    (response.activities || []).forEach(activity => {
      const details = activityDetails(activity.type, activity);
      grouped[activity.hiveId] = grouped[activity.hiveId] || [];
      grouped[activity.hiveId].push({
        id: activity.id,
        date: activity.date,
        type: activity.type,
        typeLabel: details.typeLabel,
        details: details.details,
        comment: activity.comment || ''
      });
    });
    state.activities = grouped;
    state.lastSync = new Date().toISOString();
    saveState();
    renderHives();
    setSyncMessage('Synchronisation erfolgreich.', 'success');
  } catch (error) {
    setSyncMessage(error.message, 'error');
  }
}

async function syncPendingOperations() {
  if (!navigator.onLine || !state.token) return;
  const queued = await listOperations();
  if (!queued.length) return;
  try {
    const result = await apiFetch('/api/sync', {
      method: 'POST',
      body: {
        operations: queued.map(entry => entry.operation)
      }
    });
    for (const record of queued) {
      await removeOperation(record.id);
    }
    state.hives = result.hives || state.hives;
    const grouped = {};
    (result.activities || []).forEach(activity => {
      const details = activityDetails(activity.type, activity);
      grouped[activity.hiveId] = grouped[activity.hiveId] || [];
      grouped[activity.hiveId].push({
        id: activity.id,
        date: activity.date,
        type: activity.type,
        typeLabel: details.typeLabel,
        details: details.details,
        comment: activity.comment || ''
      });
    });
    state.activities = grouped;
    state.lastSync = new Date().toISOString();
    saveState();
    renderHives();
    setSyncMessage('Alle Offline-Aktionen wurden synchronisiert.', 'success');
  } catch (error) {
    setSyncMessage(`Synchronisation fehlgeschlagen: ${error.message}`, 'error');
  }
}

async function submitHive(event) {
  event.preventDefault();
  const formData = new FormData(hiveForm);
  const payload = Object.fromEntries(formData.entries());
  payload.queenDate = payload.queenDate || todayISO();
  if (!navigator.onLine) {
    await queueOperation({ type: 'create-hive', payload });
    const hive = {
      id: crypto.randomUUID(),
      ...payload
    };
    state.hives.push(hive);
    renderHives();
    saveState();
    hiveForm.reset();
    setSyncMessage('Volk offline gespeichert.');
    return;
  }
  try {
    const response = await apiFetch('/api/hives', { method: 'POST', body: payload });
    state.hives.push(response.hive);
    saveState();
    renderHives();
    hiveForm.reset();
    setSyncMessage('Volk gespeichert.', 'success');
  } catch (error) {
    setSyncMessage(error.message, 'error');
  }
}

async function login(event) {
  event.preventDefault();
  if (!navigator.onLine) {
    setSyncMessage('Für die Anmeldung wird eine Internetverbindung benötigt.', 'error');
    return;
  }
  const formData = new FormData(loginForm);
  const body = {
    provider: formData.get('provider'),
    externalId: formData.get('externalId'),
    name: formData.get('displayName'),
    email: formData.get('email')
  };
  try {
    const response = await apiFetch('/api/auth/login', {
      method: 'POST',
      body
    });
    state.token = response.token;
    state.user = response.user;
    saveState();
    showDashboard();
    await loadData();
    await syncPendingOperations();
  } catch (error) {
    setSyncMessage(error.message, 'error');
  }
}

function logout() {
  state.token = null;
  state.user = null;
  state.hives = [];
  state.activities = {};
  state.lastSync = null;
  saveState();
  showAuth();
  setSyncMessage('Abgemeldet.');
}

function handleConnectivity() {
  if (navigator.onLine) {
    setSyncMessage('Online. Synchronisiere …');
    syncPendingOperations();
    loadData();
  } else {
    setSyncMessage('Offline – Änderungen werden später gesendet.');
  }
}

async function bootstrap() {
  queenDateInput.max = todayISO();
  await initOfflineStorage();
  loadState();
  if (isAuthenticated()) {
    showDashboard();
    renderHives();
    syncPendingOperations();
    loadData();
  } else {
    showAuth();
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(error => {
      console.warn('Service Worker konnte nicht registriert werden.', error);
    });
  }
}

loginForm.addEventListener('submit', login);
hiveForm.addEventListener('submit', submitHive);
logoutButton.addEventListener('click', logout);
refreshButton.addEventListener('click', () => {
  loadData();
  syncPendingOperations();
});
window.addEventListener('online', handleConnectivity);
window.addEventListener('offline', handleConnectivity);

bootstrap();
