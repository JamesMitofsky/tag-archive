// Mint a tap URL exactly as the garden's NTAG 424 DNA tag would write it, for
// exercising the access gate without a physical tag: `pnpm nfc:tap`, then open
// the printed URL. Signs with NFC_SDM_META_KEY / NFC_SDM_FILE_KEY from .env, so
// it goes through the real verification path in src/routes/t — no bypass.
//
//   pnpm nfc:tap                          a new random tag, counter 1
//   pnpm nfc:tap --uid 04AABBCCDDEEFF --counter 7
//   pnpm nfc:tap --base https://<tunnel>.ngrok-free.dev
//
// Each run defaults to a fresh random tag id, so every URL is a first tap. Pin
// --uid and reuse a --counter to see a replay refused.
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { mintTapParams } from '../src/lib/server/nfc/sdm.ts';

const { values } = parseArgs({
	options: {
		uid: { type: 'string' },
		counter: { type: 'string', default: '1' },
		base: { type: 'string' }
	}
});

const key = (name: string) => {
	const value = process.env[name] ?? '';
	if (!/^[0-9A-Fa-f]{32}$/.test(value)) {
		console.error(`${name} must be 32 hex characters (set it in .env — see .env.example)`);
		process.exit(1);
	}
	return Buffer.from(value, 'hex');
};

const uid = (values.uid ?? `04${randomBytes(6).toString('hex')}`).toUpperCase();
if (!/^[0-9A-F]{14}$/.test(uid)) {
	console.error('--uid must be 7 bytes of hex (14 characters)');
	process.exit(1);
}
const counter = Number(values.counter);
if (!Number.isInteger(counter) || counter < 0 || counter > 0xffffff) {
	console.error('--counter must be an integer from 0 to 16777215 (the tag counts in 24 bits)');
	process.exit(1);
}

const keys = { metaKey: key('NFC_SDM_META_KEY'), fileKey: key('NFC_SDM_FILE_KEY') };
const { e, c } = mintTapParams(keys, { uid, counter });
const base = values.base ?? process.env.ORIGIN ?? 'http://localhost:5173';
console.log(`${base.replace(/\/$/, '')}/t?e=${e}&c=${c}`);
