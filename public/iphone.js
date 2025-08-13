const api = (p, opts) => fetch(p, opts).then(r => r.json())

let currentSession = null
let menus = []
let takeoutMode = false
let events = []
let currentEventId = null

async function loadTables() {
  const tables = await api('/api/tables')
  const sel = document.getElementById('tableSelect')
  sel.innerHTML = ''
  tables.forEach(t => {
    const opt = document.createElement('option')
    opt.value = t.id
    opt.textContent = t.label
    sel.appendChild(opt)
  })
}

async function loadMenus() {
  const qs = currentEventId ? `?eventId=${encodeURIComponent(currentEventId)}` : ''
  menus = await api('/api/menus'+qs)
  const wrap = document.getElementById('menuList')
  wrap.innerHTML = ''
  menus.forEach(m => {
    const div = document.createElement('div')
    div.className = 'menu-item'
    div.innerHTML = `
      <div class="menu-name">${m.name} <span class="badge">¥${m.unitPrice}</span> ${m.stockLimit <= 0 ? '<span class=\"badge\" style=\"background:#888\">売切</span>' : ''}</div>
      <div class="menu-ops">
        <input type="number" min="1" value="1" style="width:90px"/>
        <button ${m.stockLimit<=0?'disabled':''}>${takeoutMode?'追加':'注文'}</button>
      </div>
      ${Array.isArray(m.optionGroups)&&m.optionGroups.length>0?`<div class="muted">オプションあり</div>`:''}
    `
    const qtyInput = div.querySelector('input')
    const btn = div.querySelector('button')
    btn.addEventListener('click', async () => {
      if (!currentSession) { alert('卓を選択し入店してください'); return }
      const qty = Math.max(1, Number(qtyInput.value||1))
      let optionsPerUnit = []
      if (!takeoutMode && Array.isArray(m.optionGroups) && m.optionGroups.length > 0) {
        optionsPerUnit = await promptOptionsPerUnit(m, qty)
        if (!optionsPerUnit) return
      } else {
        for (let i=0;i<qty;i++) optionsPerUnit.push({})
      }
      if (!takeoutMode) {
        const items = optionsPerUnit.map(o => ({ menuId: m.id, options: o, quantity: 1 }))
        try {
          await api('/api/orders', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ sessionId: currentSession.id, items, serviceType: 'dinein' })
          })
          await refreshOrderList(); await loadMenus()
        } catch(e) { console.error(e) }
      } else {
        // takeoutMode: バスケットに溜めて最後に一括送信
        addBasket(m, Number(qtyInput.value||1))
      }
    })
    wrap.appendChild(div)
  })
}

async function promptOptionsPerUnit(menu, qty) {
  return new Promise(resolve => {
    const dlg = document.createElement('div')
    dlg.style.position='fixed'; dlg.style.inset='0'; dlg.style.background='rgba(0,0,0,.4)'; dlg.style.display='flex'; dlg.style.alignItems='center'; dlg.style.justifyContent='center'
    const card = document.createElement('div')
    card.style.background='#fff'; card.style.padding='16px'; card.style.borderRadius='8px'; card.style.width='90%'; card.style.maxWidth='420px'
    card.innerHTML = `<div style="font-size:18px;font-weight:600;margin-bottom:8px">${menu.name} オプション</div>`
    const g = menu.optionGroups[0] // 単純化: 1グループのみ
    for (let i=0;i<qty;i++) {
      const row = document.createElement('div')
      row.className = 'row'
      const label = document.createElement('div')
      label.textContent = `#${i+1}`
      const sel = document.createElement('select')
      g.options.forEach(opt => {
        const o = document.createElement('option')
        o.value = opt.id
        o.textContent = opt.name
        sel.appendChild(o)
      })
      row.appendChild(label); row.appendChild(sel)
      card.appendChild(row)
    }
    const act = document.createElement('div')
    act.style.display='flex'; act.style.gap='8px'; act.style.marginTop='12px'
    const ok = document.createElement('button')
    ok.textContent = '決定'; ok.className='primary'
    const cancel = document.createElement('button')
    cancel.textContent = 'やめる'
    act.appendChild(ok); act.appendChild(cancel)
    card.appendChild(act)
    dlg.appendChild(card)
    document.body.appendChild(dlg)
    cancel.onclick = () => { document.body.removeChild(dlg); resolve(null) }
    ok.onclick = () => {
      const selects = card.querySelectorAll('select')
      const result = [...selects].map(s => ({ [g.id]: s.value }))
      document.body.removeChild(dlg)
      resolve(result)
    }
  })
}

