#!/usr/bin/env bash
#
# deploy.sh — one-command deploy for UpworkRadar
# (PostgreSQL 16 + Node/Express backend + Vite/React frontend, via docker compose)
# Target: Contabo Cloud VPS, Ubuntu 24.04. Run as root (or with sudo).
#
# FIRST-TIME (fresh VPS, repo not yet cloned) — see DEPLOY.md.
# REDEPLOY:  ssh root@173.212.239.64 'cd /opt/upwork-radar && git pull && sudo ./deploy.sh'
#
# It is idempotent: safe to run repeatedly.
#
set -euo pipefail

# ----------------------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------------------
REPO_URL="https://github.com/firstlinkai/upwork-radar.git"  # <-- set to your repo
APP_DIR="/opt/upwork-radar"
BRANCH="main"
SERVER_IP="173.212.239.64"
FRONTEND_PORT="5173"   # host port the dashboard is served on (compose maps 5173:80)
COMPOSE_FILE="docker-compose.yml"

# Service / command names as defined in docker-compose.yml
DB_SERVICE="postgres"
BACKEND_SERVICE="backend"
SEED_CMD="npm run seed"

# To clone a PRIVATE repo on first run, export a PAT before running:
#   export GITHUB_USER=firstlinkai GITHUB_PAT=ghp_xxx ; sudo -E ./deploy.sh
# ----------------------------------------------------------------------------

log() { echo -e "\n\033[1;32m==> $*\033[0m"; }

# 1. Install Docker Engine + compose plugin if missing (official repo) --------
if ! command -v docker >/dev/null 2>&1; then
  log "Docker not found — installing Docker Engine + compose plugin..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl git gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  log "Docker already installed: $(docker --version)"
fi

command -v git >/dev/null 2>&1 || { apt-get update -y && apt-get install -y git; }

# 2. Clone or pull the repo (idempotent) -------------------------------------
CLONE_URL="$REPO_URL"
if [[ -n "${GITHUB_PAT:-}" ]]; then
  CLONE_URL="https://${GITHUB_USER:-firstlinkai}:${GITHUB_PAT}@${REPO_URL#https://}"
fi

if [[ -d "$APP_DIR/.git" ]]; then
  log "Repo exists — pulling latest from origin/$BRANCH..."
  git -C "$APP_DIR" remote set-url origin "$CLONE_URL"
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  log "Cloning $REPO_URL into $APP_DIR..."
  git clone --branch "$BRANCH" --depth 1 "$CLONE_URL" "$APP_DIR"
fi

# Scrub any embedded credentials back out of the stored remote.
git -C "$APP_DIR" remote set-url origin "$REPO_URL"
cd "$APP_DIR"

# 3. Ensure .env exists ------------------------------------------------------
if [[ -f .env ]]; then
  log ".env present — keeping it."
elif [[ -f .env.example ]]; then
  log "No .env found — copying .env.example to .env. EDIT IT with real secrets, then re-run!"
  cp .env.example .env
  echo "  Set at minimum: DB_PASSWORD, ANTHROPIC_API_KEY, APIFY_API_KEY, RESEND_API_KEY, FROM_EMAIL."
  exit 1
else
  log "ERROR: no .env and no .env.example — cannot continue."
  exit 1
fi

# 4. Build + start the stack -------------------------------------------------
log "Building and starting containers..."
docker compose -f "$COMPOSE_FILE" up -d --build

# 5. Wait for the DB, then seed ----------------------------------------------
log "Waiting for PostgreSQL to be ready..."
for _ in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" pg_isready >/dev/null 2>&1; then
    echo "  Postgres is ready."
    break
  fi
  sleep 2
done

log "Seeding default settings ($BACKEND_SERVICE: $SEED_CMD)..."
docker compose -f "$COMPOSE_FILE" exec -T "$BACKEND_SERVICE" sh -c "$SEED_CMD" \
  || echo "  Seed returned non-zero (already seeded?) — continuing."

# 6. Done --------------------------------------------------------------------
log "Deploy complete."
echo "----------------------------------------------------------------"
echo "  Dashboard:  http://${SERVER_IP}:${FRONTEND_PORT}"
echo "  API health: http://${SERVER_IP}:3001/health"
echo "----------------------------------------------------------------"
docker compose -f "$COMPOSE_FILE" ps
