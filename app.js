/* 今天吃什么 —— 静态页面 + Supabase。
   两套互不相干的数据：
     在家吃 → dishes / meals
     出去吃 → places / visits
   界面代码共用一套，差异都收在下面的 MODES 配置里。
   读不需要登录，改需要登录（规则见 supabase.sql / places.sql）。 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* ========== 词表（改这里就能改分类和筛选项） ========== */
const CATS_HOME = ['猪肉','牛肉','羊肉','鸡肉','海鲜','鸡蛋','素菜','火锅','汤羹','主食','凉菜','早餐'];
const METHODS   = ['炒','炖','蒸','煮','焖','煎炸','烤','凉拌'];

const CATS_OUT  = ['中餐','日料','韩餐','越南','泰国','墨西哥','美式','西餐','印度','中东','烧烤','甜品咖啡'];
const PRICES    = ['$','$$','$$$'];

/* ========== 线描图标 ========== */
const ICON_PATHS = {
  /* --- 在家：按主料分 --- */
  '猪肉': '<path d="M5.4 9.6 4.1 6.3l3.3 1.2"/><path d="M18.6 9.6l1.3-3.3-3.3 1.2"/>'
        + '<path d="M12 7.2c3.9 0 6.8 2.5 6.8 5.6S15.9 19 12 19s-6.8-3.1-6.8-6.2S8.1 7.2 12 7.2Z"/>'
        + '<ellipse cx="12" cy="14.3" rx="2.7" ry="1.9"/>'
        + '<circle cx="11.1" cy="14.3" r=".45"/><circle cx="12.9" cy="14.3" r=".45"/>',
  '牛肉': '<path d="M7.6 8.4C5.2 9 2.7 8 1.6 5.8c2.2-1.3 4.9-.9 6.6 1"/>'
        + '<path d="M16.4 8.4c2.4.6 4.9-.4 6-2.6-2.2-1.3-4.9-.9-6.6 1"/>'
        + '<path d="M12 7.5c2.9 0 4.7 1.8 4.7 4.2 0 1.5-.5 3-1.4 4.1-.9 1.1-2 1.8-3.3 1.8s-2.4-.7-3.3-1.8c-.9-1.1-1.4-2.6-1.4-4.1 0-2.4 1.8-4.2 4.7-4.2Z"/>'
        + '<ellipse cx="12" cy="15.3" rx="2.5" ry="1.7"/>'
        + '<circle cx="10.2" cy="11.2" r=".5"/><circle cx="13.8" cy="11.2" r=".5"/>',
  '羊肉': '<path d="M7.9 9.4c-1.1-.5-1.4-2-.5-2.9.1-1.4 1.4-2.4 2.8-2.1.9-1.1 2.6-1.2 3.6-.2 1.3-.5 2.8.3 3.1 1.7 1.1.5 1.4 2 .5 2.9"/>'
        + '<path d="M16.4 8.8c.3.8.5 1.7.5 2.6 0 3.1-2.2 5.6-4.9 5.6s-4.9-2.5-4.9-5.6c0-.9.2-1.8.5-2.6"/>'
        + '<path d="M7.4 10.4c-1.5-.6-3 0-3.5 1.4 1.1 1 2.6 1.1 3.7.3"/>'
        + '<path d="M16.6 10.4c1.5-.6 3 0 3.5 1.4-1.1 1-2.6 1.1-3.7.3"/>'
        + '<circle cx="10.4" cy="12.2" r=".5"/><circle cx="13.6" cy="12.2" r=".5"/>',
  '鸡肉': '<path d="M7.9 6.9c0-1.1 1.2-1.6 1.9-.8.4-1.1 1.9-1.2 2.4-.2.6-.8 1.9-.4 2 .8"/>'
        + '<path d="M11.6 7.9c2.9 0 5.2 2.3 5.2 5.2 0 3-2.3 5.6-5.2 5.6s-5.2-2.6-5.2-5.6c0-2.9 2.3-5.2 5.2-5.2Z"/>'
        + '<path d="M16.6 11.7 20.4 13l-3.8 1.4"/>'
        + '<path d="M14.4 17.9c1 .3 1.5 1.4 1 2.3-1 .1-1.9-.6-2-1.6"/>'
        + '<circle cx="13.8" cy="11.6" r=".55"/>',
  '海鲜': '<path d="M22 12s-3.7 5-8.6 5S4.8 12 4.8 12s3.7-5 8.6-5S22 12 22 12Z"/>'
        + '<path d="M4.9 12 1.6 8.2v7.6L4.9 12Z"/>'
        + '<path d="M14.6 7.6c-1 1.3-1.5 2.8-1.5 4.4s.5 3.1 1.5 4.4"/>'
        + '<path d="M10.4 8.6c.9.6 1.5 1.6 1.7 2.7"/>'
        + '<circle cx="18" cy="11.1" r=".6"/>',
  '鸡蛋': '<path d="M14 4.6c2.7 0 4.9 3.9 4.9 7.1 0 3.1-2.2 5.5-4.9 5.5s-4.9-2.4-4.9-5.5c0-3.2 2.2-7.1 4.9-7.1Z"/>'
        + '<path d="M7.9 9.9c1.5 0 2.8 2.3 2.8 4.2 0 1.8-1.3 3.2-2.8 3.2S5 15.9 5 14.1c0-1.9 1.3-4.2 2.9-4.2Z"/>',
  '素菜': '<path d="M12 19.6V9.2"/>'
        + '<path d="M12 12.6c-1.9-2.6-1.3-6 1.4-7.7 1.6 2.9 1 6.1-1.4 7.7Z"/>'
        + '<path d="M12 15.2c-2.5.5-4.9-1.1-5.6-3.6 2.6-.7 5.1.6 5.6 3.6Z"/>'
        + '<path d="M12 15.2c2.5.5 4.9-1.1 5.6-3.6-2.6-.7-5.1.6-5.6 3.6Z"/>',
  '火锅': '<path d="M8.8 4.8c0 1.1-1 1.4-1 2.5M12 3.9c0 1.3-1 1.6-1 2.8M15.2 4.8c0 1.1-1 1.4-1 2.5"/>'
        + '<path d="M3.6 10.4h16.8v1.3c0 3.8-3.1 6.9-6.9 6.9h-3c-3.8 0-6.9-3.1-6.9-6.9v-1.3Z"/>'
        + '<path d="M3.6 12.6H2.1M20.4 12.6h1.5M12 10.4v8.2"/>',
  '汤羹': '<path d="M9.4 4.6c-.9 1.1.9 1.9 0 3M14.6 4.6c-.9 1.1.9 1.9 0 3"/>'
        + '<path d="M3.5 10.6h17c0 4.1-3.3 7.4-7.4 7.4h-2.2c-4.1 0-7.4-3.3-7.4-7.4Z"/>'
        + '<path d="M8.6 20.3h6.8"/>',
  '主食': '<path d="M2.4 12.6h12.8c0 3.5-2.9 6.4-6.4 6.4s-6.4-2.9-6.4-6.4Z"/>'
        + '<path d="M4.1 12.6c.8-2.3 2.8-3.8 4.7-3.8s3.9 1.5 4.7 3.8"/>'
        + '<path d="M5.3 20.4h7"/>'
        + '<path d="M12.6 12.1 20.9 4.4M14.6 13.4 21.6 7"/>',
  '凉菜': '<ellipse cx="12" cy="15" rx="8.6" ry="4.2"/>'
        + '<circle cx="9" cy="14.5" r="1.5"/><circle cx="12.5" cy="15.7" r="1.5"/><circle cx="15.5" cy="14.1" r="1.5"/>'
        + '<path d="M12 10.8c.4-1.9 2.1-3.2 4-3.3"/>',
  '早餐': '<path d="M8.8 4.2c-.8 1 .8 1.8 0 2.8M13 4.2c-.8 1 .8 1.8 0 2.8"/>'
        + '<path d="M4.4 9.3h11.4v5.5c0 2.5-2.1 4.6-4.6 4.6H9c-2.5 0-4.6-2.1-4.6-4.6V9.3Z"/>'
        + '<path d="M15.8 10.7h1.9c1.3 0 2.4 1.1 2.4 2.4s-1.1 2.4-2.4 2.4h-1.9"/>',

  /* --- 出去吃：按菜系分 --- */
  '中餐':   '<path d="M9 5.2c0 1-1 1.3-1 2.3M15 5.2c0 1-1 1.3-1 2.3"/>'
          + '<path d="M3.8 8.8h16.4v2.8H3.8Z"/>'
          + '<path d="M5.1 11.6h13.8v3.2H5.1Z"/>'
          + '<path d="M6.4 14.8h11.2v3.4H6.4Z"/>',
  '日料':   '<circle cx="8.8" cy="14.2" r="5.2"/><circle cx="8.8" cy="14.2" r="2.1"/>'
          + '<circle cx="16.4" cy="9.6" r="4.3"/><circle cx="16.4" cy="9.6" r="1.7"/>',
  '韩餐':   '<path d="M9.4 4.6c-.9 1.1.9 1.9 0 3M14.6 4.6c-.9 1.1.9 1.9 0 3"/>'
          + '<path d="M4.4 10.6h15.2v1.5c0 3.3-2.7 6-6 6h-3.2c-3.3 0-6-2.7-6-6v-1.5Z"/>'
          + '<path d="M4.4 12.6H2.6M19.6 12.6h1.8"/>'
          + '<path d="M9.6 20.4h4.8"/>',
  '越南':   '<path d="M2.4 12.6h12.8c0 3.5-2.9 6.4-6.4 6.4s-6.4-2.9-6.4-6.4Z"/>'
          + '<path d="M4.1 12.6c.8-2.3 2.8-3.8 4.7-3.8s3.9 1.5 4.7 3.8"/>'
          + '<path d="M5.3 20.4h7"/>'
          + '<path d="M12.6 12.1 20.9 4.4M14.6 13.4 21.6 7"/>',
  '泰国':   '<path d="M5.4 18.6c5 1.2 9.6-2 10.5-7 .3-2-.7-3.5-2.5-3.8-2.1-.4-3.8 1.1-4.1 3.3-.5 3.6-2.1 6-3.9 7.2Z"/>'
          + '<path d="M13.6 7.8c.3-1.7 1.7-2.9 3.5-3"/>',
  '墨西哥': '<path d="M3.2 17.2c0-4.9 3.9-8.8 8.8-8.8s8.8 3.9 8.8 8.8H3.2Z"/>'
          + '<path d="M6.6 13.6c1.5-1.1 3.4-1.7 5.4-1.7s3.9.6 5.4 1.7"/>'
          + '<path d="M8.4 16c1-.7 2.3-1.1 3.6-1.1s2.6.4 3.6 1.1"/>',
  '美式':   '<path d="M3.6 10.6c0-3.3 3.8-6 8.4-6s8.4 2.7 8.4 6H3.6Z"/>'
          + '<path d="M3.9 13.1h16.2"/>'
          + '<path d="M4.3 15.6h15.4c0 2-1.7 3.7-3.7 3.7H8c-2 0-3.7-1.7-3.7-3.7Z"/>'
          + '<circle cx="9" cy="7.8" r=".5"/><circle cx="13.6" cy="7.1" r=".5"/>',
  '西餐':   '<path d="M7.2 3.4v4.2M9.6 3.4v4.2M12 3.4v4.2"/>'
          + '<path d="M7.2 7.6a2.4 2.4 0 0 0 4.8 0"/>'
          + '<path d="M9.6 10v10.6"/>'
          + '<path d="M17.4 3.4c1.5 2.1 2.2 4.6 2.2 6.9 0 1.3-.9 2.1-2.2 2.1v8.2"/>',
  '印度':   '<path d="M12 4.8 20.2 18.8H3.8Z"/>'
          + '<path d="M12 4.8v8.2"/>'
          + '<path d="M7.4 12.6c2.9 1.4 6.3 1.4 9.2 0"/>',
  '中东':   '<path d="M12 2.6v18.8"/>'
          + '<path d="M8 6.6a1.7 1.7 0 0 1 1.7-1.7h4.6a1.7 1.7 0 0 1 0 3.4H9.7A1.7 1.7 0 0 1 8 6.6Z"/>'
          + '<path d="M8 12a1.7 1.7 0 0 1 1.7-1.7h4.6a1.7 1.7 0 0 1 0 3.4H9.7A1.7 1.7 0 0 1 8 12Z"/>'
          + '<path d="M8 17.4a1.7 1.7 0 0 1 1.7-1.7h4.6a1.7 1.7 0 0 1 0 3.4H9.7A1.7 1.7 0 0 1 8 17.4Z"/>',
  '烧烤':   '<path d="M4.2 11.4a7.8 7.8 0 0 1 15.6 0Z"/>'
          + '<path d="M3 12.7h18"/>'
          + '<path d="M5 12.7h14c0 2.3-1.9 4.2-4.2 4.2H9.2C6.9 16.9 5 15 5 12.7Z"/>'
          + '<path d="M7.6 16.6 5.6 21M16.4 16.6l2 4.4"/>',
  '甜品咖啡': '<path d="M4.4 10.8h15.2v7.4H4.4Z"/>'
          + '<path d="M4.4 10.8 12 7.4l7.6 3.4"/>'
          + '<path d="M4.4 14.5h15.2"/>'
          + '<path d="M12 7.4V5.6"/><circle cx="12" cy="4.6" r="1.1"/>',

  '其他': '<path d="M3.5 10.6h17c0 4.1-3.3 7.4-7.4 7.4h-2.2c-4.1 0-7.4-3.3-7.4-7.4Z"/><path d="M8.6 20.3h6.8"/>'
};
const icon = c => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[c] || ICON_PATHS['其他']}</svg>`;

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

/* 地址可以是一行文本，也可以是从地图 App 复制来的分享链接 */
const mapUrl = a => /^https?:\/\//i.test(a)
  ? a
  : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);

/* ========== Supabase ========== */
const CFG = window.CONFIG || {};
const KEY = CFG.SUPABASE_KEY || CFG.SUPABASE_ANON_KEY || '';
const CONFIGURED = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test((CFG.SUPABASE_URL || '').trim())
                && (KEY.startsWith('sb_publishable_') || KEY.startsWith('eyJ'));
const BUCKET = CFG.BUCKET || 'dish-photos';
const sb = CONFIGURED ? createClient(CFG.SUPABASE_URL.trim().replace(/\/$/, ''), KEY) : null;

/* ========== 两种模式的差异都收在这儿 ========== */
const selField = (name, list, cur) => `<select class="field" data-f="${name}">${
  list.map(v => `<option${v === cur ? ' selected' : ''}>${v}</option>`).join('')}</select>`;

const MODES = {
  home: {
    cats: CATS_HOME,
    table: 'dishes',  logTable: 'meals',
    logCols: { date: 'eaten_on', ref: 'dish_id', name: 'dish_name' },
    photoDir: '',
    tabs: ['菜单', '抽菜'],
    txt: {
      lib: '菜单', search: '搜菜名', add: '加菜', addTitle: '加一道菜', namePh: '菜名',
      draw: '抽一道', pick: '就吃它', logHead: '最近吃过', unit: '道',
      hint: '按下面的按钮，抽一道菜', none: '这些条件下没有菜<br>放宽筛选，或去菜单加几道',
      notePh: '做法要点、配菜、链接…', del: '删掉这道菜', backup: '菜单备份',
      emptyLog: '还没有记录。定下来的菜按「就吃它」，以后就能避开重样。',
      emptyLib: '这儿没有菜。<br>换个分类，或者用右上角「加菜」记一道。',
      emptyAll: '菜单还是空的。<br>登录后点下面的「导入菜单」，或者直接「加菜」。',
      loading: '正在读菜单…', dup: '菜单里已经有了', added: '加好了',
      logIcon: '汤羹', allIcon: '主食'
    },
    fromRow: r => ({ id: r.id, n: r.name, c: r.category, k: r.method, min: r.minutes,
                     fav: !!r.fav, on: r.active !== false, note: r.note || '', img: r.img || '' }),
    toRow: d => ({ id: d.id, name: d.n, category: d.c, method: d.k, minutes: d.min,
                   fav: d.fav, active: d.on, note: d.note, img: d.img, updated_at: new Date().toISOString() }),
    normalize: d => ({
      id: d.id || newId(), n: String(d.n || '').trim(),
      c: CATS_HOME.includes(d.c) ? d.c : '素菜',
      k: METHODS.includes(d.k) ? d.k : '炒',
      min: Math.max(1, +d.min || 20),
      fav: !!d.fav, on: d.on !== false, note: d.note || '', img: d.img || ''
    }),
    tags: d => [d.c, d.k, d.min + ' 分钟'],
    meta: d => [d.k, d.min + ' 分钟'].join(' · '),
    fields: d => `<div class="editrow">
        ${selField('c', CATS_HOME, d.c)}${selField('k', METHODS, d.k)}
        <input class="field" data-f="min" type="number" inputmode="numeric" min="1"
               value="${d.min}" style="flex:0 0 88px">
      </div>`,
    filters: F => grp('分类', chipRow('cat', CATS_HOME, F.cat))
      + grp('做法', chipRow('method', METHODS, F.method))
      + grp('用时', numChips('maxMin', [[0,'不限'],[15,'15 分钟内'],[30,'30 分钟内'],[60,'1 小时内']]))
      + grp('重样', numChips('avoid', [[0,'不避开'],[3,'3 天内不重'],[7,'7 天内不重'],[14,'14 天内不重']]))
      + grp('收藏', `<button class="chip" data-k="favOnly" data-v="1" aria-pressed="${F.favOnly}">只抽收藏的</button>`),
    filterSum: F => {
      const s = [F.cat, F.method].filter(Boolean);
      if (F.maxMin) s.push(F.maxMin + ' 分钟内');
      if (F.favOnly) s.push('只抽收藏');
      return s;
    },
    matchExtra: (d, F) => !(F.method && d.k !== F.method) && !(F.maxMin && d.min > F.maxMin),
    defF: { cat:'', method:'', maxMin:0, favOnly:false, avoid:7 }
  },

  out: {
    cats: CATS_OUT,
    table: 'places', logTable: 'visits',
    logCols: { date: 'went_on', ref: 'place_id', name: 'place_name' },
    photoDir: 'out/',
    tabs: ['餐厅', '抽店'],
    txt: {
      lib: '餐厅', search: '搜餐厅', add: '加店', addTitle: '加一家店', namePh: '餐厅名',
      draw: '换一家', pick: '就去它', logHead: '最近去过', unit: '家',
      hint: '按下面的按钮，抽一家店', none: '这些条件下没有店<br>放宽筛选，或去餐厅里加几家',
      notePh: '招牌菜、停车、要不要排队…', del: '删掉这家店', backup: '餐厅备份',
      emptyLog: '还没有记录。定下来的店按「就去它」，以后就能避开重样。',
      emptyLib: '这儿没有店。<br>换个菜系，或者用右上角「加店」记一家。',
      emptyAll: '还没有店。<br>登录后用右上角「加店」记第一家。',
      loading: '正在读餐厅…', dup: '这家已经在里面了', added: '加好了',
      logIcon: '墨西哥', allIcon: '美式'
    },
    fromRow: r => ({ id: r.id, n: r.name, c: r.cuisine, price: r.price, addr: r.addr || '',
                     fav: !!r.fav, on: r.active !== false, note: r.note || '', img: r.img || '' }),
    toRow: d => ({ id: d.id, name: d.n, cuisine: d.c, price: d.price, addr: d.addr,
                   fav: d.fav, active: d.on, note: d.note, img: d.img, updated_at: new Date().toISOString() }),
    normalize: d => ({
      id: d.id || newId(), n: String(d.n || '').trim(),
      c: CATS_OUT.includes(d.c) ? d.c : '中餐',
      price: PRICES.includes(d.price) ? d.price : '$$',
      addr: d.addr || '',
      fav: !!d.fav, on: d.on !== false, note: d.note || '', img: d.img || ''
    }),
    tags: d => [d.c, d.price, lastSeen(d.id)].filter(Boolean),
    meta: d => [d.c, d.price, lastSeen(d.id)].filter(Boolean).join(' · '),
    fields: d => `<div class="editrow">
        ${selField('c', CATS_OUT, d.c)}${selField('price', PRICES, d.price)}
      </div>
      <input class="field" data-f="addr" value="${esc(d.addr)}"
             placeholder="地址，或从地图 App 复制的链接">`,
    filters: F => grp('菜系', chipRow('cat', CATS_OUT, F.cat))
      + grp('价位', chipRow('price', PRICES, F.price))
      + grp('重样', numChips('avoid', [[0,'不避开'],[7,'7 天内不重'],[14,'14 天内不重'],[30,'30 天内不重']]))
      + grp('收藏', `<button class="chip" data-k="favOnly" data-v="1" aria-pressed="${F.favOnly}">只抽收藏的</button>`),
    filterSum: F => {
      const s = [F.cat, F.price].filter(Boolean);
      if (F.favOnly) s.push('只抽收藏');
      return s;
    },
    matchExtra: (d, F) => !(F.price && d.price !== F.price),
    defF: { cat:'', price:'', favOnly:false, avoid:14 }
  }
};

/* ========== 状态 ========== */
let mode = 'home';
try { const m = localStorage.getItem('menu.mode'); if (m === 'out' || m === 'home') mode = m; } catch {}

const state = {
  home: { items: [], log: [], current: null, ready: false, loaded: false },
  out:  { items: [], log: [], current: null, ready: false, loaded: false },
  session: null
};
const M = () => MODES[mode];
const S = () => state[mode];
const canEdit = () => !!state.session;

const FS = { home: { ...MODES.home.defF }, out: { ...MODES.out.defF } };
for (const m of ['home','out']) {
  try {
    const s = localStorage.getItem('menu.filters.' + m);
    if (s) Object.assign(FS[m], JSON.parse(s));
  } catch {}
}
let F = FS[mode];
const saveF = () => { try { localStorage.setItem('menu.filters.' + mode, JSON.stringify(F)); } catch {} };

/* 排序：分类顺序跟词表一致，同一分类内按名字拼音 */
const catRank = d => { const i = M().cats.indexOf(d.c); return i < 0 ? M().cats.length : i; };
const byCatThenPinyin = (x, y) =>
  (catRank(x) - catRank(y)) || x.n.localeCompare(y.n, 'zh-Hans-CN');
const sortItems = () => S().items.sort(byCatThenPinyin);

/* 多久没去过 / 没吃过 */
function lastSeen(id) {
  const hits = S().log.filter(e => e.id === id);
  if (!hits.length) return '';
  const n = daysAgo(hits[hits.length - 1].d);
  return n <= 0 ? '今天' : `${n} 天前`;
}

/* 本地只做缓存：网速慢时先把上次的内容画出来，联网后立刻覆盖 */
function readCache(m) {
  try {
    const c = JSON.parse(localStorage.getItem('menu.cache.' + m) || 'null');
    if (c && Array.isArray(c.items)) { state[m].items = c.items; state[m].log = c.log || []; return true; }
  } catch {}
  return false;
}
function writeCache(m = mode) {
  try {
    localStorage.setItem('menu.cache.' + m,
      JSON.stringify({ items: state[m].items, log: state[m].log }));
  } catch {}
}

/* ========== 读写云端 ========== */
async function pull(m = mode) {
  const cfg = MODES[m], lc = cfg.logCols;
  const [a, b] = await Promise.all([
    sb.from(cfg.table).select('*'),
    sb.from(cfg.logTable).select('*').order(lc.date, { ascending: true }).limit(400)
  ]);
  if (a.error) throw a.error;
  const rank = d => { const i = cfg.cats.indexOf(d.c); return i < 0 ? cfg.cats.length : i; };
  state[m].items = (a.data || []).map(cfg.fromRow)
    .sort((x, y) => (rank(x) - rank(y)) || x.n.localeCompare(y.n, 'zh-Hans-CN'));
  state[m].log = b.error ? [] : (b.data || [])
    .map(r => ({ k: r.id, d: r[lc.date], id: r[lc.ref], n: r[lc.name] }));
  state[m].loaded = true;
  writeCache(m);
}

async function saveItem(d) {
  if (!canEdit()) { toast('右上角登录后才能改'); return false; }
  const { error } = await sb.from(M().table).upsert(M().toRow(d));
  if (error) { toast('没存上：' + error.message); return false; }
  writeCache();
  return true;
}

async function removeItem(d) {
  const { error } = await sb.from(M().table).delete().eq('id', d.id);
  if (error) { toast('删不掉：' + error.message); return false; }
  if (d.img) deletePhoto(d.img);
  writeCache();
  return true;
}

async function logItem(d) {
  const lc = M().logCols;
  const e = { k: `${TODAY}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, d: TODAY, id: d.id, n: d.n };
  S().log.push(e);
  writeCache();
  if (!canEdit()) { toast('没登录，这条记录只存在这台设备上'); return; }
  const row = { id: e.k };
  row[lc.date] = e.d; row[lc.ref] = e.id; row[lc.name] = e.n;
  const { error } = await sb.from(M().logTable).insert(row);
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

