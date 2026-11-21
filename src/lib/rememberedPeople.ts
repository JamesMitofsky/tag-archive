/**
 * Names this tab has put on a submitted artefact's provenance, so they come
 * back as suggestions on the next one.
 *
 * The suggestions otherwise come from the public dataset, which only lists
 * people on vetted rows: a name on a proposed addition (anything a contributor
 * or the public submits) stays out of it until an admin approves the row, so
 * whoever just typed it in would never see it offered again. Keepers are given
 * every name by their page's load instead; this covers the public form, whose
 * visitor may only see their own unvetted names, and only here.
 *
 * Session storage, like the form's draft: it lasts through a reload ("Submit
 * another" on /contribute is one) but ends with the tab, so nothing lingers on
 * a shared phone.
 */
const KEY = 'remembered-people';

export function rememberedPeople(): string[] {
	try {
		const raw = sessionStorage.getItem(KEY);
		const names: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : [];
	} catch {
		// Storage blocked (private mode), or not JSON.
		return [];
	}
}

export function rememberPeople(names: string[]): void {
	const fresh = names.map((name) => name.trim()).filter(Boolean);
	if (fresh.length === 0) return;
	try {
		const all = [...new Set([...rememberedPeople(), ...fresh])];
		sessionStorage.setItem(KEY, JSON.stringify(all));
	} catch {
		// Blocked or full: the names just aren't offered again.
	}
}
