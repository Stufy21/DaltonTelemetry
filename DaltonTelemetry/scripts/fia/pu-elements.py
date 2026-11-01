"""Reads the power unit element counts from the FIA's race documents and writes them as data for
the "Used Elements" page (src/app/dashboards/used-elements/pu-elements.data.ts).

    python scripts/fia/pu-elements.py                          # latest event on the FIA's page
    python scripts/fia/pu-elements.py "Mexico City Grand Prix"  # a specific event

Needs pdfplumber (pip install pdfplumber). Run it again after each race weekend, once the
Technical Delegate's reports are out (they appear on Thursday and are updated through the weekend).

Per event it combines three kinds of public FIA documents:
  * "PU Elements used per Driver up to now": the season counts before this weekend;
  * "New PU elements for this Competition" (one or more): who fitted a new element, and the count
    they had before (the new total is that plus one);
  * the Stewards' decisions "... PU element(s)": the grid penalties that follow;
  * the latest entry list, to tell who is actually racing (a driver can be replaced mid-season).
The counts are only as good as those documents: if the FIA changes their layout this stops with an
error rather than writing wrong numbers.
"""
import io
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import pdfplumber

SEASON = 2026
FIA = 'https://www.fia.com'
SEASON_PAGE = f'{FIA}/documents/championships/fia-formula-one-world-championship-14/season/season-{SEASON}-2072'
OUTPUT = Path(__file__).resolve().parents[2] / 'src/app/dashboards/used-elements/pu-elements.data.ts'

# Column order of the "used up to now" table.
ELEMENTS = ['ICE', 'TC', 'EXH', 'MGU-K', 'ES', 'PU-CE', 'PU-ANC']
ELEMENT_RE = '|'.join(re.escape(e) for e in ELEMENTS)

# The FIA's table has typos now and then (the Mexico one prints "i" instead of 18 for Stroll). A row
# whose car number is not a number is read by driver name from here, or the script stops.
CAR_NUMBER_FIXES = {'Lance Stroll': 18}


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def pdf_text(url):
    with pdfplumber.open(io.BytesIO(fetch(url))) as pdf:
        return '\n'.join(page.extract_text() or '' for page in pdf.pages)


def event_page(name):
    if name is None:
        return SEASON_PAGE
    page = fetch(SEASON_PAGE).decode('utf-8', 'replace')
    for value, label in re.findall(r'<option value="([^"]*/event/[^"]*)">([^<]*)', page):
        if label.strip().lower() == name.lower():
            return FIA + value
    sys.exit(f'No event called "{name}" on the FIA page.')


def documents(html):
    """(event slug, [pdf urls]) of the power unit documents on an event page."""
    paths = sorted(set(re.findall(r'/system/files/decision-document/[^"\']+\.pdf', html)))
    slugs = {re.match(r'.*/(\d{4}_[a-z_]+_grand_prix)_-_', p).group(1) for p in paths if re.match(r'.*/\d{4}_[a-z_]+_grand_prix_-_', p)}
    if len(slugs) != 1:
        sys.exit(f'Expected the documents of one event on the page, found: {sorted(slugs)}')
    return slugs.pop(), paths


def parse_used(text):
    """{car number: (team, driver, {element: count})} from the "used up to now" table."""
    counts = ' '.join([r'(\d+)'] * len(ELEMENTS))
    pattern = re.compile(r'^(\S+) (.+) ' + counts + r'$', re.M)
    rows = {}
    for m in pattern.finditer(text):
        who = m.group(2).split()
        # The table gives "<team> <first name> <last name>": every driver has two name words.
        driver, team = ' '.join(who[-2:]), ' '.join(who[:-2])
        number = m.group(1)
        if not number.isdigit():
            if driver not in CAR_NUMBER_FIXES:
                sys.exit(f'Row of {driver} has the car number "{number}": add them to CAR_NUMBER_FIXES.')
            number = CAR_NUMBER_FIXES[driver]
        rows[int(number)] = (team, driver, dict(zip(ELEMENTS, map(int, m.groups()[2:]))))
    # every row ends in seven numbers: if the count differs, a row was lost
    candidates = len(re.findall(r'(?: \d+){%d}$' % len(ELEMENTS), text, re.M))
    if len(rows) != candidates or not 18 <= len(rows) <= 24:
        sys.exit(f'Read {len(rows)} drivers but the table has {candidates} rows; the layout changed?')
    return rows


def parse_new(text):
    """[(element, car number, count before)] from one "New PU elements for this Competition"."""
    heading = re.compile(r'following drivers? (?:will start|are using|is using)[^:]*?\((' + ELEMENT_RE + r')\)[^:]*:')
    parts = heading.split(text)
    found = []
    for element, section in zip(parts[1::2], parts[2::2]):
        for m in re.finditer(r'^(\d{1,2}) .+? (\d+)$', section, re.M):
            found.append((element, int(m.group(1)), int(m.group(2))))
    return found


