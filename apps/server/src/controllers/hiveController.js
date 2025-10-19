const crypto = require('crypto');
const { readDatabase, writeDatabase } = require('../storage/database');

function assertUser(db, userId) {
  const user = db.users.find(entry => entry.id === userId);
  if (!user) {
    throw { status: 401, message: 'Benutzer existiert nicht mehr.' };
  }
  return user;
}

function validateHivePayload(payload) {
  if (!payload) {
    throw { status: 400, message: 'Keine Daten übermittelt.' };
  }
  const { race, queenDate, location, hiveFormat } = payload;
  if (!race || typeof race !== 'string') {
    throw { status: 400, message: 'Rasse muss ausgefüllt werden.' };
  }
  if (!queenDate || Number.isNaN(Date.parse(queenDate))) {
    throw { status: 400, message: 'Datum der Königin ist ungültig.' };
  }
  if (!location || typeof location !== 'string') {
    throw { status: 400, message: 'Standort muss gesetzt werden.' };
  }
  if (!hiveFormat || typeof hiveFormat !== 'string') {
    throw { status: 400, message: 'Beutenmaß muss ausgefüllt werden.' };
  }
  return {
    race: race.trim(),
    queenDate: new Date(queenDate).toISOString().split('T')[0],
    location: location.trim(),
    hiveFormat: hiveFormat.trim()
  };
}

function ensurePastOrToday(dateStr) {
  const inputDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (inputDate > today) {
    throw { status: 400, message: 'Das Datum darf nicht in der Zukunft liegen.' };
  }
  return inputDate;
}

function validateActivity(type, payload) {
  if (!payload || typeof payload !== 'object') {
    throw { status: 400, message: 'Es wurden keine Aktivitätsdaten übermittelt.' };
  }
  if (!payload.date) {
    throw { status: 400, message: 'Ein Datum ist erforderlich.' };
  }
  const date = ensurePastOrToday(payload.date);
  const base = {
    type,
    date: date.toISOString().split('T')[0],
    comment: payload.comment ? String(payload.comment).trim() : ''
  };

  switch (type) {
    case 'control': {
      const queenPresent = Boolean(payload.queenPresent);
      const frameCount = Number(payload.frameCount || 0);
      const broodFrameCount = Number(payload.broodFrameCount || 0);
      if (Number.isNaN(frameCount) || frameCount <= 0) {
        throw { status: 400, message: 'Die Anzahl der Waben muss größer 0 sein.' };
      }
      if (Number.isNaN(broodFrameCount) || broodFrameCount < 0) {
        throw { status: 400, message: 'Die Anzahl der Brutwaben ist ungültig.' };
      }
      if (broodFrameCount > frameCount) {
        throw { status: 400, message: 'Brutwaben dürfen nicht mehr als Gesamtwaben sein.' };
      }
      let weightKg = null;
      const month = date.getUTCMonth() + 1;
      if (payload.weightKg !== undefined && payload.weightKg !== null) {
        if (month < 9) {
          throw {
            status: 400,
            message: 'Gewichtsangaben sind erst ab den Herbstmonaten erlaubt.'
          };
        }
        weightKg = Number(payload.weightKg);
        if (Number.isNaN(weightKg) || weightKg <= 0) {
          throw { status: 400, message: 'Das Gewicht muss größer 0 sein.' };
        }
      }
      return {
        ...base,
        queenPresent,
        frameCount,
        broodFrameCount,
        weightKg
      };
    }
    case 'feeding': {
      const kilograms = Number(payload.kilograms || payload.weightKg);
      if (Number.isNaN(kilograms) || kilograms <= 0) {
        throw { status: 400, message: 'Gefütterte Menge muss größer 0 sein.' };
      }
      return {
        ...base,
        kilograms
      };
    }
    case 'treatment': {
      const allowedTreatments = ['ameisensaeure', 'oxalsaeure'];
      const treatmentType = String(payload.treatmentType || '').toLowerCase();
      if (!allowedTreatments.includes(treatmentType)) {
        throw {
          status: 400,
          message: 'Behandlung muss Ameisen- oder Oxalsäure sein.'
        };
      }
      let nextTreatmentDate = null;
      if (payload.nextTreatmentDate) {
        const nextDate = new Date(payload.nextTreatmentDate);
        if (Number.isNaN(nextDate.getTime())) {
          throw { status: 400, message: 'Nächster Behandlungstermin ist ungültig.' };
        }
        if (nextDate < date) {
          throw {
            status: 400,
            message: 'Der nächste Behandlungstermin muss in der Zukunft liegen.'
          };
        }
        nextTreatmentDate = nextDate.toISOString().split('T')[0];
      }
      return {
        ...base,
        treatmentType,
        nextTreatmentDate
      };
    }
    case 'treatment-followup': {
      let nextControlDate = null;
      if (payload.nextControlDate) {
        const controlDate = new Date(payload.nextControlDate);
        if (Number.isNaN(controlDate.getTime())) {
          throw { status: 400, message: 'Nächster Kontrolltermin ist ungültig.' };
        }
        if (controlDate < date) {
          throw {
            status: 400,
            message: 'Die nächste Kontrolle muss nach dem aktuellen Datum liegen.'
          };
        }
        nextControlDate = controlDate.toISOString().split('T')[0];
      }
      let nextTreatmentDate = null;
      if (payload.nextTreatmentDate) {
        const nextDate = new Date(payload.nextTreatmentDate);
        if (Number.isNaN(nextDate.getTime())) {
          throw { status: 400, message: 'Nächste Behandlung ist ungültig.' };
        }
        if (nextDate < date) {
          throw {
            status: 400,
            message: 'Die nächste Behandlung muss nach dem Kontrolltermin liegen.'
          };
        }
        nextTreatmentDate = nextDate.toISOString().split('T')[0];
      }
      const infestation = String(payload.miteInfestationLevel || '').toLowerCase();
      const allowedLevels = ['niedrig', 'mittel', 'hoch'];
      if (!allowedLevels.includes(infestation)) {
        throw {
          status: 400,
          message: 'Milbenbefall muss niedrig, mittel oder hoch sein.'
        };
      }
      return {
        ...base,
        nextControlDate,
        nextTreatmentDate,
        miteInfestationLevel: infestation
      };
    }
    default:
      throw { status: 400, message: 'Unbekannter Aktivitätstyp.' };
  }
}

