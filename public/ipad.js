const api = (p, opts) => fetch(p, opts).then(r => r.json())

let items = []
let menus = []
let tables = []
let sessions = []
let events = []
let currentEventId = null
let activeTab = 'active' // active|done
let settings = null
let audioCtx = null
let soundEnabled = true

function ensureCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(()=>{})
  }
}

function setupAudioUnlock() {
  const tryUnlock = async () => {
    try { ensureCtx(); await audioCtx.resume() } catch(e) {}
    document.removeEventListener('pointerdown', tryUnlock, true)
    document.removeEventListener('touchstart', tryUnlock, true)
    document.removeEventListener('click', tryUnlock, true)
  }
  document.addEventListener('pointerdown', tryUnlock, true)
  document.addEventListener('touchstart', tryUnlock, true)
  document.addEventListener('click', tryUnlock, true)
}

function playKitchenBell() {
  if (!soundEnabled) return
  ensureCtx()
  const now = audioCtx.currentTime
  // 金属的なベル: 複数倍音 + 急峻なアタック/指数減衰
  const partialFreqs = [1200, 1800, 2400]
  partialFreqs.forEach((f, idx) => {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(f, now)
    osc.connect(gain); gain.connect(audioCtx.destination)
    const startGain = idx === 0 ? 0.2 : 0.08
    gain.gain.setValueAtTime(startGain, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35 + idx*0.05)
    osc.start(now)
    osc.stop(now + 0.5)
  })
}

function playRemindBeep() {
  if (!soundEnabled) return
  ensureCtx()
  const now = audioCtx.currentTime
  for (let i=0; i<3; i++) {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(520, now + i*0.25)
    osc.connect(gain); gain.connect(audioCtx.destination)
    gain.gain.setValueAtTime(0.12, now + i*0.25)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i*0.25 + 0.15)
    osc.start(now + i*0.25)
    osc.stop(now + i*0.25 + 0.18)
  }
}

async function loadAll() {
  const eventId = currentEventId || null
  const qs = eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''
  const [m, it, s, t, ev] = await Promise.all([
    api('/api/menus'+qs),
    api('/api/order-items'+qs),
    api('/api/sessions'+qs),
    api('/api/tables'),
    api('/api/events')
  ])
  menus = m
  items = it
  sessions = Array.isArray(s) ? s : (s ? [s] : [])
  tables = t
  settings = await api('/api/settings')
  events = ev
  render()
}

