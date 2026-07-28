import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// In dev/preview there is no nginx in front to substitute the __BASE_PATH__
// placeholder (see index.html, docker/nginx/default.conf), so strip it and
// serve at root.
function stripBasePathPlaceholder() {
  return {
    name: 'strip-base-path-placeholder',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace('__BASE_PATH__', '');
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), stripBasePathPlaceholder()],
  base: './',
})
