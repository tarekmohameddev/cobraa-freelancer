import http from 'node:http'
import { debugLog } from '../debug'
import { SIM_PORT, SIM_SIGNATURES } from './simSignatures'

type InjectFn = (signature: string, down: boolean) => void

let inject: InjectFn = () => {}
let server: http.Server | null = null

export function setSimulatorInjector(fn: InjectFn) {
  inject = fn
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res: http.ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(body)
}

function fireButton(button: number, down: boolean) {
  if (button < 1 || button > 4) throw new Error('button must be 1–4')
  const signature = SIM_SIGNATURES[button as 1 | 2 | 3 | 4]
  inject(signature, down)
  debugLog('mouse:sim', { button, down, signature })
  return { ok: true as const, button, down, signature }
}

export function startSimulatorBridge() {
  if (server) return SIM_PORT

  server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      })
      res.end()
      return
    }

    const url = new URL(req.url || '/', 'http://127.0.0.1')

    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { ok: true, port: SIM_PORT, buttons: SIM_SIGNATURES })
      return
    }

    if (req.method === 'POST' && url.pathname === '/button') {
      try {
        const raw = await readBody(req)
        const body = raw ? JSON.parse(raw) : {}
        const button = Number(body.button)
        if (body.click === true) {
          const down = fireButton(button, true)
          setTimeout(() => fireButton(button, false), 40)
          json(res, 200, down)
          return
        }
        json(res, 200, fireButton(button, Boolean(body.down)))
      } catch (e: any) {
        json(res, 400, { ok: false, error: e?.message || 'Invalid button payload' })
      }
      return
    }

    json(res, 404, { ok: false, error: 'Not found' })
  })

  server.on('error', (err) => {
    debugLog('mouse:sim-error', { message: (err as Error).message })
  })

  server.listen(SIM_PORT, '127.0.0.1', () => {
    debugLog('mouse:sim-listen', { port: SIM_PORT })
    console.log(`[Cobraa] mouse simulator bridge http://127.0.0.1:${SIM_PORT}`)
  })

  return SIM_PORT
}

export function stopSimulatorBridge() {
  if (!server) return
  server.close()
  server = null
}
