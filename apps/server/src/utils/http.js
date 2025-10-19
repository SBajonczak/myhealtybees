const { StringDecoder } = require('string_decoder');
const url = require('url');

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    req.on('data', chunk => {
      buffer += decoder.write(chunk);
    });
    req.on('end', () => {
      buffer += decoder.end();
      if (!buffer) {
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(buffer);
        resolve(parsed);
      } catch (error) {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  });
  res.end(JSON.stringify(payload));
}

function parsePath(reqUrl) {
  const parsedUrl = url.parse(reqUrl, true);
  const trimmedPath = parsedUrl.pathname.replace(/^\/+|\/+$/g, '');
  const segments = trimmedPath ? trimmedPath.split('/') : [];
  return {
    path: `/${segments.join('/')}`,
    segments,
    query: parsedUrl.query
  };
}

module.exports = {
  readJsonBody,
  sendJson,
  parsePath
};
