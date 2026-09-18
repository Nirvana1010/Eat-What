/* 今天吃什么 —— 静态页面 + Supabase。
   菜库、吃过的记录存在 Supabase 的表里，图片存在 Storage 桶里，
   所以换设备打开同一个网址就是同一份数据。
   读不需要登录，改需要登录（规则见 supabase.sql）。 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* ========== 词表（改这里就能改筛选项） ========== */
const CATS    = ['猪肉','牛肉','羊肉','鸡肉','海鲜','鸡蛋','素菜','火锅','汤羹','主食','凉菜','早餐'];
const METHODS = ['炒','炖','蒸','煮','焖','煎炸','凉拌'];

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
const state = { dishes: [], log: [], current: null, ready: false, session: null };
const canEdit = () => !!state.session;

let F = { cat:'', method:'', maxMin:0, favOnly:false, avoid:7 };
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
    id: r.id, n: r.name, c: r.category, k: r.method,
    min: r.minutes, fav: !!r.fav, on: r.active !== false, note: r.note || '', img: r.img || ''
  };
}
const toRow = d => ({
  id: d.id, name: d.n, category: d.c, method: d.k,
  minutes: d.min, fav: d.fav, active: d.on, note: d.note, img: d.img, updated_at: new Date().toISOString()
});

