import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        parent_dashboard: resolve(__dirname, 'parent/dashboard.html'),
        teacher_dashboard: resolve(__dirname, 'teacher/dashboard.html'),
        admin_dashboard: resolve(__dirname, 'admin/dashboard.html'),
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
