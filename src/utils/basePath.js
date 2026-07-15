/**
 * Runtime base path the app is mounted under, resolved from the <base href>
 * tag nginx injects from the reverse proxy's X-Forwarded-Prefix header (see
 * docker/nginx/default.conf). Falls back to root when the tag is missing or
 * still holds the unsubstituted build placeholder (local `vite dev`/tests).
 */
export function getRuntimeBasePath() {
  const href = document.querySelector('base')?.getAttribute('href') || '/';

  if (!href || href.includes('__BASE_PATH__')) return '/';

  const withLeadingSlash = href.startsWith('/') ? href : `/${href}`;
  const collapsed = withLeadingSlash.replace(/\/+/g, '/');
  return collapsed.endsWith('/') ? collapsed : `${collapsed}/`;
}
