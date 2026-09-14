// NEXT_PUBLIC_CIRCLE_APP_ID: the Web SDK app ID from the Circle Developer
// Console (console.circle.com → Configurator) — safe to expose client-side.
// NEXT_PUBLIC_CIRCLE_BACKEND_URL: where backend/server.mjs is running
// (defaults to the local dev server started via `npm run server`).
export const CIRCLE_APP_ID = import.meta.env.NEXT_PUBLIC_CIRCLE_APP_ID || null;
export const CIRCLE_BACKEND_URL = import.meta.env.NEXT_PUBLIC_CIRCLE_BACKEND_URL || 'http://localhost:8787';
export const CIRCLE_BACKEND_IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/.test(CIRCLE_BACKEND_URL);

// A stable, deterministic Circle userId for a given external wallet
// address, so the same wallet always maps to the same Circle user across
// sessions without needing a separate account/login system.
export function circleUserIdFor(address) {
  return 'rf-' + address.toLowerCase().replace(/^0x/, '');
}
