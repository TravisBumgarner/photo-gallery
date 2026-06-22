#!/bin/bash
set -euo pipefail

# Publish the gallery output (data/out: media + labels.json + the fat ingestion
# DB + the slim serving DB) UP to a NearlyFreeSpeech host — the inverse of
# pull.sh, and the data half of a deploy. Run it after processing to push new
# photos + the rebuilt DB WITHOUT re-deploying the app code. It reloads the
# read-only serving DB on the host; you then restart the daemon so it serves the
# new release.
#
# The app must already be deployed (deploy.sh) — this runs its dist/boot.js to
# load the served DB from the pushed data/out.
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

# Nothing to publish if the pipeline hasn't published locally yet.
if [ ! -f "$LOCAL_OUT/db/latest" ]; then
  echo "✖ No published gallery in $LOCAL_OUT — run Process first."
  exit 1
fi

echo "🔑 Checking SSH access to $REMOTE …"
if ! ssh $KEYOPT -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$REMOTE" true 2>/dev/null; then
  echo "✖ Can't SSH into $REMOTE with a key (same host/key as your deploy)."
  exit 1
fi

# The app has to be there to load the DB — point the user at the app deploy.
if ! ssh $KEYOPT "$REMOTE" "test -f '$REMOTE_DIR/dist/boot.js'"; then
  echo "✖ The app isn't deployed at $REMOTE:$REMOTE_DIR yet."
  echo "  Run 'Update the app' first, then publish photos."
  exit 1
fi

echo "📁 Ensuring remote data dir…"
ssh $KEYOPT "$REMOTE" "mkdir -p '$REMOTE_DIR/data/out'"

echo "🖼️  Publishing $LOCAL_OUT → $REMOTE:$REMOTE_DIR/data/out …"
rsync -azPh -e "$RSH" --delete --timeout=300 "$LOCAL_OUT/" "$REMOTE:$REMOTE_DIR/data/out/"

echo "🗄️  Loading the read-only DB on the host…"
ssh $KEYOPT "$REMOTE" "cd '$REMOTE_DIR' && node dist/boot.js"

echo "✅ Published to $REMOTE:$REMOTE_DIR"
echo "   Restart the daemon so it serves the new release:"
echo "   NFSN panel → Daemons → Send Signals → TERM (it relaunches)."
