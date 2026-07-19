import { describe, it, expect } from 'vitest';
import {
	findDuplicateGroups,
	levenshtein,
	normalizeName,
	type DuplicateCandidate
} from './duplicates';

const person = (
	id: number,
	name: string,
	artefactCount = 0,
	eventCount = 0
): DuplicateCandidate => ({ id, name, artefactCount, eventCount });

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

describe('findDuplicateGroups', () => {
	function reasonFor(a: string, b: string): string | undefined {
		return findDuplicateGroups([person(1, a), person(2, b)])[0]?.reason;
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
		expect(reasonFor('Bob', 'Tom')).toBeUndefined();
		expect(reasonFor('Ann', 'Eve')).toBeUndefined();
	});

	it('returns nothing for unrelated names', () => {
		expect(findDuplicateGroups([person(1, 'Ada Lovelace'), person(2, 'Alan Turing')])).toHaveLength(
			0
		);
	});

	it('chains transitive matches into one group of more than two', () => {
		const groups = findDuplicateGroups([
			person(1, 'Jon Smith'), // typo of #2
			person(2, 'John Smith'),
			person(3, 'J. Smith') // initials of #2
		]);
		expect(groups).toHaveLength(1);
		expect(groups[0].members.map((m) => m.id).sort()).toEqual([1, 2, 3]);
	});

	it('labels a group with its strongest edge and orders members richest-first', () => {
		const groups = findDuplicateGroups([
			person(1, 'Jon Smith', 0, 1), // typo (rank 3) of #2, 1 link
			person(2, 'John Smith', 5, 2), // 7 links — richest
			person(3, 'Jhon Smith', 0, 0) // typo, 0 links
		]);
		expect(groups[0].reason).toBe('Possible typo');
		// Richest record first so it's the default primary on the review page.
		expect(groups[0].members[0].id).toBe(2);
	});

	it('sorts strongest groups first', () => {
		const groups = findDuplicateGroups([
			person(1, 'Jon Smith'), // typo pair with #3 (rank 3)
			person(2, 'José García'),
			person(3, 'John Smith'),
			person(4, 'Jose Garcia') // accent match with #2 (rank 1)
		]);
		expect(groups[0].reason).toBe('Same name, different accents/case/spacing');
	});
});
