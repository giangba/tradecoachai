# TradeCoach AI – hướng dẫn deploy Vercel

## 1. Supabase (miễn phí)
1. Tạo project tại supabase.com.
2. SQL Editor → dán toàn bộ `supabase.sql` → Run.
3. Authentication → Providers → Email: bật. (Muốn đăng ký xong dùng ngay: tắt "Confirm email".)
4. Project Settings → API: copy **Project URL** và **anon public key**.

## 2. Google Gemini
Lấy API key tại aistudio.google.com/apikey.

## 3. Vercel
1. Đẩy thư mục này lên GitHub (hoặc chạy `npx vercel` trong thư mục).
2. Vercel → Add New Project → chọn repo (Framework: Other, không cần build).
3. Environment Variables: `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
4. Deploy. Sau khi đổi biến môi trường phải Redeploy.

## Lưu ý
- Ảnh được nén ở trình duyệt (tối đa 1600px) để không vượt giới hạn 4.5MB của Vercel.
- Mỗi lệnh gọi AI tốn quota/phí Gemini API; nếu mở cho nhiều người nên thêm giới hạn lượt/ngày.
