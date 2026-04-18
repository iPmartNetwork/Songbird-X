#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="songbird-x"
INSTALL_DIR="${INSTALL_DIR:-/opt/songbird-x}"
REPO_URL="${REPO_URL:-https://github.com/iPmartNetwork/Songbird-X.git}"
BRANCH="${BRANCH:-master}"

SERVICE_USER="${SERVICE_USER:-songbird}"
SERVICE_GROUP="${SERVICE_GROUP:-songbird}"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"

NGINX_SITE_FILE="/etc/nginx/sites-available/${APP_NAME}"
NGINX_ENABLED_FILE="/etc/nginx/sites-enabled/${APP_NAME}"

DEFAULT_SERVER_PORT="${DEFAULT_SERVER_PORT:-5174}"
DEFAULT_CLIENT_PORT="${DEFAULT_CLIENT_PORT:-80}"
DEFAULT_APP_ENV="${DEFAULT_APP_ENV:-production}"
DEFAULT_APP_DEBUG="${DEFAULT_APP_DEBUG:-false}"

DEFAULT_FILE_UPLOAD="${DEFAULT_FILE_UPLOAD:-true}"
DEFAULT_FILE_UPLOAD_MAX_TOTAL_SIZE="${DEFAULT_FILE_UPLOAD_MAX_TOTAL_SIZE:-78643200}"
DEFAULT_MESSAGE_FILE_RETENTION="${DEFAULT_MESSAGE_FILE_RETENTION:-7}"
DEFAULT_ACCOUNT_CREATION="${DEFAULT_ACCOUNT_CREATION:-true}"

NODE_MAJOR="${NODE_MAJOR:-24}"
NODE_VERSION="${NODE_VERSION:-24.14.0}"
NPM_REGISTRY_MIRROR="${NPM_REGISTRY_MIRROR:-https://mirror-npm.runflare.com}"

SUDO=""
SERVER_PORT="$DEFAULT_SERVER_PORT"
CLIENT_PORT="$DEFAULT_CLIENT_PORT"
APP_ENV="$DEFAULT_APP_ENV"
APP_DEBUG="$DEFAULT_APP_DEBUG"
FILE_UPLOAD="$DEFAULT_FILE_UPLOAD"
FILE_UPLOAD_MAX_TOTAL_SIZE="$DEFAULT_FILE_UPLOAD_MAX_TOTAL_SIZE"
MESSAGE_FILE_RETENTION="$DEFAULT_MESSAGE_FILE_RETENTION"
ACCOUNT_CREATION="$DEFAULT_ACCOUNT_CREATION"
SERVER_NAME="_"
NODE_ARCH=""
NODE_TARBALL_NAME=""
NODE_TARBALL_URL=""

log() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

fail() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

run_root() {
  if [[ -n "$SUDO" ]]; then
    "$SUDO" "$@"
  else
    "$@"
  fi
}

need_pkg() {
  ! dpkg -s "$1" >/dev/null 2>&1
}

ensure_sudo() {
  if [[ "$EUID" -ne 0 ]]; then
    have_cmd sudo || fail "sudo is required when not running as root."
    SUDO="sudo"
    $SUDO -v
  fi
}

ensure_os() {
  [[ -f /etc/os-release ]] || fail "/etc/os-release not found."
  # shellcheck disable=SC1091
  source /etc/os-release

  case "${ID:-}" in
    ubuntu|debian) ;;
    *)
      if [[ "${ID_LIKE:-}" != *debian* ]]; then
        fail "This installer currently supports Debian/Ubuntu only."
      fi
      ;;
  esac
}

detect_node_arch() {
  local machine
  machine="$(uname -m)"

  case "$machine" in
    x86_64|amd64)
      NODE_ARCH="linux-x64"
      ;;
    aarch64|arm64)
      NODE_ARCH="linux-arm64"
      ;;
    *)
      fail "Unsupported architecture: $machine"
      ;;
  esac

  NODE_TARBALL_NAME="node-v${NODE_VERSION}-${NODE_ARCH}.tar.gz"
  NODE_TARBALL_URL="https://mirror-nodejs.runflare.com/dist/v${NODE_VERSION}/${NODE_TARBALL_NAME}"
}

