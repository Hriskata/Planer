// Shared between LibraryPage (the type filter tabs) and its upload form.
export const ASSET_TYPES = ['Лого', 'Шрифт', 'Снимка', 'Текст', 'Друго'];

// 'Текст' assets are typed in directly (no file); everything else expects a file upload.
export function assetTypeIsText(type) {
  return type === 'Текст';
}
