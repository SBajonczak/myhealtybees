const http = require('http');
const fs = require('fs');
const path = require('path');
const { readJsonBody, sendJson, parsePath } = require('./utils/http');
const { verifyToken } = require('./utils/auth');
const { login } = require('./controllers/authController');
const {
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
} = require('./controllers/hiveController');
const { readDatabase } = require('./storage/database');

const PORT = process.env.PORT || 3000;
const STATIC_DIR = path.join(__dirname, '..', '..', 'web');

function ensureAuthenticated(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    throw { status: 401, message: 'Authentifizierung erforderlich.' };
  }
  const [scheme, token] = authHeader.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    throw { status: 401, message: 'Ungültiger Authorization-Header.' };
  }
  const payload = verifyToken(token);
  if (!payload) {
    throw { status: 401, message: 'Das Token ist ungültig oder abgelaufen.' };
  }
  return payload;
}

function serveStatic(req, res, requestPath) {
  let filePath = path.join(STATIC_DIR, requestPath);
  if (requestPath === '/' || !path.extname(requestPath)) {
    filePath = path.join(STATIC_DIR, 'index.html');
  }
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(STATIC_DIR))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.promises
    .readFile(resolved)
    .then(content => {
      const ext = path.extname(resolved).toLowerCase();
      const typeMap = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.webmanifest': 'application/manifest+json'
      };
      const contentType = typeMap[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content);
    })
    .catch(() => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Nicht gefunden');
    });
}

async function handleApi(req, res) {
  const { path: pathname, segments } = parsePath(req.url);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    });
    res.end();
    return;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const result = await login(body || {});
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, error.status || 500, { error: error.message || 'Unbekannter Fehler' });
    }
    return;
  }

  let user;
  try {
    user = ensureAuthenticated(req);
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || 'Authentifizierungsfehler' });
    return;
  }

  try {
    if (pathname === '/api/hives' && req.method === 'GET') {
      const items = await listHives(user.userId);
      sendJson(res, 200, { hives: items });
      return;
    }

    if (pathname === '/api/hives' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const hive = await createHive(user.userId, body || {});
      sendJson(res, 201, { hive });
      return;
    }

    if (segments.length === 2 && segments[0] === 'api' && segments[1] === 'sync') {
      if (req.method === 'GET') {
        const db = await readDatabase();
        const hives = db.hives.filter(entry => entry.userId === user.userId);
        const activities = db.activities.filter(entry => entry.userId === user.userId);
        sendJson(res, 200, { hives, activities });
        return;
      }
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = await applySyncOperations(user.userId, (body && body.operations) || []);
        sendJson(res, 200, result);
        return;
      }
    }

    if (segments.length >= 3 && segments[0] === 'api' && segments[1] === 'hives') {
      const hiveId = segments[2];
      if (segments.length === 3) {
        if (req.method === 'GET') {
          const hive = await getHive(user.userId, hiveId);
          sendJson(res, 200, { hive });
          return;
        }
        if (req.method === 'PUT') {
          const body = await readJsonBody(req);
          const hive = await updateHive(user.userId, hiveId, body || {});
          sendJson(res, 200, { hive });
          return;
        }
        if (req.method === 'DELETE') {
          await deleteHive(user.userId, hiveId);
          sendJson(res, 200, { success: true });
          return;
        }
      }
      if (segments.length >= 4 && segments[3] === 'activities') {
        if (segments.length === 4) {
          if (req.method === 'GET') {
            const activities = await listActivities(user.userId, hiveId);
            sendJson(res, 200, { activities });
            return;
          }
          if (req.method === 'POST') {
            const body = await readJsonBody(req);
            const activity = await createActivity(
              user.userId,
              hiveId,
              (body && body.type) || '',
              (body && body.payload) || {}
            );
            sendJson(res, 201, { activity });
            return;
          }
        }
        if (segments.length === 5) {
          const activityId = segments[4];
          if (req.method === 'GET') {
            const activity = await getActivity(user.userId, hiveId, activityId);
            sendJson(res, 200, { activity });
            return;
          }
          if (req.method === 'PUT') {
            const body = await readJsonBody(req);
            const activity = await updateActivity(
              user.userId,
              hiveId,
              activityId,
              (body && body.payload) || {}
            );
            sendJson(res, 200, { activity });
            return;
          }
          if (req.method === 'DELETE') {
            await deleteActivity(user.userId, hiveId, activityId);
            sendJson(res, 200, { success: true });
            return;
          }
        }
      }
    }

    sendJson(res, 404, { error: 'Endpunkt nicht gefunden.' });
  } catch (error) {
    const status =
      error.status || (error.message === 'INVALID_JSON' ? 400 : 500);
    const message =
      error.message === 'INVALID_JSON' ? 'Ungültige JSON-Daten.' : error.message;
    sendJson(res, status, { error: message || 'Serverfehler' });
  }
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  if (pathname.startsWith('/api/')) {
    handleApi(req, res);
  } else {
    serveStatic(req, res, pathname);
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
  });
}

module.exports = {
  server
};
