<script>
  import { auth } from './lib/stores.js';
  import { theme } from './lib/theme.js';
  import LoginView from './lib/LoginView.svelte';
  import MainView from './lib/MainView.svelte';

  // CSS reads this via :root[data-theme="..."] (see app.css) — set on <html> so it's
  // available before any component-level check would run.
  $effect(() => {
    document.documentElement.dataset.theme = $theme;
  });
</script>

{#if $auth}
  <MainView />
{:else}
  <LoginView />
{/if}
