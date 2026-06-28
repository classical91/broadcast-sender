// Only intercept GET requests. POST/uploads (e.g. /send, /send-photo) go
// straight to the network — re-issuing them through the SW intermittently
// fails on iOS Safari with "TypeError: Load failed" even after the request
// has already reached the server, producing false send errors.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request));
});
