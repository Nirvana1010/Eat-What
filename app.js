/* 今天吃什么 —— 纯前端，无后端。
   菜库和记录存在浏览器的 IndexedDB 里；图片压缩后以 dataURL 形式一起存。
   首次打开会从 data/dishes.json 载入种子菜库。 */

(() => {
'use strict';

/* ========== 词表（改这里就能改筛选项） ========== */
const CATS    = ['荤菜','素菜','汤羹','主食','凉菜','早餐'];
const MAINS   = ['猪肉','牛肉','羊肉','鸡肉','鱼虾','蛋','豆制品','蔬菜','菌菇','米面'];
const METHODS = ['炒','炖','蒸','煮','焖','煎炸','凉拌'];
const TASTES  = ['清淡','咸鲜','香辣','麻辣','酸甜','酸辣','浓香'];

/* ========== 小工具 ========== */
const $ = id => document.getElementById(id);
const esc = t => { const d = document.createElement('div'); d.textContent = t == null ? '' : t; return d.innerHTML; };
const pad = n => (n < 10 ? '0' : '') + n;
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = iso(new Date());
const daysAgo = s => Math.round((Date.parse(TODAY) - Date.parse(s)) / 864e5);
const newId = () => 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1000);

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}

function cnDate(s) {
  if (s === TODAY) return '今天';
  if (s === iso(new Date(Date.now() - 864e5))) return '昨天';
  const p = s.split('-');
  return `${+p[1]}/${+p[2]}`;
}

/* ========== IndexedDB ========== */
const DB = {
  _p: null,
  open() {
    if (this._p) return this._p;
    this._p = new Promise((res, rej) => {
      const r = indexedDB.open('chishenme', 1);
      r.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('dishes')) d.createObjectStore('dishes', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('log'))    d.createObjectStore('log',    { keyPath: 'k' });
        if (!d.objectStoreNames.contains('meta'))   d.createObjectStore('meta',   { keyPath: 'k' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this._p;
  },
  async all(store) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const q = d.transaction(store).objectStore(store).getAll();
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
  },
  async get(store, key) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const q = d.transaction(store).objectStore(store).get(key);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
  },
  async put(store, ...vals) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      vals.forEach(v => os.put(v));
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async del(store, key) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async clear(store) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
};

/* ========== 状态 ========== */
const state = { dishes: [], log: [], current: null, table: [], ready: false };

let F = { cat:'', taste:'', main:'', method:'', maxMin:0, favOnly:false, avoid:7 };
try { const s = localStorage.getItem('menu.filters'); if (s) F = { ...F, ...JSON.parse(s) }; } catch {}
const saveF = () => { try { localStorage.setItem('menu.filters', JSON.stringify(F)); } catch {} };

const saveDish = d => DB.put('dishes', d).catch(() => toast('没存上'));
const saveLog  = e => DB.put('log', e).catch(() => toast('没存上'));

/* ========== 启动：载入本地数据，首次从 data/dishes.json 播种 ========== */
async function boot() {
  let dishes = [];
  try {
    dishes = await DB.all('dishes');
    state.log = (await DB.all('log')).sort((a, b) => a.k < b.k ? -1 : 1);
  } catch {
    $('libList').innerHTML = '<p class="empty">这个浏览器不让用本地存储，换个浏览器或关掉无痕模式试试。</p>';
    return;
  }

  const seeded = await DB.get('meta', 'seeded');
  if (!dishes.length && !seeded) {
    dishes = await loadSeed();
    if (dishes.length) {
      await DB.put('dishes', ...dishes);
      await DB.put('meta', { k: 'seeded', v: true });
    }
  }

  state.dishes = dishes;
  state.ready = true;
  renderAll();
}

async function loadSeed() {
  try {
    const r = await fetch('data/dishes.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    return (j.items || []).map(normalize);
  } catch {
    toast('读不到 data/dishes.json');
    $('libList').innerHTML =
      '<p class="empty">读不到 data/dishes.json。<br>直接双击 index.html 打开时浏览器会拦下来，' +
      '用 GitHub Pages，或在文件夹里跑 <code>npx serve</code> 再打开。</p>';
    return [];
  }
}

function normalize(d) {
  return {
    id: d.id || newId(),
    n: String(d.n || '').trim(),
    c: CATS.includes(d.c) ? d.c : '荤菜',
    m: MAINS.includes(d.m) ? d.m : '蔬菜',
    k: METHODS.includes(d.k) ? d.k : '炒',
    t: TASTES.includes(d.t) ? d.t : '咸鲜',
    min: Math.max(1, +d.min || 20),
    fav: !!d.fav,
    on: d.on !== false,
    note: d.note || '',
    img: d.img || ''
  };
}

function renderAll() { renderFilters(); renderBoard(); renderLog(); renderLib(); }

/* ========== 筛选 ========== */
function chipRow(key, list, cur) {
  let h = `<button class="chip" data-k="${key}" data-v="" aria-pressed="${cur ? 'false' : 'true'}">不限</button>`;
  for (const v of list) h += `<button class="chip" data-k="${key}" data-v="${v}" aria-pressed="${cur === v ? 'true' : 'false'}">${v}</button>`;
  return h;
}
const grp = (title, html) => `<div class="grp"><h3>${title}</h3><div class="chips">${html}</div></div>`;
const numChips = (key, pairs) => pairs.map(([v, label]) =>
  `<button class="chip" data-k="${key}" data-v="${v}" aria-pressed="${F[key] === v ? 'true' : 'false'}">${label}</button>`).join('');

function renderFilters() {
  $('fpanel').innerHTML =
      grp('分类', chipRow('cat', CATS, F.cat))
    + grp('口味', chipRow('taste', TASTES, F.taste))
    + grp('主料', chipRow('main', MAINS, F.main))
    + grp('做法', chipRow('method', METHODS, F.method))
    + grp('用时', numChips('maxMin', [[0,'不限'],[15,'15 分钟内'],[30,'30 分钟内'],[60,'1 小时内']]))
    + grp('重样', numChips('avoid', [[0,'不避开'],[3,'3 天内不重'],[7,'7 天内不重'],[14,'14 天内不重']]))
    + grp('收藏', `<button class="chip" data-k="favOnly" data-v="1" aria-pressed="${F.favOnly}">只抽收藏的</button>`);

  const sum = [F.cat, F.taste, F.main, F.method];
  if (F.maxMin) sum.push(F.maxMin + ' 分钟内');
  if (F.favOnly) sum.push('收藏');
  $('fsum').textContent = sum.filter(Boolean).join(' · ') || '不限';
}

$('ftoggle').onclick = function () {
  const p = $('fpanel');
  p.hidden = !p.hidden;
  this.textContent = p.hidden ? '筛选' : '收起';
};

$('fpanel').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  const { k, v } = b.dataset;
  if (k === 'favOnly') F.favOnly = !F.favOnly;
  else if (k === 'maxMin' || k === 'avoid') F[k] = +v;
  else F[k] = v;
  saveF(); renderFilters(); renderPoolLine();
});

