// 填上自己的 Supabase 项目信息。
// Supabase 控制台 → Project Settings → API，复制 Project URL 和 anon public key。
// anon key 本来就是给前端用的公开 key，放进公开仓库没问题；真正的权限由 supabase.sql 里的
// RLS 策略控制（谁都能读，只有登录后能改）。千万别把 service_role key 放这里。

window.CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',

  // 图片存储桶名字，跟 supabase.sql 里保持一致
  BUCKET: 'dish-photos'
};
