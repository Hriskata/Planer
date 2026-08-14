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

// Alphabetical (Bulgarian collation), except 'Друго' always sorts last regardless —
// used for both the type-tabs row and the upload form's Тип dropdown, each of which
// mixes its own pseudo-type (Постове/Пост) into the list before calling this, so this
// stays a generic label sorter rather than something tied to ASSET_TYPES specifically.
export function sortAssetTypeLabels(labels) {
  const withoutOther = labels.filter((l) => l !== 'Друго').sort((a, b) => a.localeCompare(b, 'bg'));
  return labels.includes('Друго') ? [...withoutOther, 'Друго'] : withoutOther;
}