/* ========== 挑菜逻辑 ========== */
function eatenWithin(id, days) {
  if (!days) return false;
  return state.log.some(e => e.id === id && daysAgo(e.d) < days);
}
function match(d, ignore = {}) {
  if (!d.on) return false;
  if (!ignore.cat && F.cat && d.c !== F.cat) return false;
  if (F.taste && d.t !== F.taste) return false;
  if (F.main && d.m !== F.main) return false;
  if (F.method && d.k !== F.method) return false;
  if (F.maxMin && d.min > F.maxMin) return false;
  if (F.favOnly && !d.fav) return false;
  return true;
}
function pool(useAvoid, ignore) {
  let list = state.dishes.filter(d => match(d, ignore));
  if (useAvoid && F.avoid) list = list.filter(d => !eatenWithin(d.id, F.avoid));
  return list;
}
const randOf = list => list[Math.floor(Math.random() * list.length)];

/* ========== 抽菜 ========== */
function dishTags(d) { return [d.c, d.m, d.k, d.t, d.min + ' 分钟']; }

function renderBoard() {
  const b = $('board');
  const d = state.current;
  if (!d) {
    b.className = 'board blank';
    b.innerHTML = `<div class="pad"><p class="dish placeholder">${state.ready ? '按下面的按钮，抽一道菜' : '正在读菜库…'}</p></div>`;
  } else {
    b.className = 'board';
    b.innerHTML =
      (d.img ? `<img class="photo reveal" src="${esc(d.img)}" alt="${esc(d.n)}" onerror="this.remove()">` : '')
      + `<div class="pad"><p class="dish reveal">${esc(d.n)}</p>`
      + `<div class="tags reveal">${dishTags(d).map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>`
      + (d.note ? `<div class="pool">${esc(d.note)}</div>` : '')
      + '</div>';
  }
  renderPoolLine();
}

