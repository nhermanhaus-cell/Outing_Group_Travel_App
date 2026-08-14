import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const teamId = process.env.EXPO_APPLE_TEAM_ID;
const fingerprint = process.env.ANDROID_SHA256_CERT_FINGERPRINT;
if (!teamId || !fingerprint) throw new Error('Set EXPO_APPLE_TEAM_ID and ANDROID_SHA256_CERT_FINGERPRINT before a hosted production export.');
const output = resolve(process.cwd(), 'public/.well-known');
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'apple-app-site-association'), JSON.stringify({ applinks: { details: [{ appIDs: [`${teamId}.com.gayi.app`], components: [{ '/': '/invite*', comment: 'Outing trip invitations' }] }] } }, null, 2));
writeFileSync(resolve(output, 'assetlinks.json'), JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.gayi.app', sha256_cert_fingerprints: [fingerprint] } }], null, 2));
console.log('Generated Universal Link and App Link association files.');