async function uploadPhoto(id, file) {
  const blob = await shrink(file);
  const path = `${M().photoDir}${id}/${Date.now()}.jpg`;
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

/* ========== 登录 ==========
   tab 栏右边只放一个很小的入口，具体表单在底部抽屉里填 */
function renderAccount() {
  const box = $('account');
  if (!CONFIGURED) {
    box.innerHTML = '<button class="linkbtn" id="btnCfgWarn">未连接</button>';
    $('btnCfgWarn').onclick = () => toast('config.js 里的 Supabase 地址或 key 还没填对');
    return;
  }
  box.innerHTML = state.session
    ? '<button class="linkbtn" id="btnOut">退出</button>'
    : '<button class="linkbtn" id="btnLoginOpen">登录</button>';

  const out = $('btnOut');
  if (out) out.onclick = async () => { await sb.auth.signOut(); toast('已退出'); };
  const open = $('btnLoginOpen');
  if (open) open.onclick = openLoginSheet;

  $('btnSeed').hidden = !(canEdit() && mode === 'home');
}

function openLoginSheet() {
  const el = $('sheet');
  el.dataset.mode = 'login'; el.dataset.id = ''; el.dataset.new = '';
  el.innerHTML = `<div class="scrim" data-act="close"></div>
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="grab"></div>
      <div class="sheethead"><h2>登录</h2>
        <button class="icon" data-act="close" aria-label="关闭">✕</button></div>
      <div class="editor">
        <p class="hint">只看不用登录。加、改、传图才需要。</p>
        <input class="field" id="email" type="email" inputmode="email"
               placeholder="邮箱" autocomplete="username">
        <input class="field" id="pw" type="password" placeholder="密码" autocomplete="current-password">
        <button class="btn primary wide" id="btnIn">登录</button>
      </div>
    </div>`;
  el.hidden = false;
  document.body.style.overflow = 'hidden';
  el.querySelectorAll('[data-act="close"]').forEach(b => { b.onclick = closeSheet; });

  const submit = async () => {
    const email = $('email').value.trim(), password = $('pw').value;
    if (!email || !password) { toast('邮箱和密码都要填'); return; }
    const btn = $('btnIn');
    btn.disabled = true; btn.textContent = '正在登录…';
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { btn.disabled = false; btn.textContent = '登录'; toast('登录失败：' + error.message); return; }
    closeSheet(); toast('登录好了');
  };
  $('btnIn').onclick = submit;
  $('pw').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  setTimeout(() => $('email')?.focus(), 60);
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
  $('fpanel').innerHTML = M().filters(F);
  const sum = M().filterSum(F);
  $('fsum').textContent = sum.length ? sum.join(' · ') : '';
  const badge = $('fcount');
  badge.hidden = !sum.length;
  badge.textContent = sum.length;
}

$('ftoggle').onclick = function () {
  const p = $('fpanel');
  p.hidden = !p.hidden;
  this.firstChild.textContent = p.hidden ? '筛选' : '收起';
};

$('fpanel').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  const { k, v } = b.dataset;
  if (k === 'favOnly') F.favOnly = !F.favOnly;
  else if (k === 'maxMin' || k === 'avoid') F[k] = +v;
  else F[k] = v;
  saveF(); renderFilters();
});

