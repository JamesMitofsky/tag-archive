import { createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';

/**
 * Server half of NXP NTAG 424 DNA "Secure Unique NFC" (SUN) messages — the
 * Secure Dynamic Messaging (SDM) feature that rewrites the tag's URL on every
 * tap. The tag is configured to mirror two values into its NDEF URL:
 *
 *  - `e`: PICCData — the tag's UID and its tap counter, AES-128-CBC encrypted
 *    under the SDM meta-read key (zero IV, one block);
 *  - `c`: SDMMAC — an 8-byte CMAC, under a session key derived from the SDM
 *    file-read key, the UID and the counter.
 *
 * Both keys are symmetric: the same 16 bytes are written onto the tag and set
 * in the server's environment. Nothing here talks to a tag — it only checks
 * what one produced. Reference: NXP AN12196 ("NTAG 424 DNA features and
 * hints"), §3.3 (PICCData) and §3.4 (SDMMAC), whose worked example is the
 * spec's test vector.
 *
 * Configuration this expects of the tag: encrypted PICCData with UID and
 * counter mirroring on (PICCDataTag 0xC7: both mirrored, 7-byte UID), and the
 * SDMMAC input offset equal to the SDMMAC offset — so the MAC covers no file
 * data, only the session key that the UID and counter already bind.
 */

export type SdmKeys = { metaKey: Buffer; fileKey: Buffer };
export type Tap = { uid: string; counter: number };

const BLOCK = 16;
const ZERO_IV = Buffer.alloc(BLOCK);
/** UID mirrored, counter mirrored, UID length 7 — the only layout accepted. */
const PICC_DATA_TAG = 0xc7;

const E_RE = /^[0-9A-Fa-f]{32}$/;
const C_RE = /^[0-9A-Fa-f]{16}$/;

function aesEcbBlock(key: Buffer, block: Buffer): Buffer {
	const cipher = createCipheriv('aes-128-ecb', key, null);
	cipher.setAutoPadding(false);
	return Buffer.concat([cipher.update(block), cipher.final()]);
}

/** Left shift a 16-byte block by one bit, XORing in Rb on carry (RFC 4493 §2.3). */
function doubleBlock(block: Buffer): Buffer {
	const out = Buffer.alloc(BLOCK);
	for (let i = 0; i < BLOCK; i++) {
		out[i] = ((block[i] << 1) | (i + 1 < BLOCK ? block[i + 1] >> 7 : 0)) & 0xff;
	}
	if (block[0] & 0x80) out[BLOCK - 1] ^= 0x87;
	return out;
}

function xor(a: Buffer, b: Buffer): Buffer {
	const out = Buffer.alloc(a.length);
	for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
	return out;
}

/** AES-128-CMAC (RFC 4493). Node's crypto has no CMAC, so it is built on ECB. */
export function aesCmac(key: Buffer, message: Buffer): Buffer {
	const k1 = doubleBlock(aesEcbBlock(key, ZERO_IV));
	const k2 = doubleBlock(k1);

	const blocks = Math.max(1, Math.ceil(message.length / BLOCK));
	const complete = message.length > 0 && message.length % BLOCK === 0;
	const lastStart = (blocks - 1) * BLOCK;
	let last: Buffer;
	if (complete) {
		last = xor(message.subarray(lastStart), k1);
	} else {
		const padded = Buffer.alloc(BLOCK);
		message.subarray(lastStart).copy(padded);
		padded[message.length - lastStart] = 0x80;
		last = xor(padded, k2);
	}

	let x: Buffer = Buffer.alloc(BLOCK);
	for (let i = 0; i < blocks - 1; i++) {
		x = aesEcbBlock(key, xor(x, message.subarray(i * BLOCK, (i + 1) * BLOCK)));
	}
	return aesEcbBlock(key, xor(x, last));
}

/** Decrypt PICCData to the tag's UID and counter; null for any other layout. */
export function decryptPiccData(metaKey: Buffer, e: Buffer): Tap | null {
	if (e.length !== BLOCK) return null;
	const decipher = createDecipheriv('aes-128-cbc', metaKey, ZERO_IV);
	decipher.setAutoPadding(false);
	const plain = Buffer.concat([decipher.update(e), decipher.final()]);
	if (plain[0] !== PICC_DATA_TAG) return null;
	return {
		uid: plain.subarray(1, 8).toString('hex').toUpperCase(),
		counter: plain.readUIntLE(8, 3)
	};
}

/** UID (7 bytes) and the 24-bit counter, little-endian, as the tag lays them out. */
function uidAndCounter(uid: string, counter: number): Buffer {
	const ctr = Buffer.alloc(3);
	ctr.writeUIntLE(counter, 0, 3);
	return Buffer.concat([Buffer.from(uid, 'hex'), ctr]);
}

/**
 * The SDMMAC the tag would emit for this UID and counter: CMAC over the
 * (empty) MAC input under the session key KSesSDMFileReadMAC, keeping the
 * odd-indexed bytes (AN12196 §3.4: "truncated to 8 bytes, odd bytes").
 */
export function sdmMac(fileKey: Buffer, uid: string, counter: number): Buffer {
	const sv2 = Buffer.concat([
		Buffer.from([0x3c, 0xc3, 0x00, 0x01, 0x00, 0x80]),
		uidAndCounter(uid, counter)
	]);
	const sessionKey = aesCmac(fileKey, sv2);
	const full = aesCmac(sessionKey, Buffer.alloc(0));
	return Buffer.from([1, 3, 5, 7, 9, 11, 13, 15].map((i) => full[i]));
}

/**
 * Check one tap's `e` and `c` URL parameters. Returns the tag's UID and
 * counter when the MAC is genuine, else null. Replay (a counter already seen)
 * is the caller's question — this only proves the tag produced these values.
 */
export function verifyTap(
	params: { e: string | null | undefined; c: string | null | undefined },
	keys: SdmKeys
): Tap | null {
	const { e, c } = params;
	if (!e || !c || !E_RE.test(e) || !C_RE.test(c)) return null;

	const tap = decryptPiccData(keys.metaKey, Buffer.from(e, 'hex'));
	if (!tap) return null;

	const expected = sdmMac(keys.fileKey, tap.uid, tap.counter);
	const given = Buffer.from(c, 'hex');
	return timingSafeEqual(expected, given) ? tap : null;
}

/**
 * The inverse of `decryptPiccData`, for minting test taps (scripts and specs).
 * A real tag never needs this from us.
 */
export function encryptPiccData(metaKey: Buffer, tap: Tap, padding = Buffer.alloc(5)): Buffer {
	const plain = Buffer.concat([
		Buffer.from([PICC_DATA_TAG]),
		uidAndCounter(tap.uid, tap.counter),
		padding
	]);
	const cipher = createCipheriv('aes-128-cbc', metaKey, ZERO_IV);
	cipher.setAutoPadding(false);
	return Buffer.concat([cipher.update(plain), cipher.final()]);
}

/** A tap URL's query parameters for `tap`, as the tag would write them. */
export function mintTapParams(keys: SdmKeys, tap: Tap): { e: string; c: string } {
	return {
		e: encryptPiccData(keys.metaKey, tap).toString('hex').toUpperCase(),
		c: sdmMac(keys.fileKey, tap.uid, tap.counter).toString('hex').toUpperCase()
	};
}