async function listHives(userId) {
  const db = await readDatabase();
  assertUser(db, userId);
  return db.hives.filter(entry => entry.userId === userId);
}

/**
 * Returns a single hive for the authenticated user.
 * @param {string} userId
 * @param {string} hiveId
 */
async function getHive(userId, hiveId) {
  const db = await readDatabase();
  assertUser(db, userId);
  const hive = db.hives.find(entry => entry.id === hiveId && entry.userId === userId);
  if (!hive) {
    throw { status: 404, message: 'Das Volk wurde nicht gefunden.' };
  }
  return hive;
}

async function createHive(userId, payload) {
  const db = await readDatabase();
  assertUser(db, userId);
  const normalized = validateHivePayload(payload);
  const now = new Date().toISOString();
  let id = crypto.randomUUID();
  if (payload && typeof payload.id === 'string' && payload.id.trim()) {
    id = payload.id.trim();
    const duplicate = db.hives.some(entry => entry.id === id && entry.userId === userId);
    if (duplicate) {
      throw { status: 409, message: 'Die ID des Volkes wird bereits verwendet.' };
    }
  }
  const hive = {
    id,
    userId,
    ...normalized,
    createdAt: now,
    updatedAt: now
  };
  db.hives.push(hive);
  await writeDatabase(db);
  return hive;
}

async function updateHive(userId, hiveId, payload) {
  const db = await readDatabase();
  assertUser(db, userId);
  const existing = db.hives.find(entry => entry.id === hiveId && entry.userId === userId);
  if (!existing) {
    throw { status: 404, message: 'Das Volk wurde nicht gefunden.' };
  }
  const normalized = validateHivePayload(payload);
  const updated = {
    ...existing,
    ...normalized,
    updatedAt: new Date().toISOString()
  };
  db.hives = db.hives.map(entry => (entry.id === hiveId ? updated : entry));
  await writeDatabase(db);
  return updated;
}

async function deleteHive(userId, hiveId) {
  const db = await readDatabase();
  assertUser(db, userId);
  const beforeLength = db.hives.length;
  db.hives = db.hives.filter(entry => !(entry.id === hiveId && entry.userId === userId));
  if (db.hives.length === beforeLength) {
    throw { status: 404, message: 'Das Volk wurde nicht gefunden.' };
  }
  db.activities = db.activities.filter(entry => entry.hiveId !== hiveId);
  await writeDatabase(db);
  return { success: true };
}

