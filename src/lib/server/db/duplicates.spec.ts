import { describe, it, expect } from 'vitest';
import {
	findDuplicatePairs,
	levenshtein,
	normalizeName,
	type DuplicateCandidate
} from './duplicates';

const person = (id: number, name: string): DuplicateCandidate => ({
	id,
	name,
	artefactCount: 0,
	eventCount: 0
});

describe('normalizeName', () => {
	it('strips accents, case, and punctuation', () => {
		expect(normalizeName('José García')).toBe('jose garcia');
		expect(normalizeName('Smith, John')).toBe('smith john');
		expect(normalizeName('  J.  Smith ')).toBe('j smith');
	});
});

describe('levenshtein', () => {
	it('counts single edits', () => {
		expect(levenshtein('jon', 'john')).toBe(1);
		expect(levenshtein('abc', 'abc')).toBe(0);
	});
});

describe('findDuplicatePairs', () => {
	function reasonFor(a: string, b: string): string | undefined {
		return findDuplicatePairs([person(1, a), person(2, b)])[0]?.reason;
	}

	it('matches accent/case/spacing differences', () => {
		expect(reasonFor('José García', 'Jose Garcia')).toBe(
			'Same name, different accents/case/spacing'
		);
	});

	it('matches the same words in a different order', () => {
		expect(reasonFor('Smith, John', 'John Smith')).toBe('Same words, different order');
	});

	it('matches a likely typo', () => {
		expect(reasonFor('Jon Smith', 'John Smith')).toBe('Possible typo');
	});

	it('matches an initial against a full first name', () => {
		expect(reasonFor('J. Smith', 'John Smith')).toBe('Initials match');
	});

	it('does not flag short unrelated names within edit distance', () => {
		// 'bob' vs 'tom' is distance 3; the tightened short-name budget also keeps
		// genuinely different short names apart.
		expect(reasonFor('Bob', 'Tom')).toBeUndefined();
		expect(reasonFor('Ann', 'Eve')).toBeUndefined();
	});

	it('returns nothing for unrelated names', () => {
		expect(findDuplicatePairs([person(1, 'Ada Lovelace'), person(2, 'Alan Turing')])).toHaveLength(
			0
		);
	});

	it('sorts strongest matches first', () => {
		const pairs = findDuplicatePairs([
			person(1, 'Jon Smith'), // typo vs #3 (rank 3)
			person(2, 'José García'),
			person(3, 'John Smith'),
			person(4, 'Jose Garcia') // accent match vs #2 (rank 1)
		]);
		expect(pairs[0].reason).toBe('Same name, different accents/case/spacing');
	});
});
