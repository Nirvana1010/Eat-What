# 今天吃什么

一个给自己用的家常菜菜单：抽菜、管理菜单，带图片。
页面是纯静态的（放 GitHub Pages），数据和图片放在 Supabase，所以手机、电脑打开同一个网址就是同一份。

- 看：谁都能看，不用登录。
- 改：登录之后才能加菜、删菜、传图。

## 一、建 Supabase 项目

1. 去 https://supabase.com 注册，New project（免费档就够：500 MB 数据库 + 1 GB 存储）。
2. 左边 **SQL Editor** → New query → 把仓库里 `supabase.sql` 的全文粘进去 → Run。
   这一步会建两张表、设好权限、并创建公开的图片桶 `dish-photos`。
3. 拿 Project URL 和 key。最快是项目首页顶部的 **[Connect]** 按钮，对话框里两个都有。
   要单独找就去 **Settings → API Keys**：
   - 新项目：**API Keys** 标签页 → Publishable key（`sb_publishable_` 开头的短字符串）。没有就点 Create new API Keys。
   - 老项目：**Legacy API Keys** 标签页 → `anon public`（`eyJ` 开头的长串）。
   两种都能用，有 publishable 就用它 —— `anon` key 2026 年底停用。
4. 打开 `config.js`，把 URL 和 key 填进去。

> Project URL 也可以自己拼：后台地址栏 `/dashboard/project/<ref>` 里的那个 ref，拼成 `https://<ref>.supabase.co`。
>
> 这个 key 本来就是给前端用的公开 key，放进公开仓库没问题 —— 真正的权限在 `supabase.sql` 的 RLS 策略里（谁都能读，只有登录用户能写）。
> **不要**把 `service_role` 或 `sb_secret_` 开头的 key 放进来。

## 二、允许你的域名登录

Supabase 控制台 → **Authentication → URL Configuration**：

- `Site URL` 填 `https://<你的用户名>.github.io/<仓库名>/`
- `Redirect URLs` 把上面这个地址也加进去；本地调试再加一条 `http://localhost:3000`

登录方式用的是邮箱 magic link：在菜单页填邮箱 → 收到邮件 → 点链接就登录了，之后这台设备会一直保持登录。

> 免费档自带的邮件发送有频率限制（每小时几封），自己用够了。想更稳可以在 Authentication → Providers 里接自己的 SMTP。

## 三、部署到 GitHub Pages

```bash
git init && git add . && git commit -m "init"
git branch -M main
git remote add origin https://github.com/<用户名>/<仓库名>.git
git push -u origin main
```

仓库 Settings → Pages → Source 选 `Deploy from a branch`，分支 `main`、目录 `/ (root)`。
等一两分钟，访问 `https://<用户名>.github.io/<仓库名>/`。

手机上打开后「添加到主屏幕」，用起来跟 App 一样。

## 四、灌初始菜单

第一次打开时云端是空的。在菜单页登录，然后点最下面的 **「导入初始 97 道菜」**，会把 `data/dishes.json` 写进 Supabase。只需要做一次。

之后想加菜就用页面上的「加菜」，改 `data/dishes.json` 不再影响云端。

## 本地预览

别直接双击 `index.html`（`file://` 下 `fetch` 和登录回跳都会出问题）：

```bash
npx serve . -l 3000
# 或
python3 -m http.server 3000
```

然后记得把 `http://localhost:3000` 加进 Supabase 的 Redirect URLs。

## 文件

```
index.html            页面结构
style.css             样式（跟随系统深浅色：浅色是纸菜牌，深色是黑板）
app.js                全部逻辑（ES module，从 CDN 引 supabase-js）
config.js             填你的 Supabase URL 和 anon key
supabase.sql          建表 + 权限 + 图片桶
data/dishes.json      初始菜单，97 道家常菜（只用于第一次导入）
manifest.webmanifest  加到主屏用
icon.svg              图标
```

## 图片

菜单里点某道菜的 `···` → 「上传图片」。图片会先在浏览器里压到长边 1000px 的 JPEG（一张几十 KB），再传到 Supabase Storage，存下来的是一个公开 URL，所以别的设备打开也能看到。
加新菜的面板里也能直接选图，或者粘贴任何外部图片网址。

换图会把旧图从桶里删掉，删菜也会连图一起删。

## 数据结构

`dishes` 表：

| 列 | 含义 | 取值 |
|---|---|---|
| `id` | 唯一 ID | 文本 |
| `name` | 菜名 | |
| `category` | 分类 | 猪肉 / 牛肉 / 羊肉 / 鸡肉 / 海鲜 / 鸡蛋 / 素菜 / 火锅 / 汤羹 / 主食 / 凉菜 / 早餐 |
| `method` | 做法 | 炒 / 炖 / 蒸 / 煮 / 焖 / 煎炸 / 凉拌 |
| `minutes` | 大概用时 | 数字 |
| `active` | 是否参与抽签 | true / false |
| `note` | 备注 | |
| `img` | 图片 URL | |

`meals` 表记录「就吃它」按下的每一次，用来避开最近重样。

分类按「这道菜在桌上是什么角色」归，不是按里面有什么肉：冬瓜排骨汤算汤羹不算猪肉，红烧牛肉面算主食不算牛肉，口水鸡算凉菜不算鸡肉。

想改分类或筛选项，改 `app.js` 顶部的 `CATS` / `METHODS` 两个数组即可，数据库那边是纯文本列，不用改表。

## 抽签规则

- 抽菜时按筛选条件过滤，并跳过最近 N 天按过「就吃它」的菜（N 在筛选的「重样」里，默认 7 天）。
- 条件太窄导致没菜可抽时，会自动放宽「不重样」这一条并提示。

## 离线

页面会把上次读到的菜单缓存在 localStorage 里，网慢或断网时先显示缓存内容，连上后立刻覆盖。缓存只是加速，真正的数据在 Supabase。

## 已经导入过旧分类的话

如果你之前已经把 84 道菜灌进了 Supabase，分类还是老的（荤菜/素菜/…）。
在 SQL Editor 跑一次这段，按旧的 `main_ing` 自动归到新分类：

```sql
update dishes set category = case
  when category in ('汤羹','主食','凉菜','早餐') then category
  when main_ing = '猪肉' then '猪肉'
  when main_ing = '牛肉' then '牛肉'
  when main_ing = '羊肉' then '羊肉'
  when main_ing = '鸡肉' then '鸡肉'
  when main_ing = '鱼虾' then '海鲜'
  when main_ing = '蛋'   then '鸡蛋'
  else '素菜'
end;

alter table dishes drop column if exists main_ing;
alter table dishes drop column if exists taste;
```

跑完再回页面点一次「导入初始 97 道菜」，会把新增的火锅、羊肉、鸡蛋那 13 道补进去（同名的不会重复）。
