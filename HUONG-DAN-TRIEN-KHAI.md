# Hướng dẫn triển khai "Đo hiện trạng" trên máy chủ ERP

Trang "Đo hiện trạng" (thợ đo dùng điện thoại) chạy **riêng** bên cạnh ERP trên cùng máy chủ. Nó không dùng chung gì với ERP:

| | Đo hiện trạng | ERP (không đụng) |
|---|---|---|
| Dự án Docker | `mndo` | `motnha` |
| Container | `mndo-app` | `motnha-app`, `motnha-postgres` |
| Cổng | `127.0.0.1:3100` (chỉ trong máy chủ) | 3000, 5432 |
| Dữ liệu | ổ dữ liệu Docker `mndo_data` (CSDL + ảnh + bản sao lưu) | `postgres_data`, `uploads_data` |
| Runner GitHub | runner riêng, nhãn `mndo` | runner của kho ERP |
| Địa chỉ ngoài | `https://do.motnha.vn` | `https://erp.motnha.vn` |

Không có mật khẩu / mã nào nằm trong mã nguồn: anh gõ chúng vào GitHub (mục Secrets, bước 3).

## Trước khi bắt đầu — anh cần có

- Tài khoản GitHub (chủ kho ERP).
- Vào được máy chủ ERP bằng dòng lệnh (SSH) như lúc cài ERP.
- Vào được Cloudflare (trang quản lý tên miền `motnha.vn`).
- Khoảng 30 phút.

**Thứ tự quan trọng:** làm xong bước 1 → 3 rồi mới báo em đẩy mã. Đẩy mã lên là GitHub tự triển khai ngay; chưa có runner thì việc triển khai đứng chờ, chưa có mật khẩu quản lý thì trang chạy mà không ai đăng nhập được (sửa được: thêm secret rồi chạy lại như bước 4).

## 1. Tạo kho riêng tư

GitHub → nút **+** góc trên phải → **New repository** → Repository name `mn-do-hien-trang` → chọn **Private** → KHÔNG tích "Add a README" → **Create repository**.
Báo em tên chủ kho (phần trước dấu `/` trên địa chỉ kho, vd `thanhmotnha`).

## 2. Đăng ký runner cho kho mới trên máy chủ ERP

"Runner" là chương trình trên máy chủ nhận lệnh triển khai từ GitHub. Runner của ERP chỉ phục vụ kho ERP, kho mới cần một runner riêng (chạy song song, không ảnh hưởng runner cũ).

1. GitHub → kho `mn-do-hien-trang` → **Settings → Actions → Runners → New self-hosted runner** → chọn **Linux**, **x64**. Giữ trang này mở: mục **Download** có dòng `curl -o actions-runner-linux-x64-….tar.gz -L https://…` (đường tải), mục **Configure** có dòng `./config.sh --url … --token XXXX` (mã đăng ký, hết hạn sau 1 giờ).
2. Vào máy chủ (SSH). Đăng nhập bằng **cùng người dùng đang chạy runner ERP** — không biết là ai thì chạy `ps -o user= -C Runner.Listener` (tên hiện ra là người dùng đó). Người dùng này đã có quyền chạy Docker.
3. Gõ lần lượt (thay phần trong `< >` bằng chữ trong trang GitHub):

   ```bash
   mkdir -p ~/actions-runner-mndo && cd ~/actions-runner-mndo
   curl -o runner.tar.gz -L <đường tải trong trang GitHub>
   tar xzf runner.tar.gz
   ./config.sh --url https://github.com/<chủ kho>/mn-do-hien-trang --token <mã trong trang> --name erp-mndo --labels mndo --unattended
   sudo ./svc.sh install && sudo ./svc.sh start
   ```
   Lệnh `sudo` hỏi mật khẩu máy chủ thì gõ vào (chữ không hiện là bình thường).
4. Kiểm: tải lại trang Runners trên GitHub → thấy `erp-mndo` chữ **Idle** (rảnh, sẵn sàng). Không đụng thư mục runner của ERP (`~/actions-runner-motnhaerp` hoặc tên tương tự).

## 3. Thêm Secrets và Variables

GitHub → kho `mn-do-hien-trang` → **Settings → Secrets and variables → Actions**. Trang có hai thẻ: **Secrets** (giá trị bị giấu, không ai đọc lại được) và **Variables** (giá trị thường).

**Thẻ Secrets** → **New repository secret** (mỗi mục một lần: Name = tên, Secret = giá trị):

