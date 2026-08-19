# Notylo

**Notylo** is a local-first note-taking and whiteboard application designed for pen, touch, keyboard and mixed documents.

The current V1 focuses on the web application. Notes are always saved locally first, while an optional self-hosted cloud can synchronize notebooks between devices without making note-taking dependent on the network.

> **Project status:** V1 / active development. The editor, local persistence, account system, private cloud and browser OCR workflow are functional.

## Highlights

- 📖 Page-based notebooks and infinite whiteboards
- ✍️ Pen/touch input with pressure-aware ink
- 🧲 Selection, lasso, move, resize, undo/redo
- 📝 Text, shapes, tables and LaTeX math objects
- 🖼️ Images, clipboard paste and drag-and-drop
- 📄 PDF, DOCX, XLSX/CSV and common document imports
- 🧮 Automatic math evaluation for supported expressions
- 💾 IndexedDB local-first persistence and periodic snapshots
- ☁️ Optional private cloud with account authentication
- 🔑 Email/password authentication and WebAuthn passkeys
- 📦 Native `.notezip` import/export
- 🧠 Browser OCR with Tesseract.js for text and mathematical expressions
- 🌐 Installable web/PWA foundation, ready for a later Tauri wrapper

## How storage works

Notylo deliberately separates **local save** from **cloud synchronization**.

1. Editing a notebook writes to IndexedDB on the current device.
2. Local saves never wait for the server.
3. If you are signed in, Notylo synchronizes the notebook snapshot with your private cloud.
4. A local synchronization checkpoint remembers the last cloud version seen by the current device.
5. If only one side changed, the newer side is applied automatically.
6. If both local and cloud copies changed since the last checkpoint, Notylo keeps both copies intact and asks which one to keep.
7. If the server or network is unavailable, editing continues locally and cloud upload is retried after connectivity returns.
8. Notebook deletions are applied locally immediately and stored as durable tombstones until the cloud confirms them.

Attachments are stored locally as blobs and remotely in MinIO. Their hashes are checkpointed so an unchanged attachment is not uploaded on every notebook save.

> The V1 synchronization model is snapshot reconciliation, not real-time collaborative CRDT editing. The repository already contains a WebSocket endpoint for future real-time work, but the current web editor does not depend on it.

---

## Architecture

```text
Notylo
├── apps/
│   ├── web/           React + Vite editor/PWA
│   ├── api/           Fastify private cloud API
│   └── desktop/       Future Tauri integration notes
├── packages/
│   ├── canvas-engine/
│   ├── document-model/
│   ├── import-export/
│   ├── math-engine/
│   ├── persistence/
│   └── shared/
├── docker/
│   └── init.sql
├── docker-compose.yml
├── docker-compose.coolify.yml
└── docker-compose.cloud.yml
```

### Web

- React
- TypeScript
- Vite
- IndexedDB / Dexie
- PDF.js
- Mammoth
- SheetJS
- KaTeX
- Tesseract.js
- perfect-freehand

### Private cloud

- Fastify / Node.js
- PostgreSQL
- MinIO (S3-compatible object storage)
- JWT access + refresh tokens
- WebAuthn/passkeys

### Browser OCR

- Tesseract.js runs in a Web Worker, so the server never receives OCR images.
- French and English language data are cached by the browser after the first scan.
- The editor prepares a high-resolution, padded selection for better handwriting and
  formula recognition.
- Mathematical mode keeps operators and common symbols, then converts the result
  into a LaTeX math object.

---

# Run Notylo locally

## Requirements

Recommended:

- **Node.js 24**
- **pnpm 11**
- Corepack
- Docker + Docker Compose for cloud services

Check your versions:

```bash
node --version
corepack --version
docker --version
docker compose version
```

Enable pnpm through Corepack:

```bash
corepack enable
```

## 1. Clone and install

```bash
git clone https://github.com/alexistb2904/Notylo.git
cd Notylo
pnpm install --frozen-lockfile
```

## 2. Local-only mode

If you only want the editor and do not need an account, PostgreSQL or MinIO:

```bash
pnpm dev
```

Open:

```text
http://localhost:5173
```

That is enough to:

- create notebooks;
- draw and edit locally;
- close/reopen the browser and recover notebooks from IndexedDB;
- import/export supported local files.

The account service may show as unavailable. This is expected in local-only mode and does **not** prevent local note-taking.

## 3. Local mode with private cloud services

Create your local environment:

```bash
cp .env.example .env
```

For development, the defaults are sufficient.

Then either run the backend services in Docker:

```bash
docker compose up -d postgres minio api
pnpm dev
```

