const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATABASE_FILE = path.join(os.tmpdir(), `bee-test-${Date.now()}.json`);

const { server } = require('../src/server');
const { defaultState } = require('../src/storage/database');

const PORT = 4010;
let listener;

async function request(method, endpoint, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`http://localhost:${PORT}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    payload = text;
  }
  return { status: response.status, body: payload };
}

test('setup server', async () => {
  await new Promise(resolve => {
    listener = server.listen(PORT, resolve);
  });
  const dbFile = process.env.DATABASE_FILE;
  assert.ok(fs.existsSync(path.dirname(dbFile)));
});

test('login and create hive lifecycle', async () => {
  const loginResponse = await request('POST', '/api/auth/login', {
    provider: 'google',
    externalId: 'user-123',
    name: 'Imkerin',
    email: 'imkerin@example.com'
  });
  assert.strictEqual(loginResponse.status, 200);
  assert.ok(loginResponse.body.token);
  const token = loginResponse.body.token;

  const hivePayload = {
    race: 'Buckfast',
    queenDate: '2024-05-01',
    location: 'Garten A',
    hiveFormat: 'Zander'
  };
  const createHiveResponse = await request('POST', '/api/hives', hivePayload, token);
  assert.strictEqual(createHiveResponse.status, 201);
  assert.ok(createHiveResponse.body.hive.id);
  const hiveId = createHiveResponse.body.hive.id;

  const listResponse = await request('GET', '/api/hives', null, token);
  assert.strictEqual(listResponse.status, 200);
  assert.strictEqual(listResponse.body.hives.length, 1);

  const getHiveResponse = await request('GET', `/api/hives/${hiveId}`, null, token);
  assert.strictEqual(getHiveResponse.status, 200);
  assert.strictEqual(getHiveResponse.body.hive.location, hivePayload.location);

  const controlResponse = await request(
    'POST',
    `/api/hives/${hiveId}/activities`,
    {
      type: 'control',
      payload: {
        date: '2024-09-15',
        queenPresent: true,
        frameCount: 10,
        broodFrameCount: 8,
        weightKg: 32,
        comment: 'Sehr vital'
      }
    },
    token
  );
  assert.strictEqual(controlResponse.status, 201);
  assert.strictEqual(controlResponse.body.activity.type, 'control');

  const feedingResponse = await request(
    'POST',
    `/api/hives/${hiveId}/activities`,
    {
      type: 'feeding',
      payload: {
        date: '2024-08-20',
        kilograms: 5
      }
    },
    token
  );
  assert.strictEqual(feedingResponse.status, 201);

  const activitiesResponse = await request('GET', `/api/hives/${hiveId}/activities`, null, token);
  assert.strictEqual(activitiesResponse.status, 200);
  assert.strictEqual(activitiesResponse.body.activities.length, 2);

  const controlActivityId = controlResponse.body.activity.id;
  const singleActivityResponse = await request(
    'GET',
    `/api/hives/${hiveId}/activities/${controlActivityId}`,
    null,
    token
  );
  assert.strictEqual(singleActivityResponse.status, 200);
  assert.strictEqual(singleActivityResponse.body.activity.comment, 'Sehr vital');

  const updateResponse = await request(
    'PUT',
    `/api/hives/${hiveId}/activities/${controlActivityId}`,
    {
      payload: {
        date: '2024-10-01',
        queenPresent: true,
        frameCount: 9,
        broodFrameCount: 7,
        weightKg: 30,
        comment: 'Leicht reduziert'
      }
    },
    token
  );
  assert.strictEqual(updateResponse.status, 200);
  assert.strictEqual(updateResponse.body.activity.comment, 'Leicht reduziert');

  const deleteResponse = await request(
    'DELETE',
    `/api/hives/${hiveId}/activities/${controlActivityId}`,
    null,
    token
  );
  assert.strictEqual(deleteResponse.status, 200);

  const activitiesAfterDelete = await request(
    'GET',
    `/api/hives/${hiveId}/activities`,
    null,
    token
  );
  assert.strictEqual(activitiesAfterDelete.body.activities.length, 1);
});

test('sync endpoint processes batch operations', async () => {
  const loginResponse = await request('POST', '/api/auth/login', {
    provider: 'facebook',
    externalId: 'user-456'
  });
  const token = loginResponse.body.token;
  const hiveId = 'offline-hive-1';
  const activityId = 'offline-activity-1';
  const syncResponse = await request(
    'POST',
    '/api/sync',
    {
      operations: [
        {
          type: 'create-hive',
          payload: {
            id: hiveId,
            race: 'Carnica',
            queenDate: '2023-04-15',
            location: 'Stand 2',
            hiveFormat: 'Dadant'
          }
        },
        {
          type: 'create-activity',
          hiveId,
          activityType: 'feeding',
          payload: {
            id: activityId,
            date: '2024-08-20',
            kilograms: 5
          }
        },
        {
          type: 'update-activity',
          hiveId,
          activityId,
          payload: {
            date: '2024-08-22',
            kilograms: 6,
            comment: 'Nachschub'
          }
        },
        {
          type: 'delete-activity',
          hiveId,
          activityId
        }
      ]
    },
    token
  );
  assert.strictEqual(syncResponse.status, 200);
  assert.ok(syncResponse.body.applied >= 3);
  assert.ok(Array.isArray(syncResponse.body.hives));
  const createdHive = syncResponse.body.hives.find(entry => entry.id === hiveId);
  assert.ok(createdHive);
});

test('tear down server', async () => {
  await new Promise(resolve => listener.close(resolve));
  const dbFile = process.env.DATABASE_FILE;
  if (fs.existsSync(dbFile)) {
    const saved = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    assert.deepStrictEqual(Object.keys(saved).sort(), Object.keys(defaultState()).sort());
    fs.unlinkSync(dbFile);
  }
});
