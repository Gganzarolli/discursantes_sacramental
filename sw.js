const CACHE_NAME = "discursantes-v5";
const APP_SHELL = ["./", "./index.html", "./app.js", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estratégia: network-first para os dados (CSV do Google Sheets fica sempre externo,
// não é cacheado aqui de propósito — precisamos sempre da versão mais recente).
// Para o app shell, cache-first com fallback de rede.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Só mexe em requisições do PRÓPRIO site (mesma origem). Qualquer coisa
  // externa (Google Sheets, etc) passa direto pela rede, sem cache.
  if (url.origin !== self.location.origin) return;

  const isAppShell = APP_SHELL.some((p) => {
    const clean = p === "./" ? "" : p.replace("./", "");
    return clean === "" ? url.pathname.endsWith("/") : url.pathname.endsWith(clean);
  });

  if (isAppShell) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
