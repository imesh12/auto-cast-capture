# AWS EC2 Deployment Guide

Follow these steps to deploy AutoView Timelapse to an Ubuntu EC2 instance.

## 1. Install System Dependencies

Update the system and install required packages:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl nginx ffmpeg sqlite3
```

## 2. Install Node.js (v20.x)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

## 3. Clone Repository

```bash
sudo mkdir -p /opt/autoview
sudo chown ubuntu:ubuntu /opt/autoview

# Clone your project to /opt/autoview
git clone <YOUR_REPO_URL> /opt/autoview
cd /opt/autoview
```

## 4. Install NPM Dependencies & Build Frontend

```bash
cd /opt/autoview
npm install

# Build the Vue frontend
cd uiapp
npm install
npm run build
cd ..
```

## 5. Setup Secure Environment Variables

Create the `.env` file with secure credentials. **Do not use default passwords in production.**

```bash
cat <<EOT > /opt/autoview/.env
PORT=8080
APP_MODE=timelapse
DB_PATH=/opt/autoview/data/cameras.db
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_this_super_secure_password
EOT
```

## 6. Install Systemd Service

```bash
sudo cp /opt/autoview/deploy/autoview.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable autoview
sudo systemctl start autoview
```

## 7. Setup Nginx Reverse Proxy

```bash
sudo rm /etc/nginx/sites-enabled/default
sudo cp /opt/autoview/deploy/nginx-autoview.conf /etc/nginx/sites-available/autoview
sudo ln -s /etc/nginx/sites-available/autoview /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

## 8. Setup HTTPS with Certbot

```bash
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

sudo certbot --nginx -d yourdomain.com
```

## 9. Check Logs

To view the running server logs, use:
```bash
sudo journalctl -u autoview -f
```

---

## 🔒 Camera Networking (Important)

Your cameras are likely on a local private network (e.g., `192.168.x.x`). The AWS EC2 instance cannot access them by default.

**Recommended Access Options:**

1. **Tailscale VPN (Recommended)**
   Install Tailscale on the EC2 instance and on a machine inside your camera LAN (or directly on a compatible router). This creates a secure bridge without opening firewall ports.

2. **Site-to-Site VPN**
   Use AWS Virtual Private Gateway and your office router to establish a permanent IPsec tunnel.

3. **Edge Box Relay**
   Run the project on a local Raspberry Pi/NUC, and sync the final timelapse files to AWS S3, using the EC2 instance just to serve the web UI.

4. **Port Forwarding (Testing Only)**
   Open RTSP (554) and HTTP (80) ports on your local router pointing to the cameras. This is **highly insecure** and should only be done for temporary testing.
