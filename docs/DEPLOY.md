# Chạy SYM thật trên Oracle Cloud (Always Free)

Kết quả: SYM chạy 24/7 tại `https://ten-cua-ban.duckdns.org`, có HTTPS tự cấp và tự gia hạn. Passkey, thông báo đẩy và chạy offline đều dùng được. Toàn bộ: Oracle Always Free (máy ảo), DuckDNS (tên miền miễn phí), Caddy (HTTPS), Docker.

Làm lần lượt từ trên xuống. Khoảng 45 phút lần đầu.

## 0. Hai điều cần biết trước

1. **Chọn tên miền một lần rồi giữ.** Passkey gắn với tên miền. Đổi tên miền thì passkey cũ mất tác dụng (đăng nhập bằng mật khẩu vẫn dùng được).
2. **Oracle có thể thu hồi máy ảo Always Free bị "nhàn rỗi"** (CPU rất thấp trong nhiều ngày). SYM gần như nhàn rỗi, nên có rủi ro này. Cách phòng đã được nhiều người dùng báo cáo: nâng tài khoản lên *Pay As You Go* (vẫn miễn phí nếu chỉ dùng trong hạn mức Always Free, Oracle chỉ giữ thẻ để xác minh), đồng thời tải bản sao lưu về máy bạn định kỳ (mục 8). Hãy đọc chính sách hiện hành của Oracle trước khi quyết định.

## 1. Tạo máy ảo

1. Đăng ký tại <https://www.oracle.com/cloud/free/>. Cần thẻ tín dụng để xác minh. **Home region chọn lúc đăng ký không đổi được**, hãy chọn nơi gần bạn (ví dụ Singapore).
2. Vào *Compute → Instances → Create instance*:
   - **Image:** Ubuntu 24.04 (hoặc 22.04).
   - **Shape:** `VM.Standard.A1.Flex` (ARM), 1 OCPU và 6 GB RAM là dư. Nếu báo *Out of host capacity*, thử lại vài giờ sau, hoặc chọn `VM.Standard.E2.1.Micro` (AMD, 1 GB RAM, xem lưu ý swap ở mục 4).
   - **SSH keys:** chọn *Generate a key pair* và **tải cả hai file về**, hoặc dán khoá công khai của bạn.
   - Giữ nguyên ổ đĩa mặc định (50 GB).
3. Sau khi máy chạy, ghi lại **Public IP**. Để địa chỉ này không đổi, vào *Networking → Reserved public IPs → Reserve* rồi gán cho máy (hoặc trong trang máy ảo: *Attached VNICs → IPv4 addresses → Edit → Reserved public IP*).

## 2. Mở cổng 80 và 443

1. Trang máy ảo → *Subnet* → *Security Lists* → danh sách mặc định → *Add Ingress Rules*. Thêm hai dòng, Source CIDR `0.0.0.0/0`, giao thức TCP, cổng đích `80` và `443`. (Thêm UDP `443` nếu muốn HTTP/3.)
2. Với Docker thường **không cần** chỉnh tường lửa trong máy. Nếu sau khi xong mục 6 mà vẫn không vào được site (dù Security List đã mở), chạy trên máy ảo:

   ```sh
   sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

## 3. Tên miền miễn phí

1. Vào <https://www.duckdns.org>, đăng nhập, tạo một tên (ví dụ `sym-cua-kiet` → `sym-cua-kiet.duckdns.org`).
2. Ô *current ip* điền **Public IP đã reserve** ở bước 1, bấm *update ip*.

Địa chỉ này sẽ là `SYM_DOMAIN` ở mục 5.

## 4. Cài Docker trên máy ảo

Kết nối (Windows PowerShell; thay đường dẫn khoá và IP của bạn):

```sh
ssh -i C:\duong\dan\ssh-key.key ubuntu@PUBLIC_IP
```

Rồi cài Docker:

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit
```

Kết nối lại để quyền có hiệu lực, kiểm tra bằng `docker compose version`.

**Chỉ với máy 1 GB RAM (E2.1.Micro):** build cần thêm bộ nhớ, tạo swap trước:

