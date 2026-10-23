"""Makes OpenF1's query API pin the MongoDB index that matches its filters.

Its pipeline is $match -> $sort {_id: -1} -> $group. For sessions recorded recently MongoDB prefers
walking the _id index backwards (it satisfies the sort) and scans tens of millions of rows until
the query times out (5 s). Pinning the compound index fixes that.

Run from the OpenF1 clone, e.g. on the server (then rebuild the api container):

    cd ~/openf1 && python3 /path/to/apply-api-index-hints.py && docker compose up -d --build api

The indexes it names must exist (see the README, "Indexes"). Safe to run twice.
"""

from pathlib import Path

path = Path("src/openf1/util/db.py")
source = path.read_text()

# a first version passed hint=None for collections without a pinned index, which MongoDB rejects
faulty = "maxTimeMS=_MAX_QUERY_TIME_MS, hint=hint)"
if "_INDEX_HINTS" in source and faulty in source:
    source = source.replace(
        '    hint = _INDEX_HINTS.get(collection_name) if "session_key" in filters else None\n'
        "    cursor = collection.aggregate(pipeline, maxTimeMS=_MAX_QUERY_TIME_MS, hint=hint)",
        '    hint = _INDEX_HINTS.get(collection_name) if "session_key" in filters else None\n'
        "    options = {\"hint\": hint} if hint else {}\n"
        "    cursor = collection.aggregate(pipeline, maxTimeMS=_MAX_QUERY_TIME_MS, **options)",
    )
    path.write_text(source)
    print("fixed the hint=None call")
    raise SystemExit(0)

if "_INDEX_HINTS" in source:
    print("already patched")
    raise SystemExit(0)

hints = '''# Without a hint MongoDB walks the _id index backwards to satisfy the $sort, which scans every row
# of a big collection for recent sessions. Pin the index that matches the session filters instead.
_INDEX_HINTS = {
    "location": "session_key_1_date_1",
    "position": "session_key_1_date_1",
    "intervals": "session_key_1_date_1",
    "race_control": "session_key_1_date_1",
    "weather": "session_key_1_date_1",
    "team_radio": "session_key_1_date_1",
    "pit": "session_key_1_date_1",
    "laps": "session_key_1_date_start_1",
    "car_data": "session_key_1_driver_number_1_date_1",
}


async def get_documents('''

old_call = "    cursor = collection.aggregate(pipeline, maxTimeMS=_MAX_QUERY_TIME_MS)"
new_call = """    hint = _INDEX_HINTS.get(collection_name) if "session_key" in filters else None
    options = {"hint": hint} if hint else {}
    cursor = collection.aggregate(pipeline, maxTimeMS=_MAX_QUERY_TIME_MS, **options)"""

if "async def get_documents(" not in source or old_call not in source:
    raise SystemExit("db.py is not shaped as expected: nothing changed")

source = source.replace("async def get_documents(", hints, 1).replace(old_call, new_call, 1)
path.write_text(source)
print("patched src/openf1/util/db.py")
