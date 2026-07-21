import { get } from 'svelte/store';
import { auth } from './stores.js';

const CACHE_PREFIX = 'planer_tasks_cache_';

async function request(path, options = {}) {
  const current = get(auth);
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (current?.token) headers.Authorization = `Bearer ${current.token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 401 && current?.token) {
    // We sent a token and it was rejected -> it's expired/invalid, not a login failure
    // (a 401 with no token attached, e.g. wrong password on /auth/login, falls through
    // to the generic error handling below so the real backend message is shown).
    auth.set(null);
    throw new Error('Сесията е изтекла. Влез отново.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || (body.errors || []).join(', ') || `Грешка ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export async function login(username, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  auth.set({ token: data.token, user: data.user });
}

export function logout() {
  auth.set(null);
}

// Offline behavior: the last successful response is cached in localStorage per query.
// On a network error (fetch throws TypeError) we read from the cache instead of
// crashing the view. Writes (create/update/delete) are not queued offline — they just
// show an error; full two-way sync is out of scope for the MVP.
async function fetchTasksWithCache(cacheKey, query) {
  try {
    const tasks = await request(`/tasks${query}`);
    localStorage.setItem(cacheKey, JSON.stringify(tasks));
    return { tasks, offline: false };
  } catch (err) {
    if (err instanceof TypeError) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return { tasks: JSON.parse(cached), offline: true };
    }
    throw err;
  }
}

export function getTasks(date) {
  return fetchTasksWithCache(CACHE_PREFIX + (date || 'all'), date ? `?date=${date}` : '');
}

// Inclusive date range — used by the week and month views instead of one request per
// visible day.
export function getTasksRange(from, to) {
  return fetchTasksWithCache(CACHE_PREFIX + `${from}_${to}`, `?from=${from}&to=${to}`);
}

export function createTask(data) {
  return request('/tasks', { method: 'POST', body: JSON.stringify(data) });
}

export function updateTask(id, data) {
  return request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteTask(id) {
  return request(`/tasks/${id}`, { method: 'DELETE' });
}
