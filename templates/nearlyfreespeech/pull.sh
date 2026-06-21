#!/bin/bash
set -euo pipefail

# Pull the published gallery output (data/out: media + labels.json + the fat
# ingestion DB + the slim serving DB) DOWN from a NearlyFreeSpeech host into
# local data/out — the inverse of deploy.sh's data sync. Lets a fresh or wiped
# machine rebuild without re-running the vision models: the pipeline's `restore`
# step seeds the working DB from the pulled fat DB, and you can serve the gallery
# locally straight away.
#
# Does NOT --delete: it merges the host's output into local data/out, never
# wiping local work.
#
# Params (env), reused from the deploy:
#   DEPLOY_SSH_HOST    required — member_site@host (or ssh-config alias)
#   DEPLOY_SSH_KEY     optional — identity file (ssh -i); blank = default/agent
#   DEPLOY_REMOTE_DIR  default /home/protected

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT"

REMOTE="${DEPLOY_SSH_HOST:?Set DEPLOY_SSH_HOST (member_site@host)}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/home/protected}"
SSH_KEY="${DEPLOY_SSH_KEY:-}"; SSH_KEY="${SSH_KEY/#\~/$HOME}"
KEYOPT=""; [ -n "$SSH_KEY" ] && KEYOPT="-i $SSH_KEY"
RSH="ssh $KEYOPT -o ConnectTimeout=15"
LOCAL_OUT="$ROOT/data/out"

echo "🔑 Checking SSH access to $REMOTE …"
if ! ssh $KEYOPT -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$REMOTE" true 2>/dev/null; then
  echo "✖ Can't SSH into $REMOTE with a key (same host/key as your deploy)."
  exit 1
fi

# Nothing to pull if the host has no published release.
if ! ssh $KEYOPT "$REMOTE" "test -f '$REMOTE_DIR/data/out/db/latest'"; then
  echo "✖ No published gallery at $REMOTE:$REMOTE_DIR/data/out — deploy there first."
  exit 1
fi

echo "⬇️  Pulling $REMOTE:$REMOTE_DIR/data/out → $LOCAL_OUT …"
mkdir -p "$LOCAL_OUT"
rsync -azPh -e "$RSH" --timeout=300 "$REMOTE:$REMOTE_DIR/data/out/" "$LOCAL_OUT/"

images=$(find "$LOCAL_OUT/images" -type f 2>/dev/null | wc -l | tr -d ' ')
db=$([ -f "$LOCAL_OUT/db/ingest.sqlite" ] && echo "yes" || echo "MISSING")
echo "✅ Pulled — local data/out now matches the host: ${images} images · fat DB: ${db}."
echo "   • Serve it here: ./ingest-and-sync → Put my gallery online → This computer"
echo "   • Add photos:    ./ingest-and-sync — 'restore' seeds the working DB from the"
echo "     pulled fat DB (no model re-runs), then only new photos are processed."