async function listActivities(userId, hiveId) {
  const db = await readDatabase();
  assertUser(db, userId);
  const hive = db.hives.find(entry => entry.id === hiveId && entry.userId === userId);
  if (!hive) {
    throw { status: 404, message: 'Das Volk wurde nicht gefunden.' };
  }
  return db.activities
    .filter(entry => entry.hiveId === hiveId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Returns a specific activity entry of a hive.
 * @param {string} userId
 * @param {string} hiveId
 * @param {string} activityId
 */
async function getActivity(userId, hiveId, activityId) {
  const db = await readDatabase();
  assertUser(db, userId);
  const hive = db.hives.find(entry => entry.id === hiveId && entry.userId === userId);
  if (!hive) {
    throw { status: 404, message: 'Das Volk wurde nicht gefunden.' };
  }
  const activity = db.activities.find(
    entry => entry.id === activityId && entry.hiveId === hiveId && entry.userId === userId
  );
  if (!activity) {
    throw { status: 404, message: 'Die Aktivität wurde nicht gefunden.' };
  }
  return activity;
}

async function createActivity(userId, hiveId, type, payload) {
  const db = await readDatabase();
  assertUser(db, userId);
  const hive = db.hives.find(entry => entry.id === hiveId && entry.userId === userId);
  if (!hive) {
    throw { status: 404, message: 'Das Volk wurde nicht gefunden.' };
  }
  const normalized = validateActivity(type, payload);
  const now = new Date().toISOString();
  let id = crypto.randomUUID();
  if (payload && typeof payload.id === 'string' && payload.id.trim()) {
    id = payload.id.trim();
    const duplicate = db.activities.some(
      entry => entry.id === id && entry.hiveId === hiveId && entry.userId === userId
    );
    if (duplicate) {
      throw { status: 409, message: 'Die ID der Aktivität wird bereits verwendet.' };
    }
  }
  const activity = {
    id,
    hiveId,
    userId,
    ...normalized,
    createdAt: now,
    updatedAt: now
  };
  db.activities.push(activity);
  await writeDatabase(db);
  return activity;
}

/**
 * Updates an existing activity. The type cannot be changed to keep the
 * structure consistent across sync devices.
 * @param {string} userId
 * @param {string} hiveId
 * @param {string} activityId
 * @param {object} payload
 */
async function updateActivity(userId, hiveId, activityId, payload) {
  const db = await readDatabase();
  assertUser(db, userId);
  const existing = db.activities.find(
    entry => entry.id === activityId && entry.hiveId === hiveId && entry.userId === userId
  );
  if (!existing) {
    throw { status: 404, message: 'Die Aktivität wurde nicht gefunden.' };
  }
  const normalized = validateActivity(existing.type, payload);
  const updated = {
    ...existing,
    ...normalized,
    updatedAt: new Date().toISOString()
  };
  db.activities = db.activities.map(entry => (entry.id === activityId ? updated : entry));
  await writeDatabase(db);
  return updated;
}

/**
 * Deletes an activity from a hive.
 * @param {string} userId
 * @param {string} hiveId
 * @param {string} activityId
 */
async function deleteActivity(userId, hiveId, activityId) {
  const db = await readDatabase();
  assertUser(db, userId);
  const beforeLength = db.activities.length;
  db.activities = db.activities.filter(
    entry => !(entry.id === activityId && entry.hiveId === hiveId && entry.userId === userId)
  );
  if (db.activities.length === beforeLength) {
    throw { status: 404, message: 'Die Aktivität wurde nicht gefunden.' };
  }
  await writeDatabase(db);
  return { success: true };
}

async function applySyncOperations(userId, operations) {
  if (!Array.isArray(operations)) {
    throw { status: 400, message: 'Synchronisationsdaten sind ungültig.' };
  }
  let applied = 0;
  for (const op of operations) {
    try {
      switch (op.type) {
        case 'create-hive':
          await createHive(userId, op.payload);
          applied += 1;
          break;
        case 'update-hive':
          await updateHive(userId, op.hiveId, op.payload);
          applied += 1;
          break;
        case 'delete-hive':
          await deleteHive(userId, op.hiveId);
          applied += 1;
          break;
        case 'create-activity':
          await createActivity(userId, op.hiveId, op.activityType, op.payload);
          applied += 1;
          break;
        case 'update-activity':
          await updateActivity(userId, op.hiveId, op.activityId, op.payload);
          applied += 1;
          break;
        case 'delete-activity':
          await deleteActivity(userId, op.hiveId, op.activityId);
          applied += 1;
          break;
        default:
          break;
      }
    } catch (error) {
      // We intentionally ignore individual operation errors so that the
      // synchronization can proceed with the remaining items. The client will
      // receive a summary afterwards.
    }
  }
  const hives = await listHives(userId);
  const activities = (await Promise.all(hives.map(hive => listActivities(userId, hive.id)))).flat();
  return { applied, hives, activities };
}

module.exports = {
  listHives,
  getHive,
  createHive,
  updateHive,
  deleteHive,
  listActivities,
  getActivity,
  createActivity,
  updateActivity,
  deleteActivity,
  applySyncOperations
};
