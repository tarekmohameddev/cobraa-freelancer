import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dest = path.resolve(process.argv[2] || path.join(root, '..', 'cobraa-freelancer'))

const SKIP = new Set([
  'node_modules',
  'out',
  'dist',
  '.git',
  '.cursor',
  '_aimouse_unpacked'
])

const SKIP_FILES = new Set([
  'M-AI_API_Documentation.md',
  'Otek-AI_API_Documentation.md',
  'SPEECH_RECOGNITION_WEBSOCKET_IMPLEMENTATION.md'
])

const REAL_APP_KEY = 'FREELANCER_BUILD'
const REAL_SIGN_KEY = 'FREELANCER_BUILD'
const REAL_HOST = 'api.local.mock'

function shouldSkip(name) {
  return SKIP.has(name) || name.startsWith('.') && name !== '.gitignore'
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (shouldSkip(entry.name) || SKIP_FILES.has(entry.name)) continue
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) copyDir(src, dst)
    else fs.copyFileSync(src, dst)
  }
}

function patchFile(file, replacements) {
  if (!fs.existsSync(file)) return
  let text = fs.readFileSync(file, 'utf8')
  let changed = false
  for (const [from, to] of replacements) {
    if (text.includes(from)) {
      text = text.split(from).join(to)
      changed = true
    }
  }
  if (changed) fs.writeFileSync(file, text, 'utf8')
}

function walkPatch(dir, replacements) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue
      walkPatch(full, replacements)
      continue
    }
    if (/\.(ts|tsx|js|cjs|mjs|json|md|txt)$/.test(entry.name)) {
      patchFile(full, replacements)
    }
  }
}

if (path.resolve(dest) === path.resolve(root)) {
  console.error('Refusing to sanitize the working copy in place. Pass a destination folder.')
  process.exit(1)
}

if (fs.existsSync(dest)) {
  console.error(`Destination already exists: ${dest}\nDelete it first or pass a new path.`)
  process.exit(1)
}

console.log(`Copying sanitized freelancer tree → ${dest}`)
copyDir(root, dest)

const replacements = [
  [REAL_APP_KEY, 'FREELANCER_BUILD'],
  [REAL_SIGN_KEY, 'FREELANCER_BUILD'],
  [REAL_HOST, 'api.local.mock']
]

walkPatch(path.join(dest, 'src'), replacements)
walkPatch(path.join(dest, 'scripts'), replacements)
walkPatch(path.join(dest, 'apps'), replacements)

fs.writeFileSync(path.join(dest, 'src', 'main', 'api', 'freelancer.lock'), 'mock\n', 'utf8')

fs.writeFileSync(
  path.join(dest, 'FREELANCER.txt'),
  `Cobraa freelancer workspace
===========================

Live vendor APIs, signing keys, and the real hostname have been removed.
The app talks to recorded/fake responses only.

1. npm install
2. npm run dev
3. In a second terminal: npm run mouse-sim

Login: any email + any password (or the "Continue with mock account" button).

Mouse simulator
---------------
A small always-on-top window fires the same 4 extra-button signals as the
physical prototype:

  1  AI chat
  2  Translate
  3  OCR
  4  Voice (hold to talk)

Cobraa must be running first so the simulator can connect to
http://127.0.0.1:17321

Recorded replies live in fixtures/api/recorded/. If a request has no
recording, a built-in fake response is used so UI work can continue.
`,
  'utf8'
)

console.log('Done.')
console.log(`cd "${dest}"`)
console.log('npm install')
console.log('npm run dev')
console.log('npm run mouse-sim')
