#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="songbird-x"
INSTALL_DIR="/opt/songbird-x"
REPO_URL="https://github.com/iPmartNetwork/Songbird-X.git"
BRANCH="master"

SERVICE_FILE="/etc/systemd/system/songbird-x.service"

NODE_VERSION="24.14.0"
NPM_MIRROR="https://mirror-npm.runflare.com"
NODE_MIRROR="https://mirror-nodejs.runflare.com/dist"

log() { echo -e "\e[32m[INFO]\e[0m $*"; }
err() { echo -e "\e[31m[ERROR]\e[0m $*" && exit 1; }

require_root() {
  [[ "$EUID" -eq 0 ]] || err "Run as root"
}

install_packages() {
  log "Installing system dependencies..."
  apt update -y
  apt install -y git curl nginx ffmpeg build-essential ca-certificates
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    log "Node already installed: $(node -v)"
    return
  fi

  ARCH=$(uname -m)
  if [[ "$ARCH" == "x86_64" ]]; then
    NODE_ARCH="linux-x64"
  elif [[ "$ARCH" == "aarch64" ]]; then
    NODE_ARCH="linux-arm64"
  else
    err "Unsupported architecture: $ARCH"
  fi

  FILE="node-v${NODE_VERSION}-${NODE_ARCH}.tar.gz"
  URL="${NODE_MIRROR}/v${NODE_VERSION}/${FILE}"

  log "Downloading Node.js from mirror..."
  curl -L "$URL" -o /tmp/node.tar.gz

  log "Installing Node.js..."
  tar -xzf /tmp/node.tar.gz -C /usr/local --strip-components=1

  node -v || err "Node install failed"
  npm -v || err "npm install failed"
}

setup_npm_mirror() {
  log "Setting npm mirror..."
  npm config set registry "$NPM_MIRROR"
}

clone_project() {
  if [[ -d "$INSTALL_DIR" ]]; then
    log "Updating existing project..."
    cd "$INSTALL_DIR"
    git fetch
    git reset --hard origin/$BRANCH
  else
    log "Cloning project..."
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
}

install_dependencies() {
  cd "$INSTALL_DIR"

  log "Installing root deps..."
  npm install

  log "Installing client deps..."
  npm --prefix client install

  log "Installing server deps..."
  npm --prefix server install
}

build_project() {
  cd "$INSTALL_DIR"
  log "Building frontend..."
  npm run build
}

create_env() {
  if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    log "Creating .env file..."

    cat <<EOF > "$INSTALL_DIR/.env"
SERVER_PORT=5174
APP_ENV=production
APP_DEBUG=false
FILE_UPLOAD=true
FILE_UPLOAD_MAX_TOTAL_SIZE=78643200
MESSAGE_FILE_RETENTION=7
ACCOUNT_CREATION=true
EOF
  fi
}

create_service() {
  log "Creating systemd service..."

  cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Songbird-X Service
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/npm start
Restart=always
User=root

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable songbird-x
  systemctl restart songbird-x
}

setup_nginx() {
  log "Configuring nginx..."

  cat <<EOF > /etc/nginx/sites-available/songbird-x
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:5174;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

  ln -sf /etc/nginx/sites-available/songbird-x /etc/nginx/sites-enabled/
  nginx -t
  systemctl restart nginx
}

main() {
  require_root
  install_packages
  install_node
  setup_npm_mirror
  clone_project
  install_dependencies
  build_project
  create_env
  create_service
  setup_nginx

  log "======================================"
  log "Songbird-X installed successfully 🚀"
  log "Open: http://YOUR_SERVER_IP"
  log "======================================"
}

main "$@"