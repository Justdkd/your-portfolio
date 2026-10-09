import { syncMeta } from './content.mjs';
try {
  for (const mode of process.argv.slice(2).length ? process.argv.slice(2) : ['traveler', 'creator']) { syncMeta(mode); console.log('Updated static metadata: ' + mode); }
} catch (e) { console.error(e.message); process.exitCode = 1; }
