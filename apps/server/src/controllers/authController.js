const { createToken, ensureProvider } = require('../utils/auth');
const { readDatabase, writeDatabase } = require('../storage/database');
const crypto = require('crypto');

/**
 * Handles sign-in via external identity providers. The actual OAuth flow
 * happens on the client; the server only persists the identity so that the
 * beekeeper can retrieve their hives on different devices.
 */
async function login(body) {
  if (!body || typeof body !== 'object') {
    throw { status: 400, message: 'Ungültige Anmeldedaten.' };
  }
  const { provider, externalId, name, email } = body;
  try {
    ensureProvider(provider);
  } catch (error) {
    throw { status: 400, message: 'Anbieter wird nicht unterstützt.' };
  }
  if (!externalId || typeof externalId !== 'string') {
    throw { status: 400, message: 'Externe Benutzerkennung fehlt.' };
  }
  if (email && typeof email !== 'string') {
    throw { status: 400, message: 'E-Mail ist ungültig.' };
  }
  const db = await readDatabase();
  let user = db.users.find(
    entry => entry.provider === provider && entry.externalId === externalId
  );
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      provider,
      externalId,
      name: name || '',
      email: email || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.users.push(user);
  } else {
    user = {
      ...user,
      name: name || user.name,
      email: email || user.email,
      updatedAt: new Date().toISOString()
    };
    db.users = db.users.map(u => (u.id === user.id ? user : u));
  }
  await writeDatabase(db);
  const token = createToken({ userId: user.id, provider: user.provider });
  return {
    token,
    user: {
      id: user.id,
      provider: user.provider,
      name: user.name,
      email: user.email
    }
  };
}

module.exports = {
  login
};
