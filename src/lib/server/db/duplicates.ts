/**
 * Near-duplicate person detection for the merge tool.
 *
 * `person.name` is UNIQUE, so real duplicates never share an exact name — they
 * differ by accent/case, word order, typos, or initials. This surfaces those
 * likely-same entries so an admin can review a proposed group and fold the real
 * matches together.
 *
 * Matches are grouped transitively: if A~B and B~C, all three are proposed as
 * one group. That over-includes on purpose — the review step lets the admin drop
 * any member that isn't actually the same person.
 *
 * Pure and dependency-free (roster is passed in), so it's cheap to unit-test.
 */

export type DuplicateCandidate = {
	id: number;
	name: string;
	artefactCount: number;
	eventCount: number;
};

export type DuplicateGroup = {
	/** Everyone in the group, richest record (most links) first. */
	members: DuplicateCandidate[];
	/** Strongest match reason found within the group. */
	reason: string;
	/** Lower = higher confidence; used to sort the suggestions. */
	rank: number;
};

/** Most groups to return — keeps the section scannable on large rosters. */
export const MAX_DUPLICATE_GROUPS = 25;

/**
 * Fold a name to a comparable core: lowercase, strip accents, drop punctuation,
 * collapse whitespace. `José García` and `Jose  Garcia` both become `jose garcia`.
 */
export function normalizeName(name: string): string {
	return name
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
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
export function classifyPair(
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
 * All likely-duplicate groups in the roster, strongest first. Builds a match
 * graph (O(n²) over the roster — fine for the hundreds of people an archive
 * holds), then returns each connected component of size ≥ 2. Capped at
 * MAX_DUPLICATE_GROUPS.
 */
export function findDuplicateGroups(people: DuplicateCandidate[]): DuplicateGroup[] {
	const n = people.length;

	// Union-find over roster indices; matching pairs get merged into one set.
	const parent = Array.from({ length: n }, (_, i) => i);
	const find = (x: number): number => {
		while (parent[x] !== x) {
			parent[x] = parent[parent[x]]; // path halving
			x = parent[x];
		}
		return x;
	};
	const union = (a: number, b: number) => {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent[ra] = rb;
	};

	const edges: { i: number; reason: string; rank: number }[] = [];
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const match = classifyPair(people[i], people[j]);
			if (match) {
				union(i, j);
				edges.push({ i, reason: match.reason, rank: match.rank });
			}
		}
	}

	// Strongest (lowest-rank) edge per component labels the whole group.
	const best = new Map<number, { reason: string; rank: number }>();
	for (const edge of edges) {
		const root = find(edge.i);
		const current = best.get(root);
		if (!current || edge.rank < current.rank)
			best.set(root, { reason: edge.reason, rank: edge.rank });
	}

	// Gather members per component (only roots that got an edge have a group).
	const membersByRoot = new Map<number, DuplicateCandidate[]>();
	for (let i = 0; i < n; i++) {
		const root = find(i);
		if (!best.has(root)) continue;
		const list = membersByRoot.get(root) ?? [];
		list.push(people[i]);
		membersByRoot.set(root, list);
	}

	const links = (p: DuplicateCandidate) => p.artefactCount + p.eventCount;
	const groups: DuplicateGroup[] = [];
	for (const [root, members] of membersByRoot) {
		if (members.length < 2) continue;
		members.sort((a, b) => links(b) - links(a) || a.name.localeCompare(b.name));
		const label = best.get(root)!;
		groups.push({ members, reason: label.reason, rank: label.rank });
	}

	groups.sort((x, y) => x.rank - y.rank || x.members[0].name.localeCompare(y.members[0].name));
	return groups.slice(0, MAX_DUPLICATE_GROUPS);
}
