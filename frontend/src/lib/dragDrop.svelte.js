// Shared press-and-drag-to-move-day logic — a genuine singleton (not a factory), because
// a drag can start in one component (e.g. the backlog column) and end in a different one
// (e.g. WeekCalendar's grid), so every consumer must see the exact same in-flight drag,
// not an independent copy. Pointer Events, not the native HTML5 drag-and-drop API,
// because HTML5 DnD doesn't work reliably with touch, this app's main input.
const MOVE_THRESHOLD = 6; // px before a press counts as a drag rather than a tap

// Sentinel data-date value marking the "unscheduled" drop zone (the backlog column) —
// dropping there clears the task's date instead of setting it to a specific day.
export const UNSCHEDULED = '__unscheduled__';

// Every element a task can be dropped onto, app-wide: week view's day columns, month
// view's day cells, and the backlog column (all three carry a data-date attribute).
export const DROP_TARGET_SELECTOR = '.day-column, .day-cell, .backlog';

let dragState = $state(null); // { task, startX, startY, moved, x, y } | null
let suppressNextClick = false;

export function getDragState() {
  return dragState;
}

export function handlePointerDown(e, task) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  dragState = { task, startX: e.clientX, startY: e.clientY, moved: false, x: e.clientX, y: e.clientY };
}

export function handlePointerMove(e) {
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

// onMove: (task, { date }) => void — called only when the drop target's date actually
// differs from the task's current one (dropping back where it started is a no-op).
export function handlePointerUp(e, onMove) {
  if (!dragState) return;
  const { task, moved } = dragState;
  dragState = null;
  if (!moved) return; // a plain tap — the native click handler opens the edit form

  suppressNextClick = true;
  // Browsers only synthesize a trailing "click" when mousedown/mouseup land on the same
  // element — a mouse drag that ends over a different element (the usual case here)
  // gets no such click at all, so nothing would ever call consumeSuppressedClick() to
  // clear the flag. Touch input is the opposite (a click reliably follows), so without
  // this timeout a completed mouse-drag would permanently swallow the next unrelated
  // click anywhere in the calendar.
  setTimeout(() => {
    suppressNextClick = false;
  }, 300);

  const target = document.elementFromPoint(e.clientX, e.clientY);
  const dropEl = target?.closest(DROP_TARGET_SELECTOR);
  if (!dropEl || dropEl.dataset.date === undefined) return;
  const newDate = dropEl.dataset.date === UNSCHEDULED ? null : dropEl.dataset.date;
  if (newDate !== (task.date ?? null)) {
    onMove(task, { date: newDate });
  }
}

export function handlePointerCancel() {
  dragState = null;
}

// Called at the top of a click handler that might fire right after a completed drag
// (the browser dispatches a synthetic click following pointerup) — returns true (and
// clears the flag) exactly once per drag, so that one click is swallowed instead of
// also opening the edit form or creating a new task on the drop target.
export function consumeSuppressedClick() {
  if (suppressNextClick) {
    suppressNextClick = false;
    return true;
  }
  return false;
}
