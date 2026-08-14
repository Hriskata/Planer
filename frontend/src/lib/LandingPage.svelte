<script>
  import Icon from './Icon.svelte';
  import { theme, toggleTheme } from './theme.js';

  let { onEnter } = $props();
</script>

<div class="landing">
  <header class="topbar">
    <span class="wordmark">Планер</span>
    <div class="topbar-actions">
      <button
        class="theme-toggle"
        onclick={toggleTheme}
        aria-label={$theme === 'dark' ? 'Светла тема' : 'Тъмна тема'}
        title={$theme === 'dark' ? 'Светла тема' : 'Тъмна тема'}
      >
        <Icon name={$theme === 'dark' ? 'sun' : 'moon'} size="1.05rem" />
      </button>
      <button class="cta-small" onclick={onEnter}>Вход</button>
    </div>
  </header>

  <section class="hero">
    <div class="hero-copy">
      <h1>Планирай съдържанието си на едно място</h1>
      <p class="lead">
        Календар за екипи, които създават съдържание — Reel, Post, Story, Carrousel — с
        приоритети, напомняния и автоматизации, вместо разпилени бележки и таблици.
      </p>
      <button class="cta" onclick={onEnter}>Започни безплатно</button>
    </div>
    <div class="hero-shot">
      <img src="/landing/hero.png" alt="Месечен изглед на календара на Планер" />
    </div>
  </section>

  <section class="features">
    <div class="feature">
      <div class="feature-shot">
        <img src="/landing/calendar.png" alt="Седмичен изглед с оцветени постове по тип" />
      </div>
      <div class="feature-copy">
        <h2>Изглед по ден, седмица или месец</h2>
        <p>
          Превключваш моментално между трите — плъзгаш пост от неразпределените направо в
          деня, който ти трябва.
        </p>
      </div>
    </div>

    <div class="feature reverse">
      <div class="feature-shot">
        <img src="/landing/organize.png" alt="Постове, оцветени по тип, с индикатор за приоритет" />
      </div>
      <div class="feature-copy">
        <h2>Организация с един поглед</h2>
        <p>
          Всеки тип съдържание си има цвят; приоритет от P1 до P4 показва кое спешно
          трябва внимание, без да отваряш поста.
        </p>
      </div>
    </div>

    <div class="feature">
      <div class="feature-icons">
        <span class="icon-badge"><Icon name="mail" size="1.6rem" /></span>
        <span class="icon-badge"><Icon name="check-circle" size="1.6rem" /></span>
      </div>
      <div class="feature-copy">
        <h2>Автоматизации, не напомняния в главата ти</h2>
        <p>
          Push известие преди часа на поста, и по избор — автоматичен имейл до когото
          трябва, веднага щом отметнеш нещо като завършено.
        </p>
      </div>
    </div>
  </section>

  <section class="final-cta">
    <h2>Готов ли си?</h2>
    <button class="cta" onclick={onEnter}>Влез в Планер</button>
  </section>
</div>

<style>
  .landing {
    min-height: 100vh;
    min-height: 100dvh;
    background: var(--color-bg);
    color: var(--color-text);
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    padding-top: calc(1rem + env(safe-area-inset-top, 0px));
    max-width: 1100px;
    margin: 0 auto;
  }
  .wordmark {
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--color-accent);
  }
  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .theme-toggle {
    color: var(--color-text-muted);
    background: none;
    border: 1.5px solid var(--color-border);
    border-radius: 999px;
    width: 2.1rem;
    height: 2.1rem;
    line-height: 1;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .theme-toggle:hover {
    background: var(--color-accent-tint);
    color: var(--color-accent);
  }
  .cta-small {
    padding: 0.5rem 1.1rem;
    font-size: 0.9rem;
    font-weight: 600;
    background: none;
    color: var(--color-accent);
    border: 1.5px solid var(--color-accent);
    border-radius: 8px;
    cursor: pointer;
  }
  .cta-small:hover {
    background: var(--color-accent-tint);
  }
  .hero {
    display: flex;
    align-items: center;
    gap: 2.5rem;
    max-width: 1100px;
    margin: 0 auto;
    padding: 3rem 1.5rem 4rem;
  }
  .hero-copy {
    flex: 1;
    min-width: 0;
  }
  .hero h1 {
    font-size: clamp(1.8rem, 4vw, 2.6rem);
    line-height: 1.15;
    margin: 0 0 1rem;
    letter-spacing: -0.02em;
  }
  .lead {
    font-size: 1.05rem;
    line-height: 1.6;
    color: var(--color-text-muted);
    margin: 0 0 1.75rem;
    max-width: 46ch;
  }
  .cta {
    padding: 0.85rem 1.75rem;
    font-size: 1rem;
    font-weight: 700;
    background: var(--color-accent);
    color: white;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .cta:hover {
    background: var(--color-accent-hover);
  }
  .hero-shot {
    flex: 1.2;
    min-width: 0;
  }
  .hero-shot img,
  .feature-shot img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 14px;
    border: 1px solid var(--color-border);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
  }
  .features {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1rem 1.5rem 4rem;
    display: flex;
    flex-direction: column;
    gap: 4rem;
  }
  .feature {
    display: flex;
    align-items: center;
    gap: 2.5rem;
  }
  .feature.reverse {
    flex-direction: row-reverse;
  }
  .feature-shot,
  .feature-icons {
    flex: 1;
    min-width: 0;
  }
  .feature-icons {
    display: flex;
    gap: 1rem;
  }
  .icon-badge {
    width: 4rem;
    height: 4rem;
    border-radius: 14px;
    background: var(--color-accent-tint);
    color: var(--color-accent);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .feature-copy {
    flex: 1;
    min-width: 0;
  }
  .feature-copy h2 {
    font-size: 1.4rem;
    margin: 0 0 0.6rem;
    letter-spacing: -0.01em;
  }
  .feature-copy p {
    font-size: 0.98rem;
    line-height: 1.6;
    color: var(--color-text-muted);
    margin: 0;
  }
  .final-cta {
    text-align: center;
    padding: 3rem 1.5rem 5rem;
  }
  .final-cta h2 {
    font-size: 1.5rem;
    margin: 0 0 1.25rem;
  }
  @media (max-width: 760px) {
    .hero,
    .feature,
    .feature.reverse {
      flex-direction: column;
      align-items: stretch;
      text-align: left;
    }
    .lead {
      max-width: none;
    }
  }
</style>
