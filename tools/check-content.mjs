import { checkContent } from './content.mjs';
try {
  for (const mode of process.argv.slice(2).length ? process.argv.slice(2) : ['traveler', 'creator']) {
    const result = checkContent(mode);
    if (result.errors.length) { console.error(mode + '\n' + result.errors.join('\n')); process.exitCode = 1; }
    else console.log('PASS ' + mode + ': content and local resources');
  }
} catch (e) { console.error(e.message); process.exitCode = 1; }
