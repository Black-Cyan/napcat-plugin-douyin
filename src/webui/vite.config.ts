import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'path'

export default defineConfig({
    plugins: [react(), viteSingleFile()],
    base: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        cssCodeSplit: false,
        assetsInlineLimit: 100000000,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
            },
            output: {
                inlineDynamicImports: true,
            },
        },
    },
    server: {
        proxy: {
            '/api': 'http://localhost:6099',
            '/plugin': 'http://localhost:6099',
        },
    },
})
