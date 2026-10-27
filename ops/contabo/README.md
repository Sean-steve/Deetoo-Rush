# Contabo deployment foundation for Deetoo-Rush

These files prepare the repository for **Ubuntu VPS deployment**. Nothing in this folder provisions your Contabo VPS, changes DNS, stores credentials or authorizes real payment traffic.

## What this deploys

- `pnpm build` outputs the **canonical** Customer site (`dist/customer-web` including live `/customer` screens), Merchant (`dist/merchant-web`) and Admin (`dist/admin-web`). Do **not** deploy the separate Customer Next design fixture as the live portal.
- Node.js 22 / pnpm 10.17.1 Express API and `workers:start` under PM2.
- PostgreSQL 16 + PostGIS and Redis 7 in host-managed Docker volumes bound to loopback.
- Nginx + Let's Encrypt HTTPS for primary, merchant, admin and API origins.
- GitHub Actions deployment after **successful main-branch CI only**, initially **disabled** pending VPS commissioning.

## 1. Prepare the host (Ubuntu 24.04)

Create an unprivileged `deploy` user with SSH public-key login and sudo where required. Harden SSH; firewall should allow only SSH, TCP 80 and TCP 443. Keep port 3000, 5433 and 6379 closed externally; configure Contabo's network firewall too.

Install Node.js 22, pnpm 10.17.1, PM2, Nginx/Certbot, Git, curl, and **Docker Engine with Docker Compose plugin** using the official Ubuntu installation procedure.

On the host, as an administrator:

```bash
sudo install -d -o deploy -g deploy -m 755 /srv/deetoo /srv/deetoo/releases
sudo install -d -o deploy -g deploy -m 750 /srv/deetoo/shared /srv/deetoo/shared/migration-approved
sudo install -d -o root -g root -m 750 /srv/deetoo/infra
sudo cp ops/contabo/compose.yml /srv/deetoo/infra/compose.yml
sudo chmod 640 /srv/deetoo/infra/compose.yml
```

Those `cp` commands assume you have cloned this repository temporarily on the server. Do **not** run as root for `pnpm`, PM2 or application deployment. Never add `deploy` to the Docker group merely for application releases.

Create root-owned `/srv/deetoo/infra/.env` (mode 600):

```dotenv
POSTGRES_PASSWORD=USE_A_UNIQUE_URL_SAFE_DB_PASSWORD
```

Start infrastructure under the administrator account:

```bash
sudo docker compose -f /srv/deetoo/infra/compose.yml up -d
sudo docker compose -f /srv/deetoo/infra/compose.yml ps
```

Create `/srv/deetoo/shared/.env` owned by deploy (mode 600), for example:

```dotenv
APP_ENV=production
NODE_ENV=production
PORT=3000
DEETOO_BIND_HOST=127.0.0.1
DEETOO_STORAGE_MODE=postgres
DEETOO_FIXTURES=false
DEETOO_LOCAL_WORKFLOW=false
DATABASE_URL=postgresql://deetoo:USE_A_UNIQUE_URL_SAFE_DB_PASSWORD@127.0.0.1:5433/deetoo_prod
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=GENERATE_NEW_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
APP_URL=https://YOUR_DOMAIN
API_BASE_URL=https://api.YOUR_DOMAIN/api/v1
ALLOWED_ORIGINS=https://YOUR_DOMAIN,https://www.YOUR_DOMAIN,https://merchant.YOUR_DOMAIN,https://admin.YOUR_DOMAIN
MFA_ENCRYPTION_KEY=SEPARATE_BASE64_32_BYTE_KEY
PAYOUT_DESTINATION_ENCRYPTION_KEY=SEPARATE_BASE64_32_BYTE_KEY
```

Use the same database password in both files, URL-encode it if needed. Generate secrets with `openssl rand -hex 32` for JWT, and `openssl rand -base64 32` for 32-byte encryption keys. Configure actual provider/service secrets separately via this server file or a secure secret manager; **never commit credentials**. Production media must use trusted private S3-compatible storage, not the opt-in development MinIO mirror.

## 2. Install launcher and first deploy

As administrator, after cloning the repo:

