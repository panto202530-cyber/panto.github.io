import express from 'express'
import http from 'http'
import cors from 'cors'
import { WebSocketServer } from 'ws'
import { v4 as uuidv4 } from 'uuid'

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static('public'))

const server = http.createServer(app)
const wss = new WebSocketServer({ server })

// In-memory data stores (reset every run)
const db = {
  events: {},
  tables: {},
  menus: {},
  sessions: {},
  orders: {},
  orderItems: {},
  payments: {},
  tableUseCounts: {},
  settings: {
    alertInitialDelaySec: 600, // 10min default
    alertRepeatIntervalSec: 300, // 5min
    alertMaxRepeats: 3
  }
}

// Helper broadcast
function broadcast(type, payload) {
  const message = JSON.stringify({ type, payload })
  wss.clients.forEach(client => {
    try {
      if (client.readyState === 1) client.send(message)
    } catch (e) {
      // ignore
    }
  })
}

// Seed demo data
function seed() {
  const eventId = 'event-default'
  db.events[eventId] = { id: eventId, name: 'Demo Event', date: new Date().toISOString() }
  // 初期テーブルは作成しない（Adminから追加）
  const menuList = [
    { name: '生ビール', unitPrice: 600, stockLimit: 999999, visible: true, category: 'drink' },
    { name: 'ハイボール', unitPrice: 500, stockLimit: 999999, visible: true, category: 'drink' },
    { name: '唐揚げ', unitPrice: 700, stockLimit: 999999, visible: true, category: 'food' },
    { name: 'ポテトフライ', unitPrice: 500, stockLimit: 999999, visible: true, category: 'food' },
    { name: 'コーヒー', unitPrice: 400, stockLimit: 999999, visible: true, category: 'drink', optionGroups: [
      { id: 'temp', name: '温度', required: true, maxSelect: 1, options: [
        { id: 'ice', name: 'アイス', extra: 0 },
        { id: 'hot', name: 'ホット', extra: 0 }
      ]}
    ] }
  ]
  menuList.forEach(m => {
    const id = uuidv4()
    db.menus[id] = { id, ...m, eventId }
  })
}
seed()

// Utilities
function getVisibleMenus(eventId) {
  const list = Object.values(db.menus).filter(m => m.visible)
  if (eventId) return list.filter(m => m.eventId === eventId)
  return list
}

function calcPaymentTotalByLatestPrice(orderItemIds, options = {}) {
  const { applyCouponOnlineStore = false } = options
  let total = 0
  const selectedItems = []
  orderItemIds.forEach(oid => {
    const item = db.orderItems[oid]
    if (!item) return
    const menu = db.menus[item.menuId]
    if (!menu) return
    selectedItems.push({ item, menu })
    total += menu.unitPrice
  })
  if (applyCouponOnlineStore) {
    // 最高額のドリンク1点、フード1点を無料
    const drinks = selectedItems.filter(x => x.menu.category === 'drink')
    const foods = selectedItems.filter(x => x.menu.category === 'food')
    const maxDrink = drinks.sort((a,b)=>b.menu.unitPrice-a.menu.unitPrice)[0]
    const maxFood = foods.sort((a,b)=>b.menu.unitPrice-a.menu.unitPrice)[0]
    if (maxDrink) total -= maxDrink.menu.unitPrice
    if (maxFood) total -= maxFood.menu.unitPrice
  }
  if (total < 0) total = 0
  return total
}

function reserveStockForItems(items) {
  // items: [{ menuId, count }]
  const toUpdate = []
  for (const it of items) {
    const menu = db.menus[it.menuId]
    if (!menu || !menu.visible) return { ok: false, reason: 'メニューが無効です' }
    if (menu.stockLimit < it.count) return { ok: false, reason: '在庫不足' }
    toUpdate.push(menu)
  }
  // commit
  items.forEach((it, idx) => {
    toUpdate[idx].stockLimit -= it.count
  })
  return { ok: true }
}

function releaseStockForItems(items) {
  items.forEach(it => {
    const menu = db.menus[it.menuId]
    if (menu) menu.stockLimit += it.count
  })
}

// Routes
app.get('api/menus', (req, res) => {
  const { eventId } = req.query
  res.json(getVisibleMenus(eventId))
})

app.post('api/menus', (req, res) => {
  const { name, unitPrice, stockLimit = 0, visible = true, category, optionGroups = [], eventId } = req.body
  if (!name || typeof unitPrice !== 'number') return res.status(400).json({ error: 'name, unitPrice 必須' })
  const evId = eventId || Object.keys(db.events)[0]
  const id = uuidv4()
  const menu = { id, name, unitPrice, stockLimit, visible, category, optionGroups, eventId: evId }
  db.menus[id] = menu
  broadcast('menus.updated', getVisibleMenus(evId))
  res.status(201).json(menu)
})

