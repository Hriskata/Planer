<script>
  import { getHistoryFeed } from './api.js';
  import HistoryList from './HistoryList.svelte';

  // activeCalendarOwnerId: null = your own calendar's activity; otherwise the owner id
  // of a calendar shared with you (see CalendarSwitcher.svelte in MainView's header,
  // shared with this page the same way LibraryPage's client sidebar is).
  let { activeCalendarOwnerId } = $props();

  let entries = $state(null); // null = first load in flight
  let loadingMore = $state(false);
  let error = $state('');
  let exhausted = $state(false); // true once a page comes back shorter than the limit

  const PAGE_SIZE = 50;

  async function loadFirstPage() {
    entries = null;
    exhausted = false;
    error = '';
    try {
      const page = await getHistoryFeed({ calendarOwnerId: activeCalendarOwnerId, limit: PAGE_SIZE });
      entries = page;
      exhausted = page.length < PAGE_SIZE;
    } catch (err) {
      error = err.message;
      entries = [];
    }
  }

  async function loadMore() {
    loadingMore = true;
    try {
      const page = await getHistoryFeed({
        calendarOwnerId: activeCalendarOwnerId,
        before: entries.at(-1)?.id,
        limit: PAGE_SIZE,
      });
      entries = [...entries, ...page];
      exhausted = page.length < PAGE_SIZE;
    } catch (err) {
      error = err.message;
    } finally {
      loadingMore = false;
    }
  }

  $effect(() => {
    activeCalendarOwnerId;
    loadFirstPage();
  });
</script>

<div class="history-feed">
  <h1>Скорошна активност</h1>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
  <HistoryList {entries} showTaskTitle={true} />
  {#if entries?.length && !exhausted}
    <button type="button" class="secondary load-more" onclick={loadMore} disabled={loadingMore}>
      {loadingMore ? 'Зареждане...' : 'Зареди повече'}
    </button>
  {/if}
</div>

<style>
  .history-feed {
    max-width: 640px;
    margin: 0 auto;
    padding: 1.25rem 1rem 3rem;
  }
  h1 {
    font-size: 1.3rem;
    margin: 0 0 1rem;
  }
  .error {
    color: var(--color-danger);
  }
  .load-more {
    display: block;
    margin: 1rem auto 0;
    padding: 0.55rem 1.2rem;
    border-radius: 6px;
    border: 1px solid var(--color-border-strong);
    background: none;
    color: var(--color-text);
    cursor: pointer;
    font-size: 0.9rem;
  }
  .load-more:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
