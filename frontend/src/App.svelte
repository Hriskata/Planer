<script>
  import { auth } from './lib/stores.js';
  import LoginView from './lib/LoginView.svelte';
  import MainView from './lib/MainView.svelte';
</script>

{#if $auth}
  <MainView />
{:else}
  <LoginView />
{/if}
