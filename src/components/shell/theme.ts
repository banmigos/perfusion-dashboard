export const THEME_STORAGE_KEY = "perfusion-path:theme";

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
