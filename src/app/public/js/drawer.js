// ── Drawer open / close ──────────────────────────────────────────────────────
import { state } from './state.js';

export function openDrawer() {
  document.getElementById('overlay').classList.add('show');
  document.getElementById('drawer').classList.add('open');
}

export function closeDrawer() {
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('drawer').classList.remove('open');
  state.drawerMode = null;
  state.drawerKey  = null;
}
