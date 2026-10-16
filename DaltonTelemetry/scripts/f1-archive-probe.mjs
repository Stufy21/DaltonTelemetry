// Checks which files F1's static archive serves for one session, using the F1 TV token that
// `python -m fastf1 auth f1tv --authenticate` stored on this machine. The token is never printed.
//
//   node scripts/f1-archive-probe.mjs [year] [meeting-name-part] [session-name]
//   node scripts/f1-archive-probe.mjs 2025 "United States" Race
//
// Set F1_TOKEN_FILE to read the token from somewhere else.
import { readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const BASE = 'https://livetiming.formula1.com/static';
const [year = '2025', meetingPart = 'United States', sessionName = 'Race'] = process.argv.slice(2);

const FILES = [
  'SessionInfo.json',
  'DriverList.jsonStream',
  'TimingData.jsonStream',
  'TimingAppData.jsonStream',
  'CarData.z.jsonStream',
  'Position.z.jsonStream',
  'WeatherData.jsonStream',
  'RaceControlMessages.jsonStream',
  'TeamRadio.jsonStream',
];

function tokenFile() {
  if (process.env.F1_TOKEN_FILE) return process.env.F1_TOKEN_FILE;
  if (platform() === 'darwin')
    return join(homedir(), 'Library/Application Support/fastf1/f1auth.json');
  if (platform() === 'win32')
    return join(process.env.LOCALAPPDATA ?? '', 'fastf1', 'fastf1', 'f1auth.json');
  return join(homedir(), '.local/share/fastf1/f1auth.json');
}

const token = readFileSync(tokenFile(), 'utf8').trim();
if (!token)
  throw new Error('No token found: run `python -m fastf1 auth f1tv --authenticate` first.');
const headers = { Authorization: `Bearer ${token}` };

const index = await fetch(`${BASE}/${year}/Index.json`, { headers });
if (!index.ok) throw new Error(`Index.json -> ${index.status}`);
const { Meetings: meetings } = JSON.parse((await index.text()).replace(/^\uFEFF/, ''));

const meeting = meetings.find((m) => m.Name.toLowerCase().includes(meetingPart.toLowerCase()));
if (!meeting) {
  console.log(`No meeting matching "${meetingPart}". Available:`);
  for (const m of meetings) console.log(`  ${m.Name}`);
  process.exit(1);
}
const session = meeting.Sessions.find((s) => s.Name === sessionName);
if (!session?.Path) {
  console.log(`No session "${sessionName}" in ${meeting.Name}. Sessions:`);
  for (const s of meeting.Sessions) console.log(`  ${s.Name} (${s.Path ?? 'no data'})`);
  process.exit(1);
}

console.log(`${meeting.Name} - ${session.Name}\n${session.Path}\n`);
for (const file of FILES) {
  const response = await fetch(`${BASE}/${session.Path}${file}`, { headers });
  const bytes = response.ok ? (await response.arrayBuffer()).byteLength : 0;
  const size = response.ok ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : '';
  console.log(`${file.padEnd(34)} ${response.status} ${size}`);
}
