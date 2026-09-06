const db = require('../config/database');
const { hashPassword, isPasswordHash, verifyAndUpgradePassword } = require('../utils/passwordUtil');

function passwordForWrite(newPassword, currentPassword = '') {
  const value = String(newPassword || '');
  if (!value) return currentPassword;
  if (isPasswordHash(value)) return value;
  return hashPassword(value);
}

function authenticateTable(table, username, password) {
  const allowed = new Set(['cashiers', 'collectors']);
  if (!allowed.has(table)) throw new Error('Invalid authentication table');

  const user = db.prepare(`SELECT * FROM ${table} WHERE username = ? AND is_active = 1 LIMIT 1`)
    .get(String(username || '').trim());
  if (!user) return null;

  const ok = verifyAndUpgradePassword(password, user.password, (upgradedHash) => {
    db.prepare(`UPDATE ${table} SET password = ? WHERE id = ?`).run(upgradedHash, user.id);
    user.password = upgradedHash;
  });
  return ok ? user : null;
}

/** TECHNICIANS */
function getAllTechnicians() {
  return db.prepare('SELECT id, username, name, phone, area, is_active, created_at FROM technicians ORDER BY created_at DESC').all();
}

function createTechnician(data) {
  const stmt = db.prepare('INSERT INTO technicians (username, password, name, phone, area) VALUES (?, ?, ?, ?, ?)');
  return stmt.run(data.username, hashPassword(data.password), data.name, data.phone || '', data.area || '');
}

function parseBoolInt(val, defaultVal = 0) {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (val === true || val === 1 || val === '1' || val === 'true' || val === 'on' || val === 'yes') return 1;
  if (val === false || val === 0 || val === '0' || val === 'false' || val === 'off' || val === 'no') return 0;
  return Boolean(val) ? 1 : 0;
}

function updateTechnician(id, data) {
  const current = db.prepare('SELECT password FROM technicians WHERE id = ?').get(id);
  if (!current) throw new Error('Teknisi tidak ditemukan');
  const password = passwordForWrite(data.password, current.password);
  const stmt = db.prepare('UPDATE technicians SET username = ?, password = ?, name = ?, phone = ?, area = ?, is_active = ? WHERE id = ?');
  return stmt.run(data.username, password, data.name, data.phone || '', data.area || '', parseBoolInt(data.is_active, 1), id);
}

function deleteTechnician(id) {
  return db.prepare('DELETE FROM technicians WHERE id = ?').run(id);
}

/** CASHIERS */
function getAllCashiers() {
  return db.prepare('SELECT id, username, name, phone, is_active, created_at FROM cashiers ORDER BY created_at DESC').all();
}

function createCashier(data) {
  const stmt = db.prepare('INSERT INTO cashiers (username, password, name, phone) VALUES (?, ?, ?, ?)');
  return stmt.run(data.username, hashPassword(data.password), data.name, data.phone || '');
}

function updateCashier(id, data) {
  const current = db.prepare('SELECT password FROM cashiers WHERE id = ?').get(id);
  if (!current) throw new Error('Kasir tidak ditemukan');
  const password = passwordForWrite(data.password, current.password);
  const stmt = db.prepare('UPDATE cashiers SET username = ?, password = ?, name = ?, phone = ?, is_active = ? WHERE id = ?');
  return stmt.run(data.username, password, data.name, data.phone || '', parseBoolInt(data.is_active, 1), id);
}

function deleteCashier(id) {
  return db.prepare('DELETE FROM cashiers WHERE id = ?').run(id);
}

function authenticateCashier(username, password) {
  return authenticateTable('cashiers', username, password);
}

/** COLLECTORS */
function getAllCollectors() {
  return db.prepare('SELECT id, username, name, phone, area, is_active, auto_approve, created_at FROM collectors ORDER BY created_at DESC').all();
}

function createCollector(data) {
  return db.prepare(
    'INSERT INTO collectors (username, password, name, phone, area, is_active, auto_approve) VALUES (?, ?, ?, ?, ?, 1, ?)'
  ).run(
    String(data.username || '').trim(),
    hashPassword(data.password),
    String(data.name || '').trim(),
    String(data.phone || '').trim(),
    String(data.area || '').trim(),
    parseBoolInt(data.auto_approve, 0)
  );
}

function updateCollector(id, data) {
  const current = db.prepare('SELECT password FROM collectors WHERE id = ?').get(id);
  if (!current) throw new Error('Kolektor tidak ditemukan');
  const password = passwordForWrite(data.password, current.password);
  const stmt = db.prepare('UPDATE collectors SET username = ?, password = ?, name = ?, phone = ?, area = ?, is_active = ?, auto_approve = ? WHERE id = ?');
  return stmt.run(
    String(data.username || '').trim(),
    password,
    String(data.name || '').trim(),
    String(data.phone || '').trim(),
    String(data.area || '').trim(),
    parseBoolInt(data.is_active, 1),
    parseBoolInt(data.auto_approve, 0),
    id
  );
}

function deleteCollector(id) {
  return db.prepare('DELETE FROM collectors WHERE id = ?').run(id);
}

function authenticateCollector(username, password) {
  return authenticateTable('collectors', username, password);
}

module.exports = {
  getAllTechnicians,
  createTechnician,
  updateTechnician,
  deleteTechnician,
  getAllCashiers,
  createCashier,
  updateCashier,
  deleteCashier,
  authenticateCashier,
  getAllCollectors,
  createCollector,
  updateCollector,
  deleteCollector,
  authenticateCollector
};
