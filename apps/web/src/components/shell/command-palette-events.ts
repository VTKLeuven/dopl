/** Decoupled trigger so any component can open ⌘K without prop drilling. */
export const OPEN_PALETTE_EVENT = "dopl:open-command-palette";

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
}
