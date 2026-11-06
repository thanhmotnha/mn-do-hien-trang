# Việc cho Claude Code trên máy anh Thanh (VS Code, có SSH vào máy chủ ERP)

Anh Thanh mở thư mục kho này trong VS Code rồi bảo Claude: **"làm theo TRIEN-KHAI-CHO-CLAUDE.md"**.
Trả lời anh bằng tiếng Việt, ngắn. Cần anh chọn gì thì hỏi bằng hộp tích chọn.

## Mục tiêu
Trang đo `https://do.motnha.vn` chạy thật: container `mndo-app` (cổng `127.0.0.1:3110` → 3100 trong container; 3100 của máy chủ là của Paperclip) trên máy chủ ERP (`jason@192.168.3.131`), triển khai bằng workflow
`.github/workflows/deploy.yml` của kho này (runner riêng nhãn `mndo`). Chi tiết từng bước cho người: `HUONG-DAN-TRIEN-KHAI.md`.

## Cấm (máy chủ đang chạy ERP thật)
- Không đụng container / ảnh / volume / mạng của ERP: dự án compose `motnha` (`motnha-app`, `motnha-postgres`), cổng 3000 / 5432,
  volume `postgres_data` / `uploads_data`. Không `docker system prune`, không `docker compose down` ngoài dự án `-p mndo`.
- Không đụng thư mục runner của ERP, không sửa / gỡ runner ERP.
- Không in mật khẩu, mã đăng ký runner, token Cloudflare vào tệp nào trong kho. Không commit `.env`.
- Sửa cấu hình cloudflared (nếu nó dùng tệp cấu hình trên máy) thì chép bản sao trước, chỉ THÊM một mục, hỏi anh trước khi khởi động lại
  cloudflared (khởi động lại = ERP mất mạng vài giây).

## Các bước
1. **SSH:** hỏi anh tên máy / người dùng nếu `~/.ssh/config` chưa có. Chạy thử `ssh <máy> 'docker ps --format "{{.Names}}"'` — phải thấy `motnha-app`.
2. **Người dùng của runner ERP:** `ps -o user= -C Runner.Listener`. Mọi bước sau chạy bằng người dùng đó (đã có quyền Docker).
3. **Mã đăng ký runner:** nếu máy anh có `gh` đã đăng nhập:
   `gh api -X POST repos/thanhmotnha/mn-do-hien-trang/actions/runners/registration-token --jq .token`.
   Không có thì nhờ anh lấy ở GitHub → Settings → Actions → Runners → New self-hosted runner (mã sau `--token`, hết hạn 1 giờ).
4. **Cài runner** (trên máy chủ, thư mục `~/actions-runner-mndo`):
   ```bash
   A=$(uname -m); case $A in x86_64) A=x64;; aarch64) A=arm64;; esac
   V=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | grep -o '"tag_name": *"v[^"]*' | grep -o '[0-9.]*$')
   mkdir -p ~/actions-runner-mndo && cd ~/actions-runner-mndo
   curl -fsSL -o r.tgz https://github.com/actions/runner/releases/download/v$V/actions-runner-linux-$A-$V.tar.gz && tar xzf r.tgz
   ./config.sh --unattended --url https://github.com/thanhmotnha/mn-do-hien-trang --token "$TOKEN" --name erp-mndo --labels mndo
   sudo ./svc.sh install && sudo ./svc.sh start
   ```
   (`sudo` cần mật khẩu thì để anh gõ trong terminal — không hỏi mật khẩu qua khung chat.)
5. **Triển khai:** `gh workflow run deploy.yml -R thanhmotnha/mn-do-hien-trang` (hoặc anh bấm Actions → Build and Deploy → Run workflow),
   rồi `gh run watch -R thanhmotnha/mn-do-hien-trang`. Đỏ thì đọc log bước hỏng, sửa trong kho, đẩy lại.
   Docker Hub báo 429 (quá lượt tải): đổi `FROM` trong `Dockerfile` sang `mirror.gcr.io/library/node:22-alpine` (ảnh y hệt).
   Kiểm trên máy chủ: `curl -fsS http://127.0.0.1:3110/api/suc-khoe`.
6. **Tài khoản quản lý** (secret `QUAN_LY_MAT_KHAU_DAU` chưa đặt thì chưa có): trên máy chủ
   `docker exec -it mndo-app node scripts/dat-lai-quan-ly.js quanly` → in mật khẩu tạm. Đưa anh xem ngay trong terminal; trang bắt đổi lúc đăng nhập đầu.
7. **Cloudflare Tunnel** (ERP đang ra Internet qua tunnel: `erp.motnha.vn`):
   - `docker ps --format '{{.Names}} {{.Image}}' | grep -i cloudflared`, `systemctl status cloudflared`, `ls /etc/cloudflared ~/.cloudflared`.
   - Tunnel quản lý trên trang Cloudflare (chạy bằng `--token`, không có `config.yml`): anh thêm ở Cloudflare Zero Trust → Networks →
     Tunnels → tunnel của ERP → Public hostname → Add: `do.motnha.vn`, dịch vụ `http://localhost:3110`
     (cloudflared chạy trong Docker thì `http://mndo-app:3100` và chạy `docker network connect mndo_net <tên container cloudflared>`).
   - Tunnel có `config.yml`: chép bản sao, thêm mục `- hostname: do.motnha.vn` / `service: http://localhost:3110` TRƯỚC dòng `- service: http_status:404`,
     `cloudflared tunnel route dns <tên tunnel> do.motnha.vn`, hỏi anh rồi mới khởi động lại.
8. **Kiểm cuối:** `curl -fsS https://do.motnha.vn/api/suc-khoe` từ máy anh. Anh đăng nhập, đổi mật khẩu, tạo tài khoản thợ,
   Cấp mã → Chép mã → dán vào thẻ Phòng → Máy đo của tiện ích Chenfeng.

## Báo lại
Một đoạn ngắn: runner `erp-mndo` Idle, lần triển khai xanh, `do.motnha.vn` trả lời, còn vướng gì.
