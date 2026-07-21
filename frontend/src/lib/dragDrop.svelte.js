// Shared press-and-drag-to-move-day logic for WeekCalendar and MonthCalendar. Pointer
// Events (not the native HTML5 drag-and-drop API) because HTML5 DnD doesn't work
// reliably with touch, which is this app's main input. Only the date changes — there's
// no hour grid anymore, so a drag can't express a new time, just a new day.
const MOVE_THRESHOLD = 6; // px before a press counts as a drag rather than a tap

export function createDragToMove(onMove) {
  let dragState = $state(null); // { task, startX, startY, moved, x, y } | null
  let suppressNextClick = false;

  function handlePointerDown(e, task) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragState = { task, startX: e.clientX, startY: e.clientY, moved: false, x: e.clientX, y: e.clientY };
  }

  function handlePointerMove(e) {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) > MOVE_THRESHOLD) {
      dragState.moved = true;
    }
    if (dragState.moved) {
      dragState.x = e.clientX;
      dragState.y = e.clientY;
      e.preventDefault(); // stop touch-scrolling the grid while actively dragging
    }
  }

  // dropSelector: CSS selector for the drop-target element, which must carry a
  // data-date attribute (e.g. '.day-column' in WeekCalendar, '.day-cell' in MonthCalendar).
  function handlePointerUp(e, dropSelector) {
    if (!dragState) return;
    const { task, moved } = dragState;
    dragState = null;
    if (!moved) return; // a plain tap — the native click handler opens the edit form

    suppressNextClick = true;
    // Browsers only synthesize a trailing "click" when mousedown/mouseup land on the
    // same element — a mouse drag that ends over a different element (the usual case
    // here) gets no such click at all, so nothing would ever call
    // consumeSuppressedClick() to clear the flag. Touch input is the opposite (a click
    // reliably follows), so without this timeout a completed mouse-drag would
    // permanently swallow the next unrelated click anywhere in the calendar.
    setTimeout(() => {
      suppressNextClick = false;
    }, 300);

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const dropEl = target?.closest(dropSelector);
    if (dropEl?.dataset.date && dropEl.dataset.date !== task.date) {
      onMove(task, { date: dropEl.dataset.date });
    }
  }

  function handlePointerCancel() {
    dragState = null;
  }

  // Called at the top of a click handler that might fire right after a completed drag
  // (the browser dispatches a synthetic click following pointerup) — returns true (and
  // clears the flag) exactly once per drag, so that one click is swallowed instead of
  // also opening the edit form or creating a new task on the drop target.
  function consumeSuppressedClick() {
    if (suppressNextClick) {
      suppressNextClick = false;
      return true;
    }
    return false;
  }

  return {
    get dragState() {
      return dragState;
    },
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    consumeSuppressedClick,
  };
}