function normalize(d) {
  return {
    id: d.id || newId(),
    n: String(d.n || '').trim(),
    c: CATS.includes(d.c) ? d.c : '素菜',
    k: METHODS.includes(d.k) ? d.k : '炒',
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
    + grp('做法', chipRow('method', METHODS, F.method))
    + grp('用时', numChips('maxMin', [[0,'不限'],[15,'15 分钟内'],[30,'30 分钟内'],[60,'1 小时内']]))
    + grp('重样', numChips('avoid', [[0,'不避开'],[3,'3 天内不重'],[7,'7 天内不重'],[14,'14 天内不重']]))
    + grp('收藏', `<button class="chip" data-k="favOnly" data-v="1" aria-pressed="${F.favOnly}">只抽收藏的</button>`);

  const sum = [F.cat, F.method].filter(Boolean);
  if (F.maxMin) sum.push(F.maxMin + ' 分钟内');
  if (F.favOnly) sum.push('只抽收藏');
  $('fsum').textContent = sum.length ? sum.join(' · ') : '全部菜里随便抽';

  const badge = $('fcount');
  badge.hidden = !sum.length;
  badge.textContent = sum.length;
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

function match(d) {
  if (!d.on) return false;
  if (F.cat && d.c !== F.cat) return false;
  if (F.method && d.k !== F.method) return false;
  if (F.maxMin && d.min > F.maxMin) return false;
  if (F.favOnly && !d.fav) return false;
  return true;
}
function pool(useAvoid) {
  let list = state.dishes.filter(d => match(d));
  if (useAvoid && F.avoid) list = list.filter(d => !eatenWithin(d.id, F.avoid));
  return list;
}

/* ========== 抽菜 ========== */
const dishTags = d => [d.c, d.k, d.min + ' 分钟'];
const tagHtml = d => `<div class="tags">${dishTags(d).map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>`;

function renderBoard() {
  const b = $('board');
  const d = state.current;

  if (!d) {
    b.className = 'board blank';
    b.innerHTML = `<p class="dish placeholder">${state.ready ? '按下面的按钮，抽一道菜' : '正在读菜库…'}</p>`;
  } else if (d.img) {
    b.className = 'board';
    b.innerHTML = `<img class="photo" src="${esc(d.img)}" alt="${esc(d.n)}"
                        onerror="this.closest('.board').classList.add('noimg');this.remove()">
      <div class="overlay reveal">
        <p class="dish">${esc(d.n)}</p>${tagHtml(d)}
        ${d.note ? `<p class="note">${esc(d.note)}</p>` : ''}
      </div>`;
  } else {
    b.className = 'board blank';
    b.innerHTML = `<div class="reveal"><p class="dish">${esc(d.n)}</p>${tagHtml(d)}
      ${d.note ? `<p class="note">${esc(d.note)}</p>` : ''}</div>`;
  }
  renderPoolLine();
}

function renderPoolLine() {
  $('poolLine').textContent = state.ready ? `符合条件的有 ${pool(true).length} 道` : '';
}

$('btnDraw').onclick = () => {
  let list = pool(true), relaxed = false;
  if (!list.length) { list = pool(false); relaxed = true; }
  if (!list.length) {
    state.current = null;
    $('board').className = 'board blank';
    $('board').innerHTML = '<p class="dish placeholder">这些条件下没有菜<br>放宽筛选，或去菜库加几道</p>';
    $('btnEat').disabled = true;
    renderPoolLine();
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
  const last = state.log.slice(-12).reverse();
  if (!last.length) {
    box.innerHTML = '<p class="empty">还没有记录。定下来的菜按「就吃它」，以后就能避开重样。</p>';
    return;
  }
  box.innerHTML = last.map(e => {
    const d = findDish(e.id);
    const t = d?.img
      ? `<img class="lt" src="${esc(d.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
      : '<div class="lt"></div>';
    return `<div class="logline"><span class="when">${esc(cnDate(e.d))}</span>${t}<div class="ln">${esc(e.n || '')}</div></div>`;
  }).join('');
}

/* ========== 菜库 ========== */
let libCat = '';
const findDish = id => state.dishes.find(d => d.id === id);

function renderCatNav() {
  const counts = {};
  for (const d of state.dishes) counts[d.c] = (counts[d.c] || 0) + 1;
  const cats = CATS.filter(c => counts[c]);
  const other = state.dishes.filter(d => !CATS.includes(d.c)).length;
  $('catnav').innerHTML =
    `<button class="chip" data-c="" aria-pressed="${libCat ? 'false' : 'true'}">全部 ${state.dishes.length}</button>`
    + cats.map(c => `<button class="chip" data-c="${c}" aria-pressed="${libCat === c ? 'true' : 'false'}">${c} ${counts[c]}</button>`).join('')
    + (other ? `<button class="chip" data-c="其他" aria-pressed="${libCat === '其他' ? 'true' : 'false'}">其他 ${other}</button>` : '');
}

$('catnav').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  libCat = b.dataset.c;
  renderCatNav(); renderLib();
});

function tile(d) {
  const meta = [d.k, d.min + ' 分钟'].join(' · ');
  const marks = (d.fav ? '<span class="heart">♥</span>' : '')
              + (d.on ? '' : '<span class="resting">歇着</span>');
  if (d.img) {
    return `<button class="tile${d.on ? '' : ' off'}" data-id="${d.id}">
      <img src="${esc(d.img)}" alt="" loading="lazy"
           onerror="this.closest('.tile').classList.add('nophoto');this.remove()">
      ${marks}<div class="cap"><div class="cn">${esc(d.n)}</div><div class="cm">${esc(meta)}</div></div>
    </button>`;
  }
  return `<button class="tile nophoto${d.on ? '' : ' off'}" data-id="${d.id}">
    ${marks}<div class="cn">${esc(d.n)}</div><div class="cm">${esc(meta)}</div>
  </button>`;
}

function renderLib() {
  const box = $('libList');
  if (!state.ready && !state.dishes.length) { box.innerHTML = '<p class="empty">正在读菜库…</p>'; return; }
  renderCatNav();

  const q = $('q').value.trim();
  const list = state.dishes.filter(d =>
    (!q || d.n.includes(q)) &&
    (!libCat || (libCat === '其他' ? !CATS.includes(d.c) : d.c === libCat)));

  if (!list.length) {
    box.innerHTML = state.dishes.length
      ? '<p class="empty">这儿没有菜。<br>换个分类，或者用右上角「加菜」记一道。</p>'
      : '<p class="empty">菜库还是空的。<br>登录后点下面的「导入初始 97 道菜」，或者直接「加菜」。</p>';
    return;
  }
  box.innerHTML = `<div class="grid">${list.map(tile).join('')}</div>`;
}

$('q').addEventListener('input', renderLib);
$('libList').addEventListener('click', e => {
  const t = e.target.closest('.tile');
  if (t) openSheet(findDish(t.dataset.id));
});

/* ========== 底部抽屉：看 / 改 / 加 ========== */
let pendingFile = null;
let draft = null;

const selField = (name, list, cur) => `<select class="field" data-f="${name}">${
  list.map(v => `<option${v === cur ? ' selected' : ''}>${v}</option>`).join('')}</select>`;

function sheetBody(d, isNew) {
  const pv = d.img
    ? `<img class="pv" src="${esc(d.img)}" alt="">`
    : '<div class="pv none">还没图</div>';
  return `<div class="scrim" data-act="close"></div>
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="grab"></div>
      <div class="sheethead">
        <h2>${isNew ? '加一道菜' : esc(d.n)}</h2>
        ${isNew ? '' : `<button class="icon${d.fav ? ' on' : ''}" data-act="fav" aria-label="收藏">${d.fav ? '♥' : '♡'}</button>`}
        <button class="icon" data-act="close" aria-label="关闭">✕</button>
      </div>
      <div class="editor">
        <div class="imgbox">
          ${pv}
          <div class="imgside">
            <label class="filelabel">${d.img ? '换张图片' : '上传图片'}<input type="file" accept="image/*" data-act="pick" hidden></label>
            <input class="field" data-f="img" value="${esc(d.img)}" placeholder="或粘贴图片网址">
            ${d.img ? '<button class="btn sm danger" data-act="rmimg">去掉图片</button>' : ''}
          </div>
        </div>
        <input class="field" data-f="n" value="${esc(d.n)}" placeholder="菜名">
        <div class="editrow">
          ${selField('c', CATS, d.c)}${selField('k', METHODS, d.k)}
          <input class="field" data-f="min" type="number" inputmode="numeric" min="1" value="${d.min}" style="flex:0 0 88px">
        </div>
        <textarea class="field" data-f="note" placeholder="做法要点、配菜、链接…">${esc(d.note)}</textarea>
        ${isNew
          ? '<button class="btn primary wide" data-act="create">加进菜库</button>'
          : `<div class="editrow" style="margin-top:4px">
               <button class="btn sm" data-act="toggle">${d.on ? '暂时不抽' : '重新启用'}</button>
               <button class="btn sm danger" data-act="del">删掉这道菜</button>
               <button class="btn sm" data-act="close" style="margin-left:auto">完成</button>
             </div>`}
      </div>
    </div>`;
}

function openSheet(d, isNew = false) {
  if (!d) return;
  draft = isNew ? d : null;
  pendingFile = null;
  const el = $('sheet');
  el.innerHTML = sheetBody(d, isNew);
  el.hidden = false;
  el.dataset.id = d.id;
  el.dataset.new = isNew ? '1' : '';
  document.body.style.overflow = 'hidden';
}

function closeSheet() {
  $('sheet').hidden = true;
  $('sheet').innerHTML = '';
  draft = null; pendingFile = null;
  document.body.style.overflow = '';
}

const sheetDish = () => $('sheet').dataset.new ? draft : findDish($('sheet').dataset.id);

function refreshSheet() {
  const d = sheetDish();
  const isNew = !!$('sheet').dataset.new;
  if (!d) return closeSheet();
  $('sheet').innerHTML = sheetBody(d, isNew);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });

$('sheet').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.dataset.act === 'pick') return;
  const act = b.dataset.act;
  if (act === 'close') return closeSheet();

  const d = sheetDish();
  if (!d) return closeSheet();
  if (!canEdit()) { toast('先在菜库页登录才能改'); return; }

  if (act === 'create') { await createDish(d); return; }

  if (act === 'fav')    { d.fav = !d.fav; await saveDish(d); refreshSheet(); renderLib(); }
  if (act === 'toggle') { d.on = !d.on;  await saveDish(d); refreshSheet(); renderLib(); renderPoolLine(); }
  if (act === 'rmimg')  {
    const old = d.img; d.img = '';
    if (await saveDish(d)) { deletePhoto(old); refreshSheet(); renderLib(); if (state.current?.id === d.id) renderBoard(); }
  }
  if (act === 'del') {
    if (!confirm(`把「${d.n}」从菜库删掉？`)) return;
    if (!await removeDish(d)) return;
    state.dishes = state.dishes.filter(x => x.id !== d.id);
    if (state.current?.id === d.id) { state.current = null; $('btnEat').disabled = true; renderBoard(); }
    closeSheet(); renderLib(); renderPoolLine(); toast('删掉了');
  }
});

$('sheet').addEventListener('change', async e => {
  const el = e.target;
  const d = sheetDish();
  if (!d) return;
  const isNew = !!$('sheet').dataset.new;
  if (!canEdit()) { toast('先在菜库页登录才能改'); return; }

  /* 选图片 */
  if (el.dataset.act === 'pick' && el.files?.[0]) {
    if (isNew) {                       // 新菜先本地预览，保存时再传
      pendingFile = el.files[0];
      const pv = $('sheet').querySelector('.pv');
      const url = URL.createObjectURL(pendingFile);
      pv.outerHTML = `<img class="pv" src="${url}" alt="">`;
      return;
    }
    try {
      toast('正在上传…');
      const old = d.img;
      d.img = await uploadPhoto(d.id, el.files[0]);
      if (await saveDish(d)) { if (old) deletePhoto(old); toast('图片存好了'); }
      refreshSheet(); renderLib();
      if (state.current?.id === d.id) renderBoard();
    } catch (err) { toast('传不上去：' + (err.message || '')); }
    return;
  }

  /* 普通字段 */
  const f = el.dataset.f;
  if (!f) return;
  if (f === 'min') d.min = Math.max(1, +el.value || 20);
  else if (f === 'n') { const v = el.value.trim(); if (v) d.n = v; else { el.value = d.n; return; } }
  else d[f] = typeof el.value === 'string' ? el.value.trim() : el.value;

  if (isNew) return;                   // 新菜等「加进菜库」一起存
  await saveDish(d);
  if (state.current?.id === d.id) renderBoard();
  renderLib(); renderPoolLine();
  if (f === 'n') $('sheet').querySelector('.sheethead h2').textContent = d.n;
});

/* ========== 加菜 ========== */
$('btnAddToggle').onclick = () => {
  if (!canEdit()) { toast('先登录才能加菜'); return; }
  openSheet(normalize({ id: newId(), n: '', c: libCat && CATS.includes(libCat) ? libCat : '猪肉' }), true);
  setTimeout(() => $('sheet').querySelector('[data-f="n"]')?.focus(), 60);
};

async function createDish(d) {
  const nameEl = $('sheet').querySelector('[data-f="n"]');
  d.n = (nameEl?.value || '').trim();
  if (!d.n) { toast('先写个菜名'); nameEl?.focus(); return; }
  if (state.dishes.some(x => x.n === d.n)) { toast('菜库里已经有了'); return; }

  const btn = $('sheet').querySelector('[data-act="create"]');
  btn.disabled = true; btn.textContent = '正在存…';
  try {
    if (pendingFile) d.img = await uploadPhoto(d.id, pendingFile);
  } catch { toast('图片没传上去，菜先加了'); }

  if (await saveDish(d)) {
    state.dishes.push(d);
    closeSheet(); renderLib(); renderPoolLine();
    toast(`加好了：${d.n}`);
  } else {
    btn.disabled = false; btn.textContent = '加进菜库';
  }
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
  if (!confirm('把 data/dishes.json 里的 97 道菜写进云端菜库？已经存在的同名菜不会重复添加。')) return;
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
