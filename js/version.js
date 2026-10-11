/* Centrale versie-informatie voor alle Reisblik-pagina's. */
(async function () {
  try {
    const response = await fetch('./config/version.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const info = await response.json();
    if (!info || !info.version) throw new Error('Versienummer ontbreekt');
    document.querySelectorAll('[data-reisblik-version], .version-inline, .version').forEach((el) => {
      const prefix = el.getAttribute('data-version-prefix');
      if (prefix !== null) el.textContent = prefix + info.version;
      else if (el.classList.contains('version')) el.textContent = 'Reisblik ' + info.version;
      else el.textContent = 'app v' + info.version;
    });
    document.documentElement.dataset.reisblikVersion = info.version;
    let previousVersion = null;
    try { previousVersion = localStorage.getItem('reisblik_centrale_versie_v1'); } catch (_) {}
    if (previousVersion !== info.version && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'REISBLIK_VERSION_SEEN', version: info.version });
    }
    try { localStorage.setItem('reisblik_centrale_versie_v1', info.version); } catch (_) {}
  } catch (error) {
    console.warn('Centrale Reisblik-versie kon niet worden geladen:', error);
  }
})();
