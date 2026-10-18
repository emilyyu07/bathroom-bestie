/**
 * BathroomBestie's look: butter yellow and blush pink, deep raspberry for the actions that matter.
 * Every text/background pair here is at least 4.5:1 contrast (WCAG AA for body text).
 */
export const color = {
  bg: "#FFF7E1", // butter yellow: every screen
  card: "#FFFFFF",
  blush: "#FDE4EE", // soft pink: secondary buttons, gentle highlights
  blushBorder: "#F7C6D9",
  butter: "#FFE38A", // selected chips, small highlights
  primary: "#C2185B", // deep raspberry: the important buttons (white text 5.9:1)
  primaryPressed: "#9C1149",
  withHer: "#F48FB1", // "I'm with her": soft pink, the logo's right circle (deep-berry text 4.8:1)
  withHerPressed: "#F9B4CC", // lighter when pressed, so the text keeps its contrast
  worry: "#7A0E3A", // "I'm worried": very dark pink, the logo's overlap (white 10.8:1)
  worryPressed: "#5C0A2B",
  honey: "#9A5B00", // the "!" on pre-flight tips
  berry: "#8E1046", // the most serious alert cards (rung 4)
  text: "#3D1A2B", // deep plum
  muted: "#7A4A5E",
  placeholder: "#B596A4", // example text in an empty box: clearly lighter than anything typed
  error: "#B3261E",
  white: "#FFFFFF",
} as const;

/**
 * Nunito: rounded and friendly, loaded in root.tsx. Android drops a custom font when a style also
 * sets fontWeight, so with Nunito loaded a style names the weight's own font file only; if Nunito
 * isn't available (failed or slow to load) it falls back to the system font at the same weight.
 */
let nunito = false;
/** Called by root.tsx once it knows whether Nunito loaded. */
export const setNunitoLoaded = (loaded: boolean) => {
  nunito = loaded;
};
type FontStyle = { fontFamily?: string; fontWeight?: "400" | "600" | "700" | "800" };
const pick = (family: string, weight: NonNullable<FontStyle["fontWeight"]>): FontStyle =>
  nunito ? { fontFamily: family } : { fontWeight: weight };
export const font = {
  get regular() {
    return pick("Nunito_400Regular", "400");
  },
  get semibold() {
    return pick("Nunito_600SemiBold", "600");
  },
  get bold() {
    return pick("Nunito_700Bold", "700");
  },
  get extrabold() {
    return pick("Nunito_800ExtraBold", "800");
  },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { card: 20, button: 999, chip: 999, field: 14, inset: 14 } as const;

/**
 * The type scale. Every piece of text uses one of these sizes (via ui.tsx), so screens line up and
 * nothing is smaller than 13. Line heights are ~1.4x for easy reading.
 */
export const type = {
  display: { fontSize: 32, lineHeight: 38 },
  title: { fontSize: 26, lineHeight: 32 },
  heading: { fontSize: 18, lineHeight: 24 },
  body: { fontSize: 16, lineHeight: 23 },
  small: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 13, lineHeight: 18 },
} as const;
