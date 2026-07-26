import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const SITE_ORIGIN = 'https://11-web-keyboard-practice.vercel.app';

/**
 * Every routable page, extensionless (Vercel `cleanUrls` serves
 * `<slug>/index.html` at `/<slug>` and 308s the .html form). Single source
 * of truth for both the multi-page build inputs and the build-time sitemap.
 */
const PAGES = [
  { route: '/', file: 'index.html' },
  { route: '/typing-test', file: 'typing-test/index.html' },
  { route: '/typing-accuracy-test', file: 'typing-accuracy-test/index.html' },
  { route: '/code-typing-practice', file: 'code-typing-practice/index.html' },
  {
    route: '/python-typing-practice',
    file: 'python-typing-practice/index.html',
  },
  {
    route: '/javascript-typing-practice',
    file: 'javascript-typing-practice/index.html',
  },
  { route: '/average-typing-speed', file: 'average-typing-speed/index.html' },
  { route: '/how-to-type-faster', file: 'how-to-type-faster/index.html' },
];

/** Emits dist/sitemap.xml listing every page, extensionless. */
function sitemapPlugin() {
  return {
    name: 'typesprint-sitemap',
    apply: 'build',
    generateBundle() {
      const lastmod = new Date().toISOString().slice(0, 10);
      const urls = PAGES.map(
        (page) =>
          `  <url>\n    <loc>${SITE_ORIGIN}${page.route}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
      ).join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
    },
  };
}

export default defineConfig({
  root: '.',
  plugins: [sitemapPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        PAGES.map((page) => [
          page.route === '/' ? 'main' : page.route.slice(1),
          fileURLToPath(new URL(page.file, import.meta.url)),
        ])
      ),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
  },
});
