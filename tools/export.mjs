import { exportTemplate, modeName, ROOT } from './content.mjs';
import { join } from 'node:path';
try {
  const mode = modeName(process.argv[2]);
  const target = exportTemplate(mode, process.argv[3] || join(ROOT, 'dist', mode));
  console.log('Ready to publish: ' + target);
  console.log('Preview: python3 -m http.server 8090 --bind 127.0.0.1 --directory ' + JSON.stringify(target));
} catch (e) { console.error(e.message); process.exitCode = 1; }
