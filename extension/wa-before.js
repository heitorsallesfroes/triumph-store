// Roda no mundo da página (world MAIN) logo ANTES da biblioteca WA-JS (vendor/wppconnect-wa.js).
// 1) Desliga a telemetria (Google Analytics) e os servidores de terceiros de prévia de link.
// 2) Guarda o window.WPP / window.WPPConfig de outra extensão, se houver, para o wa-bridge.js
//    devolver ao global quando a nossa cópia ficar pronta.
(() => {
  const previousWpp = window.WPP;
  const previousConfig = window.WPPConfig;

  Object.defineProperty(window, '__tspWaBefore', {
    value: { wpp: previousWpp || null, config: previousWpp ? previousConfig || null : null },
    configurable: true,
  });

  window.WPPConfig = {
    ...(window.WPPConfig || {}),
    disableGoogleAnalytics: true,
    linkPreviewApiServers: [],
  };
})();
