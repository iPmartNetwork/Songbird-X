#!/usr/bin/env bash
set -Eeuo pipefail

OLD_APP_NAME="${OLD_APP_NAME:-songbird}"
NEW_APP_NAME="${NEW_APP_NAME:-songbird-x}"

OLD_INSTALL_DIR="${OLD_INSTALL_DIR:-/opt/songbird}"
NEW_INSTALL_DIR="${NEW_INSTALL_DIR:-/opt/songbird-x}"

OLD_SERVICE_NAME="${OLD_SERVICE_NAME:-songbird.service}"
NEW_SERVICE_NAME="${NEW_SERVICE_NAME:-songbird-x.service}"

REPO_URL="${REPO_URL:-https://github.com/iPmartNetwork/Songbird-X.git}"
BRANCH="${BRANCH:-master}"

SERVICE_USER="${SERVICE_USER:-songbird}"
SERVICE_GROUP="${SERVICE_GROUP:-songbird}"

BACKUP_ROOT="${BACKUP_ROOT:-/opt/songbird-migration-backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${OLD_APP_NAME}-to-${NEW_APP_NAME}-${TIMESTAMP}"

ENV_FILE="${NEW_INSTALL_DIR}/.env"
ENV_EXAMPLE_FILE="${NEW_INSTALL_DIR}/.env.example"
LOG_DIR="${NEW_INSTALL_DIR}/logs"
DATA_DIR="${NEW_INSTALL_DIR}/data"

NODE_MAJOR="${NODE_MAJOR:-24}"
OLD_PORT="${OLD_PORT:-3000}"
NEW_PORT="${NEW_PORT:-5174}"

NGINX_SITE_FILE="${NGINX_SITE_FILE:-/etc/nginx/sites-available/songbird.conf}"
NGINX_ENABLED_FILE="${NGINX_ENABLED_FILE:-/etc/nginx/sites-enabled/songbird.conf}"

AUTO_SWITCH="${AUTO_SWITCH:-false}"

SUDO=""
OS_ID=""
OS_ID_LIKE=""

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

run() {
  log "Running: $*"
  "$@"
}

