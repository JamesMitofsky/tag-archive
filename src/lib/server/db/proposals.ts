/**
 * Whether a submission from this role lands as a proposed addition. A
 * contributor's writes are unvetted, so their rows carry the `proposed_addition`
 * flag until a keeper vets them; admins (and any non-contributor role) submit
 * already-vetted. Named distinctly from any existing "needs review" concept.
 *
 * Spread into an insert's `.values()` alongside `stampInsert`, e.g.
 * `{ ...stampInsert(user.id), proposedAddition: isProposedAddition(user.role) }`.
 */
export const isProposedAddition = (role: string | null | undefined): boolean =>
	role === 'contributor';