async function refreshOrderList() {
  if (!currentSession) { document.getElementById('orderList').innerHTML = ''; return }
  const items = await api(`/api/order-items?sessionId=${currentSession.id}`)
  const wrap = document.getElementById('orderList')
  wrap.innerHTML = ''
  items.forEach(it => {
    const menu = menus.find(m => m.id === it.menuId)
    const div = document.createElement('div')
    div.className = 'menu-item'
    const optText = it.optionSelections && Object.keys(it.optionSelections).length>0 ? ` / ${Object.values(it.optionSelections).join(',')}` : ''
    div.innerHTML = `
      <div>${menu?menu.name:'?'}${optText} <span class="badge">${it.status}</span></div>
      <div class="menu-ops">
        <button class="danger" ${it.status!=='注文'?'disabled':''}>取消</button>
      </div>
    `
    div.querySelector('button').onclick = async () => {
      await api(`/api/order-items/${it.id}`, { method: 'DELETE' })
      await refreshOrderList()
      await loadMenus()
    }
    wrap.appendChild(div)
  })
}

async function tryRestoreSession(tableId) {
  const sess = await api(`/api/sessions?tableId=${tableId}`)
  if (sess && sess.status==='open') {
    currentSession = sess
  } else {
    currentSession = null
  }
  renderSessionInfo()
  await refreshOrderList()
}

function renderSessionInfo() {
  const el = document.getElementById('sessionInfo')
  if (!currentSession) { el.textContent = 'セッションなし'; return }
  el.textContent = `卓: ${currentSession.displayId || currentSession.tableId} / 人数: ${currentSession.headcount} / 回次: ${currentSession.tableUseSeq||1}`
}

async function init() {
  await loadEvents()
  await loadTables()
  await loadMenus()
  const sel = document.getElementById('tableSelect')
  sel.addEventListener('change', () => tryRestoreSession(sel.value))
  await tryRestoreSession(sel.value)

  document.getElementById('startSession').onclick = async () => {
    const tableId = sel.value
    const headcount = Number(document.getElementById('headcount').value||1)
    const evParam = currentEventId ? `&eventId=${encodeURIComponent(currentEventId)}` : ''
    const existing = await api(`/api/sessions?tableId=${tableId}${evParam}`)
    if (existing) { currentSession = existing; renderSessionInfo(); return }
    currentSession = await api('/api/sessions', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ tableId, headcount, eventId: currentEventId }) })
    renderSessionInfo()
  }

  // ページ下部の会計ボタンは削除済み
  document.getElementById('closeBill').onclick = async () => {
    if (!currentSession) { alert('セッションがありません'); return }
    const allItems = await api(`/api/order-items?sessionId=${currentSession.id}`)
    const unpaid = allItems.filter(i => !i.paid)
    showCheckoutOverlay(unpaid)
  }

  const ws = new WebSocket((location.protocol==='https:'?'wss':'ws')+'://'+location.host)
  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data)
    if (['orders.created','orderItems.updated','orderItems.deleted','menus.updated'].includes(msg.type)) {
      await loadMenus(); await refreshOrderList()
    }
  }
}

async function doPayment(method) {
  if (!currentSession) { alert('セッションがありません'); return }
  // fallback simple payment (not used in new overlay)
  const allItems = await api(`/api/order-items?sessionId=${currentSession.id}`)
  const unpaidIds = allItems.filter(i => !i.paid).map(i => i.id)
  const p = await api('/api/payments', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ sessionId: currentSession.id, method, orderItemIds: unpaidIds, serviceType: 'dinein', splitType: 'same', applyCouponOnlineStore: false }) })
  alert(`会計完了: ¥${p.totalAmount}`)
  await tryRestoreSession(document.getElementById('tableSelect').value)
}

init()

// お持ち帰りモード
document.getElementById('toggleTakeout').onclick = () => {
  takeoutMode = !takeoutMode
  document.getElementById('toggleTakeout').className = takeoutMode ? 'primary' : ''
  if (takeoutMode) showBasketOverlay()
}

async function loadEvents() {
  events = await api('/api/events')
  // 過去分非表示（当日以降のみ）
  const today = new Date(); today.setHours(0,0,0,0)
  events = events.filter(ev => new Date(ev.date) >= today)
  const sel = document.getElementById('eventSelect')
  sel.innerHTML = ''
  events.forEach(ev => {
    const opt = document.createElement('option')
    opt.value = ev.id
    opt.textContent = new Date(ev.date).toLocaleDateString()
    sel.appendChild(opt)
  })
  currentEventId = events[0] ? events[0].id : null
  sel.onchange = async () => { currentEventId = sel.value; await loadMenus(); await refreshOrderList() }
}

