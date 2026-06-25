# Deploying UpworkRadar to the VPS

Target: **Contabo Cloud VPS 10 SSD**, Ubuntu 24.04, IP **173.212.239.64**.
Strategy: push to a **private GitHub repo**, then `deploy.sh` clones + runs it on the VPS.
v1 is served on **plain IP:port** (no domain/HTTPS yet).

---

## Prerequisites (one-time)

1. **Fresh GitHub PAT.** Rotate the one shared earlier. Create a *fine-grained* token
   scoped to a single private repo, `Contents: read`. Keep it off-screen.
2. **GitHub repo** `firstlinkai/upwork-radar` (private). Confirm `REPO_URL` at the top
   of `deploy.sh` matches it.
3. **SSH key access** to the VPS (you confirmed this works): `ssh root@173.212.239.64`.

---

## First-time deploy (fresh VPS)

```bash
# 0. From your laptop — push the finished code to GitHub (once):
#    (run in the repo root, after the build is complete)
git remote add origin https://github.com/firstlinkai/upwork-radar.git
git push -u origin main
# When prompted for a password, paste your PAT (not your account password).

# 1. SSH into the VPS:
ssh root@173.212.239.64

# 2. Fetch deploy.sh straight from the repo (private → use your PAT), then run it.
#    The script installs Docker, clones the repo, and starts everything.
export GITHUB_USER=firstlinkai GITHUB_PAT=ghp_your_fresh_token
curl -fsSL -u "$GITHUB_USER:$GITHUB_PAT" \
  https://raw.githubusercontent.com/firstlinkai/upwork-radar/main/deploy.sh -o deploy.sh
chmod +x deploy.sh
sudo -E ./deploy.sh
```

On the **first run** the script copies `.env.example` → `.env` and stops, so you can
fill in real secrets:

```bash
nano /opt/upwork-radar/.env     # set DB_PASSWORD, ANTHROPIC_API_KEY, FROM_EMAIL, etc.
cd /opt/upwork-radar && sudo ./deploy.sh   # run again — now it builds + starts
```

> **`.env` is gitignored and never pushed.** Your local `.env` (with the Apify +
> Resend keys already filled in) does **not** travel to the VPS via git — recreate
> the secret values on the server in `/opt/upwork-radar/.env`.

---

## Redeploy (every time after)

One line from your laptop:

```bash
ssh root@173.212.239.64 'cd /opt/upwork-radar && git pull && sudo ./deploy.sh'
```

---

## After deploy — verify

```bash
curl http://173.212.239.64:3001/health        # -> { status: ok, db: connected, ... }
```
Open the dashboard: **http://173.212.239.64:5173**

> Ports 3001 and 5173 must be allowed by the VPS firewall. They're currently closed
> from the outside (nothing is listening yet); once the stack is up, confirm Contabo's
> firewall / `ufw` permits inbound 3001 and 5173.

---

## `.env` values that still need real secrets before going live

| Var | Status |
|---|---|
| `APIFY_API_KEY`, `RESEND_API_KEY` | ✅ already set locally |
| `FRONTEND_URL`, `VITE_API_URL` | ✅ set to the VPS IP |
| `DB_PASSWORD` | ⚠️ still `your_secure_password_here` — set a strong value |
| `ANTHROPIC_API_KEY` | ⚠️ placeholder — add your Claude key |
| `FROM_EMAIL` | ⚠️ must be a **Resend-verified domain** (a bare gmail won't send) |
