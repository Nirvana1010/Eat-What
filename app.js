/* 今天吃什么 —— 静态页面 + Supabase。
   菜库、吃过的记录存在 Supabase 的表里，图片存在 Storage 桶里，
   所以换设备打开同一个网址就是同一份数据。
   读不需要登录，改需要登录（规则见 supabase.sql）。 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

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
const randOf = list => list[Math.floor(Math.random() * list.length)];

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function cnDate(s) {
  if (s === TODAY) return '今天';
  if (s === iso(new Date(Date.now() - 864e5))) return '昨天';
  const p = s.split('-');
  return `${+p[1]}/${+p[2]}`;
}

/* ========== Supabase ========== */
const CFG = window.CONFIG || {};
// 新的 sb_publishable_ key 和老的 anon key（eyJ 开头的 JWT）都支持
const KEY = CFG.SUPABASE_KEY || CFG.SUPABASE_ANON_KEY || '';
const CONFIGURED = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test((CFG.SUPABASE_URL || '').trim())
                && (KEY.startsWith('sb_publishable_') || KEY.startsWith('eyJ'));
const BUCKET = CFG.BUCKET || 'dish-photos';
const sb = CONFIGURED ? createClient(CFG.SUPABASE_URL.trim().replace(/\/$/, ''), KEY) : null;

/* ========== 状态 ========== */
const state = { dishes: [], log: [], current: null, table: [], ready: false, session: null };
const canEdit = () => !!state.session;

let F = { cat:'', taste:'', main:'', method:'', maxMin:0, favOnly:false, avoid:7 };
try { const s = localStorage.getItem('menu.filters'); if (s) F = { ...F, ...JSON.parse(s) }; } catch {}
const saveF = () => { try { localStorage.setItem('menu.filters', JSON.stringify(F)); } catch {} };

/* 本地只做缓存：网速慢时先把上次的内容画出来，联网后立刻覆盖 */
function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem('menu.cache') || 'null');
    if (c && Array.isArray(c.dishes)) { state.dishes = c.dishes; state.log = c.log || []; return true; }
  } catch {}
  return false;
}
function writeCache() {
  try { localStorage.setItem('menu.cache', JSON.stringify({ dishes: state.dishes, log: state.log })); } catch {}
}

/* ========== 行 <-> 内部结构 ========== */
function fromRow(r) {
  return {
    id: r.id, n: r.name, c: r.category, m: r.main_ing, k: r.method, t: r.taste,
    min: r.minutes, fav: !!r.fav, on: r.active !== false, note: r.note || '', img: r.img || ''
  };
}
const toRow = d => ({
  id: d.id, name: d.n, category: d.c, main_ing: d.m, method: d.k, taste: d.t,
  minutes: d.min, fav: d.fav, active: d.on, note: d.note, img: d.img, updated_at: new Date().toISOString()
});

function normalize(d) {
  return {
    id: d.id || newId(),
    n: String(d.n || '').trim(),
    c: CATS.includes(d.c) ? d.c : '荤菜',
    m: MAINS.includes(d.m) ? d.m : '蔬菜',
    k: METHODS.includes(d.k) ? d.k : '炒',
    t: TASTES.includes(d.t) ? d.t : '咸鲜',
    min: Math.max(1, +d.min || 20),
    fav: !!d.fav, on: d.on !== false, note: d.note || '', img: d.img || ''
  };
}

/* ========== 读写云端 ========== */
async function pull() {
  const [a, b] = await Promise.all([
    sb.from('dishes').select('*'),
    sb.from('meals').select('*').order('eaten_on', { ascending: true }).limit(400)
  ]);
  if (a.error) throw a.error;
  state.dishes = (a.data || []).map(fromRow).sort((x, y) => x.id < y.id ? -1 : 1);
  state.log = b.error ? [] : (b.data || []).map(r => ({ k: r.id, d: r.eaten_on, id: r.dish_id, n: r.dish_name }));
  writeCache();
}

async function saveDish(d) {
  if (!canEdit()) { toast('先在菜库页登录才能改'); return false; }
  const { error } = await sb.from('dishes').upsert(toRow(d));
  if (error) { toast('没存上：' + error.message); return false; }
  writeCache();
  return true;
}

