// Scores an agent's answer (JSON array, see bench/README.md) against the truth in run.mjs.
// Run: node bench/score-agent.mjs bench/results/agent-lab-sonnet.json
import fs from 'node:fs';
const truth = {
  'make this smaller': { asset: 'shapes', box: [1700, 200, 2100, 600] },
  'less padding here': { file: 'src/button.ts', line: 20 },
  'remove this': { asset: 'countdown', box: [980, 80, 1180, 200], from: 5, to: 6 },
};
const answer = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let points = 0;
const rows = Object.entries(truth).map(([ask, t]) => {
  const a = answer.find((x) => x.comment === ask) || {};
  const said = `${a.file} ${a.what_is_there}`;
  const parts = [];
  if (t.line) parts.push(['file', a.file === t.file], ['line', a.line === t.line]);
  else parts.push(['asset', said.includes(t.asset)], ['spot', a.x >= t.box[0] && a.x <= t.box[2] && a.y >= t.box[1] && a.y <= t.box[3]]);
  if (t.from !== undefined) parts.push(['time', a.seconds >= t.from && a.seconds < t.to]);
  points += parts.filter(([, ok]) => ok).length;
  return `${ask}: ${parts.map(([n, ok]) => `${n} ${ok ? 'ok' : 'MISS'}`).join(', ')}`;
});
const total = Object.values(truth).reduce((n, t) => n + (t.line ? 2 : 2) + (t.from !== undefined ? 1 : 0), 0);
console.log(rows.join('\n'));
console.log(`${points}/${total}`);
