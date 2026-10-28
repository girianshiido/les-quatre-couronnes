export const COLOR_THEMES = [
  { id: "forest", name: "Forêt", color: "#142326" },
  { id: "midnight", name: "Nuit bleue", color: "#151e35" },
  { id: "parchment", name: "Parchemin", color: "#e9dfc9" },
  { id: "plum", name: "Prune", color: "#302138" },
] as const;
export type ColorTheme = (typeof COLOR_THEMES)[number]["id"];
export function colorTheme(value: unknown): ColorTheme {
  return COLOR_THEMES.some((theme) => theme.id === value)
    ? (value as ColorTheme)
    : "forest";
}
export function applyColorTheme(theme: ColorTheme) {
  document.documentElement.dataset.theme = colorTheme(theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", COLOR_THEMES.find((t) => t.id === theme)!.color);
}
