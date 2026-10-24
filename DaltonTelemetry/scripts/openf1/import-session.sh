#!/bin/bash
# Imports ONE finished session from F1's archive into the OpenF1 MongoDB, for a session the live
# recorder missed (Mac asleep, tunnel down...). Run it from the home machine, not from the VM: F1
# blocks Oracle's addresses.
#
#   bash scripts/openf1/import-session.sh <year> <meeting_key> <session_key>
#   bash scripts/openf1/import-session.sh 2026 1297 11390      # Austin 2026, Practice 2
#
# Needs: the SSH tunnel to MongoDB open on localhost:27017, a fresh F1 TV token (about 4 days), and
# the patched OpenF1 clone in ~/openf1-local (see scripts/openf1/f1-token.patch).
# Log: ~/openf1-local/import-session-<session_key>.log
set -u

year="${1:-}"; meeting="${2:-}"; session="${3:-}"
if [ -z "$year" ] || [ -z "$meeting" ] || [ -z "$session" ]; then
  echo "Uso: $0 <anno> <meeting_key> <session_key>   es. $0 2026 1297 11390"
  exit 1
fi

cd ~/openf1-local || { echo "Manca ~/openf1-local"; exit 1; }
TOKEN_FILE="$HOME/Library/Application Support/fastf1/f1auth.json"

if ! nc -z -w 3 localhost 27017; then
  echo "Il tunnel SSH verso il database è chiuso. Aprilo in un altro terminale:"
  echo "  ssh -N -L 27017:localhost:27017 -o ServerAliveInterval=30 -i ~/.ssh/oracle-f1.key ubuntu@92.4.216.19"
  exit 1
fi
if [ ! -s "$TOKEN_FILE" ]; then
  echo "Token F1 mancante: ~/f1rec/bin/python -m fastf1 auth f1tv --authenticate"
  exit 1
fi

export PATH="$HOME/openf1-local/.venv/bin:$PATH"
export PYTHONPATH=src
export MONGO_CONNECTION_STRING=mongodb://localhost:27017
export OPENF1_MQTT_PORT=1883
export F1_TOKEN="$(cat "$TOKEN_FILE")"
# Each session gets its own range of document ids (10 million apart, far above what one session
# needs): ids from the live recorder follow the clock and the season imports use 1.700e12-1.702e12,
# and two imports must never share ids, or the colliding rows are silently dropped.
export OPENF1_ID_BASE=$(( 1600000000000 + session * 10000000 ))

count() {
  python - "$session" <<'EOF'
import sys
from pymongo import MongoClient
db = MongoClient('mongodb://localhost:27017', serverSelectionTimeoutMS=8000)['openf1-livetiming']
k = int(sys.argv[1])
cols = ['car_data', 'location', 'position', 'laps', 'stints', 'pit', 'race_control', 'weather', 'team_radio', 'drivers']
print('  ' + ' | '.join(f"{c} {db[c].count_documents({'session_key': k})}" for c in cols))
EOF
}

echo "Righe già presenti per la sessione $session:"
count
echo "(se sono già molte, la sessione è stata registrata in parte: importarla di nuovo duplicherebbe le righe)"
echo
log="import-session-$session.log"
start=$(date +%s)
echo "$(date '+%H:%M:%S') avvio importazione sessione $session (anno $year, meeting $meeting)"
python -m openf1.services.ingestor_livetiming.historical.main ingest-session "$year" "$meeting" "$session" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
errors=$(grep -c "ERROR" "$log")
dups=$(grep -c "E11000" "$log")
echo
echo "$(date '+%H:%M:%S') finito in $(( $(date +%s) - start )) s: uscita=$status, errori=$errors, duplicati=$dups"
echo "Righe nel database ora:"
count
if [ "$status" -ne 0 ] || [ "$errors" -ne 0 ]; then
  echo "ATTENZIONE: ci sono stati errori, controlla $log"
  exit 1
fi