/* ========== 挑 ========== */
const seenWithin = (id, days) => !!days && S().log.some(e => e.id === id && daysAgo(e.d) < days);

function match(d) {
  if (!d.on) return false;
  if (F.cat && d.c !== F.cat) return false;
  if (F.favOnly && !d.fav) return false;
  return M().matchExtra(d, F);
}
function pool(useAvoid) {
  let list = S().items.filter(match);
  if (useAvoid && F.avoid) list = list.filter(d => !seenWithin(d.id, F.avoid));
  return list;
}

/* ========== 抽 ========== */
const tagHtml = d => `<div class="tags">${M().tags(d).map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>`;

function renderBoard() {
  const b = $('board');
  const d = S().current;

  if (!d) {
    b.className = 'board blank';
    b.innerHTML = `<p class="dish placeholder">${S().ready ? M().txt.hint : M().txt.loading}</p>`;
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
  renderNav();
}

/* 出去吃：抽到之后给一个直达地图的按钮 */
function renderNav() {
  const box = $('navBox');
  const d = S().current;
  if (mode !== 'out' || !d || !d.addr) { box.hidden = true; box.innerHTML = ''; return; }
  const isLink = /^https?:\/\//i.test(d.addr);
  box.hidden = false;
  box.innerHTML = `${isLink ? '' : `<p class="addr">${esc(d.addr)}</p>`}
    <a class="btn ghostacc wide" href="${esc(mapUrl(d.addr))}" target="_blank" rel="noopener">打开地图导航</a>`;
}

$('btnDraw').onclick = () => {
  let list = pool(true), relaxed = false;
  if (!list.length) { list = pool(false); relaxed = true; }
  if (!list.length) {
    S().current = null;
    $('board').className = 'board blank';
    $('board').innerHTML = `<p class="dish placeholder">${M().txt.none}</p>`;
    $('btnEat').disabled = true;
    renderNav();
    return;
  }
  let pick = randOf(list);
  if (list.length > 1 && S().current && pick.id === S().current.id) {
    pick = list[(list.indexOf(pick) + 1) % list.length];
  }
  S().current = pick;
  renderBoard();
  if (relaxed && F.avoid) toast(mode === 'out' ? '最近都去过了，这次不避开重样' : '最近都吃过了，这次不避开重样');
  $('btnEat').disabled = false;
};

$('btnEat').onclick = async function () {
  if (!S().current) return;
  this.disabled = true;
  await logItem(S().current);
  renderLog(); renderLib();
  const s = document.createElement('div');
  s.className = 'seal'; s.textContent = '今日';
  $('board').appendChild(s);
};

function renderLog() {
  const box = $('logList');
  const last = S().log.slice(-12).reverse();
  if (!last.length) {
    box.innerHTML = `<p class="empty"><span class="emptyic">${icon(M().txt.logIcon)}</span>${M().txt.emptyLog}</p>`;
    return;
  }
  box.innerHTML = last.map(e => {
    const d = findItem(e.id);
    const t = d?.img
      ? `<img class="lt" src="${esc(d.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
      : '<div class="lt"></div>';
    return `<div class="logline"><span class="when">${esc(cnDate(e.d))}</span>${t}<div class="ln">${esc(e.n || '')}</div></div>`;
  }).join('');
}

/* ========== 列表 ========== */
let libCat = '';
const findItem = id => S().items.find(d => d.id === id);

function renderCatNav() {
  const cats = M().cats;
  const counts = {};
  for (const d of S().items) counts[d.c] = (counts[d.c] || 0) + 1;
  const shown = cats.filter(c => counts[c]);
  const other = S().items.filter(d => !cats.includes(d.c)).length;
  $('catnav').innerHTML =
    `<button class="chip" data-c="" aria-pressed="${libCat ? 'false' : 'true'}">全部<span class="num">${S().items.length}</span></button>`
    + shown.map(c => `<button class="chip" data-c="${c}" aria-pressed="${libCat === c ? 'true' : 'false'}">${icon(c)}${c}<span class="num">${counts[c]}</span></button>`).join('')
    + (other ? `<button class="chip" data-c="其他" aria-pressed="${libCat === '其他' ? 'true' : 'false'}">${icon('其他')}其他<span class="num">${other}</span></button>` : '');
  centerActiveCat();
}

/* 窄屏时：标记两端位置好让 CSS 决定渐隐，并把选中的分类滚到视野中间 */
function updateNavEdges() {
  const el = $('catnav');
  const slack = el.scrollWidth - el.clientWidth;
  el.classList.toggle('scrollable', slack > 2);
  el.classList.toggle('at-start', el.scrollLeft <= 2);
  el.classList.toggle('at-end', el.scrollLeft >= slack - 2);
}
function centerActiveCat() {
  const el = $('catnav');
  if (el.scrollWidth - el.clientWidth <= 2) return;
  const sel = el.querySelector('.chip[aria-pressed="true"]');
  if (sel) el.scrollLeft = sel.offsetLeft - el.clientWidth / 2 + sel.offsetWidth / 2;
  updateNavEdges();
}
$('catnav').addEventListener('scroll', updateNavEdges, { passive: true });
addEventListener('resize', updateNavEdges);

$('catnav').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  libCat = b.dataset.c;
  renderCatNav(); renderLib();
});

function tile(d) {
  const meta = M().meta(d);
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
    <span class="ghost">${icon(d.c)}</span>
    ${marks}<div class="cn">${esc(d.n)}</div><div class="cm">${esc(meta)}</div>
  </button>`;
}

function renderLib() {
  const box = $('libList');
  if (!S().ready && !S().items.length) { box.innerHTML = `<p class="empty">${M().txt.loading}</p>`; return; }
  renderCatNav();

  const q = $('q').value.trim();
  const cats = M().cats;
  const list = S().items.filter(d =>
    (!q || d.n.includes(q)) &&
    (!libCat || (libCat === '其他' ? !cats.includes(d.c) : d.c === libCat)));

  if (!list.length) {
    box.innerHTML = S().items.length
      ? `<p class="empty"><span class="emptyic">${icon(libCat || '其他')}</span>${M().txt.emptyLib}</p>`
      : `<p class="empty"><span class="emptyic">${icon(M().txt.allIcon)}</span>${M().txt.emptyAll}</p>`;
    return;
  }
  box.innerHTML = `<div class="grid">${list.map(tile).join('')}</div>`;
}

$('q').addEventListener('input', renderLib);
$('libList').addEventListener('click', e => {
  const t = e.target.closest('.tile');
  if (t) openSheet(findItem(t.dataset.id));
});

/* ========== 底部抽屉：看 / 改 / 加 ========== */
let pendingFile = null;
let draft = null;

function sheetBody(d, isNew) {
  const pv = d.img ? `<img class="pv" src="${esc(d.img)}" alt="">` : '<div class="pv none">还没图</div>';
  const t = M().txt;
  return `<div class="scrim" data-act="close"></div>
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="grab"></div>
      <div class="sheethead">
        ${icon(d.c)}<h2>${isNew ? t.addTitle : esc(d.n)}</h2>
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
        <input class="field" data-f="n" value="${esc(d.n)}" placeholder="${t.namePh}">
        ${M().fields(d)}
        <textarea class="field" data-f="note" placeholder="${t.notePh}">${esc(d.note)}</textarea>
        ${!isNew && mode === 'out' && d.addr
          ? `<a class="btn sm ghostacc" href="${esc(mapUrl(d.addr))}" target="_blank" rel="noopener">打开地图导航</a>` : ''}
        ${isNew
          ? `<button class="btn primary wide" data-act="create">加进${t.lib}</button>`
          : `<div class="editrow" style="margin-top:4px">
               <button class="btn sm" data-act="toggle">${d.on ? '暂时不抽' : '重新启用'}</button>
               <button class="btn sm danger" data-act="del">${t.del}</button>
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
  el.dataset.mode = 'item';
  el.innerHTML = sheetBody(d, isNew);
  el.hidden = false;
  el.dataset.id = d.id;
  el.dataset.new = isNew ? '1' : '';
  document.body.style.overflow = 'hidden';
}

function closeSheet() {
  $('sheet').dataset.mode = '';
  $('sheet').hidden = true;
  $('sheet').innerHTML = '';
  draft = null; pendingFile = null;
  document.body.style.overflow = '';
}

const sheetItem = () => $('sheet').dataset.new ? draft : findItem($('sheet').dataset.id);

function refreshSheet() {
  const d = sheetItem();
  if (!d) return closeSheet();
  $('sheet').innerHTML = sheetBody(d, !!$('sheet').dataset.new);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });

$('sheet').addEventListener('click', async e => {
  if ($('sheet').dataset.mode === 'login') return;   // 登录抽屉自己绑了处理器
  const b = e.target.closest('[data-act]');
  if (!b || b.dataset.act === 'pick') return;
  const act = b.dataset.act;
  if (act === 'close') return closeSheet();

  const d = sheetItem();
  if (!d) return closeSheet();
  if (!canEdit()) { toast('右上角登录后才能改'); return; }

  if (act === 'create') { await createItem(d); return; }

  if (act === 'fav')    { d.fav = !d.fav; await saveItem(d); refreshSheet(); renderLib(); }
  if (act === 'toggle') { d.on = !d.on;  await saveItem(d); refreshSheet(); renderLib(); }
  if (act === 'rmimg')  {
    const old = d.img; d.img = '';
    if (await saveItem(d)) { deletePhoto(old); refreshSheet(); renderLib(); if (S().current?.id === d.id) renderBoard(); }
  }
  if (act === 'del') {
    if (!confirm(`把「${d.n}」删掉？`)) return;
    if (!await removeItem(d)) return;
    S().items = S().items.filter(x => x.id !== d.id);
    if (S().current?.id === d.id) { S().current = null; $('btnEat').disabled = true; renderBoard(); }
    closeSheet(); renderLib(); toast('删掉了');
  }
});

$('sheet').addEventListener('change', async e => {
  if ($('sheet').dataset.mode === 'login') return;
  const el = e.target;
  const d = sheetItem();
  if (!d) return;
  const isNew = !!$('sheet').dataset.new;
  if (!canEdit()) { toast('右上角登录后才能改'); return; }

  /* 选图片 */
  if (el.dataset.act === 'pick' && el.files?.[0]) {
    if (isNew) {                       // 新的先本地预览，保存时再传
      pendingFile = el.files[0];
      const pv = $('sheet').querySelector('.pv');
      pv.outerHTML = `<img class="pv" src="${URL.createObjectURL(pendingFile)}" alt="">`;
      return;
    }
    try {
      toast('正在上传…');
      const old = d.img;
      d.img = await uploadPhoto(d.id, el.files[0]);
      if (await saveItem(d)) { if (old) deletePhoto(old); toast('图片存好了'); }
      refreshSheet(); renderLib();
      if (S().current?.id === d.id) renderBoard();
    } catch (err) { toast('传不上去：' + (err.message || '')); }
    return;
  }

  /* 普通字段 */
  const f = el.dataset.f;
  if (!f) return;
  if (f === 'min') d.min = Math.max(1, +el.value || 20);
  else if (f === 'n') { const v = el.value.trim(); if (v) d.n = v; else { el.value = d.n; return; } }
  else d[f] = typeof el.value === 'string' ? el.value.trim() : el.value;

  if (isNew) return;                   // 新的等「加进…」一起存
  await saveItem(d);
  if (f === 'c' || f === 'n') sortItems();
  if (S().current?.id === d.id) renderBoard();
  renderLib();
  if (f === 'n') $('sheet').querySelector('.sheethead h2').textContent = d.n;
  if (f === 'addr' && S().current?.id === d.id) renderNav();
});

/* ========== 新增 ========== */
$('btnAddToggle').onclick = () => {
  if (!canEdit()) { toast('右上角登录后才能加'); return; }
  const cats = M().cats;
  openSheet(M().normalize({ id: newId(), n: '', c: libCat && cats.includes(libCat) ? libCat : cats[0] }), true);
  setTimeout(() => $('sheet').querySelector('[data-f="n"]')?.focus(), 60);
};

async function createItem(d) {
  const nameEl = $('sheet').querySelector('[data-f="n"]');
  d.n = (nameEl?.value || '').trim();
  if (!d.n) { toast('先写个名字'); nameEl?.focus(); return; }
  if (S().items.some(x => x.n === d.n)) { toast(M().txt.dup); return; }

  const btn = $('sheet').querySelector('[data-act="create"]');
  btn.disabled = true; btn.textContent = '正在存…';
  try {
    if (pendingFile) d.img = await uploadPhoto(d.id, pendingFile);
  } catch { toast('图片没传上去，先加好了'); }

  if (await saveItem(d)) {
    S().items.push(d);
    sortItems();
    closeSheet(); renderLib();
    toast(`${M().txt.added}：${d.n}`);
  } else {
    btn.disabled = false; btn.textContent = `加进${M().txt.lib}`;
  }
}

/* ========== 备份 / 播种 ========== */
$('btnExport').onclick = () => {
  const blob = new Blob([JSON.stringify({
    v: 3, mode, exportedAt: new Date().toISOString(), items: S().items, log: S().log
  }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${M().txt.backup}-${TODAY}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

$('btnSeed').onclick = async function () {
  if (!canEdit() || mode !== 'home') { toast('先登录'); return; }
  if (!confirm('把 data/dishes.json 里的 97 道菜写进云端菜单？已经存在的同名菜不会重复添加。')) return;
  this.disabled = true;
  try {
    const r = await fetch('data/dishes.json', { cache: 'no-store' });
    const j = await r.json();
    const have = new Set(state.home.items.map(d => d.n));
    const add = (j.items || []).map(MODES.home.normalize).filter(d => d.n && !have.has(d.n));
    if (!add.length) { toast('没有要加的'); this.disabled = false; return; }
    const { error } = await sb.from('dishes').upsert(add.map(MODES.home.toRow));
    if (error) throw error;
    await pull('home');
    renderLib(); renderLog();
    toast(`加了 ${add.length} 道`);
  } catch (err) { toast('没成功：' + (err.message || '')); }
  this.disabled = false;
};

/* ========== 模式切换：在家吃 / 出去吃 ========== */
function applyModeLabels() {
  const t = M().txt;
  const tabs = document.querySelectorAll('.tab');
  tabs[0].textContent = M().tabs[0];
  tabs[1].textContent = M().tabs[1];
  $('q').placeholder = t.search;
  $('btnAddToggle').textContent = t.add;
  $('btnDraw').textContent = t.draw;
  $('btnEat').textContent = t.pick;
  $('logHead').textContent = t.logHead;
  $('btnSeed').hidden = !(canEdit() && mode === 'home');
  document.querySelectorAll('.mode').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
}

function switchMode(m) {
  if (m === mode) return;
  if (!$('sheet').hidden) closeSheet();
  mode = m;
  try { localStorage.setItem('menu.mode', m); } catch {}
  F = FS[mode];
  libCat = '';
  $('q').value = '';
  $('fpanel').hidden = true;
  $('ftoggle').firstChild.textContent = '筛选';
  $('btnEat').disabled = !S().current;

  applyModeLabels();
  renderFilters(); renderAccount();
  renderBoard(); renderLog(); renderLib();

  if (!CONFIGURED) { S().ready = true; renderBoard(); renderLib(); return; }

  if (!S().loaded) {
    readCache(mode) && (renderBoard(), renderLog(), renderLib());
    pull(mode).then(() => {
      S().ready = true;
      renderBoard(); renderLog(); renderLib();
    }).catch(err => {
      S().ready = true;
      toast('连不上云端：' + (err.message || ''));
      renderBoard(); renderLog(); renderLib();
    });
  }
}

document.querySelectorAll('.mode').forEach(b => { b.onclick = () => switchMode(b.dataset.mode); });

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

applyModeLabels();
renderFilters();
if (readCache(mode)) { renderBoard(); renderLog(); renderLib(); }

if (!CONFIGURED) {
  state.home.ready = state.out.ready = true;
  renderAccount(); renderBoard(); renderLib();
  $('cloudNote').textContent = '还没连上云端。填好 config.js 再刷新。';
} else {
  sb.auth.getSession().then(({ data }) => { state.session = data.session; renderAccount(); renderLib(); });
  sb.auth.onAuthStateChange((_e, session) => { state.session = session; renderAccount(); renderLib(); });

  pull(mode).then(() => {
    S().ready = true;
    renderBoard(); renderLog(); renderLib();
  }).catch(err => {
    S().ready = true;
    toast('连不上云端：' + (err.message || ''));
    $('cloudNote').textContent = '云端读不到，现在显示的是这台设备上次缓存的内容。';
    renderBoard(); renderLog(); renderLib();
  });
}
