<script>
  import { auth } from './lib/stores.js';
  import { theme } from './lib/theme.js';
  import LandingPage from './lib/LandingPage.svelte';
  import LoginView from './lib/LoginView.svelte';
  import MainView from './lib/MainView.svelte';
  import SharedCalendarPage from './lib/SharedCalendarPage.svelte';

  // CSS reads this via :root[data-theme="..."] (see app.css) — set on <html> so it's
  // available before any component-level check would run.
  $effect(() => {
    document.documentElement.dataset.theme = $theme;
  });

  // Signed-out visitors land on the marketing page first, not straight on a login form —
  // "Вход"/"Започни безплатно" там е това, което разкрива LoginView. Once $auth is set this
  // stops mattering (MainView takes over below), so there's no need to reset it on logout.
  let showLogin = $state(false);

  // The app's first (and only) path-based route — a public share link
  // (/share/:token, see SharedCalendarPage.svelte + routes/publicShare.js). Whoever
  // received the URL loads it directly and it's a full-page navigation target, not
  // something the app ever navigates to internally, so a one-time check at module init
  // is enough — no need for this to react to later pathname changes in the same session.
  // Takes priority over $auth: the share view must render identically whether or not
  // this browser happens to have its own logged-in session.
  const shareMatch = window.location.pathname.match(/^\/share\/([^/]+)\/?$/);
</script>

{#if shareMatch}
  <SharedCalendarPage token={shareMatch[1]} />
{:else if $auth}
  <MainView />
{:else if showLogin}
  <LoginView onBack={() => (showLogin = false)} />
{:else}
  <LandingPage onEnter={() => (showLogin = true)} />
{/if}
