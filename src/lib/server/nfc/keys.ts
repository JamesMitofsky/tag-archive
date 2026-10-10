import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { SdmKeys } from './sdm';

/**
 * The two AES-128 keys the garden tag signs its taps with (see ./sdm). They
 * are their own env vars, not derived from BETTER_AUTH_SECRET like
 * $lib/server/signing's keys: the same bytes are written onto the physical
 * tag, so rotating the auth secret must never invalidate it.
 *
 * Fails closed: outside dev, missing keys — or the all-zero factory default,
 * which anyone holding a blank tag could sign with — refuse every tap. In dev
 * the zero keys are allowed, so the NXP app-note vectors and
 * `scripts/nfc-tap-url.ts` work without provisioning anything.
 */
const KEY_RE = /^[0-9A-Fa-f]{32}$/;

export function sdmKeys(): SdmKeys | null {
	const meta = env.NFC_SDM_META_KEY ?? '';
	const file = env.NFC_SDM_FILE_KEY ?? '';
	if (!KEY_RE.test(meta) || !KEY_RE.test(file)) {
		console.error('[nfc] NFC_SDM_META_KEY / NFC_SDM_FILE_KEY are unset or malformed');
		return null;
	}
	const keys = { metaKey: Buffer.from(meta, 'hex'), fileKey: Buffer.from(file, 'hex') };
	const factory = (k: Buffer) => k.every((b) => b === 0);
	if (!dev && (factory(keys.metaKey) || factory(keys.fileKey))) {
		console.error('[nfc] refusing factory-default (all-zero) SDM keys outside dev');
		return null;
	}
	return keys;
}