function render() {
  const list = document.getElementById('list')
  list.innerHTML = ''
  renderEventSelect()
  const now = Date.now()
  const data = items.filter(it => activeTab==='active' ? it.status !== '提供済み' : it.status === '提供済み')
  // 古い順＝上
  data.sort((a,b) => (a.statusTimestamps['注文']||0)-(b.statusTimestamps['注文']||0))
  // 同一タイムスタンプ内でtakeoutはメニューで集計表示
  const grouped = []
  if (activeTab==='active') {
    const map = new Map()
    data.forEach(it => {
      const key = it.serviceType==='takeout' ? `${it.sessionId}-${it.statusTimestamps['注文']}` : `${it.id}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(it)
    })
    map.forEach(arr => grouped.push(arr))
  } else {
    data.forEach(it => grouped.push([it]))
  }

  grouped.forEach(group => {
    // 表示はグループの先頭を基準
    const it0 = group[0]
    const currentStatus = it0.status === '調理完了' ? '調理済み' : it0.status
    const row = document.createElement('div')
    row.className = 'row'
    const menu = menus.find(m => m.id === it0.menuId)
    const sess = sessions.find(s => s.id === it0.sessionId)
    const tableLabel = (() => {
      if (!sess) return '-'
      const tbl = tables.find(tb => tb.id === sess.tableId)
      return tbl ? tbl.label : '-'
    })()
    const orderedAt = it0.statusTimestamps['注文'] || 0
    const elapsedMin = Math.floor((now - orderedAt)/60000)
    const warn = (currentStatus==='注文' && settings && settings.alertInitialDelaySec && (now - orderedAt) >= settings.alertInitialDelaySec*1000)
    row.style.background = warn ? '#ffe5e5' : 'transparent'
    const takeoutTag = it0.serviceType==='takeout' ? ' <span class="badge" style="background:#333;color:#fff;border-radius:6px;padding:2px 6px; white-space:nowrap; display:inline-block;">お持ち帰り</span>' : ''
    let middle = ''
    if (it0.serviceType==='takeout' && group.length>1) {
      // メニュー別に集計
      const counts = {}
      group.forEach(x => { counts[x.menuId] = (counts[x.menuId]||0)+1 })
      const parts = Object.entries(counts).map(([menuId, c]) => {
        const m = menus.find(mm => mm.id===menuId)
        return `${m?m.name:'?'} ×${c}`
      })
      middle = parts.join(' / ')
    } else {
      middle = `${menu?menu.name:'?'} ${it0.optionSelections && Object.values(it0.optionSelections).join('/') || ''}`
    }
    const btnBg = currentStatus==='注文' ? 'background:pink;' : ''
    const disabled = currentStatus==='提供済み' ? 'disabled' : ''
    row.innerHTML = `
      <div style="font-size:18.66px;">卓: ${tableLabel}${takeoutTag}</div>
      <div style="font-size:18.66px; white-space: nowrap;">${middle}</div>
      <div style="font-size:18.66px;">${elapsedMin}分</div>
      <div>
        <button class="next" ${disabled} style="font-size:18.66px;padding:8px 12px;${btnBg}">${currentStatus}</button>
      </div>
    `
    if (currentStatus!=='提供済み') {
      const btn = row.querySelector('button.next')
      btn.style.cursor = 'pointer'
      btn.addEventListener('click', async () => {
        try {
          btn.disabled = true
          btn.textContent = '更新中'
          const sequence = ['注文','調理中','調理済み','提供済み']
          const next = sequence[Math.min(sequence.indexOf(currentStatus)+1, sequence.length-1)]
          for (const g of group) {
            await api(`/api/order-items/${g.id}/status`, { method: 'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status: next }) })
          }
          await loadAll()
        } catch (e) {
          alert('更新に失敗しました')
          console.error(e)
          btn.disabled = false
          btn.textContent = currentStatus
        }
      })
    }
    list.appendChild(row)
  })
}

function renderEventSelect() {
  const sel = document.getElementById('eventSelect')
  sel.innerHTML = ''
  // 過去は非表示
  const today = new Date(); today.setHours(0,0,0,0)
  const futureEvents = events.filter(ev => new Date(ev.date) >= today)
  futureEvents.forEach(ev => {
    const opt = document.createElement('option')
    opt.value = ev.id
    opt.textContent = new Date(ev.date).toLocaleDateString()
    sel.appendChild(opt)
  })
  if (!currentEventId && futureEvents[0]) currentEventId = futureEvents[0].id
  sel.value = currentEventId || ''
  sel.onchange = async () => { currentEventId = sel.value; await loadAll() }
}

function scheduleAlerts() {
  // 新規注文通知: WebSocketで受信時
  setInterval(()=>{
    if (!settings) return
    const now = Date.now()
    items.forEach(it => {
      if (it.status !== '注文') return
      const t0 = it.statusTimestamps['注文'] || 0
      const elapsed = (now - t0)/1000
      if (elapsed >= settings.alertInitialDelaySec) {
        const repeats = Math.floor((elapsed - settings.alertInitialDelaySec) / settings.alertRepeatIntervalSec) + 1
        if (repeats > 0 && repeats <= settings.alertMaxRepeats) {
          // リマインド音（短い3連）
          playRemindBeep()
        }
      }
    })
  }, 30000)
}

function setupWS() {
  const ws = new WebSocket((location.protocol==='https:'?'wss':'ws')+'://'+location.host)
  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.type === 'orders.created') {
      playKitchenBell()
    }
    if (['orders.created','orderItems.updated','orderItems.deleted','menus.updated'].includes(msg.type)) {
      await loadAll()
    }
  }
}

function init() {
  document.body.style.fontSize = '12px' // フォント1/3（元の約2倍→1/3へ）
  document.getElementById('tabActive').style.fontSize = '12px'
  document.getElementById('tabDone').style.fontSize = '12px'
  document.getElementById('toggleSound').style.fontSize = '12px'
  document.getElementById('tabActive').onclick = () => { activeTab='active'; render() }
  document.getElementById('tabDone').onclick = () => { activeTab='done'; render() }
  document.getElementById('toggleSound').onclick = async () => {
    try {
      if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); await audioCtx.resume() }
      soundEnabled = !soundEnabled
      document.getElementById('toggleSound').textContent = soundEnabled ? '音を無効化' : '音を有効化'
    } catch(e) { console.error(e) }
  }
  setupAudioUnlock()
  loadAll(); setupWS(); scheduleAlerts(); tick()
}

function tick() {
  render()
  setTimeout(tick, 10000) // 10秒ごとに経過分を更新（リロード不要）
}

init()

