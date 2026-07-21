import { writable } from 'svelte/store';

const STORAGE_KEY = 'planer_auth';

function loadAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// { token, user } when logged in, otherwise null. Persisted to localStorage so
// the user stays logged in after closing the app (the token is valid for 30 days).
export const auth = writable(loadAuth());

auth.subscribe((value) => {
  if (value) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
});
