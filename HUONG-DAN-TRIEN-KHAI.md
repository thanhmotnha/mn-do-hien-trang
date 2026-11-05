# Hướng dẫn triển khai "Đo hiện trạng" trên máy chủ ERP

Ứng dụng chạy **riêng** bên cạnh ERP trên cùng máy chủ:

| | Đo hiện trạng | ERP (không đụng) |
|---|---|---|
| Dự án compose | `-p mndo` | `-p motnha` |
| Container | `mndo-app` | `motnha-app`, `motnha-postgres` |
| Cổng | `127.0.0.1:3100` (chỉ máy chủ) | 3000, 5432 |
| Dữ liệu | volume `mndo_data` (SQLite + ảnh + sao lưu) | `postgres_data`, `uploads_data` |
| Runner GitHub | runner riêng, nhãn `mndo` | runner của kho ERP |

Không có mật khẩu / mã nào trong mã nguồn: tất cả nằm trong GitHub Secrets. Workflow ghi `.env` (quyền 600) chỉ gồm địa chỉ + tên quản lý; mật khẩu quản lý đầu đi thẳng vào container qua biến môi trường (không qua `.env`, không qua kịch bản — ký tự `$`, `` ` ``, `#`, `"`, `'` trong mật khẩu giữ nguyên chữ).

## 1. Tạo kho riêng tư

GitHub → **New repository** → tên `mn-do-hien-trang` → **Private** → không thêm README → Create. Báo em tên chủ kho để em đẩy mã lên.

## 2. Đăng ký runner cho kho mới trên máy chủ ERP

Runner của ERP gắn với kho ERP, kho mới cần runner riêng.

1. GitHub → kho mới → **Settings → Actions → Runners → New self-hosted runner** → Linux x64 → giữ trang mở (có đường tải + mã đăng ký).
2. Trên máy chủ, cùng người dùng đang chạy runner ERP (đã ở nhóm `docker`):

   ```bash
   mkdir -p ~/actions-runner-mndo && cd ~/actions-runner-mndo
   curl -o runner.tar.gz -L <đường dẫn tải trong trang GitHub>
   tar xzf runner.tar.gz
   ./config.sh --url https://github.com/<chủ kho>/mn-do-hien-trang --token <mã trong trang> --name erp-mndo --labels mndo --unattended
   sudo ./svc.sh install && sudo ./svc.sh start
   ```
3. Kiểm: trang Runners hiện `erp-mndo` **Idle**. Không đụng thư mục `~/actions-runner-motnhaerp`.

## 3. Thêm Secrets / Variables

Kho mới → **Settings → Secrets and variables → Actions**:

- Tab **Secrets** → New repository secret:
  - `QUAN_LY_MAT_KHAU_DAU` — mật khẩu đầu của quản lý, ≥ 12 ký tự, anh tự đặt và giữ riêng. Chỉ dùng ở lần chạy đầu tiên. Ký tự nào cũng được, trừ xuống dòng (workflow dừng và báo).
  - (nên đặt) `QUAN_LY_TEN` — tên đăng nhập quản lý, 3 … 32 ký tự chữ thường không dấu / số / `. _ -`. Mặc định `quanly` ai cũng đoán được: người lạ gõ sai 5 lần chỉ khoá được máy của họ (khoá theo tên + máy), nhưng tên riêng thì họ còn không biết mà đoán.
  - (tuỳ chọn, Variables) trần ảnh `ANH_PHONG_MB` (500 / phòng), `ANH_TONG_GB` (20), `DIA_TRONG_MIN_GB` (2) — đĩa dùng chung với ERP; vượt trần thì điện thoại báo "đầy — báo quản lý", quản lý xem dung lượng ở trang Tài khoản thợ.
- Tab **Variables**:
  - `PUBLIC_URL` = `https://do.motnha.vn` (địa chỉ ngoài; chuỗi kết nối máy vẽ lấy từ đây).
  - (tuỳ chọn) `MNCF_KHO` — địa chỉ kho mn-chenfeng để chạy phép thử hợp đồng (mặc định `https://github.com/thanhmotnha/mn-chenfeng.git`).

## 4. Chạy lần đầu

**Actions → Build and Deploy → Run workflow** (hoặc em đẩy lên `main`). Bước "Phép thử" chạy trong container Node (không cài gì lên máy chủ); bước "Chờ sức khoẻ" xanh là xong.

Kiểm trên máy chủ:

```bash
docker ps --filter name=mndo          # mndo-app  … (healthy)
curl http://127.0.0.1:3100/api/suc-khoe   # {"ok":true,"ban":"0.1.1"}
```

Lưu ý: workflow của ERP có bước dọn Docker (`docker container prune`, `docker image prune -af --filter until=72h`). `mndo-app` đang chạy thì không bị đụng; nếu nó đang **dừng** lúc ERP triển khai thì container bị xoá (dữ liệu trong volume `mndo_data` vẫn còn) — chỉ cần chạy lại workflow của kho này.

## 5. Thêm tên miền con trong Cloudflare Tunnel

Tunnel đang chạy cho `erp.motnha.vn` dùng chung được:

1. **Cloudflare Zero Trust → Networks → Tunnels** → tunnel của ERP → **Public Hostname → Add a public hostname**: Subdomain `do`, Domain `motnha.vn`, Type **HTTP**, URL `localhost:3100` → Save.
2. Xem trước dòng `erp.motnha.vn` đang trỏ gì:
   - `localhost:3000` → dùng `localhost:3100` như trên.
   - `motnha-app:3000` (cloudflared chạy trong Docker) → `localhost` không tới được: chạy `docker network connect mndo_net <tên container cloudflared>` rồi dùng URL `mndo-app:3100`. (Khi đó cổng 3100 trên máy chủ vẫn chỉ nghe 127.0.0.1.)
3. Nếu tunnel cấu hình bằng tệp (`/etc/cloudflared/config.yml`): thêm

   ```yaml
     - hostname: do.motnha.vn
       service: http://localhost:3100
   ```
   **trước** dòng `- service: http_status:404`, rồi `sudo systemctl restart cloudflared`.
4. **Không** bật Cloudflare Access cho `do.motnha.vn` (máy vẽ trong Chenfeng không đăng nhập Access được). Không cần quy tắc cache (mọi `/api` đã `no-store`). Tắt Rocket Loader cho tên miền này nếu đang bật.
5. Kiểm: mở `https://do.motnha.vn` trên điện thoại → màn **Đăng nhập**.

## 6. Đăng nhập quản lý

Tên `quanly` (hoặc `QUAN_LY_TEN`) + mật khẩu ở bước 3 → trang bắt đặt mật khẩu mới. Từ đây `QUAN_LY_MAT_KHAU_DAU` không còn tác dụng (đổi biến không đặt lại mật khẩu) — có thể xoá secret.

## 7. Tạo tài khoản thợ

**Tài khoản thợ → + Thợ mới**: tên đăng nhập (vd `hung.tho`), tên hiện (hiện ở máy vẽ là "người gửi"), **Sinh mật khẩu** → Tạo → gửi riêng cho thợ. Thợ đăng nhập lần đầu tự đổi mật khẩu.
Thợ nghỉ: **Khoá** (máy thợ bị đăng xuất ngay). Quên mật khẩu: **Đặt lại mật khẩu**.

## 8. Cấp mã cho máy vẽ

**Mã kết nối máy vẽ → Cấp mã** (nhãn "Máy vẽ xưởng") → **Chép mã**. Mã chỉ hiện **một lần**.

## 9. Dán vào bảng Một Nhà

Trong Chenfeng → bảng Một Nhà → thẻ **Phòng** → khối **Phòng đã đo trên điện thoại** → dán chuỗi → **Nối máy chủ** → thấy "● Đã nối do.motnha.vn". Mất máy / lộ mã: **Thu hồi** rồi cấp mã mới.

## 10. Cài lên điện thoại thợ

Mở `https://do.motnha.vn` → iPhone: Chia sẻ → **Thêm vào MH chính**; Android: menu ⋮ → **Cài ứng dụng**. (iPhone xoá dữ liệu trang chưa cài sau ~7 ngày không mở — cài để giữ nháp.)

## 11. Sao lưu

Mỗi ngày 02:17 (giờ VN) máy tự chép CSDL vào `/data/sao-luu/do-YYYY-MM-DD.sqlite`, giữ 14 bản. Phòng / công trình đã xoá giữ 30 ngày rồi mới xoá hẳn (kèm ảnh).

Chép cả dữ liệu (CSDL + ảnh) ra ngoài:

```bash
docker run --rm -v mndo_data:/d:ro -v ~/sao-luu-mndo:/b alpine tar czf /b/mndo-$(date +%F).tgz -C /d .
```

Khôi phục: `docker compose -p mndo stop` → giải nén vào volume (`docker run --rm -v mndo_data:/d -v ~/sao-luu-mndo:/b alpine sh -c 'rm -rf /d/* && tar xzf /b/<tệp>.tgz -C /d'`) → `docker compose -p mndo up -d`.

## 12. Quên mật khẩu quản lý

```bash
docker exec -it mndo-app node scripts/dat-lai-quan-ly.js quanly
```
In ra một mật khẩu tạm (đăng nhập xong phải đổi). Chỉ người vào được máy chủ mới làm được.

## 13. Gỡ

`docker compose -p mndo down` (giữ dữ liệu); `docker volume rm mndo_data` mới xoá dữ liệu. ERP không bị ảnh hưởng.
