import { defineConfig } from 'vite';
export default defineConfig({ server: { proxy: { '/socket.io': { target: 'http://127.0.0.1:3001', ws: true } } }, build: { rollupOptions: { output: { manualChunks: { three: ['three'], react: ['react','react-dom'], network: ['socket.io-client'] } } } } });