```sh
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 5. Lấy mã nguồn và cấu hình

Nếu mã nguồn nằm trên GitHub:

```sh
git clone https://github.com/TEN-BAN/SYM.git
```

Nếu không, từ máy bạn (PowerShell, trong thư mục cha của `SYM`):

```sh
scp -i C:\duong\dan\ssh-key.key -r SYM ubuntu@PUBLIC_IP:~/
```

(Không cần gửi `node_modules` và `dist`: xoá hai thư mục này trước, hoặc chấp nhận đợi lâu hơn.)

Cấu hình:

```sh
cd ~/SYM/deploy
cp .env.example .env
nano .env
```

Điền hai dòng:

```
SYM_DOMAIN=sym-cua-kiet.duckdns.org
SYM_VAPID_SUBJECT=mailto:email-that-cua-ban@gmail.com
```

## 6. Chạy

```sh
docker compose up -d --build
docker compose logs -f caddy
```

Lần build đầu mất 3–6 phút. Trong log của `caddy` sẽ thấy dòng báo đã lấy được chứng chỉ (`certificate obtained successfully`). Nhấn `Ctrl+C` để thoát xem log. Nếu Caddy báo lỗi ACME, thường là do DuckDNS chưa trỏ đúng IP hoặc cổng 80 chưa mở (quay lại mục 2 và 3).

Kiểm tra: mở `https://sym-cua-kiet.duckdns.org/api/health`, phải thấy `{"ok":true}`.

## 7. Thử trên điện thoại

1. Mở địa chỉ trên điện thoại, tạo tài khoản, **lưu mã khôi phục**.
2. Hồ sơ → *Thêm passkey*. Đăng xuất rồi thử *Đăng nhập bằng passkey*.
3. Cài app: Android (Chrome) menu → *Cài đặt ứng dụng*. **iPhone:** Safari → Chia sẻ → *Thêm vào MH chính*, rồi mở SYM từ màn hình chính.
4. Cài đặt → Thông báo → bật, rồi *Gửi thử một thông báo*.

## 8. Sao lưu

Dữ liệu nằm trong một file `sym.db` (cả khoá VAPID của thông báo). Mất máy ảo là mất file này, nên cần bản sao nằm ở nơi khác.

Sao lưu tự động hằng ngày (giữ 14 bản mới nhất, nằm trong `~/sym-backups` trên chính máy ảo):

```sh
chmod +x ~/SYM/deploy/backup.sh
crontab -e
```

Thêm dòng (giờ máy chủ là UTC, 20:15 UTC là 3:15 sáng giờ Việt Nam):

```
15 20 * * * /home/ubuntu/SYM/deploy/backup.sh >> /home/ubuntu/sym-backup.log 2>&1
```

**Tải về máy bạn** (làm mỗi tuần, hoặc đặt lịch trên Windows) để có bản sao ngoài Oracle:

```sh
scp -i C:\duong\dan\ssh-key.key "ubuntu@PUBLIC_IP:~/sym-backups/*" D:\sym-backups\
```

File sao lưu chứa dữ liệu tài chính của mọi người dùng: giữ riêng tư.

**Khôi phục** (chưa thử trên Docker thật, hãy thử một lần khi chưa có dữ liệu quan trọng): dừng server, chép file vào volume, bật lại:

```sh
cd ~/SYM/deploy
docker compose stop sym
docker compose run --rm --no-deps --user root -v ~/sym-backups:/b sym sh -c 'cp /b/TEN-FILE.db /data/sym.db && rm -f /data/sym.db-wal /data/sym.db-shm && chown node:node /data/sym.db'
docker compose start sym
```

## 9. Cập nhật phiên bản mới

```sh
cd ~/SYM && git pull
cd deploy && docker compose up -d --build
```

Dữ liệu nằm trong volume `sym-data` nên không mất khi build lại. Người dùng đang mở app sẽ nhận bản mới sau khi đóng hết các tab SYM.

## Xem log và xử lý sự cố

```sh
docker compose ps                  # sym phải là "healthy"
docker compose logs --tail 50 sym  # lỗi của server, lỗi gửi thông báo
docker compose logs --tail 50 caddy
```

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| Trình duyệt báo chứng chỉ không hợp lệ | DuckDNS trỏ sai IP, hoặc cổng 80 chưa mở: Caddy chưa lấy được chứng chỉ |
| Đăng nhập báo "Thử quá nhiều lần" cho mọi người | `SYM_TRUST_PROXY` không được bật: kiểm tra `docker-compose.yml` còn nguyên |
| Passkey báo "trang khác" | `SYM_DOMAIN` khác với địa chỉ bạn đang mở |
| Không nhận được thông báo | Chưa bật trong Cài đặt trên thiết bị đó; iPhone chưa mở từ màn hình chính; xem `docker compose logs sym` tìm dòng `[push]` |
