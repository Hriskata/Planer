import { get } from 'svelte/store';
import { auth } from './stores.js';

const CACHE_PREFIX = 'planer_tasks_cache_';

// Shared by request() below and the two multipart upload functions (uploadImage,
// uploadLibraryAsset), which can't go through request() itself — see the comment on
// uploadImage for why. Reads whichever shape the backend used (a single `error` string,
// or tasks.js's validation `errors` array) so no call site has to know which.
async function throwApiError(res) {
  const body = await res.json().catch(() => ({}));
  throw new Error(body.error || (body.errors || []).join(', ') || `Грешка ${res.status}`);
}

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

  if (!res.ok) await throwApiError(res);

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

export async function loginWithGoogle(credential) {
  const data = await request('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
  auth.set({ token: data.token, user: data.user });
}

// Public (no token needed) — used before the user is logged in, to decide whether to
// render the "Sign in with Google" button at all.
export async function getGoogleClientId() {
  const res = await fetch('/api/auth/google-client-id');
  const { clientId } = await res.json();
  return clientId;
}

export function logout() {
  auth.set(null);
}

// Offline behavior: the last successful response is cached in localStorage per query.
// On a network error (fetch throws TypeError) we read from the cache instead of
// crashing the view. Writes (create/update/delete) are not queued offline — they just
// show an error; full two-way sync is out of scope for the MVP.
//
// Bounded LRU: every distinct date/range/calendar-owner combination gets its own cache
// key (see getTasks/getTasksRange/getUnscheduledTasks below), and switching weeks/
// months/shared calendars over months of daily PWA use would otherwise pile up
// localStorage entries forever — small individually, but localStorage's per-origin
// quota is tight enough that "forever" is a real problem for an app people keep
// installed long-term. MAX_CACHE_ENTRIES caps it; least-recently-used ones are evicted.
const CACHE_ORDER_KEY = 'planer_tasks_cache_order';
const MAX_CACHE_ENTRIES = 30;

function touchCacheKey(cacheKey) {
  let order = [];
  try {
    order = JSON.parse(localStorage.getItem(CACHE_ORDER_KEY)) || [];
  } catch {
    order = [];
  }
  order = order.filter((k) => k !== cacheKey);
  order.push(cacheKey);
  while (order.length > MAX_CACHE_ENTRIES) {
    localStorage.removeItem(order.shift());
  }
  localStorage.setItem(CACHE_ORDER_KEY, JSON.stringify(order));
}

async function fetchTasksWithCache(cacheKey, path) {
  try {
    const tasks = await request(path);
    localStorage.setItem(cacheKey, JSON.stringify(tasks));
    touchCacheKey(cacheKey);
    return { tasks, offline: false };
  } catch (err) {
    if (err instanceof TypeError) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return { tasks: JSON.parse(cached), offline: true };
    }
    throw err;
  }
}

// calendarOwnerId: viewing your own calendar (the default, undefined/null) vs. someone
// else's shared with you (see CalendarSwitcher.svelte) — folded into both the request
// query string and the cache key, so switching calendars can't show the wrong person's
// cached tasks while offline.
function calendarSuffix(calendarOwnerId) {
  return calendarOwnerId ? `calendar=${calendarOwnerId}` : '';
}

export function getTasks(date, calendarOwnerId) {
  const params = [date && `date=${date}`, calendarSuffix(calendarOwnerId)].filter(Boolean).join('&');
  return fetchTasksWithCache(
    CACHE_PREFIX + (date || 'all') + (calendarOwnerId ? `_cal${calendarOwnerId}` : ''),
    `/tasks${params ? `?${params}` : ''}`
  );
}

// Inclusive date range — used by the week and month views instead of one request per
// visible day.
export function getTasksRange(from, to, calendarOwnerId) {
  const params = [`from=${from}`, `to=${to}`, calendarSuffix(calendarOwnerId)].filter(Boolean).join('&');
  return fetchTasksWithCache(
    CACHE_PREFIX + `${from}_${to}` + (calendarOwnerId ? `_cal${calendarOwnerId}` : ''),
    `/tasks?${params}`
  );
}

