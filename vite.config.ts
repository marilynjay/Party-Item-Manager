import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps asset URLs relative so the same build works on
// GitHub Pages (/Party-Item-Manager/) and any other static host.
export default defineConfig({
  plugins: [react()],
  base: './',
});