// Takeout basket helpers
let basket = new Map()
function addBasket(menu, qty) {
  basket.set(menu.id, (basket.get(menu.id)||0) + qty)
  showBasketOverlay()
}

function showBasketOverlay() {
  let dlg = document.getElementById('basketDlg')
  if (!takeoutMode) { if (dlg) dlg.remove(); return }
  if (!dlg) {
    dlg = document.createElement('div'); dlg.id = 'basketDlg'
    dlg.style.position='fixed'; dlg.style.inset='0'; dlg.style.background='rgba(0,0,0,.6)'; dlg.style.display='flex'; dlg.style.alignItems='center'; dlg.style.justifyContent='center'; dlg.style.zIndex='9999'
    const card = document.createElement('div'); card.id='basketCard'
    card.style.background='#fff'; card.style.borderRadius='12px'; card.style.width='96%'; card.style.maxWidth='560px'; card.style.maxHeight='90vh'; card.style.overflow='auto'; card.style.padding='16px'
    dlg.appendChild(card); document.body.appendChild(dlg)
  }
  const card = document.getElementById('basketCard')
  card.innerHTML = ''
  const title = document.createElement('div'); title.textContent='お持ち帰り 一括注文'; title.style.fontSize='22px'; title.style.fontWeight='700'
  const list = document.createElement('div')
  menus.forEach(m => {
    const row = document.createElement('div'); row.className='row'; row.style.alignItems='center'
    const name = document.createElement('div'); name.textContent = `${m.name} (¥${m.unitPrice})`; name.style.flex='1'
    const minus = document.createElement('button'); minus.textContent='−'
    const cnt = document.createElement('input'); cnt.type='number'; cnt.value=String(basket.get(m.id)||0); cnt.style.width='80px'
    const plus = document.createElement('button'); plus.textContent='+'
    minus.onclick = ()=>{ const v=Math.max(0,(basket.get(m.id)||0)-1); basket.set(m.id,v); cnt.value=String(v) }
    plus.onclick = ()=>{ const v=(basket.get(m.id)||0)+1; basket.set(m.id,v); cnt.value=String(v) }
    cnt.onchange = ()=>{ const v=Math.max(0,Number(cnt.value||0)); basket.set(m.id,v) }
    row.appendChild(name); row.appendChild(minus); row.appendChild(cnt); row.appendChild(plus)
    list.appendChild(row)
  })
  const acts = document.createElement('div'); acts.style.display='flex'; acts.style.gap='8px'; acts.style.marginTop='12px'
  const order = document.createElement('button'); order.textContent='注文する'; order.className='primary'
  const close = document.createElement('button'); close.textContent='閉じる'
  acts.appendChild(order); acts.appendChild(close)
  card.appendChild(title); card.appendChild(list); card.appendChild(acts)
  close.onclick = ()=>{ takeoutMode=false; document.getElementById('toggleTakeout').className=''; dlg.remove() }
  order.onclick = async ()=>{
    if (!currentSession) { alert('卓を選択し入店してください'); return }
    const items = []
    basket.forEach((q, menuId) => { for (let i=0;i<q;i++) items.push({ menuId, options:{}, quantity:1 }) })
    if (items.length===0) { alert('数量が0です'); return }
    await api('/api/orders', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sessionId: currentSession.id, items, serviceType: 'takeout' }) })
    basket = new Map(); dlg.remove(); await refreshOrderList(); await loadMenus()
  }
}