def parse_entry_list(text, teams):
    """[(car number, TLA, driver name, constructor)] from an entry list. The constructor is the
    team name as the "used up to now" table writes it, found at the end of each row."""
    entries = []
    for m in re.finditer(r'^(\d{1,2}) ([A-Z]{3}) (.+)$', text, re.M):
        words = m.group(3).split()
        nationality = next((i for i, w in enumerate(words) if re.fullmatch(r'[A-Z]{3}', w)), None)
        if nationality is None:
            continue
        rest = ' '.join(words[nationality + 1:])
        team = next((t for t in teams if rest.endswith(t)), rest)
        entries.append((int(m.group(1)), m.group(2), ' '.join(words[:nationality]), team))
    return entries


def parse_penalty(text):
    m = re.search(r'No / Driver (\d+) - ([^\n]+)', text)
    decision = re.search(r'Decision (.+?)(?:\nReason|\n[A-Z][a-z]+ [a-z])', text, re.S)
    if not m or not decision:
        sys.exit('Could not read a penalty decision; the layout changed?')
    decision = ' '.join(decision.group(1).split())
    places = re.search(r'Drop of (\d+) grid position', decision)
    document = re.search(r'Document (\d+)', text)
    return {
        'car': int(m.group(1)),
        'driver': m.group(2).strip(),
        'places': int(places.group(1)) if places else None,
        'decision': decision,
        'document': int(document.group(1)) if document else None,
    }


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else None
    slug, paths = documents(fetch(event_page(name)).decode('utf-8', 'replace'))
    base = FIA + '/system/files/decision-document/'
    used = [p for p in paths if 'pu_elements_used_per_driver' in p]
    new = [p for p in paths if '_new_pu_elements_for_this_competition' in p]
    penalties = [p for p in paths if '_infringement_' in p and re.search(r'pu_element', p)]
    if len(used) != 1:
        sys.exit(f'Expected one "used up to now" document for {slug}, found {len(used)}.')

    drivers = parse_used(pdf_text(FIA + used[0]))
    fitted = {}
    for path in new:
        for element, car, before in parse_new(pdf_text(FIA + path)):
            if car not in drivers:
                sys.exit(f'Car {car} in {path} is not in the "used up to now" table.')
            fitted[(car, element)] = max(fitted.get((car, element), 0), before + 1)

    # The newest entry list tells who is really racing: a driver can be replaced after the elements
    # report is out (Hirakawa for Ocon in Mexico) and the report keeps listing the old one.
    lists = []
    for path in (p for p in paths if p.endswith('entry_list.pdf') or '_entry_list' in p):
        text = pdf_text(FIA + path)
        number = re.search(r'Document (\d+)', text)
        lists.append((int(number.group(1)) if number else 0, text))
    teams = sorted({team for team, _, _ in drivers.values()}, key=len, reverse=True)
    racing = parse_entry_list(max(lists)[1], teams) if lists else []
    entered = {car for car, _, _, _ in racing}

    entries = []
    for car, (team, driver, counts) in drivers.items():  # the FIA lists the teams in championship order
        total = dict(counts)
        new_now = []
        for element in ELEMENTS:
            if (car, element) in fitted:
                total[element] = max(total[element], fitted[(car, element)])
                new_now.append(element)
        row = {'car': car, 'driver': driver, 'team': team, 'used': total, 'new': new_now}
        if racing and car not in entered:
            row['notRacing'] = True
        entries.append(row)
    # drivers on the entry list with no row in the elements report
    absent = {e['team']: e['car'] for e in entries if e.get('notRacing')}
    substitutes = [
        {'car': car, 'driver': name, 'team': team, 'replaces': absent.get(team)}
        for car, _, name, team in racing
        if car not in drivers
    ]
    sanctions = [parse_penalty(pdf_text(FIA + p)) for p in penalties]

    title = slug.replace('_', ' ').title()
    data = {
        'season': SEASON,
        'event': title,
        'drivers': entries,
        'substitutes': substitutes,
        'penalties': sanctions,
    }
    OUTPUT.write_text(
        '// Generated by scripts/fia/pu-elements.py from the FIA race documents. Do not edit by hand.\n'
        "import { PuElementsSnapshot } from './pu-elements.model';\n\n"
        f'export const PU_ELEMENTS: PuElementsSnapshot = {json.dumps(data, indent=2, ensure_ascii=False)};\n'
    )
    print(f'{title}: {len(entries)} drivers, {len(fitted)} new elements, {len(sanctions)} penalties, {len(substitutes)} substitutes -> {OUTPUT}')


if __name__ == '__main__':
    main()