app.patch('api/menus/:id', (req, res) => {
  const id = req.params.id
  const menu = db.menus[id]
  if (!menu) return res.status(404).json({ error: 'not found' })
  Object.assign(menu, req.body)
  broadcast('menus.updated', getVisibleMenus())
  res.json(menu)
})

app.get('/api/tables', (req, res) => {
  res.json(Object.values(db.tables))
})

app.post('/api/sessions', (req, res) => {
  const { tableId, headcount, eventId } = req.body
  if (!db.tables[tableId]) return res.status(400).json({ error: '卓が存在しません' })
  const sessionId = uuidv4()
  // 卓使用回数をインクリメントしてhuman-readableな連番IDを付与
  db.tableUseCounts[tableId] = (db.tableUseCounts[tableId] || 0) + 1
  const tableUseSeq = db.tableUseCounts[tableId]
  const tableLabel = db.tables[tableId].label
  const displayId = `${tableLabel}-${tableUseSeq}`
  const sess = { id: sessionId, tableId, headcount, eventId: eventId || Object.keys(db.events)[0], startedAt: Date.now(), closedAt: null, status: 'open', tableUseSeq, displayId }
  db.sessions[sessionId] = sess
  res.status(201).json(sess)
})

app.patch('/api/sessions/:id', (req, res) => {
  const sess = db.sessions[req.params.id]
  if (!sess) return res.status(404).json({ error: 'not found' })
  Object.assign(sess, req.body)
  res.json(sess)
})

app.post('/api/orders', (req, res) => {
  const { sessionId, items, serviceType = 'dinein' } = req.body // items: [{ menuId, options, quantity }]
  const sess = db.sessions[sessionId]
  if (!sess || sess.status !== 'open') return res.status(400).json({ error: 'セッションが無効です' })

  // Expand to quantity=1 items and reserve stock
  const flat = []
  const reserveCountMap = new Map()
  for (const it of items || []) {
    const qty = Math.max(1, Number(it.quantity || 1))
    for (let i = 0; i < qty; i++) {
      flat.push({ menuId: it.menuId, options: it.options || {} })
    }
    reserveCountMap.set(it.menuId, (reserveCountMap.get(it.menuId) || 0) + qty)
  }

  const reserveList = Array.from(reserveCountMap.entries()).map(([menuId, count]) => ({ menuId, count }))
  const resv = reserveStockForItems(reserveList)
  if (!resv.ok) return res.status(400).json({ error: resv.reason })

  const orderId = uuidv4()
  const order = { id: orderId, sessionId, createdAt: Date.now() }
  db.orders[orderId] = order
  const createdItemIds = []
  flat.forEach(f => {
    const id = uuidv4()
    db.orderItems[id] = {
      id,
      orderId,
      sessionId,
      menuId: f.menuId,
      optionSelections: f.options,
      status: '注文',
      statusTimestamps: { 注文: Date.now() },
      paid: false,
      paymentId: null,
      serviceType,
      eventId: sess.eventId
    }
    createdItemIds.push(id)
  })
  broadcast('orders.created', { order, items: createdItemIds.map(id => db.orderItems[id]) })
  res.status(201).json({ orderId, itemIds: createdItemIds })
})

app.patch('/api/order-items/:id/status', (req, res) => {
  const { status } = req.body // 調理中, 調理完了, 提供済み
  const item = db.orderItems[req.params.id]
  if (!item) return res.status(404).json({ error: 'not found' })
  const allowed = ['注文', '調理中', '調理完了', '調理済み', '提供済み']
  if (!allowed.includes(status)) return res.status(400).json({ error: 'status invalid' })
  // 正規化: 調理完了 -> 調理済み
  const normalized = status === '調理完了' ? '調理済み' : status
  item.status = normalized
  item.statusTimestamps[normalized] = Date.now()
  broadcast('orderItems.updated', item)
  res.json(item)
})

app.post('/api/payments', (req, res) => {
  const { sessionId, method, orderItemIds: providedIds, applyCouponOnlineStore = false, serviceType = 'dinein', splitType = 'same' } = req.body // method: cash|qr
  const sess = db.sessions[sessionId]
  if (!sess || sess.status !== 'open') return res.status(400).json({ error: 'セッションが無効です' })
  // 未会計のこのセッションの明細のうち、指定があればその範囲で決済
  const unpaidIds = Object.values(db.orderItems)
    .filter(i => i.sessionId === sessionId && !i.paid)
    .map(i => i.id)
  const orderItemIds = Array.isArray(providedIds) && providedIds.length > 0 ? providedIds.filter(id => unpaidIds.includes(id)) : unpaidIds
  if (orderItemIds.length === 0) return res.status(400).json({ error: '対象明細がありません' })
  const total = calcPaymentTotalByLatestPrice(orderItemIds, { applyCouponOnlineStore })
  const paymentId = uuidv4()
  const payment = { id: paymentId, sessionId, eventId: sess.eventId, totalAmount: total, method, serviceType, splitType, paidAt: Date.now(), orderItemIds, coupon: applyCouponOnlineStore ? 'オンラインストア購入特典' : null }
  db.payments[paymentId] = payment
  // Mark items paid
  orderItemIds.forEach(id => {
    const it = db.orderItems[id]
    if (it) { it.paid = true; it.paymentId = paymentId }
  })
  // Close session if all items paid
  const remaining = Object.values(db.orderItems).some(i => i.sessionId === sessionId && !i.paid)
  if (!remaining) {
    sess.status = 'closed'
    sess.closedAt = Date.now()
  }
  broadcast('payments.created', payment)
  res.status(201).json(payment)
})

