import { defineConfig } from 'vite';
import { resolve } from 'path';
import { cpSync, mkdirSync } from 'node:fs';

function publicMenuSlugPlugin() {
  const rewrite = function (req, _res, next) {
    if (!['GET', 'HEAD'].includes(req.method)) return next();

    const pathname = decodeURIComponent((req.url || '').split('?')[0]);
    const match = pathname.match(/^\/([^/?.]+)\/?$/);
    if (!match) return next();

    const slug = match[1];
    req.url = `/Pages/Menu.html?slug=${encodeURIComponent(slug)}`;
    next();
  };

  return {
    name: "public-menu-slug",
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

function copyRuntimeScriptsPlugin() {
  return {
    name: "copy-runtime-scripts",
    closeBundle() {
      const distDir = resolve(__dirname, "dist");
      mkdirSync(distDir, { recursive: true });
      cpSync(resolve(__dirname, "js"), resolve(distDir, "js"), {
        recursive: true,
      });
    },
  };
}

export default defineConfig({
  plugins: [publicMenuSlugPlugin(), copyRuntimeScriptsPlugin()],
  server: {
    allowedHosts: [
      "gentleman-writer-patches-director.trycloudflare.com"
    ],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'Pages/Login.html'),
        waiter_login: resolve(__dirname, 'Pages/WaiterLogin.html'),
        waiter_dashboard: resolve(__dirname, 'Pages/WaiterDashboard.html'),
        admin_dashboard: resolve(__dirname, 'Pages/AdminDashboard.html'),
        super_admin_dashboard: resolve(__dirname, 'Pages/SuperAdminDashboard.html'),
        menu: resolve(__dirname, 'Pages/Menu.html'),
        landing: resolve(__dirname, 'Pages/Landing.html'),
        setup_password: resolve(__dirname, 'Pages/SetupPassword.html'),
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
      mangle: true,
    },
  },
});
