<script>
  import { auth } from './lib/stores.js';
  import { theme } from './lib/theme.js';
  import LandingPage from './lib/LandingPage.svelte';
  import LoginView from './lib/LoginView.svelte';
  import MainView from './lib/MainView.svelte';

  // CSS reads this via :root[data-theme="..."] (see app.css) — set on <html> so it's
  // available before any component-level check would run.
  $effect(() => {
    document.documentElement.dataset.theme = $theme;
  });

  // Signed-out visitors land on the marketing page first, not straight on a login form —
  // "Вход"/"Започни безплатно" there is what reveals LoginView. Once $auth is set this
  // stops mattering (MainView takes over below), so there's no need to reset it on logout.
  let showLogin = $state(false);
</script>

{#if $auth}
  <MainView />
{:else if showLogin}
  <LoginView onBack={() => (showLogin = false)} />
{:else}
  <LandingPage onEnter={() => (showLogin = true)} />
{/if}