or run PostgreSQL/MinIO in Docker and the API directly with Node:

```bash
docker compose up -d postgres minio
pnpm dev:api
```

In another terminal:

```bash
pnpm dev
```

Useful local endpoints:

| Service | URL |
|---|---|
| Web app | `http://localhost:5173` |
| API health | `http://localhost:3001/health` |
| MinIO S3 | `http://localhost:9000` |
| MinIO console | `http://localhost:9001` |

Check the containers:

```bash
docker compose ps
```

Follow logs:

```bash
docker compose logs -f api
```

Stop the services without deleting data:

```bash
docker compose down
```

Delete the local Docker data as well:

```bash
docker compose down -v
```

---

# Accounts and cloud connection

## Create an account locally

Local Docker configuration enables registration by default.

1. Start PostgreSQL, MinIO and the API.
2. Open Notylo.
3. Click **Se connecter**.
4. Click **Créer un compte**.
5. Enter an email address and a password of at least 10 characters.
6. After authentication, the library performs an initial cloud reconciliation.

The account is only needed for cloud features. Existing local notebooks remain available when logged out.

## Sessions

The API issues:

- a short-lived access token;
- a longer-lived refresh token.

The web client refreshes the session automatically while it is open, when the browser returns to the foreground and when the network comes back.

Authentication data is currently kept in `sessionStorage`. This intentionally keeps the session browser-session scoped; a new browser session can therefore require signing in again.

## Passkeys

Passkeys work on:

- `localhost`, for development;
- a real **HTTPS** origin in production.

For production, these values must match the public web application exactly:

```env
WEBAUTHN_RP_ID=notes.example.com
WEBAUTHN_ORIGIN=https://notes.example.com
```

`WEBAUTHN_RP_ID` is the hostname only. Do not include `https://` or a path.

---

# Deploy the private cloud on Coolify

`docker-compose.coolify.yml` is the production compose file for Coolify. It
keeps PostgreSQL and MinIO private and exposes only the `web` service on
its internal port 80. Do not add host `ports:` mappings to this file: Coolify's
proxy routes the assigned domain to the container port.

## Coolify setup

1. Create a **Docker Compose** application connected to this repository.
2. Set the compose file to `docker-compose.coolify.yml`.
3. Assign the public HTTPS domain only to the `web` service, using container
   port `80`. Leave `postgres`, `minio` and `api` without domains.
4. Add the variables below in Coolify's environment editor:

```env
POSTGRES_PASSWORD=<random-secret>
MINIO_ACCESS_KEY=notylo
MINIO_SECRET_KEY=<random-secret>
MINIO_BUCKET=notylo-assets
JWT_SECRET=<random-secret-at-least-32-characters>
REGISTRATION_ENABLED=true
CORS_ORIGIN=https://notes.example.com
WEBAUTHN_RP_ID=notes.example.com
WEBAUTHN_ORIGIN=https://notes.example.com
LOG_LEVEL=info
```

Replace `notes.example.com` with the exact domain configured on the `web`
service. `CORS_ORIGIN` and `WEBAUTHN_ORIGIN` must not have a trailing slash;
`WEBAUTHN_RP_ID` is the hostname only.

5. Deploy the stack. The named volumes `postgres_data` and `minio_data` must
   remain attached to the resource across redeployments.
6. Create the first accounts, then set `REGISTRATION_ENABLED=false` and
   redeploy.

Verify the public chain after deployment:

```bash
curl https://notes.example.com/healthz
curl https://notes.example.com/api/health
```

The API health endpoint returns HTTP 503 when PostgreSQL is unavailable, so
Coolify does not route traffic to an API that cannot serve cloud operations.

## Generic VPS deployment

The older `docker-compose.cloud.yml` file remains available for a VPS with an
external Caddy, Nginx Proxy Manager or Traefik instance. It publishes the web
container on loopback and is not the file to select for a native Coolify
Compose application.

The VPS compose file is designed for a small private VPS. PostgreSQL, MinIO and API stay on the internal Docker network. Only the web container is bound to `127.0.0.1`, ready to sit behind Caddy, Nginx Proxy Manager, Traefik or another HTTPS reverse proxy.

## Recommended VPS baseline

For the current V1:

- Linux x86_64
- Docker Engine + Docker Compose
- a recent browser with Web Worker support for local OCR
- enough client-side memory for the Tesseract language data cache
- persistent storage for Docker volumes
- a domain/subdomain
- HTTPS

OCR processing uses the device that runs the editor. The first scan downloads
the language data in the browser; later scans reuse the cached worker.

## 1. Clone the repository

```bash
git clone https://github.com/alexistb2904/Notylo.git
cd Notylo
```

