import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Keep the existing site's download routes when deploying this web-only repo.
const worker = await readFile('.deployment/worker.js');
const expectedWorkerHash = '1fd242bfe205724c7c81560199f3f018e90dd81b8248f4fc940b82ab6e83d116';
if (createHash('sha256').update(worker).digest('hex') !== expectedWorkerHash) {
  throw new Error('Existing site worker checksum mismatch; deployment stopped.');
}
const rawManifest = await readFile('.deployment/update.json', 'utf8');
const manifest = JSON.parse(rawManifest);
if (!Number.isSafeInteger(manifest.versionCode) || manifest.versionCode < 1) {
  throw new Error('Invalid live update manifest; deployment stopped.');
}
await rm('.deploy', { recursive: true, force: true });
await cp('dist', '.deploy', { recursive: true });
await mkdir('.deploy/android', { recursive: true });
await writeFile('.deploy/_worker.js', worker);
await writeFile('.deploy/android/update.json', rawManifest);
await writeFile('.deploy/_routes.json', JSON.stringify({
  version: 1, include: ['/android/*'], exclude: ['/android/update.json']
}));
await writeFile('.deploy/_headers', '/android/update.json\n  Cache-Control: no-store\n');
console.log(`Prepared web deployment; retained app update manifest v${manifest.versionCode}.`);
