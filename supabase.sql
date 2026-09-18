-- 今天吃什么 —— Supabase 建表脚本
-- 用法：Supabase 控制台 → SQL Editor → 新建 query → 粘贴全文 → Run
-- 规则：任何人都能读（这样没登录也能在别的设备上看菜谱），只有登录后才能改。

-- ---------- 菜库 ----------
create table if not exists dishes (
  id         text primary key,
  name       text not null,
  category   text not null default '荤菜',   -- 荤菜/素菜/汤羹/主食/凉菜/早餐
  main_ing   text not null default '蔬菜',   -- 主料
  method     text not null default '炒',     -- 做法
  taste      text not null default '咸鲜',   -- 口味
  minutes    int  not null default 20,       -- 大概用时
  fav        boolean not null default false, -- 收藏
  active     boolean not null default true,  -- 是否参与抽签
  note       text not null default '',       -- 备注 / 做法要点
  img        text not null default '',       -- 图片 URL
  updated_at timestamptz not null default now()
);

-- ---------- 吃过的记录 ----------
create table if not exists meals (
  id         text primary key,
  eaten_on   date not null,
  dish_id    text not null,
  dish_name  text not null,
  created_at timestamptz not null default now()
);

create index if not exists meals_eaten_on_idx on meals (eaten_on desc);

-- ---------- 行级权限 ----------
alter table dishes enable row level security;
alter table meals  enable row level security;

drop policy if exists dishes_read  on dishes;
drop policy if exists dishes_write on dishes;
drop policy if exists meals_read   on meals;
drop policy if exists meals_write  on meals;

create policy dishes_read  on dishes for select using (true);
create policy dishes_write on dishes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy meals_read   on meals  for select using (true);
create policy meals_write  on meals  for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------- 图片存储桶 ----------
insert into storage.buckets (id, name, public)
values ('dish-photos', 'dish-photos', true)
on conflict (id) do nothing;

drop policy if exists photos_read   on storage.objects;
drop policy if exists photos_write  on storage.objects;
drop policy if exists photos_update on storage.objects;
drop policy if exists photos_delete on storage.objects;

create policy photos_read on storage.objects for select
  using (bucket_id = 'dish-photos');
create policy photos_write on storage.objects for insert
  with check (bucket_id = 'dish-photos' and auth.role() = 'authenticated');
create policy photos_update on storage.objects for update
  using (bucket_id = 'dish-photos' and auth.role() = 'authenticated');
create policy photos_delete on storage.objects for delete
  using (bucket_id = 'dish-photos' and auth.role() = 'authenticated');
