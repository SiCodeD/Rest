import { defineConfig } from 'vite';
import { resolve } from 'path';
import { cpSync, mkdirSync } from 'node:fs';

function publicMenuSlugPlugin() {
  const cleanRoutes = {
    '/login': '/Pages/Login.html',
    '/admin': '/Pages/AdminDashboard.html',
    '/super-admin': '/Pages/SuperAdminDashboard.html',
    '/waiter': '/Pages/WaiterDashboard.html',
    '/waiter-login': '/Pages/WaiterLogin.html',
    '/kitchen': '/Pages/KitchenDisplay.html',
    '/setup-password': '/Pages/SetupPassword.html',
    '/setuppassword': '/Pages/SetupPassword.html',
    '/landing': '/Pages/Landing.html',
    '/menu': '/Pages/Menu.html',
  };
  const reserved = new Set([
    ...Object.keys(cleanRoutes).map((r) => r.slice(1).toLowerCase()),
    'pages', 'js', 'css', 'public', 'assets', 'api', 'app',
  ]);

  const rewrite = function (req, _res, next) {
    if (!['GET', 'HEAD'].includes(req.method)) return next();

    const rawPath = decodeURIComponent((req.url || '').split('?')[0]);
    const pathname = rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
    const lower = pathname.toLowerCase();

    // Legacy /Pages/*.html and /X.html handled by worker 301s in prod; dev just serves.
    if (cleanRoutes[lower]) {
      const q = (req.url || '').includes('?') ? (req.url || '').slice((req.url || '').indexOf('?')) : '';
      req.url = `${cleanRoutes[lower]}${q}`;
      return next();
    }

    const match = pathname.match(/^\/([^/?.]+)\/?$/);
    if (!match) return next();

    const slug = match[1].toLowerCase();
    if (reserved.has(slug)) return next();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return next();

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