async function removeDish(d) {
  const { error } = await sb.from('dishes').delete().eq('id', d.id);
  if (error) { toast('删不掉：' + error.message); return false; }
  if (d.img) deletePhoto(d.img);
  writeCache();
  return true;
}

async function logDish(d) {
  const e = { k: `${TODAY}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, d: TODAY, id: d.id, n: d.n };
  state.log.push(e);
  writeCache();
  if (!canEdit()) { toast('没登录，这条记录只存在这台设备上'); return; }
  const { error } = await sb.from('meals')
    .insert({ id: e.k, eaten_on: e.d, dish_id: e.id, dish_name: e.n });
  if (error) toast('记录没同步上去');
}

/* ========== 图片 ========== */
function shrink(file, max = 1000, quality = 0.8) {
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
        cv.toBlob(b => b ? res(b) : rej(new Error('encode')), 'image/jpeg', quality);
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

async function uploadPhoto(dishId, file) {
  const blob = await shrink(file);
  const path = `${dishId}/${Date.now()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function pathOf(url) {
  const marker = `/object/public/${BUCKET}/`;
  const i = (url || '').indexOf(marker);
  return i < 0 ? null : decodeURIComponent(url.slice(i + marker.length));
}
function deletePhoto(url) {
  const p = pathOf(url);
  if (p) sb.storage.from(BUCKET).remove([p]).catch(() => {});
}

/* ========== 登录 ========== */
function renderAccount() {
  const box = $('account');
  if (!CONFIGURED) {
    box.innerHTML = '<div class="warn">config.js 里的 Supabase 地址或 key 还没填对，改不了也同步不了。看 README。</div>';
    return;
  }
  box.innerHTML = state.session
    ? `<div class="acct"><span>已登录 ${esc(state.session.user.email || '')}</span>
         <button class="btn sm" id="btnOut">退出</button></div>`
    : `<div class="acct"><span>只读模式，登录后才能改菜库</span></div>
       <div class="row" style="margin-top:8px">
         <input class="field" id="email" type="email" inputmode="email" placeholder="邮箱" autocomplete="email">
         <button class="btn sm" id="btnIn">发登录链接</button>
       </div>`;

  if ($('btnOut')) $('btnOut').onclick = async () => { await sb.auth.signOut(); };
  if ($('btnIn')) $('btnIn').onclick = async () => {
    const email = $('email').value.trim();
    if (!email) { toast('填个邮箱'); return; }
    $('btnIn').disabled = true;
    const { error } = await sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: location.origin + location.pathname }
    });
    $('btnIn').disabled = false;
    toast(error ? '发不出去：' + error.message : '链接发到邮箱了，点开就登录');
  };
  $('btnSeed').hidden = !canEdit();
}

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

/* ========== 挑菜 ========== */
const eatenWithin = (id, days) => !!days && state.log.some(e => e.id === id && daysAgo(e.d) < days);

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

/* ========== 抽菜 ========== */
const dishTags = d => [d.c, d.m, d.k, d.t, d.min + ' 分钟'];

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

