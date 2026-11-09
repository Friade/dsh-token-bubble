/**
 * dsh-token-bubble —— 浏览器半边
 *
 * 悬浮挂件：显示「所有工作区会话累计消耗的 token」。
 * 单击胶囊展开会话级明细，拖动可换位置，位置和开合状态记在 localStorage。
 * 数据来自宿主路由 /dsh-token-bubble/data.json。
 *
 * 定位说明：
 * - 胶囊（bubble）钉在一个 0×0 的锚点容器里，用 translate3d 摆到视口坐标；
 *   首次摆放量一次「实际落点 - 目标落点」的偏差，之后一直补偿（DSH 的 body 可能被
 *   压成 0 高、祖先可能带 transform），所以不会出现 right/bottom 算歪的问题。
 * - 面板（panel）绝对定位在锚点里，开合时按胶囊当前位置决定朝上/朝下、左对齐/居中/右对齐，
 *   并且随页面尺寸变化、随胶囊拖动实时重新摆放。
 */
;(function () {
  if (window.__dshTokenMeterLoaded) return
  window.__dshTokenMeterLoaded = true

  var DATA_URL = '/dsh-token-bubble/data.json'
  var POS_KEY = 'dsh-token-bubble:pos'
  var OPEN_KEY = 'dsh-token-bubble:open'
  var POLL_MS = 10000
  var MARGIN = 18
  var GAP = 8
  var PAD = 8
  var PANEL_W = 300

  var CSS = [
    '.dtm-root{position:fixed;left:0;top:0;margin:0;padding:0;width:0;height:0;',
    'z-index:2147483000;pointer-events:auto;-webkit-app-region:no-drag;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;',
    'font-size:12px;line-height:1.4;user-select:none;-webkit-user-select:none;transform-origin:0 0;}',
    '.dtm-bubble{position:absolute;left:0;top:0;display:flex;align-items:center;gap:7px;',
    'padding:10px 16px;border-radius:999px;min-height:34px;box-sizing:border-box;white-space:nowrap;',
    'background:rgba(255,255,255,.94);color:#1b2030;border:1px solid rgba(15,23,42,.10);',
    'box-shadow:0 6px 20px rgba(15,23,42,.14);cursor:grab;backdrop-filter:blur(10px);',
    '-webkit-app-region:no-drag;touch-action:none;transition:box-shadow .12s ease;}',
    '.dtm-bubble:hover{box-shadow:0 8px 24px rgba(15,23,42,.20);}',
    '.dtm-bubble.dtm-dragging{cursor:grabbing;}',
    '.dtm-dot{width:6px;height:6px;border-radius:50%;background:#22c55e;flex:0 0 auto;}',
    '.dtm-label{color:#64748b;font-size:11px;}',
    '.dtm-value{font-weight:600;font-size:13px;font-variant-numeric:tabular-nums;letter-spacing:.2px;}',
    '.dtm-panel{position:absolute;left:0;top:0;display:none;flex-direction:column;overflow:hidden;',
    'width:300px;box-sizing:border-box;-webkit-app-region:no-drag;',
    'background:rgba(255,255,255,.97);border:1px solid rgba(15,23,42,.10);border-radius:14px;',
    'box-shadow:0 18px 44px rgba(15,23,42,.20);backdrop-filter:blur(14px);color:#1b2030;}',
    '.dtm-panel.dtm-open{display:flex;}',
    '.dtm-head{padding:12px 14px 10px;border-bottom:1px solid rgba(15,23,42,.07);}',
    '.dtm-title{font-size:11px;color:#64748b;margin-bottom:2px;}',
    '.dtm-total{font-size:22px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.2px;}',
    '.dtm-sub{margin-top:3px;font-size:11px;color:#94a3b8;}',
    '.dtm-list{overflow-y:auto;padding:6px 0;min-height:0;}',
    '.dtm-row{display:flex;align-items:flex-start;gap:10px;padding:8px 14px;}',
    '.dtm-row:hover{background:rgba(59,130,246,.06);}',
    '.dtm-row-main{flex:1 1 auto;min-width:0;}',
    '.dtm-row-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:#1b2030;}',
    '.dtm-row-meta{margin-top:2px;font-size:10.5px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.dtm-row-tokens{flex:0 0 auto;font-variant-numeric:tabular-nums;font-size:11.5px;color:#334155;font-weight:600;}',
    '.dtm-empty{padding:18px 14px;color:#94a3b8;text-align:center;}',
    '.dtm-foot{padding:7px 14px;border-top:1px solid rgba(15,23,42,.07);font-size:10.5px;color:#94a3b8;',
    'display:flex;justify-content:space-between;align-items:center;gap:8px;}',
    '.dtm-refresh{cursor:pointer;color:#3b82f6;font-size:10.5px;}',
    '.dtm-refresh:hover{text-decoration:underline;}',
    '.dtm-root.dtm-dark .dtm-bubble{background:rgba(28,31,41,.94);color:#e8eaf2;border-color:rgba(148,163,184,.18);',
    'box-shadow:0 6px 20px rgba(0,0,0,.45);}',
    '.dtm-root.dtm-dark .dtm-label{color:#94a3b8;}',
    '.dtm-root.dtm-dark .dtm-panel{background:rgba(24,27,36,.97);color:#e8eaf2;border-color:rgba(148,163,184,.16);',
    'box-shadow:0 18px 44px rgba(0,0,0,.55);}',
    '.dtm-root.dtm-dark .dtm-head,.dtm-root.dtm-dark .dtm-foot{border-color:rgba(148,163,184,.14);}',
    '.dtm-root.dtm-dark .dtm-row:hover{background:rgba(96,165,250,.10);}',
    '.dtm-root.dtm-dark .dtm-row-title{color:#e8eaf2;}',
    '.dtm-root.dtm-dark .dtm-row-tokens{color:#cbd5e1;}',
    '.dtm-root.dtm-dark .dtm-total{color:#f1f5f9;}',
  ].join('')

  function fmt(n) {
    var v = Number(n) || 0
    if (v >= 1e9) return (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B'
    if (v >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'
    if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
    return String(v)
  }

  function exact(n) {
    try {
      return (Number(n) || 0).toLocaleString('zh-CN')
    } catch (err) {
      return String(Number(n) || 0)
    }
  }

  function relTime(ts) {
    if (!ts) return ''
    var diff = Date.now() - ts
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
    if (diff < 86400000 * 30) return Math.floor(diff / 86400000) + ' 天前'
    try {
      var d = new Date(ts)
      return d.getMonth() + 1 + '/' + d.getDate()
    } catch (err) {
      return ''
    }
  }

  function clockOf(ts) {
    try {
      var d = new Date(ts)
      var hh = String(d.getHours()).padStart(2, '0')
      var mm = String(d.getMinutes()).padStart(2, '0')
      var ss = String(d.getSeconds()).padStart(2, '0')
      return hh + ':' + mm + ':' + ss
    } catch (err) {
      return '--:--'
    }
  }

  // 主题自适应：DSH 的深浅色由它自己的主题系统控制，不一定跟着系统走。
  // 所以直接量当前页面底色（body → html 逐层找不透明的那层），量不到才退回系统偏好。
  function parseColor(value) {
    var m = /rgba?\(([^)]+)\)/.exec(String(value || ''))
    if (!m) return null
    var parts = m[1].split(',').map(function (x) {
      return parseFloat(x)
    })
    if (parts.length < 3) return null
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }

  function pageIsDark() {
    try {
      var nodes = [document.body, document.documentElement]
      for (var i = 0; i < nodes.length; i++) {
        if (!nodes[i]) continue
        var c = parseColor(window.getComputedStyle(nodes[i]).backgroundColor)
        if (c && c.a > 0.1) {
          return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722 < 128
        }
      }
      if (window.matchMedia) return window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch (err) {
      /* ignore */
    }
    return false
  }

  var style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  var root = document.createElement('div')
  root.className = 'dtm-root'

  var panel = document.createElement('div')
  panel.className = 'dtm-panel'

  var head = document.createElement('div')
  head.className = 'dtm-head'
  var titleEl = document.createElement('div')
  titleEl.className = 'dtm-title'
  titleEl.textContent = '累计 Token 用量 · 全部工作区'
  var totalEl = document.createElement('div')
  totalEl.className = 'dtm-total'
  totalEl.textContent = '--'
  var subEl = document.createElement('div')
  subEl.className = 'dtm-sub'
  subEl.textContent = '加载中…'
  head.appendChild(titleEl)
  head.appendChild(totalEl)
  head.appendChild(subEl)

  var list = document.createElement('div')
  list.className = 'dtm-list'

  var foot = document.createElement('div')
  foot.className = 'dtm-foot'
  var footInfo = document.createElement('span')
  footInfo.textContent = ''
  var refreshEl = document.createElement('span')
  refreshEl.className = 'dtm-refresh'
  refreshEl.textContent = '刷新'
  foot.appendChild(footInfo)
  foot.appendChild(refreshEl)

  panel.appendChild(head)
  panel.appendChild(list)
  panel.appendChild(foot)

  var bubble = document.createElement('div')
  bubble.className = 'dtm-bubble'
  bubble.title = '累计 Token 用量（点击展开明细，拖动改变位置）'
  var dot = document.createElement('span')
  dot.className = 'dtm-dot'
  var label = document.createElement('span')
  label.className = 'dtm-label'
  label.textContent = 'Σ'
  var valueEl = document.createElement('span')
  valueEl.className = 'dtm-value'
  valueEl.textContent = '--'
  bubble.appendChild(dot)
  bubble.appendChild(label)
  bubble.appendChild(valueEl)

  root.appendChild(panel)
  root.appendChild(bubble)

  var state = { open: false, data: null, busy: false }
  var pos = null // 胶囊左上角的目标视口坐标
  var bias = { x: 0, y: 0 } // 祖先 transform 造成的偏移（translate 单位）
  var scale = { x: 1, y: 1 } // 祖先 zoom/scale
  var measured = false
  var layoutQueued = false

  function viewport() {
    return {
      w: window.innerWidth || document.documentElement.clientWidth || 1024,
      h: window.innerHeight || document.documentElement.clientHeight || 768,
    }
  }

  function bubbleRect() {
    return bubble.getBoundingClientRect()
  }

  function clampPos(x, y) {
    var vp = viewport()
    var r = bubbleRect()
    var maxX = Math.max(PAD, vp.w - r.width - PAD)
    var maxY = Math.max(PAD, vp.h - r.height - PAD)
    return {
      x: Math.min(Math.max(PAD, x), maxX),
      y: Math.min(Math.max(PAD, y), maxY),
    }
  }

  function defaultPos() {
    var vp = viewport()
    var r = bubbleRect()
    return clampPos(vp.w - r.width - MARGIN, vp.h - r.height - MARGIN)
  }

  function applyTransform() {
    if (!pos) return
    var tx = (pos.x - bias.x) / (scale.x || 1)
    var ty = (pos.y - bias.y) / (scale.y || 1)
    root.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0)'
  }

  function measureBias() {
    if (!pos || measured) return
    root.style.transform = 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)'
    var r = bubbleRect()
    var ow = bubble.offsetWidth || r.width
    var oh = bubble.offsetHeight || r.height
    scale.x = ow > 0 ? r.width / ow : 1
    scale.y = oh > 0 ? r.height / oh : 1
    if (!scale.x || !isFinite(scale.x)) scale.x = 1
    if (!scale.y || !isFinite(scale.y)) scale.y = 1
    bias.x = (r.left - pos.x) / scale.x
    bias.y = (r.top - pos.y) / scale.y
    measured = true
    applyTransform()
  }

  // 面板摆放：上下按剩余空间选，左右按胶囊在视口的横向位置决定对齐方式
  function layoutPanel() {
    if (!state.open) return
    var vp = viewport()
    var br = bubbleRect()

    panel.style.visibility = 'hidden'
    panel.style.width = Math.min(PANEL_W, vp.w - PAD * 2) + 'px'
    panel.style.maxHeight = Math.max(160, Math.round(vp.h * 0.62)) + 'px'
    var pr = panel.getBoundingClientRect()
    var naturalH = pr.height

    var belowSpace = vp.h - br.bottom - GAP - PAD
    var aboveSpace = br.top - GAP - PAD
    var openBelow
    if (belowSpace >= naturalH) openBelow = true
    else if (aboveSpace >= naturalH) openBelow = false
    else openBelow = belowSpace >= aboveSpace

    var avail = Math.max(120, openBelow ? belowSpace : aboveSpace)
    panel.style.maxHeight = Math.min(Math.max(160, Math.round(vp.h * 0.62)), avail) + 'px'

    pr = panel.getBoundingClientRect()
    var pw = pr.width
    var ph = pr.height

    var py = openBelow ? br.bottom + GAP : br.top - GAP - ph

    // 左三分之一贴左，右三分之一贴右，中间居中对齐胶囊
    var cx = br.left + br.width / 2
    var third = vp.w / 3
    var px
    if (cx < third) px = br.left
    else if (cx > vp.w - third) px = br.right - pw
    else px = cx - pw / 2
    px = Math.min(Math.max(PAD, px), Math.max(PAD, vp.w - pw - PAD))
    py = Math.min(Math.max(PAD, py), Math.max(PAD, vp.h - ph - PAD))

    // 换算到锚点本地坐标（祖先有 scale 时本地 1px ≠ 视口 1px）
    panel.style.left = (px - br.left) / (scale.x || 1) + 'px'
    panel.style.top = (py - br.top) / (scale.y || 1) + 'px'
    panel.style.visibility = ''
  }

  function queueLayout() {
    if (layoutQueued || !state.open) return
    layoutQueued = true
    requestAnimationFrame(function () {
      layoutQueued = false
      layoutPanel()
    })
  }

  function place(next) {
    if (next) pos = clampPos(next.x, next.y)
    if (!pos) return
    applyTransform()
    if (!measured) measureBias()
    queueLayout()
  }

  function savePos() {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) }))
    } catch (err) {
      /* ignore */
    }
  }

  function loadPos() {
    var saved = null
    try {
      var raw = localStorage.getItem(POS_KEY)
      if (!raw) {
        // 插件改名前叫 dsh-token-meter，把老位置迁移过来，免得用户重拖一次
        raw = localStorage.getItem('dsh-token-meter:pos')
        if (raw) {
          localStorage.setItem(POS_KEY, raw)
          localStorage.removeItem('dsh-token-meter:pos')
        }
      }
      saved = JSON.parse(raw || 'null')
    } catch (err) {
      saved = null
    }
    if (!saved) return null
    if (typeof saved.x === 'number' && typeof saved.y === 'number') return { x: saved.x, y: saved.y }
    if (typeof saved.left === 'number' && typeof saved.top === 'number') return { x: saved.left, y: saved.top }
    return null
  }

  function applyTheme() {
    root.classList.toggle('dtm-dark', pageIsDark())
  }

  function setOpen(open) {
    state.open = !!open
    panel.classList.toggle('dtm-open', state.open)
    try {
      localStorage.setItem(OPEN_KEY, state.open ? '1' : '0')
    } catch (err) {
      /* ignore */
    }
    if (state.open) {
      layoutPanel()
      refresh()
    }
  }

  function render() {
    applyTheme()
    var data = state.data
    if (!data || !data.ok) return
    totalEl.textContent = exact(data.total)
    valueEl.textContent = fmt(data.total)
    subEl.textContent = data.sessionCount + ' 个会话 · 输入 + 输出 + 缓存读写合计'
    footInfo.textContent = '更新于 ' + clockOf(data.updatedAt)
    list.textContent = ''

    if (!data.sessions || data.sessions.length === 0) {
      var empty = document.createElement('div')
      empty.className = 'dtm-empty'
      empty.textContent = '还没有可统计的会话'
      list.appendChild(empty)
      queueLayout()
      return
    }

    for (var i = 0; i < data.sessions.length; i++) {
      var s = data.sessions[i]
      var row = document.createElement('div')
      row.className = 'dtm-row'

      var main = document.createElement('div')
      main.className = 'dtm-row-main'
      var t = document.createElement('div')
      t.className = 'dtm-row-title'
      t.textContent = s.title || '未命名会话'
      t.title = (s.title || '') + (s.cwd ? '\n' + s.cwd : '')
      var meta = document.createElement('div')
      meta.className = 'dtm-row-meta'
      var parts = []
      if (s.cwd) parts.push(s.cwd)
      if (s.lastAt) parts.push(relTime(s.lastAt))
      meta.textContent = parts.join(' · ')
      main.appendChild(t)
      main.appendChild(meta)

      var tok = document.createElement('div')
      tok.className = 'dtm-row-tokens'
      tok.textContent = fmt(s.total)
      tok.title = exact(s.total) + ' tokens'

      row.appendChild(main)
      row.appendChild(tok)
      list.appendChild(row)
    }
    queueLayout()
  }

  function refresh() {
    if (state.busy) return
    state.busy = true
    var url = DATA_URL + '?t=' + Date.now()
    fetch(url, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.json()
      })
      .then(function (data) {
        state.data = data
        render()
      })
      .catch(function (err) {
        if (!state.data) {
          subEl.textContent = '读取失败：' + (err && err.message ? err.message : '未知错误')
        }
      })
      .then(function () {
        state.busy = false
      })
  }

  // —— 拖动 / 点击 ——
  var drag = null

  bubble.addEventListener('pointerdown', function (ev) {
    if (ev.button !== 0) return
    ev.preventDefault()
    drag = {
      id: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      originX: pos ? pos.x : 0,
      originY: pos ? pos.y : 0,
      moved: false,
    }
    bubble.classList.add('dtm-dragging')
  })

  function onMove(ev) {
    if (!drag || (drag.id !== undefined && ev.pointerId !== undefined && ev.pointerId !== drag.id)) return
    var dx = (ev.clientX - drag.startX) / (scale.x || 1)
    var dy = (ev.clientY - drag.startY) / (scale.y || 1)
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return
    drag.moved = true
    ev.preventDefault()
    place({ x: drag.originX + dx, y: drag.originY + dy })
  }

  function onUp(ev) {
    if (!drag) return
    if (drag.id !== undefined && ev && ev.pointerId !== undefined && ev.pointerId !== drag.id) return
    var moved = drag.moved
    drag = null
    bubble.classList.remove('dtm-dragging')
    if (moved) {
      pos = clampPos(pos.x, pos.y)
      applyTransform()
      savePos()
      layoutPanel()
    } else {
      setOpen(!state.open)
    }
  }

  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', onUp, true)
  window.addEventListener('pointercancel', onUp, true)
  window.addEventListener('blur', function () {
    if (drag) {
      drag = null
      bubble.classList.remove('dtm-dragging')
    }
  })

  refreshEl.addEventListener('click', function (ev) {
    ev.stopPropagation()
    state.busy = false
    refresh()
  })

  window.addEventListener('resize', function () {
    if (!pos) return
    measured = false
    pos = clampPos(pos.x, pos.y)
    applyTransform()
    measureBias()
    layoutPanel()
  })

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refresh()
  })

  function boot() {
    if (!document.body) return
    ;(document.documentElement || document.body).appendChild(root)
    applyTheme()
    try {
      if (window.MutationObserver) {
        new MutationObserver(applyTheme).observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme'],
        })
      }
    } catch (err) {
      /* ignore */
    }
    try {
      if (window.matchMedia) {
        var mq = window.matchMedia('(prefers-color-scheme: dark)')
        if (mq.addEventListener) mq.addEventListener('change', applyTheme)
        else if (mq.addListener) mq.addListener(applyTheme)
      }
    } catch (err) {
      /* ignore */
    }

    pos = loadPos() || defaultPos()
    applyTransform()
    requestAnimationFrame(function () {
      measureBias()
      pos = clampPos(pos.x, pos.y)
      applyTransform()

      try {
        if (localStorage.getItem(OPEN_KEY) === '1') setOpen(true)
      } catch (err) {
        /* ignore */
      }
      refresh()
      setInterval(refresh, POLL_MS)
    })
  }

  if (document.body) boot()
  else document.addEventListener('DOMContentLoaded', boot)
})()