```bash
sudo install -o deploy -g deploy -m 644 ops/contabo/ecosystem.config.cjs /srv/deetoo/shared/ecosystem.config.cjs
sudo install -o deploy -g deploy -m 750 ops/contabo/deploy.sh /srv/deetoo/shared/deploy.sh
```

Then **as deploy** (not root), determine the intended main commit and deploy it:

```bash
SHA="$(git ls-remote https://github.com/Sean-steve/Deetoo-Rush.git refs/heads/main | awk '{print $1}')"
bash /srv/deetoo/shared/deploy.sh "$SHA"
pm2 status
curl -fsS http://127.0.0.1:3000/health/ready
```

Run `pm2 startup` and its displayed systemd command after a successful launch, then `pm2 save`. Verify reboot recovery.

The deploy script refuses stale commits, verifies the SHA, builds from immutable release folders, checks TypeScript, runs checksum-checked migrations, switches the `current` symlink, restarts supervised processes, checks readiness, and attempts **code rollback** after a failed cutover. It cannot roll back destructive database changes or external events.

## 3. Domain/HTTPS

Replace every `YOUR_DOMAIN` in `nginx.conf.template`. Install under `/etc/nginx/sites-available/deetoo`, symlink to sites-enabled and run `sudo nginx -t && sudo systemctl reload nginx`.

Create A records for root, www, merchant, admin and api subdomains pointing at your Contabo IPv4. Only use an AAAA record if IPv6 is correctly configured. Once DNS/port 80 work:

```bash
sudo certbot --nginx -d YOUR_DOMAIN -d www.YOUR_DOMAIN -d merchant.YOUR_DOMAIN -d admin.YOUR_DOMAIN -d api.YOUR_DOMAIN
sudo certbot renew --dry-run
```

The Nginx template reverse-proxies same-origin `/api/` on each portal and serves SPA fallbacks. Adapt domains before deploying.

## 4. Enable GitHub auto-deployment *only after initial commissioning*

The workflow `.github/workflows/deploy-contabo.yml` is safe-by-default OFF.

- Create an Actions repository-level variable `CONTABO_DEPLOY_ENABLED` with value `true` **only after** the first deployment and SSH verification.
- Create a GitHub environment called `production`; set required reviewers for initial rollouts.
- Add environment secrets `CONTABO_HOST` (VPS IP), `CONTABO_SSH_KEY` (dedicated SSH private key), and `CONTABO_KNOWN_HOSTS` (verified pinned SSH host key).
- Install that dedicated SSH **public** key into `/home/deploy/.ssh/authorized_keys` on the VPS; never store your personal key in Actions.
- Require CI and reviewed PRs before merging into main. The workflow only uses a successful **push** CI result for `main`.

For each approved change: PR -> CI -> merge main -> CI pass -> SSH deploy current SHA. If a later push reaches main before an older deployment starts, the old SHA is refused; the latest successful run can deploy.

If a release adds/changes SQL migration files, `deploy.sh` blocks it until staging review and verified off-host DB backup. After explicit approval on the VPS, touch `/srv/deetoo/shared/migration-approved/<FULL_SHA>` and rerun the same CI/deploy workflow; **do not** automatically authorize migrations. See existing Deetoo staging/production release certification documents.

## 5. Go-live and operational cautions

- Never run `docker compose down -v` in production (it can delete DB/cache volumes).
- Back up PostGIS and media **off VPS**; conduct a full restore test.
- Verify `/health/ready`, the queue workers, web applications, SSL renewal and disk-space alerts.
- Stage Daraja sandbox callbacks, ledger posting, merchant/rider fulfillment, refunds, timeouts and duplicate callbacks before accepting **real** orders. The repo's customer release process currently documents **HOLD** on production payment certification. This infrastructure PR does **not** grant approval.
- Rider Android must be built/released separately; it is not published by this VPS web workflow.
- The workflow rebuilds on the VPS. For limited VPS resources, a later improvement is CI-built, signed/pinned artifacts deployed without compiling on Contabo.
- Keep the deployed `/srv/deetoo/shared/deploy.sh` and ecosystem file aligned with future reviewed changes to `ops/contabo/`; updating this repo alone does not automatically update host-managed scripts.
