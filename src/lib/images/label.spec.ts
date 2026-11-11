import { describe, expect, it } from 'vitest';
import { imageSetLabel, withoutTitleLine } from './label';

describe('withoutTitleLine', () => {
	it('drops the first line when it is the label', () => {
		const description = 'Picnic in the garden\n\nEveryone brought a dish.';
		const label = imageSetLabel({ description, count: 3 });
		expect(withoutTitleLine(description, label)).toBe('Everyone brought a dish.');
		expect(withoutTitleLine('  Picnic in the garden  ', 'Picnic in the garden')).toBeNull();
	});

	it('keeps the whole description when the label came from elsewhere', () => {
		const description = 'Picnic in the garden\nEveryone brought a dish.';
		const label = imageSetLabel({ event: 'Summer Picnic', description });
		expect(withoutTitleLine(description, label)).toBe(description);
	});

	it('keeps a first line too long to be the label whole', () => {
		const description = 'x'.repeat(100);
		expect(withoutTitleLine(description, imageSetLabel({ description }))).toBe(description);
	});

	it('prints nothing for a blank description', () => {
		expect(withoutTitleLine(null, '3 photographs')).toBeNull();
		expect(withoutTitleLine(' \n ', '3 photographs')).toBeNull();
	});
});