function showCheckoutOverlay(unpaidItems) {
  const dlg = document.createElement('div')
  dlg.style.position='fixed'; dlg.style.inset='0'; dlg.style.background='rgba(0,0,0,.6)'; dlg.style.display='flex'; dlg.style.alignItems='center'; dlg.style.justifyContent='center'; dlg.style.zIndex='9999'
  const card = document.createElement('div')
  card.style.background='#fff'; card.style.borderRadius='12px'; card.style.width='96%'; card.style.maxWidth='560px'; card.style.maxHeight='90vh'; card.style.overflow='auto'; card.style.padding='16px'
  const title = document.createElement('div')
  title.style.fontSize='22px'; title.style.fontWeight='700'; title.textContent='お会計'

  const list = document.createElement('div')
  const state = { splitType: 'same', serviceType: 'dinein', applyCoupon: false, selected: new Set(unpaidItems.map(i=>i.id)) }
  const recalc = () => {
    // build rows
    list.innerHTML = ''
    const byId = new Map(menus.map(m=>[m.id,m]))
    const selectedItems = unpaidItems.filter(i=>state.selected.has(i.id))
    // aggregate for display
    const lines = []
    selectedItems.forEach(it => {
      const m = byId.get(it.menuId)
      lines.push({ id: it.id, name: m?m.name:'?', price: m?m.unitPrice:0, category: m?m.category:undefined, option: it.optionSelections })
    })
    // coupon: pick highest priced drink and food
    let discount = 0
    if (state.applyCoupon) {
      const drinks = lines.filter(l=>l.category==='drink').sort((a,b)=>b.price-a.price)
      const foods = lines.filter(l=>l.category==='food').sort((a,b)=>b.price-a.price)
      if (drinks[0]) discount += drinks[0].price
      if (foods[0]) discount += foods[0].price
    }
    const subtotal = lines.reduce((s,l)=>s+l.price,0)
    const total = Math.max(0, subtotal - discount)

    const itemsArea = document.createElement('div')
    itemsArea.style.margin='8px 0'
    unpaidItems.forEach(it => {
      const m = byId.get(it.menuId)
      const row = document.createElement('div')
      row.className='row'
      const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=state.selected.has(it.id); cb.disabled = state.splitType==='same'
      cb.onchange = () => { if (cb.checked) state.selected.add(it.id); else state.selected.delete(it.id); recalc() }
      const label = document.createElement('span'); label.textContent = `${m?m.name:'?'} / ¥${m?m.unitPrice:0}`
      row.appendChild(cb); row.appendChild(label); itemsArea.appendChild(row)
    })

    const summary = document.createElement('div')
    summary.style.fontSize='20px'; summary.style.fontWeight='700'; summary.style.margin='8px 0'
    summary.textContent = `合計: ¥${total}（小計: ¥${subtotal}${state.applyCoupon?` / クーポン割引: -¥${discount}`:''}）`

    list.appendChild(itemsArea)
    list.appendChild(summary)
  }

  const controls = document.createElement('div')
  controls.innerHTML = `
    <div style="margin:8px 0;">
      会計種別: 
      <label><input type="radio" name="split" value="same" checked> 同時会計</label>
      <label style="margin-left:12px"><input type="radio" name="split" value="split"> 別会計</label>
    </div>
    <div style="margin:8px 0;">
      提供形態: 
      <label><input type="radio" name="svc" value="dinein" checked> 店内</label>
      <label style="margin-left:12px"><input type="radio" name="svc" value="takeout"> お持ち帰り</label>
    </div>
    <div style="margin:8px 0;">
      クーポン: <label><input type="checkbox" id="coupon"> オンラインストア購入特典（ドリンク1杯 + フード1杯 無料）</label>
    </div>
  `
  const acts = document.createElement('div')
  acts.style.display='flex'; acts.style.gap='8px'; acts.style.marginTop='12px'
  const payCash = document.createElement('button'); payCash.textContent='現金で会計'; payCash.className='primary'
  const payQR = document.createElement('button'); payQR.textContent='QRで会計'
  const cancel = document.createElement('button'); cancel.textContent='閉じる'
  acts.appendChild(payCash); acts.appendChild(payQR); acts.appendChild(cancel)

  card.appendChild(title)
  card.appendChild(controls)
  card.appendChild(list)
  card.appendChild(acts)
  dlg.appendChild(card)
  document.body.appendChild(dlg)

  controls.querySelectorAll('input[name="split"]').forEach(r => r.onchange = (e)=>{ state.splitType = e.target.value; recalc() })
  controls.querySelectorAll('input[name="svc"]').forEach(r => r.onchange = (e)=>{ state.serviceType = e.target.value })
  controls.querySelector('#coupon').onchange = (e)=>{ state.applyCoupon = e.target.checked; recalc() }

  payCash.onclick = () => finalizePayment('cash')
  payQR.onclick = () => finalizePayment('qr')
  cancel.onclick = () => document.body.removeChild(dlg)

  function finalizePayment(method) {
    const orderItemIds = Array.from(state.selected)
    api('/api/payments', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sessionId: currentSession.id, method, orderItemIds, applyCouponOnlineStore: state.applyCoupon, serviceType: state.serviceType, splitType: state.splitType }) })
      .then(p => {
        alert(`会計完了: ¥${p.totalAmount}`)
        document.body.removeChild(dlg)
        tryRestoreSession(document.getElementById('tableSelect').value)
      })
  }

  recalc()
}

