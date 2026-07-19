/**
 * Near-duplicate person detection for the merge tool.
 *
 * `person.name` is UNIQUE, so real duplicates never share an exact name — they
 * differ by accent/case, word order, typos, or initials. This surfaces those
 * likely-same pairs so an admin can jump straight to a candidate to fold.
 *
 * Pure and dependency-free (roster is passed in), so it's cheap to unit-test.
 */

export type DuplicateCandidate = {
	id: number;
	name: string;
	artefactCount: number;
	eventCount: number;
};

export type DuplicatePair = {
	a: DuplicateCandidate;
	b: DuplicateCandidate;
	reason: string;
	/** Lower = higher confidence; used to sort the suggestions. */
	rank: number;
};

/** Most suggestions to return — keeps the section scannable on large rosters. */
export const MAX_DUPLICATE_PAIRS = 25;

/**
 * Fold a name to a comparable core: lowercase, strip accents, drop punctuation,
 * collapse whitespace. `José García` and `Jose  Garcia` both become `jose garcia`.
 */
export function normalizeName(name: string): string {
	return name
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

/** Standard Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	let curr = new Array<number>(b.length + 1);

	for (let i = 1; i <= a.length; i++) {
		curr[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[j] = Math.min(
				prev[j] + 1, // deletion
				curr[j - 1] + 1, // insertion
				prev[j - 1] + cost // substitution
			);
		}
		[prev, curr] = [curr, prev];
	}
	return prev[b.length];
}

/** Same words regardless of order: `Smith John` vs `John Smith`. */
function sameTokenMultiset(a: string[], b: string[]): boolean {
	if (a.length !== b.length || a.length === 0) return false;
	return [...a].sort().join(' ') === [...b].sort().join(' ');
}

/**
 * Every token of the shorter name lines up, in order, with the longer name's —
 * either equal or a single-letter token matching the other's first letter.
 * Matches `J. Smith` with `John Smith`; requires at least one real initial so
 * two full names don't slip through here (they'd already match earlier rules).
 */
function initialsMatch(a: string[], b: string[]): boolean {
	const [short, long] = a.length <= b.length ? [a, b] : [b, a];
	if (short.length === 0 || short.length !== long.length) return false;

	let sawInitial = false;
	for (let i = 0; i < short.length; i++) {
		const s = short[i];
		const l = long[i];
		if (s === l) continue;
		if (s.length === 1 && l.startsWith(s)) {
			sawInitial = true;
			continue;
		}
		if (l.length === 1 && s.startsWith(l)) {
			sawInitial = true;
			continue;
		}
		return false;
	}
	return sawInitial;
}

/** Classify a pair by the strongest matching rule, or null if unrelated. */
function classify(
	a: DuplicateCandidate,
	b: DuplicateCandidate
): { reason: string; rank: number } | null {
	const normA = normalizeName(a.name);
	const normB = normalizeName(b.name);
	if (!normA || !normB) return null;

	if (normA === normB) return { reason: 'Same name, different accents/case/spacing', rank: 1 };

	const tokensA = normA.split(' ');
	const tokensB = normB.split(' ');
	if (sameTokenMultiset(tokensA, tokensB))
		return { reason: 'Same words, different order', rank: 2 };

	// Small edit distance = likely typo. Tighten to a single edit for short names,
	// where a 2-char gap sweeps in genuinely different names.
	const distance = levenshtein(normA, normB);
	const shorter = Math.min(normA.length, normB.length);
	const typoBudget = shorter <= 5 ? 1 : 2;
	if (distance <= typoBudget) return { reason: 'Possible typo', rank: 3 };

	if (initialsMatch(tokensA, tokensB)) return { reason: 'Initials match', rank: 4 };

	return null;
}

/**
 * All likely-duplicate pairs in the roster, strongest first. O(n²) over the
 * roster — fine for the hundreds of people an archive holds. Capped at
 * MAX_DUPLICATE_PAIRS.
 */
export function findDuplicatePairs(people: DuplicateCandidate[]): DuplicatePair[] {
	const pairs: DuplicatePair[] = [];

	for (let i = 0; i < people.length; i++) {
		for (let j = i + 1; j < people.length; j++) {
			const match = classify(people[i], people[j]);
			if (match) pairs.push({ a: people[i], b: people[j], reason: match.reason, rank: match.rank });
		}
	}

	pairs.sort((x, y) => x.rank - y.rank || x.a.name.localeCompare(y.a.name));
	return pairs.slice(0, MAX_DUPLICATE_PAIRS);
}
