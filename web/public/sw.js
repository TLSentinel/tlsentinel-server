// TLSentinel service worker.
//
// Minimum required for PWA install qualification: a registered service worker
// with a `fetch` handler. We deliberately do not cache anything yet — the
// network is the source of truth, and a stale UI showing yesterday's cert
// state is worse than a "no internet" error. When push notifications land,
// the `push` and `notificationclick` handlers will join `fetch` here.
//
// Service workers don't go through Vite's bundler, so this file ships as-is
// from /public.

self.addEventListener('install', () => {
  // Activate this worker immediately on first install instead of waiting for
  // every existing tab to close. New deploys still wait for the next reload.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Take control of any tabs already open under this scope so the freshly
  // activated worker handles their fetches without a reload.
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Pass-through. Required for the install-prompt heuristic on Chromium —
  // the browser checks that the SW handles fetch events at all, not what it
  // does with them.
})
