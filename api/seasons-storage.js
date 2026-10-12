import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const STORAGE_FILE = path.join(DATA_DIR, 'seasons_storage.json');

function ensureDataFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORAGE_FILE)) {
      fs.writeFileSync(STORAGE_FILE, JSON.stringify({ users: {} }, null, 2), 'utf-8');
    }
  } catch (err) {
    console.warn('[seasons-storage] Failed to ensure data file:', err);
  }
}

function readAllData() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
    return JSON.parse(raw) || { users: {} };
  } catch {
    return { users: {} };
  }
}

function writeAllData(data) {
  ensureDataFile();
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[seasons-storage] Failed to write data file:', err);
  }
}

export function getLocalSeasons(userId) {
  const data = readAllData();
  const userSeasons = data.users?.[userId]?.seasons || [];
  return [...userSeasons];
}

export function getLocalSeason(userId, seasonId) {
  const seasons = getLocalSeasons(userId);
  return seasons.find(s => s.id === seasonId) || null;
}

export function saveLocalSeason(userId, seasonData) {
  const data = readAllData();
  if (!data.users) data.users = {};
  if (!data.users[userId]) data.users[userId] = { seasons: [] };

  const id = seasonData.id || crypto.randomUUID();
  const now = new Date().toISOString();

  const newSeason = {
    id,
    user_id: userId,
    name: seasonData.name,
    description: seasonData.description || null,
    start_date: seasonData.start_date,
    end_date: seasonData.end_date,
    status: seasonData.status || 'active',
    active_habit_ids: seasonData.active_habit_ids || [],
    created_at: seasonData.created_at || now,
    updated_at: now,
  };

  data.users[userId].seasons.unshift(newSeason);
  writeAllData(data);
  return newSeason;
}

export function updateLocalSeason(userId, seasonId, updates) {
  const data = readAllData();
  if (!data.users?.[userId]?.seasons) return null;

  const list = data.users[userId].seasons;
  const index = list.findIndex(s => s.id === seasonId);
  if (index === -1) return null;

  const current = list[index];
  const now = new Date().toISOString();

  const updated = {
    ...current,
    ...updates,
    updated_at: now,
  };

  list[index] = updated;
  writeAllData(data);
  return updated;
}

export function deleteLocalSeason(userId, seasonId) {
  const data = readAllData();
  if (!data.users?.[userId]?.seasons) return false;

  const beforeLen = data.users[userId].seasons.length;
  data.users[userId].seasons = data.users[userId].seasons.filter(s => s.id !== seasonId);
  writeAllData(data);
  return data.users[userId].seasons.length < beforeLen;
}
