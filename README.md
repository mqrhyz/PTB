# Cola Photobooth

Website photobooth tiếng Việt: chụp ảnh bằng camera, chọn màu ảnh, hiệu ứng khuôn mặt, khung trang trí, bố cục 1–4 ảnh và tải ảnh về máy.

## Chạy trên máy

Không cần bước build hoặc cài thư viện. Từ thư mục repo, chạy:

```sh
python3 -m http.server 8080 --directory dist
```

Mở http://localhost:8080 và cấp quyền camera. Camera cần localhost hoặc HTTPS.

## Cấu trúc

- `dist/index.html`: giao diện.
- `dist/style.css`: kiểu dáng và responsive.
- `dist/app.js`: camera, filter, hiệu ứng, khung ảnh và xuất ảnh.
- `dist/assets/`: ảnh khung và tài nguyên MediaPipe chạy trong trình duyệt.
- `wrangler.toml`: cấu hình Cloudflare Pages cho bản web tĩnh.

## Triển khai

Dùng `dist` làm thư mục xuất bản, không cần lệnh build. Với Cloudflare Pages CLI:

```sh
npx wrangler pages deploy dist --project-name cola-photobooth
```

Thông tin đăng nhập Cloudflare được cấu hình riêng trên máy hoặc môi trường triển khai.

Repo này chỉ chứa website. Không chứa mã Android, APK, hệ thống cập nhật ứng dụng, file `.env` hoặc dự án Blender.