| Name | Giá trị | Bắt buộc? |
|---|---|---|
| `QUAN_LY_MAT_KHAU_DAU` | mật khẩu đầu của tài khoản quản lý — anh tự đặt, ≥ 12 ký tự, ký tự gì cũng được (trừ xuống dòng). Ghi riêng ra giấy / trình quản lý mật khẩu. Chỉ dùng cho lần đăng nhập đầu. | Có |
| `QUAN_LY_TEN` | tên đăng nhập quản lý, 3 … 32 ký tự: chữ thường không dấu, số, `.` `_` `-` (vd `thanh.ql`). Không đặt thì là `quanly` — tên ai cũng đoán được, nên đặt tên riêng. | Nên đặt |

**Thẻ Variables** → **New repository variable**:

| Name | Giá trị | Bắt buộc? |
|---|---|---|
| `PUBLIC_URL` | `https://do.motnha.vn` (địa chỉ thợ mở trên điện thoại; chuỗi kết nối cho máy vẽ lấy từ đây). Chỉ tên miền, không có `/` ở cuối. | Có |
| `ANH_PHONG_MB` | trần ảnh mỗi phòng, MB (mặc định 500) | Không |
| `ANH_TONG_GB` | trần tổng ảnh, GB (mặc định 20) — ổ đĩa dùng chung với ERP | Không |
| `DIA_TRONG_MIN_GB` | ổ đĩa còn trống dưới số này (GB, mặc định 2) thì ngừng nhận ảnh | Không |
| `MNCF_KHO` | địa chỉ kho mn-chenfeng (mặc định `https://github.com/thanhmotnha/mn-chenfeng.git`) — dùng để thử khớp với máy vẽ trước mỗi lần triển khai | Không |

Vượt trần ảnh thì điện thoại báo "đầy — báo quản lý"; quản lý xem dung lượng ở trang **Tài khoản thợ**.

Xong bước này: báo em đẩy mã lên.

## 4. Lần triển khai đầu

Em đẩy mã lên nhánh `main` là GitHub tự chạy. Xem tiến độ: kho → thẻ **Actions** → dòng **Build and Deploy** mới nhất. Các bước:
1. lấy mã, 2. **Phép thử** (chạy trong một container tạm, không cài gì lên máy chủ), 3. ghi tệp cấu hình, 4. dựng + chạy container `mndo-app`, 5. **Chờ sức khoẻ**.
Tất cả dấu tích xanh là xong. Có dấu đỏ: bấm vào bước đỏ, chụp màn hình gửi em.

Muốn chạy lại bằng tay (vd sau khi thêm / sửa secret): **Actions → Build and Deploy → Run workflow → Run workflow**.

Kiểm trên máy chủ (tuỳ chọn):

```bash
docker ps --filter name=mndo              # dòng mndo-app … (healthy)
curl http://127.0.0.1:3100/api/suc-khoe   # {"ok":true,"ban":"0.1.1"}
```

Lưu ý: mỗi lần ERP triển khai, nó dọn container đang **dừng** và ảnh cũ. `mndo-app` đang chạy thì không bị đụng. Nếu lúc đó `mndo-app` đang dừng thì container bị xoá — dữ liệu (`mndo_data`) vẫn còn nguyên, chỉ cần chạy lại workflow của kho này (Run workflow).

## 5. Thêm tên miền con trong Cloudflare Tunnel

Tunnel (đường hầm) đang đưa `erp.motnha.vn` vào máy chủ; dùng chung nó cho `do.motnha.vn`.

1. Cloudflare → **Zero Trust → Networks → Tunnels** → bấm tunnel đang dùng cho ERP → thẻ **Public Hostname**.
2. Xem dòng `erp.motnha.vn` đang trỏ tới đâu (cột Service):
   - **`http://localhost:3000`** → bấm **Add a public hostname**: Subdomain `do`, Domain `motnha.vn`, Type **HTTP**, URL `localhost:3100` → **Save**.
   - **`http://motnha-app:3000`** (tức cloudflared chạy trong Docker, `localhost` không tới được) → trước hết trên máy chủ chạy `docker ps --format '{{.Names}}' | grep -i cloudflare` để biết tên container cloudflared, rồi `docker network connect mndo_net <tên đó>`; sau đó thêm hostname như trên nhưng URL là `mndo-app:3100`.
   - Trang báo tunnel "cấu hình bằng tệp" (không sửa được trên web) → trên máy chủ mở `/etc/cloudflared/config.yml`, thêm hai dòng dưới đây **phía trên** dòng `- service: http_status:404` (thụt lề giống các dòng `- hostname:` sẵn có), rồi `sudo systemctl restart cloudflared`:

     ```yaml
       - hostname: do.motnha.vn
         service: http://localhost:3100
     ```
