import { createCipheriv } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { aesCmac, decryptPiccData, mintTapParams, verifyTap } from './sdm';

const hex = (s: string) => Buffer.from(s, 'hex');

describe('aesCmac (RFC 4493 §4 vectors)', () => {
	const key = hex('2b7e151628aed2a6abf7158809cf4f3c');
	const msg = hex(
		'6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710'
	);

	it.each([
		[0, 'bb1d6929e95937287fa37d129b756746'],
		[16, '070a16b46b4d4144f79bdd9dd04a287c'],
		[40, 'dfa66747de9ae63030ca32611497c827'],
		[64, '51f0bebf7e3b9d92fc49741779363cfe']
	])('matches for a %i-byte message', (length, mac) => {
		expect(aesCmac(key, msg.subarray(0, length)).toString('hex')).toBe(mac);
	});
});

describe('verifyTap', () => {
	// NXP AN12196 §3.4 worked example: factory (all-zero) keys.
	const zero = Buffer.alloc(16);
	const keys = { metaKey: zero, fileKey: zero };
	const e = 'EF963FF7828658A599F3041510671E88';
	const c = '94EED9EE65337086';

	it("accepts the app note's example tap", () => {
		expect(verifyTap({ e, c }, keys)).toEqual({ uid: '04DE5F1EACC040', counter: 61 });
	});

	it('accepts lowercase hex', () => {
		expect(verifyTap({ e: e.toLowerCase(), c: c.toLowerCase() }, keys)).not.toBeNull();
	});

	it('rejects a tampered MAC', () => {
		expect(verifyTap({ e, c: '94EED9EE65337087' }, keys)).toBeNull();
	});

	it('rejects a tampered PICCData block', () => {
		expect(verifyTap({ e: 'FF963FF7828658A599F3041510671E88', c }, keys)).toBeNull();
	});

	it('rejects the right tap under a different MAC key', () => {
		const other = { metaKey: zero, fileKey: Buffer.alloc(16, 1) };
		expect(verifyTap({ e, c }, other)).toBeNull();
	});

	it('rejects the right tap under a different meta key', () => {
		// Decrypts to garbage, so the PICCDataTag byte check fails first.
		expect(verifyTap({ e, c }, { metaKey: Buffer.alloc(16, 1), fileKey: zero })).toBeNull();
	});

	it.each([
		[null, c],
		[e, null],
		['', c],
		[e.slice(2), c],
		[e, c.slice(2)],
		[`${e.slice(2)}zz`, c]
	])('rejects malformed parameters (%s, %s)', (badE, badC) => {
		expect(verifyTap({ e: badE, c: badC }, keys)).toBeNull();
	});

	it('round-trips taps it mints, under non-trivial keys', () => {
		const custom = {
			metaKey: hex('00112233445566778899aabbccddeeff'),
			fileKey: hex('ffeeddccbbaa99887766554433221100')
		};
		const tap = { uid: '04A1B2C3D4E5F6', counter: 0xabcdef };
		expect(verifyTap(mintTapParams(custom, tap), custom)).toEqual(tap);
	});
});

describe('decryptPiccData', () => {
	it('refuses a block whose tag byte is not 0xC7', () => {
		// Encrypt an all-zero plaintext, so it decrypts with tag byte 0x00.
		const zero = Buffer.alloc(16);
		const cipher = createCipheriv('aes-128-cbc', zero, zero);
		cipher.setAutoPadding(false);
		const block = Buffer.concat([cipher.update(Buffer.alloc(16)), cipher.final()]);
		expect(decryptPiccData(zero, block)).toBeNull();
	});
});
