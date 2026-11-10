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

Dự án không cần build. Triển khai production bằng workflow GitHub Actions ở phần dưới để giữ các đường dẫn tải ứng dụng có sẵn. Không deploy trực tiếp `dist` vào production dùng chung vì thư mục đó chỉ chứa web.

Repo này chỉ chứa website. Không chứa mã Android, APK, hệ thống cập nhật ứng dụng, file `.env` hoặc dự án Blender.

## Tự động triển khai (CI/CD)

Mỗi lần push hoặc merge vào `main`, workflow `.github/workflows/deploy.yml` sẽ kiểm tra JavaScript và triển khai lên https://cola-photobooth.pages.dev. Nhánh khác chưa cập nhật production. Có thể chạy thủ công trong GitHub Actions → Deploy website to Cloudflare Pages → Run workflow.

Cloudflare credentials nằm trong GitHub Actions Secrets: `CLOUDFLARE_ACCOUNT_ID` và `CLOUDFLARE_API_TOKEN`. Công cụ Wrangler được khóa phiên bản trong `package-lock.json`.

Địa chỉ production đang dùng chung với đường dẫn tải/cập nhật ứng dụng có sẵn. CI lấy worker tương thích từ R2, xác minh checksum và giữ manifest hiện hành trước khi triển khai. Các file này chỉ được ghép trong thư mục tạm, không đưa mã Android hoặc APK vào repo. Nếu không lấy được dữ liệu tương thích, workflow dừng để bảo vệ bản đang chạy. Khi thay worker trên R2, cần cập nhật checksum trong `scripts/prepare-deploy.mjs`.

Theo dõi kết quả tại https://github.com/mqrhyz/PTB/actions. Nếu deploy lỗi, bản web đã triển khai thành công trước đó vẫn phục vụ người dùng.
