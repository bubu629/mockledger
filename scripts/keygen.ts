// scripts/keygen.ts
import fs from 'node:fs';
import crypto from 'node:crypto';
import { signOfflineLicense, LicensePayload } from '../src/license.js';

if (!fs.existsSync('./private_key.pem')) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  fs.writeFileSync('./private_key.pem', privateKey, 'utf8');
  fs.writeFileSync('./public_key.pem', publicKey, 'utf8');
  console.log('✅ Generated new Ed25519 keypair');
}

const privateKey = fs.readFileSync('./private_key.pem', 'utf8');
const publicKey = fs.readFileSync('./public_key.pem', 'utf8');

const licenseTsPath = './src/license.ts';
let licenseCode = fs.readFileSync(licenseTsPath, 'utf8');
licenseCode = licenseCode.replace(
  /export let EMBEDDED_PUBLIC_KEY = `[\s\S]*?`;/,
  `export let EMBEDDED_PUBLIC_KEY = \`${publicKey.trim()}\`;`
);
fs.writeFileSync(licenseTsPath, licenseCode, 'utf8');
console.log('✅ Injected production public key into src/license.ts');

function makeBatch(tier: 'PERSONAL' | 'PRO', count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const payload: LicensePayload = {
      license_id: `DF-${tier}-${Date.now()}-${String(i + 1).padStart(3, '0')}`,
      tier,
      max_orders: tier === 'PRO' ? 50000 : 1000,
      allow_custom_seed: tier === 'PRO',
      unlocked_scenarios: ['ecom-stripe-recon'],
      issued_at: new Date().toISOString(),
      expires_at: null
    };
    return signOfflineLicense(payload, privateKey);
  });
}

fs.writeFileSync('./batch_personal_39usd.txt', makeBatch('PERSONAL', 50).join('\n'));
fs.writeFileSync('./batch_pro_99usd.txt', makeBatch('PRO', 50).join('\n'));
console.log('🎉 Generated batch_personal_39usd.txt and batch_pro_99usd.txt (50 keys each)');