function renderPoolLine() {
  const b = $('board');
  let el = b.querySelector('.pool.count');
  if (!el) {
    el = document.createElement('div');
    el.className = 'pool count';
    (b.querySelector('.pad') || b).appendChild(el);
  }
  el.textContent = state.ready ? `符合条件的有 ${pool(true).length} 道` : '';
}

$('btnDraw').onclick = () => {
  let list = pool(true), relaxed = false;
  if (!list.length) { list = pool(false); relaxed = true; }
  if (!list.length) {
    state.current = null;
    $('board').className = 'board blank';
    $('board').innerHTML = '<div class="pad"><p class="dish placeholder">这些条件下没有菜<br>放宽筛选，或去菜库加几道</p></div>';
    $('btnEat').disabled = true;
    return;
  }
  let pick = randOf(list);
  if (list.length > 1 && state.current && pick.id === state.current.id) {
    pick = list[(list.indexOf(pick) + 1) % list.length];
  }
  state.current = pick;
  renderBoard();
  if (relaxed && F.avoid) toast('最近都吃过了，这次不避开重样');
  $('btnEat').disabled = false;
};

function logDish(d) {
  const e = { k: `${TODAY}|${Date.now()}|${Math.random().toString(36).slice(2, 6)}`, d: TODAY, id: d.id, n: d.n };
  state.log.push(e);
  saveLog(e);
}

$('btnEat').onclick = function () {
  if (!state.current) return;
  logDish(state.current);
  renderLog(); renderPoolLine();
  const s = document.createElement('div');
  s.className = 'seal'; s.textContent = '今日';
  $('board').appendChild(s);
  this.disabled = true;
};

function renderLog() {
  const box = $('logList');
  const last = state.log.slice(-14).reverse();
  box.innerHTML = last.length
    ? last.map(e => `<div class="logline"><span>${esc(cnDate(e.d))}</span><div>${esc(e.n || '')}</div></div>`).join('')
    : '<p class="empty">还没有记录。定下来的菜按「就吃它」，以后就能避开重样。</p>';
}

/* ========== 配一桌 ========== */
function buildTable(size) {
  const want = size === 2 ? ['荤菜','素菜']
             : size === 3 ? ['荤菜','素菜','汤羹']
             : ['荤菜','荤菜','素菜','汤羹'];
  const picked = [];
  const used = new Set();
  for (const cat of want) {
    let list = pool(true, { cat: true }).filter(d => d.c === cat && !used.has(d.id));
    if (!list.length) list = pool(false, { cat: true }).filter(d => d.c === cat && !used.has(d.id));
    if (!list.length) list = state.dishes.filter(d => d.on && d.c === cat && !used.has(d.id));
    if (!list.length) continue;
    const p = randOf(list);
    used.add(p.id);
    picked.push(p);
  }
  return picked;
}

function renderTable() {
  const out = $('tableOut');
  if (!state.table.length) {
    out.innerHTML = '<p class="empty">配一桌搭配好的菜，荤素汤各来一道。</p>';
    $('btnTableEat').disabled = true;
    return;
  }
  out.innerHTML = state.table.map(d =>
    `<div class="tablecard">
       ${d.img ? `<img class="thumb" src="${esc(d.img)}" alt="${esc(d.n)}" onerror="this.style.visibility='hidden'">`
               : '<div class="thumb none">无图</div>'}
       <div><div class="n">${esc(d.n)}</div><div class="meta">${esc([d.c, d.m, d.t, d.min + ' 分钟'].join(' · '))}</div></div>
     </div>`).join('');
  $('btnTableEat').disabled = false;
}

$('btnTable').onclick = () => {
  state.table = buildTable(+$('tableSize').value);
  if (!state.table.length) toast('菜库里还没有能配的菜');
  renderTable();
};
$('btnTableEat').onclick = function () {
  state.table.forEach(logDish);
  renderLog(); renderPoolLine();
  toast('记下了，这桌 ' + state.table.length + ' 道菜');
  this.disabled = true;
};

/* ========== 菜库 ========== */
let openId = null;

