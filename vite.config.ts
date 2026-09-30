/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { collectCredits, readCommit } from './src/build/buildInfo.ts'

// GitHub Pages serves the app from /<repo>/, so the base path is injected at
// build time. Defaults to '/' for local dev and any root-hosted deploy.
const base = process.env.VITE_BASE || '/'

const readJson = (path: string) => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'))
const pkg = readJson('./package.json')
const installed = (name: string) => {
  const path = `./node_modules/${name}/package.json`
  return existsSync(fileURLToPath(new URL(path, import.meta.url))) ? readJson(path) : undefined
}

// Version details shown in Help > About (see src/version.ts). Read once per build; no runtime requests.
const buildInfo = {
  __APP_VERSION__: JSON.stringify(pkg.version),
  __APP_COMMIT__: JSON.stringify(readCommit((command) => execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString())),
  __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  __APP_CREDITS__: JSON.stringify(collectCredits(pkg, installed)),
}

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  define: buildInfo,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
