/**
 * Whether a submission from this role lands as a proposed addition. Only an
 * admin's writes count as already vetted; everyone else — a signed-in
 * contributor, an anonymous visitor on /contribute (no role at all), or any role
 * added later — lands with the `proposed_addition` flag until an admin vets it.
 *
 * An allow-list on purpose: the earlier `role === 'contributor'` deny-list let
 * any role it didn't name, including "no role", bypass review.
 *
 * Spread into an insert's `.values()` alongside the audit stamps, e.g.
 * `{ ...stampInsert(user.id), proposedAddition: isProposedAddition(user.role) }`.
 */
export const isProposedAddition = (role: string | null | undefined): boolean => role !== 'admin';