function thumb(d) {
  return d.img
    ? `<img class="thumb" src="${esc(d.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
    : '<div class="thumb none">无图</div>';
}

function renderLib() {
  const box = $('libList');
  if (!state.ready) { box.innerHTML = '<p class="empty">正在读菜库…</p>'; return; }

  const q = $('q').value.trim();
  const list = state.dishes.filter(d => !q || d.n.includes(q));
  if (!list.length) { box.innerHTML = '<p class="empty">没找到。用上面的「加菜」把它记下来。</p>'; return; }

  const groups = CATS.concat(['其他']);
  let html = '';
  for (const c of groups) {
    const g = list.filter(d => c === '其他' ? !CATS.includes(d.c) : d.c === c);
    if (!g.length) continue;
    html += `<div class="catrule">${esc(c)} <span style="letter-spacing:0">(${g.length})</span></div>`;
    for (const d of g) {
      html += `<div class="item${d.on ? '' : ' off'}" data-id="${d.id}">
        <div class="itemtop">
          ${thumb(d)}
          <div style="flex:1;min-width:0">
            <div class="itemname">${esc(d.n)}</div>
            <div class="meta">${esc([d.m, d.k, d.t, d.min + ' 分钟'].join(' · '))}</div>
          </div>
          <button class="icon${d.fav ? ' on' : ''}" data-act="fav" aria-label="收藏">${d.fav ? '♥' : '♡'}</button>
          <button class="icon" data-act="edit" aria-label="编辑">···</button>
        </div>
        ${openId === d.id ? editor(d) : ''}
      </div>`;
    }
  }
  box.innerHTML = html;
}

function selField(name, list, cur) {
  return `<select class="field" data-f="${name}">${
    list.map(v => `<option${v === cur ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
}

function editor(d) {
  return `<div class="editor">
    <div class="imgbox">
      ${d.img ? `<img src="${esc(d.img)}" alt="">` : '<div class="thumb none" style="width:96px;height:96px">无图</div>'}
      <div class="imgside">
        <label class="btn sm" style="text-align:center">
          上传图片<input type="file" accept="image/*" data-act="pick" hidden>
        </label>
        <input class="field" data-f="img" value="${esc(d.img.startsWith('data:') ? '' : d.img)}"
               placeholder="或填图片地址，如 images/hongshaorou.jpg">
        ${d.img ? '<button class="btn sm danger" data-act="rmimg">去掉图片</button>' : ''}
      </div>
    </div>
    <input class="field" data-f="n" value="${esc(d.n)}" placeholder="菜名">
    <div class="editrow">
      ${selField('c', CATS, d.c)}${selField('m', MAINS, d.m)}${selField('k', METHODS, d.k)}${selField('t', TASTES, d.t)}
      <input class="field" data-f="min" type="number" inputmode="numeric" min="1" value="${d.min}" style="flex:0 0 84px">
    </div>
    <textarea class="field" data-f="note" placeholder="做法要点、配菜、链接…">${esc(d.note)}</textarea>
    <div class="editrow">
      <button class="btn sm" data-act="toggle">${d.on ? '暂时不抽' : '重新启用'}</button>
      <button class="btn sm danger" data-act="del">删掉这道菜</button>
    </div>
  </div>`;
}

const findDish = id => state.dishes.find(d => d.id === id);

$('q').addEventListener('input', renderLib);

$('libList').addEventListener('click', async e => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.dataset.act === 'pick') return;
  const d = findDish(e.target.closest('.item').dataset.id);
  if (!d) return;

  switch (btn.dataset.act) {
    case 'fav':    d.fav = !d.fav; saveDish(d); renderLib(); break;
    case 'edit':   openId = openId === d.id ? null : d.id; renderLib(); break;
    case 'toggle': d.on = !d.on; saveDish(d); renderLib(); renderPoolLine(); break;
    case 'rmimg':  d.img = ''; saveDish(d); renderLib(); if (state.current?.id === d.id) renderBoard(); break;
    case 'del':
      if (!confirm(`把「${d.n}」从菜库删掉？`)) return;
      state.dishes = state.dishes.filter(x => x.id !== d.id);
      await DB.del('dishes', d.id);
      openId = null;
      if (state.current?.id === d.id) { state.current = null; $('btnEat').disabled = true; renderBoard(); }
      renderLib(); renderPoolLine();
      toast('删掉了');
      break;
  }
});

// 编辑框失焦即保存
$('libList').addEventListener('change', async e => {
  const el = e.target;
  const item = el.closest('.item');
  if (!item) return;
  const d = findDish(item.dataset.id);
  if (!d) return;

  if (el.dataset.act === 'pick' && el.files && el.files[0]) {
    try {
      toast('正在压缩图片…');
      d.img = await shrink(el.files[0]);
      await saveDish(d);
      renderLib();
      if (state.current?.id === d.id) renderBoard();
      toast('图片存好了');
    } catch { toast('这张图读不了，换一张'); }
    return;
  }

  const f = el.dataset.f;
  if (!f) return;
  if (f === 'min') d.min = Math.max(1, +el.value || 20);
  else if (f === 'n') { const v = el.value.trim(); if (v) d.n = v; else el.value = d.n; }
  else if (f === 'img') { const v = el.value.trim(); if (v || !d.img.startsWith('data:')) d.img = v; }
  else d[f] = el.value;
  saveDish(d);
  if (state.current?.id === d.id) renderBoard();
  if (f === 'c' || f === 'n' || f === 'img') renderLib();
  renderPoolLine();
});

/* 把图片压到长边 900px 的 JPEG，省空间 */
function shrink(file, max = 900, quality = 0.78) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => {
      const im = new Image();
      im.onerror = rej;
      im.onload = () => {
        const scale = Math.min(1, max / Math.max(im.width, im.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(im.width * scale);
        cv.height = Math.round(im.height * scale);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        res(cv.toDataURL('image/jpeg', quality));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ========== 加菜 ========== */
$('btnAddToggle').onclick = function () {
  const p = $('addPanel');
  if (!p.innerHTML) {
    p.innerHTML = `
      <div class="grp"><input class="field" id="nName" placeholder="菜名" autocomplete="off"></div>
      <div class="grp"><div class="editrow">
        ${selField('c', CATS, '荤菜').replace('data-f="c"', 'id="nCat"')}
        ${selField('m', MAINS, '猪肉').replace('data-f="m"', 'id="nMain"')}
        ${selField('k', METHODS, '炒').replace('data-f="k"', 'id="nMethod"')}
        ${selField('t', TASTES, '咸鲜').replace('data-f="t"', 'id="nTaste"')}
        <input class="field" id="nMin" type="number" inputmode="numeric" min="1" value="20" style="flex:0 0 84px">
      </div></div>
      <div class="grp"><button class="btn primary" id="nSave">加进菜库</button></div>`;
    $('nSave').onclick = addDish;
  }
  p.hidden = !p.hidden;
  this.textContent = p.hidden ? '加菜' : '收起';
  if (!p.hidden) $('nName').focus();
};

async function addDish() {
  const n = $('nName').value.trim();
  if (!n) { toast('先写个菜名'); return; }
  if (state.dishes.some(d => d.n === n)) { toast('菜库里已经有了'); return; }
  const d = normalize({
    id: newId(), n, c: $('nCat').value, m: $('nMain').value,
    k: $('nMethod').value, t: $('nTaste').value, min: +$('nMin').value
  });
  state.dishes.push(d);
  await saveDish(d);
  $('nName').value = '';
  openId = d.id;
  renderLib(); renderPoolLine();
  toast(`加好了：${n}，可以给它配张图`);
}

/* ========== 备份 / 导入 / 重置 ========== */
$('btnExport').onclick = () => {
  const blob = new Blob([JSON.stringify({
    v: 1, exportedAt: new Date().toISOString(), items: state.dishes, log: state.log
  }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `菜库备份-${TODAY}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

$('btnImport').onclick = () => $('fileImport').click();
$('fileImport').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    const items = (j.items || []).map(normalize).filter(d => d.n);
    if (!items.length) throw new Error('empty');
    if (!confirm(`用备份里的 ${items.length} 道菜替换现在的菜库？`)) return;
    await DB.clear('dishes');
    await DB.put('dishes', ...items);
    state.dishes = items;
    if (Array.isArray(j.log)) {
      await DB.clear('log');
      const log = j.log.filter(x => x && x.d && x.id).map((x, i) => ({ ...x, k: x.k || `${x.d}|${i}` }));
      if (log.length) await DB.put('log', ...log);
      state.log = log;
    }
    await DB.put('meta', { k: 'seeded', v: true });
    openId = null;
    renderAll();
    toast('导入好了');
  } catch { toast('这个文件读不了'); }
  e.target.value = '';
});

$('btnReset').onclick = async () => {
  if (!confirm('把菜库恢复成 data/dishes.json 里的初始 84 道？你自己加的菜和图片会没掉，吃过的记录保留。')) return;
  const seed = await loadSeed();
  if (!seed.length) return;
  await DB.clear('dishes');
  await DB.put('dishes', ...seed);
  state.dishes = seed;
  state.current = null; state.table = [];
  openId = null;
  renderAll(); renderTable();
  toast('恢复好了');
};

/* ========== tab 切换 ========== */
document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', String(x === t)));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + t.dataset.view));
  };
});

/* ========== 走起 ========== */
(function initDate() {
  const d = new Date();
  $('today').textContent = `${d.getMonth() + 1}月${d.getDate()}日 周${'日一二三四五六'[d.getDay()]}`;
})();
renderFilters();
boot();

})();