// Tasks with no date — the backlog column shown beside every view, independent of
// whatever date range is currently displayed.
export function getUnscheduledTasks(calendarOwnerId) {
  const params = calendarSuffix(calendarOwnerId);
  return fetchTasksWithCache(
    CACHE_PREFIX + 'unscheduled' + (calendarOwnerId ? `_cal${calendarOwnerId}` : ''),
    `/tasks/unscheduled${params ? `?${params}` : ''}`
  );
}

// Every task (scheduled or not) for one client, regardless of date — powers the
// "Постове" tab in LibraryPage. client='' (the "Всички клиенти" sidebar selection)
// omits the filter entirely, returning every task for the calendar instead. Not
// offline-cached like the calendar views above; it's a secondary lookup, same
// reasoning as the library asset functions below.
export function getTasksByClient(client, calendarOwnerId) {
  const params = [client && `client=${encodeURIComponent(client)}`, calendarSuffix(calendarOwnerId)]
    .filter(Boolean)
    .join('&');
  return request(`/tasks${params ? `?${params}` : ''}`);
}

// Distinct clients pulled from tasks, not library_assets — merged with the library's
// own client list in LibraryPage so a client only ever mentioned in the calendar still
// shows up in the library sidebar.
export function getTaskClients(calendarOwnerId) {
  const params = calendarSuffix(calendarOwnerId);
  return request(`/tasks/clients${params ? `?${params}` : ''}`);
}

