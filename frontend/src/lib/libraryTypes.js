// Shared between LibraryPage (the type filter tabs) and its upload form.
export const ASSET_TYPES = ['Лого', 'Шрифт', 'Снимка', 'Текст', 'Цвят', 'Друго'];

// 'Текст' assets are typed in directly (no file); everything else expects a file upload.
export function assetTypeIsText(type) {
  return type === 'Текст';
}

// 'Цвят' assets take HEX and/or RGB and/or a reference photo — none required
// individually, but at least one of the three must be filled (enforced both here, for
// the upload form, and again server-side in routes/library.js).
export function assetTypeIsColor(type) {
  return type === 'Цвят';
}
