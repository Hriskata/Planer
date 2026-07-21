import { writable } from 'svelte/store';

const STORAGE_KEY = 'planer_theme';

function loadTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // ignore — falls through to the system preference below
  }
  // No explicit choice yet — default to whatever the OS/browser already prefers.
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// 'light' | 'dark', persisted so the choice survives a reload.
export const theme = writable(loadTheme());

theme.subscribe((value) => {
  localStorage.setItem(STORAGE_KEY, value);
});

export function toggleTheme() {
  theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
}
