#!/bin/bash
set -euo pipefail

# Deploy the APP to NearlyFreeSpeech.NET (code only — not the photos/DB).
#
# Builds the web UI + backend locally, rsyncs the compiled app up to the host,
# installs production deps remotely, and writes the host .env + run.sh. The
# photos + database are pushed separately by push.sh ("Publish photos"), which
# also loads the read-only serving DB. Run this rarely — only when the app
# itself changes; run push.sh after every Process.
#
# How it serves on NFSN (two one-time panel settings — see the summary this
# prints at the end):
#
#   public web ──Proxy(http :8084)──▶ Daemon(run.sh) ──▶ node dist/index.js
#
#   • Daemon — Command = REMOTE_DIR/run.sh. run.sh is #!/bin/sh and execs node by
#     ABSOLUTE path. (#!/bin/bash fails: bash isn't at /bin/bash on FreeBSD; that
#     was the "execvp … Permission denied" loop — not noexec.) Listens on PORT.
#   • Proxy — http, Base URI /, Document Root /, Port = PORT (8084). Routes the
#     public site to the daemon. Without it the daemon runs but nothing reaches it.
#
# Params (env), prompted + remembered by the CLI:
#   DEPLOY_SSH_HOST    required — user_site@ssh.phx.nearlyfreespeech.net (or ssh alias)
#   DEPLOY_REMOTE_DIR  default /home/protected — where the app + data live
#   DEPLOY_SITE_URL    optional — public URL, used as CORS_ORIGIN (blank = *)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT"

REMOTE="${DEPLOY_SSH_HOST:?Set DEPLOY_SSH_HOST (e.g. user_site@ssh.phx.nearlyfreespeech.net)}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/home/protected}"
SITE_URL="${DEPLOY_SITE_URL:-}"

# Optional explicit identity (a non-default key). Expand a leading ~ since it
# arrives as a literal in the env. Threaded into both ssh and rsync.
SSH_KEY="${DEPLOY_SSH_KEY:-}"
SSH_KEY="${SSH_KEY/#\~/$HOME}"
KEYOPT=""
[ -n "$SSH_KEY" ] && KEYOPT="-i $SSH_KEY"
RSH="ssh $KEYOPT -o ConnectTimeout=15"

# Reuse the local serving secrets so prod matches local exactly.
LOCAL_ENV="$ROOT/backend/.env"
APP_PASSWORD="$(grep -E '^APP_PASSWORD=' "$LOCAL_ENV" | head -1 | cut -d= -f2- || true)"
SESSION_SECRET="$(grep -E '^SESSION_SECRET=' "$LOCAL_ENV" | head -1 | cut -d= -f2- || true)"
if [ -z "$APP_PASSWORD" ] || [ -z "$SESSION_SECRET" ]; then
  echo "✖ APP_PASSWORD / SESSION_SECRET missing from backend/.env — run setup first."
  exit 1
fi

# Fail fast on auth — before the multi-minute build — and with guidance. This
# flow is non-interactive (no password prompt is possible), so key auth is
# required; BatchMode turns a would-be password prompt into a clean error.
echo "🔑 Checking SSH access to $REMOTE …"
if ! ssh $KEYOPT -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$REMOTE" true 2>/dev/null; then
  echo "✖ Can't SSH into $REMOTE with a key."
  echo "  • Host must include your NFSN member+site (member_site@host), or be a"
  echo "    Host alias from ~/.ssh/config."
  echo "  • Pick the right key (DEPLOY_SSH_KEY=${SSH_KEY:-<default identities>})"
  echo "    and make sure its public half is in the NFSN panel (Profile → SSH Keys)."
  exit 1
fi

echo "🎨 Building the web UI…"
# Frontend deps aren't installed by ingest-and-sync (only needed to build the
# UI), so install them if missing — else `npx expo` grabs a random latest expo.
[ -d frontend/node_modules/expo ] || npm install -w frontend --no-audit --no-fund
# NODE_PATH so the root-hoisted @expo/metro-config can resolve `expo` (which npm
# keeps in frontend/node_modules) — otherwise the export dies with
# "Cannot find module 'expo/package.json'".
( cd frontend && NODE_PATH="$PWD/node_modules" EXPO_PUBLIC_API_BASE_URL="" \
    npx expo export --platform web --output-dir dist )
rm -rf backend/frontend-dist
cp -R frontend/dist backend/frontend-dist

echo "🖥️  Building backend + shared…"
npm run build -w backend   # tsc -b: compiles shared/dist too

echo "📋 Preparing deployment manifests…"
# Backend manifest: drop the workspace "shared" dep (synced manually below).
node -e "
const fs=require('fs');
const p=JSON.parse(fs.readFileSync('./backend/package.json','utf8'));
const d={name:p.name,version:p.version,type:p.type,dependencies:{...p.dependencies}};
delete d.dependencies.shared;
process.stdout.write(JSON.stringify(d,null,2));
" > /tmp/pg-deploy-package.json
# Shared manifest: same exports, but pointing at compiled dist/*.js.
node -e "
const fs=require('fs');
const p=JSON.parse(fs.readFileSync('./shared/package.json','utf8'));
const exp={};
for(const[k,v]of Object.entries(p.exports)) exp[k]=v.replace('/src/','/dist/').replace(/\.ts\$/,'.js');
const d={name:p.name,version:p.version,type:p.type,exports:exp,dependencies:p.dependencies};
process.stdout.write(JSON.stringify(d,null,2));
" > /tmp/pg-deploy-shared-package.json

