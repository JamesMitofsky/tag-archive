import { describe, expect, it } from 'vitest';
import { morph, morphName, morphNameForPair, morphVar } from './transitions.svelte';

describe('morphNameForPair', () => {
	it('pairs each keeper list with its own detail pages, both ways', () => {
		const pairs = [
			['/keeper/artefacts', '/keeper/artefacts/7', 'artefact-7'],
			['/keeper/events', '/keeper/events/7', 'event-7'],
			['/keeper/series', '/keeper/series/7', 'series-7'],
			['/keeper/images', '/keeper/images/7', 'image-7']
		] as const;
		for (const [list, detail, name] of pairs) {
			expect(morphNameForPair(list, detail)).toBe(name);
			expect(morphNameForPair(detail, list)).toBe(name);
			// A trailing slash is the same page.
			expect(morphNameForPair(`${list}/`, `${detail}/`)).toBe(name);
		}
	});

	it('leaves the add pages, edit pages and other lists to the plain fade', () => {
		expect(morphNameForPair('/keeper/images', '/keeper/images/add')).toBeNull();
		expect(morphNameForPair('/keeper/images/add', '/keeper/images')).toBeNull();
		expect(morphNameForPair('/keeper/images', '/keeper/images/7/edit')).toBeNull();
		expect(morphNameForPair('/keeper/images/7/edit', '/keeper/images/7')).toBeNull();
		// Same id, wrong list: an image set never morphs out of the artefacts list.
		expect(morphNameForPair('/keeper/artefacts', '/keeper/images/7')).toBeNull();
		expect(morphNameForPair('/keeper/images/7', '/keeper/artefacts')).toBeNull();
		expect(morphNameForPair('/images', '/keeper/images/7')).toBeNull();
		expect(morphNameForPair(undefined, '/keeper/images/7')).toBeNull();
	});
});

describe('morphVar', () => {
	it('names only the card being morphed, and its parts', () => {
		morph.name = morphName('image', 7);
		try {
			expect(morphVar('image', 7)).toBe('image-7');
			expect(morphVar('image', 7, 'meta')).toBe('image-7-meta');
			expect(morphVar('image', 8)).toBeUndefined();
			// Kinds don't collide on a shared id.
			expect(morphVar('artefact', 7)).toBeUndefined();
		} finally {
			morph.name = null;
		}
		expect(morphVar('image', 7)).toBeUndefined();
	});
});
