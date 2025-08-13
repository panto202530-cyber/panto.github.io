const api = (p, opts) => fetch(p, opts).then(r => r.json())

let events = []
let currentEventId = null

async function load() {
  events = await api('/api/events')
  // 最新イベントを先頭に
  events.sort((a,b)=> new Date(b.date)-new Date(a.date))
  if (!currentEventId && events.length>0) currentEventId = events[0].id
  const qs = currentEventId ? `?eventId=${encodeURIComponent(currentEventId)}` : ''
  const [items, menus, sessions, tables] = await Promise.all([
    api('/api/order-items'+qs), api('api/menus'+qs), api('/api/sessions'+qs), api('/api/tables')
  ])
  const mById = new Map(menus.map(m=>[m.id,m]))
  const tById = new Map(tables.map(t=>[t.id,t]))
  const sById = new Map((Array.isArray(sessions)?sessions:(sessions?[sessions]:[])).map(s=>[s.id,s]))
  items.sort((a,b)=> (a.statusTimestamps['注文']||0)-(b.statusTimestamps['注文']||0))
  const tbody = document.getElementById('tbody')
  tbody.innerHTML = ''
  items.forEach(it => {
    const tr = document.createElement('tr')
    const m = mById.get(it.menuId)
    const s = sById.get(it.sessionId)
    const tbl = s ? tById.get(s.tableId) : null
    const payMethod = it.paid && it.paymentId ? 'paid' : ''
    tr.innerHTML = `
      <td>${new Date(it.statusTimestamps['注文']||0).toLocaleString()}</td>
      <td>${tbl?tbl.label:'-'}</td>
      <td>${s ? (s.displayId || s.id.slice(0,6)) : '-'}</td>
      <td>${s ? s.headcount : ''}</td>
      <td>${m?m.name:'?'}</td>
      <td>1</td>
      <td>${m?m.unitPrice:0}</td>
      <td>${payMethod}</td>
    `
    tbody.appendChild(tr)
  })

  renderEventTabs()
  renderEventAdd()
}

document.getElementById('reload').onclick = load

function renderEventTabs() {
  const h = document.querySelector('h1')
  let bar = document.getElementById('eventTabs')
  if (!bar) {
    bar = document.createElement('div')
    bar.id = 'eventTabs'
    bar.style.margin = '8px 0'
    h.insertAdjacentElement('afterend', bar)
  }
  bar.innerHTML = ''
  // 過去は非表示
  const today = new Date(); today.setHours(0,0,0,0)
  events.filter(ev => new Date(ev.date) >= today).forEach(ev => {
    const btn = document.createElement('button')
    btn.textContent = new Date(ev.date).toLocaleDateString()
    if (currentEventId === ev.id) btn.className = 'primary'
    btn.onclick = async () => { currentEventId = ev.id; await load() }
    bar.appendChild(btn)
  })

  // 集計
  renderSummary()
}

async function renderSummary() {
  const qs = currentEventId ? `?eventId=${encodeURIComponent(currentEventId)}` : ''
  const [items, menus] = await Promise.all([ api('/api/order-items'+qs), api('api/menus'+qs) ])
  const mById = new Map(menus.map(m=>[m.id,m]))
  let drinkCount=0, drinkSum=0, foodCount=0, foodSum=0
  items.forEach(it => {
    const m = mById.get(it.menuId); if (!m) return
    if (m.category==='drink') { drinkCount++; drinkSum += m.unitPrice }
    else if (m.category==='food') { foodCount++; foodSum += m.unitPrice }
  })
  const totalCount = drinkCount + foodCount
  const totalSum = drinkSum + foodSum
  let box = document.getElementById('summaryBox')
  if (!box) {
    box = document.createElement('div')
    box.id = 'summaryBox'
    box.style.margin = '8px 0'
    document.getElementById('eventTabs').insertAdjacentElement('afterend', box)
  }
  box.innerHTML = `
    <div><b>DRINK</b> 点数: ${drinkCount} 合計: ¥${drinkSum}</div>
    <div><b>FOOD</b> 点数: ${foodCount} 合計: ¥${foodSum}</div>
    <div><b>総合</b> 点数: ${totalCount} 合計: ¥${totalSum}</div>
  `
}

load()

function renderEventAdd() {
  const box = document.getElementById('eventAdd')
  const cloneSel = document.getElementById('cloneFrom')
  cloneSel.innerHTML = ''
  events.forEach(ev => {
    const opt = document.createElement('option')
    opt.value = ev.id
    opt.textContent = new Date(ev.date).toLocaleDateString()
    cloneSel.appendChild(opt)
  })
  document.getElementById('addEventBtn').onclick = async () => {
    const date = document.getElementById('newEventDate').value
    if (!date) { alert('日付を入力してください'); return }
    const ev = await api('/api/events', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: '営業日', date: new Date(date).toISOString() }) })
    const fromEventId = cloneSel.value
    if (fromEventId) await api(`/api/events/${ev.id}/clone-menus`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fromEventId }) })
    currentEventId = ev.id
    await load()
  }
}

// CSV ダウンロード（営業日ごと）
document.getElementById('downloadCsv')?.addEventListener('click', async () => {
  if (!currentEventId) { alert('営業日を選択してください'); return }
  const qs = `?eventId=${encodeURIComponent(currentEventId)}`
  const [items, menus, sessions, tables] = await Promise.all([
    api('/api/order-items'+qs), api('api/menus'+qs), api('/api/sessions'+qs), api('/api/tables')
  ])
  const mById = new Map(menus.map(m=>[m.id,m]))
  const tById = new Map(tables.map(t=>[t.id,t]))
  const sById = new Map((Array.isArray(sessions)?sessions:(sessions?[sessions]:[])).map(s=>[s.id,s]))
  const rows = [['dateTime','table','menu','unitPrice','quantity','options','amount','canceled','paymentMethod']]
  items.forEach(it => {
    const m = mById.get(it.menuId)
    const s = sById.get(it.sessionId)
    const tbl = s ? tById.get(s.tableId) : null
    const dateTime = new Date(it.statusTimestamps['注文']||0).toISOString()
    const table = tbl?tbl.label:''
    const menu = m?m.name:''
    const unitPrice = m?m.unitPrice:0
    const quantity = 1
    const options = it.optionSelections ? Object.values(it.optionSelections).join('/') : ''
    const amount = unitPrice * quantity
    const canceled = 'false'
    const paymentMethod = it.paid ? 'paid' : ''
    rows.push([dateTime, table, menu, unitPrice, quantity, options, amount, canceled, paymentMethod])
  })
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `orders_${currentEventId}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
})