$('btnEat').onclick = async function () {
  if (!state.current) return;
  this.disabled = true;
  await logDish(state.current);
  renderLog(); renderPoolLine();
  const s = document.createElement('div');
  s.className = 'seal'; s.textContent = '今日';
  $('board').appendChild(s);
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
  const picked = [], used = new Set();
  for (const cat of want) {
    let list = pool(true, { cat: true }).filter(d => d.c === cat && !used.has(d.id));
    if (!list.length) list = pool(false, { cat: true }).filter(d => d.c === cat && !used.has(d.id));
    if (!list.length) list = state.dishes.filter(d => d.on && d.c === cat && !used.has(d.id));
    if (!list.length) continue;
    const p = randOf(list);
    used.add(p.id); picked.push(p);
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
$('btnTableEat').onclick = async function () {
  this.disabled = true;
  for (const d of state.table) await logDish(d);
  renderLog(); renderPoolLine();
  toast(`记下了，这桌 ${state.table.length} 道菜`);
};

/* ========== 菜库 ========== */
let openId = null;
const findDish = id => state.dishes.find(d => d.id === id);

const thumb = d => d.img
  ? `<img class="thumb" src="${esc(d.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
  : '<div class="thumb none">无图</div>';

function renderLib() {
  const box = $('libList');
  if (!state.ready && !state.dishes.length) { box.innerHTML = '<p class="empty">正在读菜库…</p>'; return; }

  const q = $('q').value.trim();
  const list = state.dishes.filter(d => !q || d.n.includes(q));
  if (!list.length) {
    box.innerHTML = state.dishes.length
      ? '<p class="empty">没找到。用上面的「加菜」把它记下来。</p>'
      : '<p class="empty">菜库还是空的。<br>登录后点下面的「导入初始 84 道菜」，或者直接「加菜」。</p>';
    return;
  }

  let html = '';
  for (const c of CATS.concat(['其他'])) {
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
        <label class="btn sm filelabel">上传图片<input type="file" accept="image/*" data-act="pick" hidden></label>
        <input class="field" data-f="img" value="${esc(d.img)}" placeholder="或粘贴一个图片网址">
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

$('q').addEventListener('input', renderLib);

$('libList').addEventListener('click', async e => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.dataset.act === 'pick') return;
  const d = findDish(e.target.closest('.item').dataset.id);
  if (!d) return;
  const act = btn.dataset.act;

  if (act === 'edit') { openId = openId === d.id ? null : d.id; renderLib(); return; }
  if (!canEdit()) { toast('先在菜库页登录才能改'); return; }

  if (act === 'fav')    { d.fav = !d.fav; await saveDish(d); renderLib(); }
  if (act === 'toggle') { d.on = !d.on;  await saveDish(d); renderLib(); renderPoolLine(); }
  if (act === 'rmimg')  {
    const old = d.img; d.img = '';
    if (await saveDish(d)) { deletePhoto(old); renderLib(); if (state.current?.id === d.id) renderBoard(); }
  }
  if (act === 'del') {
    if (!confirm(`把「${d.n}」从菜库删掉？`)) return;
    if (!await removeDish(d)) return;
    state.dishes = state.dishes.filter(x => x.id !== d.id);
    openId = null;
    if (state.current?.id === d.id) { state.current = null; $('btnEat').disabled = true; renderBoard(); }
    renderLib(); renderPoolLine(); toast('删掉了');
  }
});

$('libList').addEventListener('change', async e => {
  const el = e.target;
  const item = el.closest('.item');
  if (!item) return;
  const d = findDish(item.dataset.id);
  if (!d) return;
  if (!canEdit()) { toast('先在菜库页登录才能改'); renderLib(); return; }

  if (el.dataset.act === 'pick' && el.files?.[0]) {
    try {
      toast('正在上传…');
      const old = d.img;
      d.img = await uploadPhoto(d.id, el.files[0]);
      if (await saveDish(d)) { if (old) deletePhoto(old); toast('图片存好了'); }
      renderLib();
      if (state.current?.id === d.id) renderBoard();
    } catch (err) { toast('传不上去：' + (err.message || '')); }
    return;
  }

  const f = el.dataset.f;
  if (!f) return;
  if (f === 'min') d.min = Math.max(1, +el.value || 20);
  else if (f === 'n') { const v = el.value.trim(); if (v) d.n = v; else { el.value = d.n; return; } }
  else d[f] = el.value.trim ? el.value.trim() : el.value;

  await saveDish(d);
  if (state.current?.id === d.id) renderBoard();
  if (f === 'c' || f === 'n' || f === 'img') renderLib();
  renderPoolLine();
});

/* ========== 加菜（带配图） ========== */
let pendingFile = null;

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
      <div class="grp"><div class="imgbox">
        <div id="nPreview" class="thumb none" style="width:96px;height:96px">无图</div>
        <div class="imgside">
          <label class="btn sm filelabel">选张图片<input type="file" accept="image/*" id="nFile" hidden></label>
          <input class="field" id="nImgUrl" placeholder="或粘贴一个图片网址">
        </div>
      </div></div>
      <div class="grp"><button class="btn primary" id="nSave">加进菜库</button></div>`;
    $('nSave').onclick = addDish;
    $('nFile').addEventListener('change', e => {
      pendingFile = e.target.files?.[0] || null;
      const box = $('nPreview');
      if (!pendingFile) return;
      const url = URL.createObjectURL(pendingFile);
      box.outerHTML = `<img id="nPreview" src="${url}" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:3px">`;
    });
  }
  p.hidden = !p.hidden;
  this.textContent = p.hidden ? '加菜' : '收起';
  if (!p.hidden) $('nName').focus();
};