# Host .env — remote paths, local secrets. nearlyfreespeech serves media itself
# (no MEDIA_BASE_URL), so STORAGE_URL points at the rsynced files on disk.
cat > /tmp/pg-deploy.env <<EOF
PORT=8084
NODE_ENV=production
BACKEND_SERVER=nearlyfreespeech
DATABASE_URL=$REMOTE_DIR/data/served.sqlite
STORAGE_URL=file://$REMOTE_DIR/data/out
APP_PASSWORD=$APP_PASSWORD
SESSION_SECRET=$SESSION_SECRET
CORS_ORIGIN=${SITE_URL:-*}
EOF

# Daemon run script. NFSN's Daemon command takes ONE executable with no args, so
# the daemon points at this. Use /bin/sh (FreeBSD always has it — the old
# #!/bin/bash failed because bash isn't at /bin/bash on NFSN) and node's ABSOLUTE
# path (a daemon runs with a bare PATH). .env loads by path, so no cd needed.
NODE_BIN="$(ssh $KEYOPT "$REMOTE" 'command -v node' 2>/dev/null || true)"
[ -n "$NODE_BIN" ] || NODE_BIN="/usr/local/bin/node"
echo "   (host node: $NODE_BIN)"
cat > /tmp/pg-run.sh <<EOF
#!/bin/sh
exec "$NODE_BIN" "$REMOTE_DIR/dist/index.js"
EOF

echo "📁 Ensuring remote directories…"
# rsync only creates the final path component, so a two-level dest like
# data/out fails unless its parent already exists. Make them up front.
ssh $KEYOPT "$REMOTE" "mkdir -p '$REMOTE_DIR/data/out' '$REMOTE_DIR/node_modules'"

echo "🚀 Syncing app to $REMOTE:$REMOTE_DIR …"
# Don't ship the root package-lock.json — it's a *workspace* lock and misleads a
# standalone `npm install` into installing nothing useful (the backend dies with
# "Cannot find package 'compression'"). We install with --no-package-lock below.
rsync -azPh -e "$RSH" --timeout=300 /tmp/pg-deploy-package.json "$REMOTE:$REMOTE_DIR/package.json"
rsync -azPh -e "$RSH" --timeout=300 /tmp/pg-deploy.env "$REMOTE:$REMOTE_DIR/.env"
rsync -azPh -e "$RSH" --timeout=300 /tmp/pg-run.sh "$REMOTE:$REMOTE_DIR/run.sh"
rsync -azPh -e "$RSH" --delete --timeout=300 backend/dist/ "$REMOTE:$REMOTE_DIR/dist/"
rsync -azPh -e "$RSH" --delete --timeout=300 backend/frontend-dist/ "$REMOTE:$REMOTE_DIR/frontend-dist/"
if [ -d backend/drizzle ]; then
  rsync -azPh -e "$RSH" --delete --timeout=300 backend/drizzle/ "$REMOTE:$REMOTE_DIR/drizzle/"
fi

echo "📦 Installing production dependencies on the host…"
ssh $KEYOPT "$REMOTE" "
  set -euo pipefail
  cd '$REMOTE_DIR'
  find node_modules -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
  mkdir -p node_modules data
  npm install --omit=dev --no-package-lock --no-audit --no-fund
  chmod +x run.sh
  chmod -R 755 dist frontend-dist
"

# Sync the shared package into node_modules AFTER install (so it survives it).
echo "📦 Syncing shared package…"
ssh $KEYOPT "$REMOTE" "mkdir -p '$REMOTE_DIR/node_modules/shared/dist'"
rsync -azPh -e "$RSH" --delete --timeout=300 shared/dist/ "$REMOTE:$REMOTE_DIR/node_modules/shared/dist/"
rsync -azPh -e "$RSH" --timeout=300 /tmp/pg-deploy-shared-package.json "$REMOTE:$REMOTE_DIR/node_modules/shared/package.json"

echo "✅ App deployed to $REMOTE:$REMOTE_DIR"
echo "   Next: Publish photos — pushes your gallery + loads the database. The"
echo "   site has nothing to serve until you do (this deploy is code only)."
echo
echo "════ One-time NFSN panel setup (only needed the first time) ════════"
echo
echo "  public web ──Proxy(:8084)──▶ Daemon(run.sh) ──▶ node dist/index.js"
echo
echo "  1) Daemons → 'Add a Daemon':"
echo "       Tag      : run                  (any label)"
echo "       Command  : $REMOTE_DIR/run.sh"
echo "     run.sh is #!/bin/sh and execs $NODE_BIN. It serves on port 8084."
echo
echo "  2) Proxies → 'Add a Proxy'  (routes the public site to the daemon —"
echo "     without it the daemon runs but nothing reaches it):"
echo "       Protocol      : http"
echo "       Base URI      : /"
echo "       Document Root : /"
echo "       Port          : 8084            (must match PORT in .env)"
echo
echo "  Later deploys change nothing in the panel — just restart the daemon"
echo "  (Send Signals → TERM, it relaunches) so it picks up the new release."
echo "═══════════════════════════════════════════════════════════════════"