// 支払い一覧
app.get('/api/payments', (req, res) => {
  const { eventId } = req.query
  let list = Object.values(db.payments)
  if (eventId) list = list.filter(p => p.eventId === eventId)
  res.json(list)
})

// 取消（調理中前のみ）
app.delete('/api/order-items/:id', (req, res) => {
  const item = db.orderItems[req.params.id]
  if (!item) return res.status(404).json({ error: 'not found' })
  if (item.status !== '注文') return res.status(400).json({ error: '調理中以降は取消できません' })
  // release stock
  releaseStockForItems([{ menuId: item.menuId, count: 1 }])
  delete db.orderItems[item.id]
  broadcast('orderItems.deleted', { id: req.params.id })
  res.json({ ok: true })
})

// 一覧取得
app.get('/api/order-items', (req, res) => {
  const { sessionId, eventId } = req.query
  let items = Object.values(db.orderItems)
  if (sessionId) items = items.filter(i => i.sessionId === sessionId)
  if (eventId) items = items.filter(i => i.eventId === eventId)
  // 古い順＝上（注文時刻で昇順）
  items.sort((a, b) => (a.statusTimestamps['注文'] || 0) - (b.statusTimestamps['注文'] || 0))
  res.json(items)
})

// セッション検索（卓ごとのオープンセッション）
app.get('/api/sessions', (req, res) => {
  const { tableId, eventId } = req.query
  if (tableId) {
    const sess = Object.values(db.sessions).find(s => s.tableId === tableId && s.status === 'open' && (!eventId || s.eventId === eventId))
    return res.json(sess || null)
  }
  let list = Object.values(db.sessions)
  if (eventId) list = list.filter(s => s.eventId === eventId)
  res.json(list)
})

// テーブル作成/更新
app.post('/api/tables', (req, res) => {
  const { label, enabled = true } = req.body
  if (!label) return res.status(400).json({ error: 'label 必須' })
  const id = uuidv4()
  db.tables[id] = { id, label, enabled }
  res.status(201).json(db.tables[id])
})

app.patch('/api/tables/:id', (req, res) => {
  const t = db.tables[req.params.id]
  if (!t) return res.status(404).json({ error: 'not found' })
  Object.assign(t, req.body)
  res.json(t)
})

app.delete('/api/tables/:id', (req, res) => {
  const id = req.params.id
  if (!db.tables[id]) return res.status(404).json({ error: 'not found' })
  delete db.tables[id]
  res.json({ ok: true })
})

// 設定取得/更新（アラート設定）
app.get('/api/settings', (req, res) => {
  res.json(db.settings)
})
app.patch('/api/settings', (req, res) => {
  const { alertInitialDelaySec, alertRepeatIntervalSec, alertMaxRepeats } = req.body
  if (typeof alertInitialDelaySec === 'number') db.settings.alertInitialDelaySec = alertInitialDelaySec
  if (typeof alertRepeatIntervalSec === 'number') db.settings.alertRepeatIntervalSec = alertRepeatIntervalSec
  if (typeof alertMaxRepeats === 'number') db.settings.alertMaxRepeats = alertMaxRepeats
  res.json(db.settings)
})

// Events API
app.get('/api/events', (req, res) => {
  res.json(Object.values(db.events))
})

app.post('/api/events', (req, res) => {
  const { name, date } = req.body
  const id = uuidv4()
  db.events[id] = { id, name: name || '営業日', date: date || new Date().toISOString() }
  broadcast('events.updated', Object.values(db.events))
  res.status(201).json(db.events[id])
})

app.post('/api/events/:id/clone-menus', (req, res) => {
  const targetId = req.params.id
  const { fromEventId } = req.body
  if (!db.events[targetId] || !db.events[fromEventId]) return res.status(400).json({ error: 'event not found' })
  const sourceMenus = Object.values(db.menus).filter(m => m.eventId === fromEventId)
  sourceMenus.forEach(sm => {
    const id = uuidv4()
    db.menus[id] = { id, name: sm.name, unitPrice: sm.unitPrice, stockLimit: sm.stockLimit, visible: sm.visible, category: sm.category, optionGroups: sm.optionGroups || [], eventId: targetId }
  })
  broadcast('menus.updated', getVisibleMenus(targetId))
  res.json({ ok: true, count: sourceMenus.length })
})

// Real-time: send heartbeat
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', payload: 'connected' }))
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`)
})