async function addDish() {
  if (!canEdit()) { toast('先登录才能加菜'); return; }
  const n = $('nName').value.trim();
  if (!n) { toast('先写个菜名'); return; }
  if (state.dishes.some(d => d.n === n)) { toast('菜库里已经有了'); return; }

  const btn = $('nSave');
  btn.disabled = true;
  const d = normalize({
    id: newId(), n, c: $('nCat').value, m: $('nMain').value,
    k: $('nMethod').value, t: $('nTaste').value, min: +$('nMin').value,
    img: $('nImgUrl').value.trim()
  });

  try {
    if (pendingFile) { toast('正在上传图片…'); d.img = await uploadPhoto(d.id, pendingFile); }
  } catch (err) { toast('图片没传上去，菜先加了'); }

  if (await saveDish(d)) {
    state.dishes.push(d);
    $('nName').value = ''; $('nImgUrl').value = ''; $('nFile').value = ''; pendingFile = null;
    const pv = $('nPreview');
    if (pv) pv.outerHTML = '<div id="nPreview" class="thumb none" style="width:96px;height:96px">无图</div>';
    renderLib(); renderPoolLine();
    toast(`加好了：${n}`);
  }
  btn.disabled = false;
}

/* ========== 备份 / 播种 ========== */
$('btnExport').onclick = () => {
  const blob = new Blob([JSON.stringify({
    v: 2, exportedAt: new Date().toISOString(), items: state.dishes, log: state.log
  }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `菜库备份-${TODAY}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

$('btnSeed').onclick = async function () {
  if (!canEdit()) { toast('先登录'); return; }
  if (!confirm('把 data/dishes.json 里的 84 道菜写进云端菜库？已经存在的同名菜不会重复添加。')) return;
  this.disabled = true;
  try {
    const r = await fetch('data/dishes.json', { cache: 'no-store' });
    const j = await r.json();
    const have = new Set(state.dishes.map(d => d.n));
    const add = (j.items || []).map(normalize).filter(d => d.n && !have.has(d.n));
    if (!add.length) { toast('没有要加的'); this.disabled = false; return; }
    const { error } = await sb.from('dishes').upsert(add.map(toRow));
    if (error) throw error;
    await pull();
    renderLib(); renderPoolLine(); renderLog();
    toast(`加了 ${add.length} 道`);
  } catch (err) { toast('没成功：' + (err.message || '')); }
  this.disabled = false;
};

/* ========== tab ========== */
document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', String(x === t)));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + t.dataset.view));
  };
});

/* ========== 启动 ========== */
(function initDate() {
  const d = new Date();
  $('today').textContent = `${d.getMonth() + 1}月${d.getDate()}日 周${'日一二三四五六'[d.getDay()]}`;
})();

renderFilters();
if (readCache()) { renderBoard(); renderLog(); renderLib(); }

if (!CONFIGURED) {
  state.ready = true;
  renderAccount(); renderBoard(); renderLib();
  $('cloudNote').textContent = '还没连上云端。填好 config.js 再刷新。';
} else {
  sb.auth.getSession().then(({ data }) => { state.session = data.session; renderAccount(); renderLib(); });
  sb.auth.onAuthStateChange((_e, session) => { state.session = session; renderAccount(); renderLib(); });

  pull().then(() => {
    state.ready = true;
    renderBoard(); renderLog(); renderLib(); renderPoolLine();
  }).catch(err => {
    state.ready = true;
    toast('连不上云端：' + (err.message || ''));
    $('cloudNote').textContent = '云端读不到，现在显示的是这台设备上次缓存的内容。';
    renderBoard(); renderLog(); renderLib();
  });
}
