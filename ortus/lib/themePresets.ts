export type ThemeId = 'blue' | 'emerald' | 'purple' | 'rose' | 'slate';

export const THEME_OPTIONS: { value: ThemeId; label: string }[] = [
  { value: 'blue', label: 'Azul (padrão)' },
  { value: 'emerald', label: 'Verde' },
  { value: 'purple', label: 'Roxo' },
  { value: 'rose', label: 'Rosa' },
  { value: 'slate', label: 'Cinza' },
];

export function applyTheme(themeId: ThemeId | string | undefined) {
  if (typeof document === 'undefined') return;
  const id = (THEME_OPTIONS.some((t) => t.value === themeId) ? themeId : 'blue') as ThemeId;
  document.documentElement.setAttribute('data-theme', id);
}