For a private repository, authenticate Git on the VPS using your preferred GitHub credential method.

## 2. Create the production environment

```bash
cp .env.cloud.example .env
```

Generate strong secrets, for example:

```bash
openssl rand -hex 48
```

Edit `.env`:

```env
POSTGRES_PASSWORD=<random-secret>

MINIO_ACCESS_KEY=notylo
MINIO_SECRET_KEY=<random-secret>
MINIO_BUCKET=notylo-assets

JWT_SECRET=<random-secret-at-least-32-characters>

REGISTRATION_ENABLED=true

CORS_ORIGIN=https://notes.example.com
WEBAUTHN_RP_ID=notes.example.com
WEBAUTHN_ORIGIN=https://notes.example.com

WEB_PORT=8080
LOG_LEVEL=info
```

Do not commit `.env`.

## 3. Build and start

```bash
docker compose -f docker-compose.cloud.yml up -d --build
```

Check status:

```bash
docker compose -f docker-compose.cloud.yml ps
```

The application is now available locally on the VPS at:

```text
http://127.0.0.1:8080
```

The database, MinIO and API are **not** directly published to the internet.

## 4. Put HTTPS in front

### Caddy example

If Caddy is installed on the host:

```caddyfile
notes.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Reload Caddy after changing the configuration.

Caddy can then terminate HTTPS while the bundled web Nginx container proxies:

```text
/api/*  -> Fastify API
/*      -> React application and browser OCR
```

Using a single public origin avoids unnecessary cross-origin complexity and is also the cleanest setup for passkeys.

If you use Nginx Proxy Manager, Traefik or Cloudflare Tunnel instead, point it at:

```text
127.0.0.1:8080
```

and keep the public URL identical to `CORS_ORIGIN` and `WEBAUTHN_ORIGIN`.

## 5. Create the first account, then close registration

With:

```env
REGISTRATION_ENABLED=true
```

create the accounts you need from the Notylo login dialog.

For a private deployment, then switch to:

```env
REGISTRATION_ENABLED=false
```

and apply the configuration:

```bash
docker compose -f docker-compose.cloud.yml up -d
```

Existing accounts can still sign in. Only new account creation is disabled.

## 6. Verify the deployment

Through the public domain:

```bash
curl https://notes.example.com/api/health
```

Expected API state:

```json
{
  "status": "ok",
  "service": "notylo-api",
  "database": "ready"
}
```

Container logs:

```bash
docker compose -f docker-compose.cloud.yml logs -f api
docker compose -f docker-compose.cloud.yml logs -f web
```

---

# How cloud synchronization behaves

## First sign-in on a device

When an account is connected:

- cloud-only notebooks are downloaded locally;
- local-only notebooks are uploaded;
- notebooks that are identical establish a local synchronization checkpoint;
- a pre-existing local and remote notebook with the same ID but different content is treated conservatively as a conflict.

## Normal editing

The editor:

1. saves locally;
2. debounces cloud uploads;
3. checks the last synchronized version;
4. uploads the document;
5. only uploads attachments whose hash changed;
6. retries transient failures.

If the access token expires, the client refreshes the session and resumes synchronization.

## Offline editing

When the network disappears:

- local IndexedDB saves continue;
- no note-taking action depends on the API;
- cloud operations resume after the `online` browser event or a later reconciliation.

## Conflicts

If both local and cloud copies changed from the same known checkpoint, Notylo does not silently overwrite either one.

Return to the notebook library. Notylo displays the conflict dialog and offers:

- **Garder cette copie** — upload the local copy and replace the cloud snapshot;
- **Garder le cloud** — download the remote copy onto this device.

## Offline notebook deletion

Notebook deletion is local-first too:

1. the notebook disappears from IndexedDB immediately;
2. the same IndexedDB transaction creates a durable `delete` item in the synchronization queue;
3. if the cloud is reachable, the delete is sent immediately;
4. otherwise the queue survives reloads and the delete is retried at the next reconciliation;
5. the API stores a PostgreSQL tombstone so another device cannot resurrect an old copy simply by uploading it again;
6. the tombstone is removed only when the notebook is explicitly restored.

The API also queues MinIO object deletions server-side. If object storage is temporarily unavailable, binary cleanup remains pending instead of being silently forgotten.

### Deletion versus offline edits on another device

A remote deletion does **not** silently destroy unsynchronized edits.

If another device has not changed the notebook since its last cloud checkpoint, the remote tombstone removes that local copy automatically. If that device contains newer local changes, Notylo shows a conflict with two choices:

- **Restaurer le cahier** — recreate the notebook in the cloud from the modified local copy and clear the server tombstone;
- **Accepter la suppression** — delete the modified local copy too.

This prevents both accidental resurrection and silent loss of offline work.

---

# Browser OCR

Select an imported image or one or more handwritten strokes in the editor, then
open the inspector and choose **Lire le texte** or **Convertir en maths**. The
selection is rendered locally to an in-memory PNG and passed to a Tesseract.js
worker. No OCR endpoint or image upload is involved.

The first use downloads the `fra+eng` language data from the Tesseract.js data
distribution and caches it in the browser. Mathematical mode uses a restricted
character set and LaTeX normalization for common operators (`√`, `π`, `×`, `÷`,
exponents and simple fractions). Tesseract.js is not a trained handwritten
LaTeX model, so complex handwritten layouts may still need a quick correction in
the generated math object.

---

# Production updates

Pull the latest code:

```bash
git pull
```

Rebuild and restart:

```bash
docker compose -f docker-compose.cloud.yml up -d --build
```

Inspect status:

```bash
docker compose -f docker-compose.cloud.yml ps
```

Prune old unused Docker build data when needed:

```bash
docker builder prune
```

Do **not** use `docker compose down -v` on production unless you intentionally want to delete the PostgreSQL and MinIO volumes.

---

# Backups

Cloud data is split between:

- PostgreSQL — accounts and notebook snapshots;
- MinIO — binary attachments.

Back up both.

## PostgreSQL

```bash
mkdir -p backup
docker compose -f docker-compose.cloud.yml exec -T postgres \
  pg_dump -U notylo notylo > backup/notylo.sql
```

## MinIO data

A simple private VPS backup can copy the container data directory:

```bash
docker compose -f docker-compose.cloud.yml cp minio:/data ./backup/minio-data
```

For a production setup, automate off-machine backups as well.

Users should also periodically export important notebooks as `.notezip`; this keeps a portable copy independent from the server.

---

# Quality checks

Install dependencies first:

```bash
pnpm install --frozen-lockfile
```

TypeScript:

```bash
pnpm typecheck
```

Lint:

```bash
pnpm lint
```

Unit tests:

```bash
pnpm test
```

Web build:

```bash
pnpm build
```

End-to-end tests:

```bash
pnpm test:e2e
```

Playwright browsers may need to be installed once:

```bash
pnpm exec playwright install
```

---

# Troubleshooting

## “Le service cloud est indisponible”

Check:

```bash
docker compose ps
docker compose logs api
```

Then:

```bash
curl http://localhost:3001/health
```

For production:

```bash
curl https://notes.example.com/api/health
```

The local notebook is not deleted when this happens.

## I cannot create an account

Check:

```env
REGISTRATION_ENABLED=true
```

Then restart/recreate the API container:

```bash
docker compose up -d api
```

In production:

```bash
docker compose -f docker-compose.cloud.yml up -d api
```

## CORS errors in production

`CORS_ORIGIN` must be the exact public origin:

```env
CORS_ORIGIN=https://notes.example.com
```

Avoid a trailing slash.

## Passkey registration fails

Verify all three conditions:

```env
CORS_ORIGIN=https://notes.example.com
WEBAUTHN_RP_ID=notes.example.com
WEBAUTHN_ORIGIN=https://notes.example.com
```

and verify the browser is actually using HTTPS.

## API works but attachments do not synchronize

Check MinIO and API logs:

```bash
docker compose logs minio
docker compose logs api
```

In production:

```bash
docker compose -f docker-compose.cloud.yml logs minio
docker compose -f docker-compose.cloud.yml logs api
```

## OCR is slow on the first scan

The first browser scan loads the Tesseract.js worker and language data. The
worker stays alive and the language data is cached locally, so subsequent scans
on the same device are faster. A high-resolution source image and a tight
selection generally improve recognition quality.

---

# Security notes

For an internet-accessible private deployment:

- use HTTPS;
- use strong unique PostgreSQL, MinIO and JWT secrets;
- never commit `.env`;
- keep PostgreSQL and MinIO off public ports;
- disable public registration after creating your accounts;
- keep Docker and the host OS updated;
- back up PostgreSQL and MinIO;
- treat `.notezip` exports as potentially sensitive documents.

---

# Desktop roadmap

The V1 is intentionally web-first. The document model, persistence and platform abstractions are kept separate so the same frontend can later be wrapped with **Tauri 2** for Windows and Linux instead of maintaining a second editor implementation.

See `apps/desktop/README.md` for the current desktop integration notes.

---

## License

No public license has been declared in the repository yet. Until one is added, the repository remains under the default copyright rules applicable to its owner.
