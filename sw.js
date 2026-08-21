// Service Worker de Centinela — hace que el sistema funcione sin internet,
// pero SIN quedarse pegado mostrando una versión vieja cuando sí hay conexión.
//
// Dos estrategias distintas según qué se pide:
//
// 1) El código propio de la app (el HTML, y cualquier .js/.json del mismo
//    sitio) -> "red primero": si hay internet, siempre trae la versión más
//    reciente de GitHub. Si no hay internet, usa la última copia guardada.
//    Así nunca hace falta limpiar caché a mano para ver cambios nuevos.
//
// 2) Las librerías externas pesadas (html5-qrcode, Tesseract, pdf.js) -> se
//    quedan con "caché primero", porque esas casi no cambian nunca y así se
//    cargan al instante, sin gastar datos revisándolas cada vez.

const CACHE_NAME = 'centinela-cache-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((n) => n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

function esArchivoPropio(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (esArchivoPropio(event.request)) {
    // Red primero, con la copia guardada como respaldo si no hay internet.
    event.respondWith(
      fetch(event.request)
        .then((respuesta) => {
          if (respuesta && respuesta.status === 200) {
            const copia = respuesta.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          }
          return respuesta;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Librerías externas: caché primero, y si no está guardada, se busca en
  // internet y se guarda para la próxima vez.
  event.respondWith(
    caches.match(event.request).then((guardado) => {
      if (guardado) return guardado;
      return fetch(event.request)
        .then((respuesta) => {
          if (respuesta && respuesta.status === 200) {
            const copia = respuesta.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          }
          return respuesta;
        })
        .catch(() => new Response(
          'Sin conexión, y este recurso todavía no se guardó en el celular. Abrí la app una vez con internet para que quede disponible offline.',
          { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        ));
    })
  );
});
