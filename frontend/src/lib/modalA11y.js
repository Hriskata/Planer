// Shared behavior for every modal dialog in the app (SettingsMenu's 3 modals,
// TaskForm) — previously each was a plain `<div class="overlay">` with no dialog
// semantics: no focus moved into it on open, no focus trap (Tab could escape to
// background content), and no Escape-to-close. Pairs with `role="dialog"
// aria-modal="true"` on the actual dialog element (this action only handles focus/
// keyboard behavior, not ARIA attributes — those stay in the markup since they don't
// change at runtime).
// :not(:disabled) — the pseudo-class, not the [disabled] attribute selector — on
// purpose: a control inside a disabled <fieldset> (see TaskForm's readOnly mode) is
// functionally disabled without carrying its own `disabled` attribute, so [disabled]
// alone misses it. :disabled correctly reflects that inherited state, matching what
// the browser itself uses to decide whether .focus() on the element is a no-op.
const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function focusableIn(node) {
  return Array.from(node.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
  );
}

export function trapFocus(node, params) {
  let onEscape = params?.onEscape;
  // Restored on close — without this, focus silently resets to <body> when a modal
  // opened from a button (e.g. the settings gear) closes, dropping keyboard users back
  // at the top of the page instead of where they were.
  const previouslyFocused = document.activeElement;

  (focusableIn(node)[0] ?? node).focus();

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onEscape?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusableIn(node);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  node.addEventListener('keydown', handleKeydown);

  return {
    update(newParams) {
      onEscape = newParams?.onEscape;
    },
    destroy() {
      node.removeEventListener('keydown', handleKeydown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    },
  };
}