run_root() {
  if [[ -n "$SUDO" ]]; then
    run "$SUDO" "$@"
  else
    run "$@"
  fi
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

detect_os() {
  [[ -f /etc/os-release ]] || fail "/etc/os-release not found."
  # shellcheck disable=SC1091
  source /etc/os-release
  OS_ID="${ID:-}"
  OS_ID_LIKE="${ID_LIKE:-}"

  if [[ "$OS_ID" == "ubuntu" || "$OS_ID" == "debian" || "$OS_ID_LIKE" == *"debian"* ]]; then
    return 0
  fi

  fail "Unsupported OS. This script supports Debian/Ubuntu only."
}

ensure_sudo() {
  if [[ "$EUID" -ne 0 ]]; then
    have_cmd sudo || fail "sudo is required when not running as root."
    SUDO="sudo"
    "$SUDO" -v
  fi
}

ensure_base_packages() {
  run_root apt-get update
  run_root apt-get install -y git curl ca-certificates gnupg lsb-release build-essential nginx ffmpeg rsync
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

  log "Installing Node.js ${NODE_MAJOR}.x ..."
  run_root mkdir -p /etc/apt/keyrings
  curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" \
    | run_root gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

  printf "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_%s.x nodistro main\n" "$NODE_MAJOR" \
    | run_root tee /etc/apt/sources.list.d/nodesource.list >/dev/null

  run_root apt-get update
  run_root apt-get install -y nodejs

  log "Installed Node.js $(node -v) and npm $(npm -v)."
}

ensure_service_user() {
  if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
    run_root useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  fi
}

assert_old_install_exists() {
  [[ -d "$OLD_INSTALL_DIR" ]] || fail "Old Songbird install not found at: $OLD_INSTALL_DIR"
}

backup_old_install() {
  run_root mkdir -p "$BACKUP_DIR"
  log "Creating migration backup at $BACKUP_DIR"

  if [[ -f "${OLD_INSTALL_DIR}/.env" ]]; then
    run_root cp "${OLD_INSTALL_DIR}/.env" "${BACKUP_DIR}/.env"
  fi

  if [[ -d "${OLD_INSTALL_DIR}/data" ]]; then
    run_root rsync -a "${OLD_INSTALL_DIR}/data/" "${BACKUP_DIR}/data/"
  fi

  if [[ -f "/etc/systemd/system/${OLD_SERVICE_NAME}" ]]; then
    run_root cp "/etc/systemd/system/${OLD_SERVICE_NAME}" "${BACKUP_DIR}/${OLD_SERVICE_NAME}"
  fi

  if [[ -f "$NGINX_SITE_FILE" ]]; then
    run_root cp "$NGINX_SITE_FILE" "${BACKUP_DIR}/$(basename "$NGINX_SITE_FILE").bak"
  fi

  if [[ -e "$NGINX_ENABLED_FILE" ]]; then
    run_root cp -P "$NGINX_ENABLED_FILE" "${BACKUP_DIR}/$(basename "$NGINX_ENABLED_FILE").bak"
  fi

  log "Backup completed."
}

clone_songbird_x() {
  if [[ -d "${NEW_INSTALL_DIR}/.git" ]]; then
    log "Existing Songbird-X repo found. Resetting to latest ${BRANCH}."
    run_root git -C "$NEW_INSTALL_DIR" fetch --all --prune
    run_root git -C "$NEW_INSTALL_DIR" checkout "$BRANCH"
    run_root git -C "$NEW_INSTALL_DIR" reset --hard "origin/${BRANCH}"
  else
    log "Cloning Songbird-X into ${NEW_INSTALL_DIR}"
    run_root rm -rf "$NEW_INSTALL_DIR"
    run_root git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$NEW_INSTALL_DIR"
  fi
}

prepare_env() {
  if [[ -f "${OLD_INSTALL_DIR}/.env" ]]; then
    run_root cp "${OLD_INSTALL_DIR}/.env" "$ENV_FILE"
    log "Copied .env from old installation."
  elif [[ -f "$ENV_EXAMPLE_FILE" ]]; then
    run_root cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
    log "Created .env from .env.example"
  else
    fail "Neither old .env nor new .env.example found."
  fi
}

set_env_value() {
  local key="$1"
  local value="$2"

  if run_root grep -q "^${key}=" "$ENV_FILE"; then
    run_root sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" | run_root tee -a "$ENV_FILE" >/dev/null
  fi
}

ensure_new_port_in_env() {
  set_env_value "SERVER_PORT" "$NEW_PORT"
  log "Set SERVER_PORT=${NEW_PORT} in ${ENV_FILE}"
}

migrate_data() {
  run_root mkdir -p "$DATA_DIR" "$LOG_DIR"

  if [[ -d "${OLD_INSTALL_DIR}/data" ]]; then
    log "Migrating data directory..."
    run_root rsync -a "${OLD_INSTALL_DIR}/data/" "${NEW_INSTALL_DIR}/data/"
  else
    warn "Old data directory not found. Skipping data migration."
  fi
}

reuse_or_install_dependencies() {
  local need_root_install="false"
  local need_client_install="false"
  local need_server_install="false"

  [[ -d "${NEW_INSTALL_DIR}/node_modules" ]] || need_root_install="true"
  [[ -d "${NEW_INSTALL_DIR}/client/node_modules" ]] || need_client_install="true"
  [[ -d "${NEW_INSTALL_DIR}/server/node_modules" ]] || need_server_install="true"

  if [[ "$need_root_install" == "true" ]]; then
    log "Installing root dependencies..."
    run_root bash -lc "cd '$NEW_INSTALL_DIR' && npm install"
  else
    log "Root node_modules already exists in repository. Skipping."
  fi

  if [[ "$need_client_install" == "true" ]]; then
    log "Installing client dependencies..."
    run_root bash -lc "cd '$NEW_INSTALL_DIR' && npm --prefix client install"
  else
    log "Client node_modules already exists. Skipping."
  fi

  if [[ "$need_server_install" == "true" ]]; then
    log "Installing server dependencies..."
    run_root bash -lc "cd '$NEW_INSTALL_DIR' && npm --prefix server install"
  else
    log "Server node_modules already exists. Skipping."
  fi
}

build_frontend() {
  log "Building frontend..."
  run_root bash -lc "cd '$NEW_INSTALL_DIR' && npm run build"
}

fix_permissions() {
  run_root chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "$NEW_INSTALL_DIR"
}

write_new_service() {
  cat <<EOF | run_root tee "/etc/systemd/system/${NEW_SERVICE_NAME}" >/dev/null
[Unit]
Description=Songbird-X Messaging Platform
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${NEW_INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
StandardOutput=append:${NEW_INSTALL_DIR}/logs/server.log
StandardError=append:${NEW_INSTALL_DIR}/logs/server-error.log

[Install]
WantedBy=multi-user.target
EOF

  run_root systemctl daemon-reload
  run_root systemctl enable "${NEW_SERVICE_NAME}"
  run_root systemctl restart "${NEW_SERVICE_NAME}"
  log "New service installed and started: ${NEW_SERVICE_NAME}"
}

check_new_service() {
  if ! run_root systemctl is-active --quiet "${NEW_SERVICE_NAME}"; then
    fail "New service ${NEW_SERVICE_NAME} is not active."
  fi
  log "Verified ${NEW_SERVICE_NAME} is active."
}

assert_nginx_files() {
  [[ -f "$NGINX_SITE_FILE" ]] || fail "Nginx site file not found: $NGINX_SITE_FILE"
}

replace_proxy_pass() {
  local old_http="http://127.0.0.1:${OLD_PORT}"
  local new_http="http://127.0.0.1:${NEW_PORT}"
  local old_localhost="http://localhost:${OLD_PORT}"
  local new_localhost="http://127.0.0.1:${NEW_PORT}"

  if run_root grep -q "$old_http" "$NGINX_SITE_FILE"; then
    run_root sed -i "s|${old_http}|${new_http}|g" "$NGINX_SITE_FILE"
  fi

  if run_root grep -q "$old_localhost" "$NGINX_SITE_FILE"; then
    run_root sed -i "s|${old_localhost}|${new_localhost}|g" "$NGINX_SITE_FILE"
  fi

  log "Updated nginx proxy_pass targets from ${OLD_PORT} to ${NEW_PORT}"
}

rollback_nginx() {
  local backup_site="${BACKUP_DIR}/$(basename "$NGINX_SITE_FILE").bak"
  if [[ -f "$backup_site" ]]; then
    run_root cp "$backup_site" "$NGINX_SITE_FILE"
  fi

  if run_root nginx -t; then
    run_root systemctl reload nginx
    log "Rollback nginx config restored and reloaded."
  else
    warn "Rollback config restored, but nginx -t still failed. Manual intervention required."
  fi
}

test_and_reload_nginx() {
  if ! run_root nginx -t; then
    warn "nginx -t failed after switch attempt."
    rollback_nginx
    fail "Nginx test failed. Rollback completed."
  fi

  run_root systemctl reload nginx
  log "Nginx reloaded successfully."
}

switch_services() {
  run_root systemctl restart "$NEW_SERVICE_NAME"
  log "Restarted ${NEW_SERVICE_NAME}"

  if run_root systemctl list-unit-files | grep -q "^${OLD_SERVICE_NAME}"; then
    run_root systemctl stop "$OLD_SERVICE_NAME" || true
    log "Stopped old service ${OLD_SERVICE_NAME}"
  else
    warn "Old service ${OLD_SERVICE_NAME} not found in systemd list."
  fi
}

run_nginx_switch() {
  assert_nginx_files
  replace_proxy_pass
  test_and_reload_nginx
  switch_services
}

print_summary() {
  cat <<EOF

==============================================
 Songbird → Songbird-X migration completed
==============================================
Old install : ${OLD_INSTALL_DIR}
New install : ${NEW_INSTALL_DIR}
Backup dir  : ${BACKUP_DIR}
Old service : ${OLD_SERVICE_NAME}
New service : ${NEW_SERVICE_NAME}
Old port    : ${OLD_PORT}
New port    : ${NEW_PORT}
Auto switch : ${AUTO_SWITCH}

Useful commands:
  sudo systemctl status ${NEW_SERVICE_NAME}
  sudo journalctl -u ${NEW_SERVICE_NAME} -f
  sudo nginx -t
  sudo systemctl status nginx

Rollback:
  1) Restore nginx:
     sudo cp ${BACKUP_DIR}/$(basename "$NGINX_SITE_FILE").bak ${NGINX_SITE_FILE}
     sudo nginx -t && sudo systemctl reload nginx

  2) Stop new service:
     sudo systemctl stop ${NEW_SERVICE_NAME}

  3) Restore old data/env if needed:
     ${BACKUP_DIR}

  4) Start old service:
     sudo systemctl start ${OLD_SERVICE_NAME}

==============================================
EOF
}

main() {
  detect_os
  ensure_sudo
  ensure_base_packages
  ensure_nodejs
  ensure_service_user
  assert_old_install_exists
  backup_old_install
  clone_songbird_x
  prepare_env
  ensure_new_port_in_env
  migrate_data
  reuse_or_install_dependencies
  build_frontend
  fix_permissions
  write_new_service
  check_new_service

  if [[ "${AUTO_SWITCH}" == "true" ]]; then
    run_nginx_switch
  else
    warn "AUTO_SWITCH is false. New service is running, but nginx was not switched."
    warn "After testing, rerun with AUTO_SWITCH=true to switch nginx and stop old service."
  fi

  print_summary
}

main "$@"