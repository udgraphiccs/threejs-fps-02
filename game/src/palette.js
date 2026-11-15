// The look plan, in one place. Dusk in a freight yard: warm sand and rust against a
// teal night sky, one amber accent for the spike and the HUD. The same names are the
// CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#191512',
  surface: '#262019',
  hairline: '#3d332a',
  ink: '#efe6d4',
  muted: '#a89a80',
  accent: '#e07830',
  teal: '#3fae9e',
  danger: '#d84a3a',
};

export function shade(name) {
  return PALETTE[name];
}
