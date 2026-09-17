import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const mode = process.argv[2]
if (!mode || !['live', 'record', 'mock'].includes(mode)) {
  console.error('Usage: node scripts/with-env.mjs <live|record|mock> [electron-vite args...]')
  process.exit(1)
}

process.env.COBRAA_API_MODE = mode
const extra = process.argv.slice(3)
const child = spawn('npx', ['electron-vite', 'dev', ...extra], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: process.env
})
child.on('exit', (code) => process.exit(code ?? 0))