install_required_packages() {
  local packages=()

  need_pkg git && packages+=("git")
  need_pkg curl && packages+=("curl")
  need_pkg ca-certificates && packages+=("ca-certificates")
  need_pkg gnupg && packages+=("gnupg")
  need_pkg lsb-release && packages+=("lsb-release")
  need_pkg build-essential && packages+=("build-essential")
  need_pkg nginx && packages+=("nginx")
  need_pkg ffmpeg && packages+=("ffmpeg")
  need_pkg unzip && packages+=("unzip")
  need_pkg rsync && packages+=("rsync")

  if (( ${#packages[@]} > 0 )); then
    log "Installing missing system packages: ${packages[*]}"
    run_root apt-get update
    run_root apt-get install -y "${packages[@]}"
  else
    log "All required system packages are already installed."
  fi
}

ensure_nodejs() {
  if have_cmd node && have_cmd npm; then
    local current_major
    current_major="$(node -p 'process.versions.node.split(".")[0]')"
    if [[ "$current_major" =~ ^[0-9]+$ ]] && (( current_major >= NODE_MAJOR )); then
      log "Node.js $(node -v) and npm $(npm -v) already installed."
      return 0
    fi
  fi

  detect_node_arch

  log "Installing Node.js from Runflare mirror: $NODE_TARBALL_URL"
  local tmp_archive="/tmp/${NODE_TARBALL_NAME}"

  run_root rm -f "$tmp_archive"
  run_root curl -fL "$NODE_TARBALL_URL" -o "$tmp_archive"
  run_root tar -xzf "$tmp_archive" -C /usr/local --strip-components=1

  have_cmd node || fail "Node installation failed: node not found."
  have_cmd npm || fail "Node installation failed: npm not found."

  log "Installed Node.js $(node -v) and npm $(npm -v)."
}

ensure_service_user() {
  if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
    log "Creating service user: $SERVICE_USER"
    run_root useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  else
    log "Service user already exists: $SERVICE_USER"
  fi
}

prompt_value() {
  local prompt="$1"
  local default="$2"
  local result=""
  read -r -p "$prompt [$default]: " result
  if [[ -z "$result" ]]; then
    result="$default"
  fi
  printf '%s' "$result"
}

configure_install() {
  echo
  echo "Songbird-X installer configuration"
  SERVER_PORT="$(prompt_value "Server port" "$DEFAULT_SERVER_PORT")"
  CLIENT_PORT="$(prompt_value "Nginx listen port" "$DEFAULT_CLIENT_PORT")"
  APP_ENV="$(prompt_value "APP_ENV" "$DEFAULT_APP_ENV")"
  APP_DEBUG="$(prompt_value "APP_DEBUG" "$DEFAULT_APP_DEBUG")"
  FILE_UPLOAD="$(prompt_value "FILE_UPLOAD" "$DEFAULT_FILE_UPLOAD")"
  FILE_UPLOAD_MAX_TOTAL_SIZE="$(prompt_value "FILE_UPLOAD_MAX_TOTAL_SIZE" "$DEFAULT_FILE_UPLOAD_MAX_TOTAL_SIZE")"
  MESSAGE_FILE_RETENTION="$(prompt_value "MESSAGE_FILE_RETENTION" "$DEFAULT_MESSAGE_FILE_RETENTION")"
  ACCOUNT_CREATION="$(prompt_value "ACCOUNT_CREATION" "$DEFAULT_ACCOUNT_CREATION")"
  SERVER_NAME="$(prompt_value "Domain / server_name (_ for IP only)" "_")"
}

clone_project() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    log "Project already exists. Updating repository..."

    run_root git -C "$INSTALL_DIR" fetch --all --prune
    run_root git -C "$INSTALL_DIR" checkout "$BRANCH"
    run_root git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"

  elif [[ -d "$INSTALL_DIR" ]]; then
    log "Directory exists but is not a git repository. Skipping clone."
    log "Expected git repo at: $INSTALL_DIR/.git"
    log "Remove $INSTALL_DIR manually if you want a clean clone."

  else
    log "Cloning Songbird-X into $INSTALL_DIR"
    run_root git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  fi
}

write_env_file() {
  local env_file="$INSTALL_DIR/.env"

  if [[ -f "$INSTALL_DIR/.env.example" ]]; then
    run_root cp "$INSTALL_DIR/.env.example" "$env_file"
  else
    run_root touch "$env_file"
  fi

  cat <<EOF | run_root tee "$env_file" >/dev/null
SERVER_PORT=$SERVER_PORT
CLIENT_PORT=$CLIENT_PORT
APP_ENV=$APP_ENV
APP_DEBUG=$APP_DEBUG
FILE_UPLOAD=$FILE_UPLOAD
FILE_UPLOAD_MAX_TOTAL_SIZE=$FILE_UPLOAD_MAX_TOTAL_SIZE
MESSAGE_FILE_RETENTION=$MESSAGE_FILE_RETENTION
ACCOUNT_CREATION=$ACCOUNT_CREATION
EOF

  log "Wrote environment file: $env_file"
}

configure_npm_registry() {
  log "Configuring npm registry mirror: $NPM_REGISTRY_MIRROR"
  run_root npm config set registry "$NPM_REGISTRY_MIRROR"
}

install_project_dependencies() {
  configure_npm_registry

  log "Installing root dependencies..."
  run_root bash -lc "cd '$INSTALL_DIR' && npm install"

  log "Installing client dependencies..."
  run_root bash -lc "cd '$INSTALL_DIR' && npm --prefix client install"

  log "Installing server dependencies..."
  run_root bash -lc "cd '$INSTALL_DIR' && npm --prefix server install"
}

build_project() {
  log "Building frontend..."
  run_root bash -lc "cd '$INSTALL_DIR' && npm run build"
}

fix_permissions() {
  run_root mkdir -p "$INSTALL_DIR/logs" "$INSTALL_DIR/data"
  run_root chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"
}

write_systemd_service() {
  cat <<EOF | run_root tee "$SERVICE_FILE" >/dev/null
[Unit]
Description=Songbird-X Messaging Platform
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
StandardOutput=append:$INSTALL_DIR/logs/server.log
StandardError=append:$INSTALL_DIR/logs/server-error.log

[Install]
WantedBy=multi-user.target
EOF

  run_root systemctl daemon-reload
  run_root systemctl enable "${APP_NAME}.service"
  run_root systemctl restart "${APP_NAME}.service"

  log "Systemd service created and started."
}

write_nginx_config() {
  cat <<EOF | run_root tee "$NGINX_SITE_FILE" >/dev/null
server {
    listen $CLIENT_PORT;
    listen [::]:$CLIENT_PORT;
    server_name $SERVER_NAME;

    client_max_body_size 256M;

    location / {
        proxy_pass http://127.0.0.1:$SERVER_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

  run_root ln -sf "$NGINX_SITE_FILE" "$NGINX_ENABLED_FILE"
  run_root nginx -t
  run_root systemctl enable nginx
  run_root systemctl restart nginx

  log "Nginx config created and activated."
}

show_summary() {
  echo
  echo "========================================================="
  echo "                 Songbird-X Installed"
  echo "========================================================="
  echo "Install dir : $INSTALL_DIR"
  echo "Repository  : $REPO_URL"
  echo "Branch      : $BRANCH"
  echo "Server port : $SERVER_PORT"
  echo "Nginx port  : $CLIENT_PORT"
  echo "Domain      : $SERVER_NAME"
  echo "Node mirror : $NODE_TARBALL_URL"
  echo "NPM mirror  : $NPM_REGISTRY_MIRROR"
  echo "Service     : ${APP_NAME}.service"
  echo
  echo "Useful commands:"
  echo "  sudo systemctl status ${APP_NAME}.service"
  echo "  sudo journalctl -u ${APP_NAME}.service -f"
  echo "  sudo nginx -t"
  echo
  echo "========================================================="
}

main() {
  ensure_os
  ensure_sudo
  install_required_packages
  ensure_nodejs
  ensure_service_user
  configure_install
  clone_project
  write_env_file
  install_project_dependencies
  build_project
  fix_permissions
  write_systemd_service
  write_nginx_config
  show_summary
}

main "$@"
