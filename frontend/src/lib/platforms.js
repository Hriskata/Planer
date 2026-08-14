// Shared between TaskForm (the field itself) and anywhere else that might want the
// same fixed list. 'Други' is a UI-only sentinel — never stored as-is, see TaskForm's
// handling of the free-text field that appears when it's selected.
export const PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'LinkedIn', 'X', 'Google'];
export const PLATFORM_OTHER = 'Други';