3. **Không** bật Cloudflare Access (trang bắt đăng nhập của Cloudflare) cho `do.motnha.vn` — máy vẽ trong Chenfeng không qua được nó. Nếu Rocket Loader đang bật cho tên miền thì tắt (Speed → Optimization). Không cần thêm quy tắc cache.
4. Kiểm: mở `https://do.motnha.vn` trên điện thoại → thấy màn **Đăng nhập**.

## 6. Đăng nhập quản lý

Mở `https://do.motnha.vn` → tên đăng nhập = `QUAN_LY_TEN` (không đặt thì `quanly`), mật khẩu = `QUAN_LY_MAT_KHAU_DAU` → trang bắt đặt mật khẩu mới. Từ đây mật khẩu đầu hết tác dụng (sửa secret cũng không đổi mật khẩu) — có thể xoá secret đó.

## 7. Tạo tài khoản thợ

**Tài khoản thợ → + Thợ mới**: tên đăng nhập (vd `hung.tho`), tên hiện (hiện ở máy vẽ là "người gửi") → **Sinh mật khẩu** → **Tạo** → gửi tên + mật khẩu riêng cho thợ (tin nhắn riêng, không gửi nhóm). Thợ đăng nhập lần đầu tự đổi mật khẩu.
Thợ nghỉ việc: **Khoá** (máy thợ bị đăng xuất ngay). Thợ quên mật khẩu: **Đặt lại mật khẩu**.

## 8. Cấp mã cho máy vẽ

**Mã kết nối máy vẽ → Cấp mã** (nhãn vd "Máy vẽ xưởng") → **Chép mã**. Mã chỉ hiện **một lần** — chép xong dán ngay vào bước 9. Mỗi máy vẽ nên có mã riêng.

## 9. Dán vào bảng Một Nhà

Trong Chenfeng → bảng Một Nhà → thẻ **Phòng** → khối **Phòng đã đo trên điện thoại** → dán chuỗi vừa chép (dạng `https://do.motnha.vn/api/do#mn-…`) → **Nối máy chủ** → thấy "● Đã nối do.motnha.vn".
Mất máy / lộ mã: vào trang quản lý → **Thu hồi** mã đó → cấp mã mới.

## 10. Cài lên điện thoại thợ

Mở `https://do.motnha.vn` → iPhone (Safari): nút Chia sẻ → **Thêm vào MH chính**; Android (Chrome): menu ⋮ → **Cài ứng dụng** / **Thêm vào màn hình chính**.
Nên cài: iPhone tự xoá dữ liệu của trang chưa cài sau ~7 ngày không mở — mất số đo chưa gửi.

## 11. Sao lưu

Máy tự chép CSDL mỗi ngày lúc 02:17 (giờ VN) vào `/data/sao-luu/do-YYYY-MM-DD.sqlite`, giữ 14 bản. Phòng / công trình đã xoá giữ 30 ngày rồi mới xoá hẳn (kèm ảnh).

Bản sao tự động nằm CHUNG máy chủ — hỏng ổ là mất cả. Nên định kỳ chép cả dữ liệu (CSDL + ảnh) ra một tệp rồi tải về máy khác:

```bash
mkdir -p ~/sao-luu-mndo
docker run --rm -v mndo_data:/d:ro -v ~/sao-luu-mndo:/b alpine tar czf /b/mndo-$(date +%F).tgz -C /d .
```

Khôi phục từ tệp đó (thay `<tệp>` bằng tên tệp, vd `mndo-2026-11-05`):

```bash
docker stop mndo-app
docker run --rm -v mndo_data:/d -v ~/sao-luu-mndo:/b alpine sh -c 'rm -rf /d/* && tar xzf /b/<tệp>.tgz -C /d'
docker start mndo-app
```

## 12. Quên mật khẩu quản lý

Trên máy chủ (thay `quanly` bằng `QUAN_LY_TEN` nếu anh đã đặt):

```bash
docker exec -it mndo-app node scripts/dat-lai-quan-ly.js quanly
```
Lệnh in ra một mật khẩu tạm (đăng nhập xong phải đổi). Chỉ người vào được máy chủ mới làm được.

## 13. Tạm dừng / gỡ

- Tạm dừng: `docker stop mndo-app`; chạy lại: `docker start mndo-app`. (Đừng để dừng lâu: ERP triển khai lúc nó dừng là container bị dọn — xem lưu ý bước 4.)
- Gỡ hẳn container (giữ dữ liệu): `docker rm -f mndo-app`.
- Xoá luôn dữ liệu (không lấy lại được): `docker volume rm mndo_data`.

ERP không bị ảnh hưởng ở mọi bước trên.
