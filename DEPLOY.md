# Wajha — Production Deploy (Vercel + Fly.io)

This guide walks the first deploy. Follow top-to-bottom; each step assumes the previous one finished.

- **Frontend**: Vercel (free Hobby tier)
- **Backend**: Fly.io (~$10–15/month)
- **Domain**: `wajha-mena.com` → Vercel; `api.wajha-mena.com` → Fly.io

---

## Step 0 — One-time installs (do once)

```powershell
# Fly.io CLI on Windows
iwr https://fly.io/install.ps1 -useb | iex
# Reopen the terminal so flyctl ends up on PATH

# Vercel CLI (you have a Vercel account already; this just gives terminal control)
npm i -g vercel
```

Verify:
```powershell
flyctl version    # any version is fine
vercel --version  # any version is fine
```

---

## Step 1 — GitHub repo for `alshaya-shop-demo/`

Vercel auto-deploys from GitHub, so the codebase needs to live in a repo. Run from the repo root:

```powershell
cd C:\Users\AliFraydi\Desktop\Wajha-Mena\alshaya-shop-demo
git status                    # confirm git is initialised (.git directory exists)
git add -A
git status                    # double-check no .env / .venv / node_modules in staged files
git commit -m "Pre-deploy snapshot: backend Dockerfile, fly.toml, CORS update"
```

Then create a **private** GitHub repo (UI is easiest):
1. Open https://github.com/new
2. Repository name: `wajha-app` (or any private name you prefer)
3. **Private**. No README / .gitignore / license — repo already has them
4. Click "Create repository"

Push from your terminal (GitHub shows the exact commands; they look like):
```powershell
git remote add origin https://github.com/<your-username>/wajha-app.git
git branch -M main
git push -u origin main
```

---

## Step 2 — Fly.io account + backend deploy

### 2a. Sign up + auth
```powershell
flyctl auth signup       # opens browser; sign up with email or GitHub
# or, if you already have an account:
flyctl auth login
```

Add a payment card at https://fly.io/dashboard/personal/billing — Fly requires one even for the free tier. Your machine will cost ~$10–15/month at the `shared-cpu-1x` / 2 GB config.

### 2b. Launch the backend app

From the backend folder:
```powershell
cd C:\Users\AliFraydi\Desktop\Wajha-Mena\alshaya-shop-demo\backend
flyctl launch --no-deploy --copy-config --name wajha-backend --region fra
```

When prompted:
- "Would you like to copy its configuration to the new app?" → **Yes**
- "Choose a region for deployment" → already set to fra (Frankfurt) — accept
- "Would you like to set up a PostgreSQL database now?" → **No**
- "Would you like to set up an Upstash Redis database now?" → **No**
- "Would you like to deploy now?" → **No** (we need to set secrets first)

This creates the Fly app + reads our existing `fly.toml`.

### 2c. Set secrets

Read the values from your local `backend/.env`, then push them to Fly:

```powershell
# From inside backend/  — these come from your existing backend/.env
flyctl secrets set `
  SUPABASE_URL="https://uqxvgfvkgwnckkglkauj.supabase.co" `
  SUPABASE_SERVICE_ROLE_KEY="<paste from .env>" `
  COHERE_API_KEY="<paste from .env>" `
  GROQ_API_KEY="<paste from .env>" `
  GEMINI_API_KEY="<paste from .env>"
```

Verify they're set (names only — values are masked):
```powershell
flyctl secrets list
```

### 2d. Deploy

```powershell
flyctl deploy --remote-only
```

`--remote-only` does the Docker build on Fly's builders (faster than uploading from Kuwait's home internet). First build is slow because of the CLIP weight download — ~5–8 minutes. Subsequent deploys are ~1–2 minutes.

When it finishes you'll see:
```
==> Monitoring deployment
1 desired, 1 placed, 1 healthy, 0 unhealthy
Visit your newly deployed app at https://wajha-backend.fly.dev/
```

Sanity check:
```powershell
curl https://wajha-backend.fly.dev/health
# {"status":"ok"}
```

---

## Step 3 — Vercel deploy of the frontend

You already have a Vercel account from the rental-marketplace project.

1. Open https://vercel.com/new
2. **Import Git Repository** → pick `wajha-app` (the repo you just pushed)
3. Configure project:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: click "Edit" → set to **`frontend`** (Next.js code lives in `alshaya-shop-demo/frontend`, but since the repo root *is* `alshaya-shop-demo/`, this becomes just `frontend`)
   - **Environment Variables** — add one:
     - `NEXT_PUBLIC_API_BASE` = `https://wajha-backend.fly.dev`
4. Click **Deploy**

First build is ~2 minutes. You'll get a URL like `wajha-app-<hash>.vercel.app`.

Open it in your phone's Safari to smoke-test before wiring the custom domain.

---

## Step 4 — DNS records at Namecheap

You own `wajha-mena.com` already. Add these records in Namecheap's Advanced DNS panel.

| Type | Host | Value | TTL |
|---|---|---|---|
| **A** | `@` | `76.76.21.21` | Automatic |
| **CNAME** | `www` | `cname.vercel-dns.com` | Automatic |
| **CNAME** | `api` | `wajha-backend.fly.dev` | Automatic |

> Why `A` at root and `CNAME` for `www`: Namecheap doesn't support `ALIAS` at the apex (`@`). Vercel's `76.76.21.21` is their recommended anycast IP for apex domains.

### Tell Vercel about the custom domain

In the Vercel project → Settings → Domains → add `wajha-mena.com`. Vercel will check DNS and auto-issue a TLS cert (Let's Encrypt). Same for `www.wajha-mena.com`.

### Tell Fly.io about the API subdomain

```powershell
flyctl certs create api.wajha-mena.com
```

Fly will issue a cert as soon as the CNAME propagates (usually a few minutes).

Verify:
```powershell
curl https://api.wajha-mena.com/health
# {"status":"ok"}
```

### Update Vercel env var

Once `api.wajha-mena.com` is serving, update the Vercel env var:

- `NEXT_PUBLIC_API_BASE` = `https://api.wajha-mena.com`

Trigger a redeploy from the Vercel dashboard (or push any commit — Vercel auto-deploys on every push to `main`).

---

## Step 5 — Smoke test the production pipeline

From the phone (Safari):
1. Open `https://wajha-mena.com`
2. Tap Scenario 1 (English text search). Should return H&M tees within 2–3s (cold) or <1s (warm).
3. Tap Scenario 2 (Arabic). Should render RTL.
4. Open the Visual tab. Tap upload, pick an `.avif` screenshot. Should NOT return "Failed to fetch" (the pillow-avif-plugin install verifies in production).

If any of these fails, paste the error and we debug.

---

## Operational notes

- **Auto-deploy**: every `git push origin main` auto-deploys Vercel (frontend). Fly redeploys only on `flyctl deploy`. Keep `main` branch clean — use feature branches + PR if you start collaborating.
- **Logs**: `flyctl logs` (backend) · Vercel dashboard → Deployments → Logs (frontend).
- **Restart backend**: `flyctl restart` or push a new image with `flyctl deploy`.
- **Scale down to save money**: `flyctl scale count 0` (turns the app off entirely; flip back to 1 with `flyctl scale count 1`).
- **Backup-of-record**: Supabase is the durable store. Vercel and Fly are stateless — losing either one is a redeploy, not a data-loss event.
