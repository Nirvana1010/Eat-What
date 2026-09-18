// 填上自己的 Supabase 项目信息。
//
// 去哪拿：项目首页顶部的 [Connect] 按钮，对话框里 Project URL 和 key 都有。
// 或者 Settings → API Keys：
//   · 新项目 → API Keys 标签页 → Publishable key（sb_publishable_ 开头的短字符串）
//   · 老项目 → Legacy API Keys 标签页 → anon public（eyJ 开头的长串）
// 两种都能用，有 publishable 就优先用它（anon key 2026 年底停用）。
//
// Project URL 也可以自己拼：后台地址栏里 /dashboard/project/<ref> 的那个 ref，
// 拼成 https://<ref>.supabase.co 就是。
//
// 这个 key 本来就是给前端用的公开 key，放进公开仓库没问题；真正的权限由
// supabase.sql 里的 RLS 策略控制（谁都能读，只有登录后能改）。
// 千万别把 service_role / sb_secret_ 开头的 key 放这里。

window.CONFIG = {
  SUPABASE_URL: 'https://ocabphocnlkcdzjfftwk.supabase.co',
  SUPABASE_KEY: 'sb_publishable__8xXm-O_3g2T_ISnhbz5kA_Cpoed93z',   // 或者老的 anon key

  // 图片存储桶名字，跟 supabase.sql 里保持一致
  BUCKET: 'dish-photos'
};
