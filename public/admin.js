const api = (p, opts) => fetch(p, opts).then(r => r.json())

async function loadMenus() {
  const menus = await api('api/menus')
  const tbody = document.getElementById('menuT')
  tbody.innerHTML = ''
  menus.forEach(m => {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${m.name}</td>
      <td>¥${m.unitPrice}</td>
      <td>${m.stockLimit}</td>
      <td>${m.category||'-'}</td>
      <td>${m.visible? '表示':'非表示'}</td>
      <td>
        <button data-act="toggle">表示切替</button>
        <button data-act="+stock">在庫+10</button>
        <button data-act="-stock">在庫-10</button>
      </td>
    `
    tr.querySelectorAll('button').forEach(btn => btn.onclick = async () => {
      const act = btn.getAttribute('data-act')
      if (act === 'toggle') await api(`api/menus/${m.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ visible: !m.visible }) })
      if (act === '+stock') await api(`api/menus/${m.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ stockLimit: m.stockLimit + 10 }) })
      if (act === '-stock') await api(`api/menus/${m.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ stockLimit: Math.max(0, m.stockLimit - 10) }) })
      await loadMenus()
    })
    tbody.appendChild(tr)
  })
}

async function loadTables() {
  const tables = await api('/api/tables')
  const tbody = document.getElementById('tableT')
  tbody.innerHTML = ''
  tables.forEach(t => {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${t.id.slice(0,8)}</td>
      <td>${t.label}</td>
      <td>${t.enabled? '有効':'無効'}</td>
      <td>
        <button data-act="toggle">有効切替</button>
        <button data-act="delete">削除</button>
      </td>
    `
    tr.querySelectorAll('button').forEach(btn => btn.onclick = async ()=>{
      const act = btn.getAttribute('data-act')
      if (act==='toggle') await api(`/api/tables/${t.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ enabled: !t.enabled }) })
      if (act==='delete') { if (confirm('削除しますか？')) await api(`/api/tables/${t.id}`, { method: 'DELETE' }) }
      await loadTables()
    })
    tbody.appendChild(tr)
  })
}

async function loadSettings() {
  const s = await api('/api/settings')
  document.getElementById('sInit').value = s.alertInitialDelaySec
  document.getElementById('sInt').value = s.alertRepeatIntervalSec
  document.getElementById('sMax').value = s.alertMaxRepeats
}

function bindActions() {
  document.getElementById('addMenu').onclick = async () => {
    const name = document.getElementById('mName').value.trim()
    const unitPrice = Number(document.getElementById('mPrice').value||0)
    const stockLimit = Number(document.getElementById('mStock').value||0)
    const category = document.getElementById('mCat').value
    if (!name || !unitPrice) { alert('名称と単価は必須'); return }
    await api('api/menus', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, unitPrice, stockLimit, visible:true, category }) })
    document.getElementById('mName').value = ''
    await loadMenus()
  }
  document.getElementById('addTable').onclick = async () => {
    const label = document.getElementById('tLabel').value.trim()
    if (!label) return
    await api('/api/tables', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ label }) })
    document.getElementById('tLabel').value = ''
    await loadTables()
  }
  document.getElementById('saveSettings').onclick = async () => {
    const alertInitialDelaySec = Number(document.getElementById('sInit').value||600)
    const alertRepeatIntervalSec = Number(document.getElementById('sInt').value||300)
    const alertMaxRepeats = Number(document.getElementById('sMax').value||3)
    await api('/api/settings', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ alertInitialDelaySec, alertRepeatIntervalSec, alertMaxRepeats }) })
    alert('保存しました')
  }
}

async function init() {
  bindActions()
  await Promise.all([loadMenus(), loadTables(), loadSettings()])
  await loadEvents()
  await loadEventMenus()
}

// 営業日管理（表示連動）
let events = []
let currentEventId = null
async function loadEvents() {
  events = await api('/api/events')
  const sel = document.getElementById('eventSelect')
  sel.innerHTML = ''
  events.forEach(ev => {
    const opt = document.createElement('option')
    opt.value = ev.id
    opt.textContent = new Date(ev.date).toLocaleDateString()
    sel.appendChild(opt)
  })
  currentEventId = events[0] ? events[0].id : null
  sel.onchange = async () => { currentEventId = sel.value; await loadEventMenus() }
  document.getElementById('refreshEvents').onclick = async ()=>{ await loadEvents(); await loadEventMenus() }
}

async function loadEventMenus() {
  if (!currentEventId) { document.getElementById('eventMenuT').innerHTML=''; return }
  const menus = await api('api/menus?eventId='+encodeURIComponent(currentEventId))
  const tbody = document.getElementById('eventMenuT')
  tbody.innerHTML = ''
  menus.forEach(m => {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${m.name}</td>
      <td>¥${m.unitPrice}</td>
      <td>${m.stockLimit}</td>
      <td>${m.category||'-'}</td>
      <td>${m.visible? '表示':'非表示'}</td>
      <td>
        <button data-act="toggle">表示切替</button>
        <button data-act="+stock">在庫+10</button>
        <button data-act="-stock">在庫-10</button>
        <button data-act="delete">削除</button>
      </td>
    `
    tr.querySelectorAll('button').forEach(btn => btn.onclick = async () => {
      const act = btn.getAttribute('data-act')
      if (act === 'toggle') await api(`api/menus/${m.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ visible: !m.visible }) })
      if (act === '+stock') await api(`api/menus/${m.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ stockLimit: m.stockLimit + 10 }) })
      if (act === '-stock') await api(`api/menus/${m.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ stockLimit: Math.max(0, m.stockLimit - 10) }) })
      if (act === 'delete') { if (confirm('削除しますか？')) { await api(`api/menus/${m.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ visible:false }) }) } }
      await loadEventMenus()
    })
    tbody.appendChild(tr)
  })

  document.getElementById('emAdd').onclick = async () => {
    const name = document.getElementById('emName').value.trim()
    const unitPrice = Number(document.getElementById('emPrice').value||0)
    const stockLimit = Number(document.getElementById('emStock').value||0)
    const category = document.getElementById('emCat').value
    const visible = document.getElementById('emVisible').checked
    if (!name || !unitPrice) { alert('名称と単価は必須'); return }
    await api('api/menus', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, unitPrice, stockLimit, visible, category, eventId: currentEventId }) })
    document.getElementById('emName').value = ''
    await loadEventMenus()
  }
}

init()

