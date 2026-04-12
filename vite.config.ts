import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
build: {
outDir: 'dist',
emptyOutDir: false,
cssCodeSplit: false,
rollupOptions: {
input: resolve(__dirname, 'src/main.ts'),
output: {
entryFileNames: 'assets/[name].js',
chunkFileNames: 'assets/[name].js',
assetFileNames: (assetInfo) => {
if (assetInfo.name?.endsWith('.css')) {
return 'assets/styles.css';
}
return 'assets/[name][extname]';
}
}
}
}
});
