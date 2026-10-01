/* Auto-update: GitHub Pages caches files for ~10 min (longer for home-screen apps).
   Compare the running version with version.json and reload once when a newer one is live.
   Version strings are rewritten by bump-version.sh — don't edit by hand. */

const APP_VERSION = '20261001-1555';
const RELOADED_KEY = 'reloaded-for-version';

async function checkForUpdate() {
  try {
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const { version } = await res.json();
    if (!version || version === APP_VERSION) return;
    // reload at most once per new version, in case the CDN still serves the old page
    if (sessionStorage.getItem(RELOADED_KEY) === version) return;
    sessionStorage.setItem(RELOADED_KEY, version);
    location.reload();
  } catch (e) { /* offline or storage blocked: keep running the current version */ }
}

try {
  if (sessionStorage.getItem(RELOADED_KEY) === APP_VERSION) {
    sessionStorage.removeItem(RELOADED_KEY);
    toast('已更新到最新版本');
  }
} catch (e) {}

checkForUpdate();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate();
});