// Separate from request() on purpose: file uploads need multipart/form-data with a
// browser-generated boundary, which only happens if we DON'T set Content-Type
// ourselves (request() always sends application/json). Returns { path }.
export async function uploadImage(file) {
  const current = get(auth);
  const formData = new FormData();
  formData.append('image', file);
  const headers = {};
  if (current?.token) headers.Authorization = `Bearer ${current.token}`;

  const res = await fetch('/api/uploads', { method: 'POST', body: formData, headers });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export async function getVapidPublicKey() {
  const { publicKey } = await request('/push/vapid-public-key');
  return publicKey;
}

export function subscribePush(subscription) {
  return request('/push/subscribe', { method: 'POST', body: JSON.stringify(subscription) });
}

export function unsubscribePush(endpoint) {
  return request('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) });
}

export async function getNotificationSettings() {
  return request('/push/settings');
}

export function updateNotificationSettings(reminderMinutes) {
  return request('/push/settings', { method: 'PUT', body: JSON.stringify({ reminderMinutes }) });
}

export async function getEmailSenderSettings() {
  return request('/account/email-sender');
}

// appPassword omitted = leave the stored one untouched; '' = clear it.
export function updateEmailSenderSettings({ email, appPassword }) {
  return request('/account/email-sender', { method: 'PUT', body: JSON.stringify({ email, appPassword }) });
}

// Calendars I've granted access to (for managing them in Settings).
export function getMyShares() {
  return request('/sharing/shares');
}

export function addCalendarShare(email) {
  return request('/sharing/shares', { method: 'POST', body: JSON.stringify({ email }) });
}

export function removeCalendarShare(id) {
  return request(`/sharing/shares/${id}`, { method: 'DELETE' });
}

// Calendars shared WITH me — powers the calendar switcher in the header.
export function getSharedWithMe() {
  return request('/sharing/shared-with-me');
}

// Library assets aren't cached offline (unlike tasks) — it's a secondary, occasionally
// used feature, so a plain request() with its normal error-on-failure behavior is fine.
export function getLibraryAssets(calendarOwnerId) {
  const params = calendarSuffix(calendarOwnerId);
  return request(`/library${params ? `?${params}` : ''}`);
}

// Same multipart reasoning as uploadImage() — Content-Type must be left for the browser
// to set (with its boundary), not forced to application/json like request() does.
// `file` is optional (text/color-only assets may have none); everything else is a
// plain string. hexCode/rgbValue are 'Цвят'-only, blank for every other type.
export async function uploadLibraryAsset({ client, type, title, file, textContent, hexCode, rgbValue }, calendarOwnerId) {
  const current = get(auth);
  const formData = new FormData();
  formData.append('client', client);
  formData.append('type', type);
  formData.append('title', title);
  if (textContent) formData.append('text_content', textContent);
  if (hexCode) formData.append('hex_code', hexCode);
  if (rgbValue) formData.append('rgb_value', rgbValue);
  if (file) formData.append('file', file);

  const headers = {};
  if (current?.token) headers.Authorization = `Bearer ${current.token}`;

  const params = calendarSuffix(calendarOwnerId);
  const res = await fetch(`/api/library${params ? `?${params}` : ''}`, { method: 'POST', body: formData, headers });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export function deleteLibraryAsset(id) {
  return request(`/library/${id}`, { method: 'DELETE' });
}

// My outgoing client share links (Библиотеки's "Сподели с клиента" action).
export function getMyShareLinks() {
  return request('/share-links');
}

export function createShareLink(client) {
  return request('/share-links', { method: 'POST', body: JSON.stringify({ client }) });
}

export function revokeShareLink(id) {
  return request(`/share-links/${id}`, { method: 'DELETE' });
}

// Public, unauthenticated — powers SharedCalendarPage.svelte (/share/:token). Deliberately
// NOT going through request(): that helper always reads the auth store and would attach a
// Bearer header if the visitor happens to be logged in on that browser, which is harmless
// server-side (publicShare.js never checks it) but conceptually wrong for a route that must
// behave identically whether or not anyone is logged in. Not offline-cached either — same
// reasoning as getTasksByClient, plus caching under a guessable-ish key risks a stale/wrong
// client's tasks surviving the link's revocation.
export async function getPublicShareLink(token) {
  const res = await fetch(`/api/public-share/${encodeURIComponent(token)}`);
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export async function getPublicShareTasks(token) {
  const res = await fetch(`/api/public-share/${encodeURIComponent(token)}/tasks`);
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export function createTask(data) {
  return request('/tasks', { method: 'POST', body: JSON.stringify(data) });
}

export function updateTask(id, data) {
  return request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

// Bulk-edit "this and all following" / "the entire series" (see SeriesScopeDialog.svelte).
// `id` is the anchor occurrence the user was looking at when they chose the scope;
// "just this one" never calls this — it goes through updateTask() with series_id: null.
export function updateSeriesScope(id, scope, data) {
  return request(`/tasks/${id}/series?scope=${scope}`, { method: 'PUT', body: JSON.stringify(data) });
}

// Bulk-delete "this and all following" / "the entire series"; "just this one" uses the
// plain deleteTask() below.
export function deleteSeriesScope(id, scope) {
  return request(`/tasks/${id}/series?scope=${scope}`, { method: 'DELETE' });
}

export function deleteTask(id) {
  return request(`/tasks/${id}`, { method: 'DELETE' });
}

// Audit history for one task (TaskForm's "История" button). Not offline-cached — same
// occasional-feature reasoning as getTasksByClient/library above.
export function getTaskHistory(id) {
  return request(`/tasks/${id}/history`);
}

// Global "Скорошна активност" feed (HistoryFeedPage.svelte) — before is a history row
// id (keyset pagination cursor), not a timestamp; omit for the first/most-recent page.
export function getHistoryFeed({ calendarOwnerId, before, limit } = {}) {
  const params = [calendarSuffix(calendarOwnerId), before && `before=${before}`, limit && `limit=${limit}`]
    .filter(Boolean)
    .join('&');
  return request(`/tasks/history${params ? `?${params}` : ''}`);
}

// Comment thread (CommentsDialog.svelte), authed/owner side. approval_status itself has
// no dedicated function here — the owner changes it through the existing updateTask(id,
// { approval_status }), same as any other task field (see tasks.js's applyTaskUpdate).
export function getTaskComments(id) {
  return request(`/tasks/${id}/comments`);
}

export function postTaskComment(id, body) {
  return request(`/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
}

// Public, unauthenticated equivalents — same bare-fetch/no-request()/no-offline-cache
// reasoning as getPublicShareLink/getPublicShareTasks above (must behave identically
// whether or not the visitor happens to be logged in on that browser).
export async function getPublicTaskComments(token, taskId) {
  const res = await fetch(`/api/public-share/${encodeURIComponent(token)}/tasks/${taskId}/comments`);
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export async function postPublicTaskComment(token, taskId, body) {
  const res = await fetch(`/api/public-share/${encodeURIComponent(token)}/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export async function updatePublicApprovalStatus(token, taskId, status) {
  const res = await fetch(`/api/public-share/${encodeURIComponent(token)}/tasks/${taskId}/approval-status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}
