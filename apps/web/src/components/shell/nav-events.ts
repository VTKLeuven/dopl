export const OPEN_NAV_EVENT = "dopl:open-nav";
export function openMobileNav() {
  window.dispatchEvent(new CustomEvent(OPEN_NAV_EVENT));
}
