/**
 * dsh-token-bubble —— 宿主半边
 *
 * 数据来源：DSH 自己的会话投影缓存
 *   $DSH_HOME/storages/session_projcache/sessions/<sessionId>.json
 * 其中 record.rows.tokenUsage.val.totals 是「整条会话日志累计」的 provider 上报用量：
 *   { uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
 * 所以不需要另建账本，也不需要回填历史。
 *
 * 对外只提供两个路由：
 *   GET /dsh-token-bubble/data.json    汇总 + 会话级列表
 *   GET /dsh-token-bubble/widget.js    浏览器半边
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WIDGET_ASSET = path.join(PACKAGE_ROOT, 'assets', 'widget.js')

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SESSIONS_DIR = path.join(DSH_HOME, 'storages', 'session_projcache', 'sessions')

const ROUTE_BASE = '/dsh-token-bubble'
const WIDGET_URL = ROUTE_BASE + '/widget.js'
const DATA_URL = ROUTE_BASE + '/data.json'

// 桌面端（Electron）只能吃「结构化注入行」，且必须是内联 script：
// script-src 行加载失败会 reject 掉 __DSH_BOOT_READY__，整个应用起不来（见 whale-widget issue #154）。
const DESKTOP_INJECT_TEXT =
  '(function(){try{var d=document.body||document.head||document.documentElement;if(!d)return;' +
  'var s=document.createElement("script");s.src="' + WIDGET_URL + '";' +
  's.onerror=function(){};d.appendChild(s)}catch(e){}})()'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    return null
  }
}

function toInt(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

function totalsOf(record) {
  const rows = record && record.rows
  const row = rows && rows.tokenUsage
  const totals = row && row.val && row.val.totals
  if (!totals || typeof totals !== 'object') return null
  const uncachedInputTokens = toInt(totals.uncachedInputTokens)
  const outputTokens = toInt(totals.outputTokens)
  const cacheReadTokens = toInt(totals.cacheReadTokens)
  const cacheWriteTokens = toInt(totals.cacheWriteTokens)
  return {
    uncachedInputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    total: uncachedInputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
  }
}

function textOf(row) {
  if (!row) return ''
  const value = row.val
  if (typeof value === 'string') return value.trim()
  if (value && typeof value.text === 'string') return value.text.trim()
  return ''
}

function collect() {
  let names = []
  try {
    names = fs.readdirSync(SESSIONS_DIR)
  } catch (err) {
    names = []
  }

  const sessions = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const file = path.join(SESSIONS_DIR, name)
    const raw = readJson(file)
    if (!raw) continue
    const record = raw.record && raw.record.rows ? raw.record : raw
    if (!record || !record.rows) continue

    const usage = totalsOf(record)
    if (!usage || usage.total <= 0) continue

    const rows = record.rows
    const cwd = textOf(rows.workingDirectory) || (record.identity && record.identity.cwd) || ''
    const base = cwd ? path.basename(String(cwd).replace(/[\\/]+$/, '')) : ''
    const title = textOf(rows.title) || base || '未命名会话'

    let lastAt = 0
    try {
      lastAt = Math.round(fs.statSync(file).mtimeMs)
    } catch (err) {
      lastAt = 0
    }

    sessions.push({
      id: name.slice(0, -'.json'.length),
      title,
      cwd: String(cwd || ''),
      total: usage.total,
      usage,
      lastAt,
    })
  }

  sessions.sort((a, b) => b.total - a.total)
  const total = sessions.reduce((sum, item) => sum + item.total, 0)

  return {
    ok: true,
    total,
    sessionCount: sessions.length,
    sessions,
    updatedAt: Date.now(),
    source: SESSIONS_DIR,
  }
}

// 两秒内的重复请求共用一份快照，避免面板开着时反复读盘。
let cache = null
let cacheAt = 0
function snapshot() {
  const now = Date.now()
  if (cache && now - cacheAt < 2000) return cache
  cache = collect()
  cacheAt = now
  return cache
}

function readWidget() {
  return fs.readFileSync(WIDGET_ASSET)
}

function isTrustedRequest(req) {
  const host = String(req.headers.host || '').toLowerCase()
  if (!host) return false
  const hostname = host.replace(/:\d+$/, '').replace(/^\[/, '').replace(/\]$/, '')
  const loopback =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '::1' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  if (!loopback) return false
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin.length > 0 && origin !== 'null') {
    try {
      if (new URL(origin).host.toLowerCase() !== host) return false
    } catch (err) {
      return false
    }
  }
  return true
}

export default {
  name: 'dsh-token-bubble',
  apply(root) {
    const disposers = []

    // ① 桌面端注入行：宿主启动时一次性收集，必须立刻注册，不能等任何服务。
    disposers.push(
      root.on('webserver/index-inject', (table) => {
        try {
          if (!Array.isArray(table)) return
          for (const row of table) {
            if (!row) continue
            if (row.kind === 'script-src' && row.src === WIDGET_URL) return
            if (row.kind === 'script' && typeof row.text === 'string' && row.text.indexOf(WIDGET_URL) >= 0) return
          }
          table.push({ kind: 'script', placement: 'body', text: DESKTOP_INJECT_TEXT })
        } catch (err) {
          /* 注入失败不影响宿主 */
        }
      }),
    )

    // ② Web 形态：改写 index.html 注入 script 标签
    root.inject(['webServer'], (ctx) => {
      function register(route) {
        const inner = route && route.handler
        const wrapped = Object.assign({}, route, {
          handler: async (req, res) => {
            if (!isTrustedRequest(req)) {
              res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
              res.end('forbidden')
              return
            }
            return inner(req, res)
          },
        })
        return ctx.webServer.register(wrapped)
      }

      disposers.push(
        register({
          kind: 'exact',
          path: WIDGET_URL,
          handler: (req, res) => {
            try {
              const bytes = readWidget()
              res.writeHead(200, {
                'Content-Type': 'application/javascript; charset=utf-8',
                'Cache-Control': 'no-store',
                'Content-Length': String(bytes.length),
              })
              res.end(bytes)
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
              res.end('widget unavailable')
            }
          },
        }),
      )

      disposers.push(
        register({
          kind: 'exact',
          path: DATA_URL,
          handler: (req, res) => {
            try {
              const payload = snapshot()
              res.writeHead(200, JSON_HEADERS)
              res.end(JSON.stringify(payload))
            } catch (err) {
              res.writeHead(500, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }))
            }
          },
        }),
      )

      try {
        disposers.push(
          ctx.webServer.tapIndex((html) => {
            if (typeof html !== 'string') return html
            if (html.indexOf(WIDGET_URL) !== -1) return html
            const tag = '<script defer src="' + WIDGET_URL + '"></script>'
            if (html.indexOf('</body>') !== -1) return html.replace('</body>', tag + '</body>')
            return html + tag
          }),
        )
      } catch (err) {
        /* 老版本宿主没有 tapIndex 时忽略 */
      }
    })

    root.effect(() => () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch (err) {
          /* ignore */
        }
      }
    })
  },
}