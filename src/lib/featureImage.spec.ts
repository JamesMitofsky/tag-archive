import { describe, expect, it } from 'vitest';
import { encodeFeatureRef, parseFeatureRef, sameFeatureRef, type FeatureRef } from './featureImage';

describe('feature image refs', () => {
	it('round-trips both kinds, URLs with colons and all', () => {
		const refs: FeatureRef[] = [
			{ kind: 'image', imageId: 42 },
			{ kind: 'artefact', artefactId: 7, url: 'https://bucket.test:8443/a/b:c.webp?x=1' },
			{ kind: 'artefact', artefactId: 7, url: '/artefacts/Symphonic Steep Program.webp' }
		];
		for (const ref of refs) expect(parseFeatureRef(encodeFeatureRef(ref))).toEqual(ref);
	});

	it('reads an empty value as no feature image', () => {
		expect(parseFeatureRef('')).toBeNull();
	});

	it('tells a malformed value from an empty one', () => {
		for (const value of [
			'image:',
			'image:0',
			'image:-1',
			'image:1.5',
			'image:1e3',
			'image:007',
			'image:99999999999999999999',
			'artefact:7',
			'artefact:7:',
			'artefact::https://x.test/a.webp',
			'photo:1',
			' image:1'
		]) {
			expect(parseFeatureRef(value), value).toBeUndefined();
		}
	});

	it('compares refs by what they name', () => {
		expect(sameFeatureRef({ kind: 'image', imageId: 1 }, { kind: 'image', imageId: 1 })).toBe(true);
		expect(sameFeatureRef({ kind: 'image', imageId: 1 }, null)).toBe(false);
		expect(sameFeatureRef(null, null)).toBe(true);
	});
});
