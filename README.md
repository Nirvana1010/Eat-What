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

登录方式是**邮箱 + 密码**，不发任何邮件，所以不会撞上 Supabase 内置邮件服务「每小时 2 封」的限制。

在 Supabase 控制台建一个账号：**Authentication → Users → Add user → Create new user**，填邮箱和密码，**勾上 Auto Confirm User**，保存。

之后在菜单页最下面点「登录后可以改菜单」，输入这组邮箱密码即可。浏览器会记住密码，换设备也只需要输一次。

> 权限策略只看「有没有登录」（`auth.role() = 'authenticated'`），跟具体是哪个用户无关，所以账号可以随时删了重建，菜单数据不受影响。

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
| `method` | 做法 | 炒 / 炖 / 蒸 / 煮 / 焖 / 煎炸 / 烤 / 凉拌 |
| `minutes` | 大概用时 | 数字 |
| `active` | 是否参与抽签 | true / false |
| `note` | 备注 | |
| `img` | 图片 URL | |

`meals` 表记录「就吃它」按下的每一次，用来避开最近重样。

分类按「这道菜在桌上是什么角色」归，不是按里面有什么肉：冬瓜排骨汤算汤羹不算猪肉，红烧牛肉面算主食不算牛肉，口水鸡算凉菜不算鸡肉。

想改分类或筛选项，改 `app.js` 顶部的 `CATS` / `METHODS` 两个数组即可，数据库那边是纯文本列，不用改表。

## 菜单的排列顺序

先按分类（顺序跟 `app.js` 顶部 `CATS` 数组一致：猪肉、牛肉、羊肉、鸡肉、海鲜、鸡蛋、素菜、火锅、汤羹、主食、凉菜、早餐），同一个分类里按菜名拼音。改分类数组的顺序就能改分组顺序。

拼音排序用的是浏览器自带的 `localeCompare(…, 'zh-Hans-CN')`，不需要额外的库。

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

## 别让 Supabase 把项目睡过去

免费档的规则：项目 **1 周没有任何 API 请求就会被自动暂停**；暂停后 90 天内没恢复，就无法再从控制台恢复了。

暂停本身是可逆的 —— 控制台点一下 Restore，数据一条不少。而且你每打开一次这个网页就是一次 API 请求，正常用根本碰不到这条线。会中招的是连着两周没开的情况（比如出门旅行）。

仓库里的 `.github/workflows/keepalive.yml` 就是给这个兜底的：GitHub Actions 每 3 天自动请求一次数据库，把计时器顶住。

**不用配任何东西**，它直接从 `config.js` 里读地址和 key（那个 key 本来就是公开的）。推上去之后：

1. 仓库 → Actions 标签页 → 左边选 `keepalive` → 右边 `Run workflow` 手动跑一次，确认是绿的。
2. 之后它自己每 3 天跑一次。

两个注意点：

- **GitHub 会停掉不活跃仓库的定时任务**。如果仓库连续 60 天没有任何提交，Actions 的 schedule 会被自动禁用，GitHub 会发邮件通知，点一下就能重新启用。
- 万一还是被暂停了：Supabase 控制台里项目会带一个 Paused 标记，点 Restore 等几分钟就回来。**在这之前先去 Project Overview 把数据库备份和 Storage 文件下载一份**，免费档没有自动备份。

另外菜单页底部的「导出备份」也建议偶尔点一下存一份 —— 那份 JSON 里菜和图片链接都有，是完全独立于 Supabase 的一道保险。
