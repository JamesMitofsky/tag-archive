export interface ParentRouteInfo {
	href: string;
	label: string;
}

interface RouteDefinition {
	title: string;
	parent: string;
}

const STATIC_ROUTES: Record<string, RouteDefinition> = {
	'/': { title: 'Home', parent: '/' },
	'/events': { title: 'Events', parent: '/' },
	'/keeper': { title: 'Cloud Keeper', parent: '/' },
	'/keeper/artefacts': { title: 'Artefacts', parent: '/keeper' },
	'/keeper/artefacts/add': { title: 'Artefacts', parent: '/keeper/artefacts' },
	'/keeper/events': { title: 'Events', parent: '/keeper' },
	'/keeper/events/add': { title: 'Events', parent: '/keeper/events' },
	'/keeper/series': { title: 'Series', parent: '/keeper' },
	'/keeper/series/add': { title: 'Series', parent: '/keeper/series' },
	'/keeper/settings': { title: 'Settings', parent: '/keeper' },
	'/keeper/settings/create-user': { title: 'Settings', parent: '/keeper/settings' },
	'/keeper/settings/review': { title: 'Review Queue', parent: '/keeper/settings' },
	'/keeper/settings/review/artefacts': { title: 'Review Queue', parent: '/keeper/settings/review' },
	'/keeper/settings/review/events': { title: 'Review Queue', parent: '/keeper/settings/review' },
	'/keeper/settings/review/series': { title: 'Review Queue', parent: '/keeper/settings/review' },
	'/keeper/contributors': { title: 'Contributors', parent: '/keeper/settings' },
	'/keeper/contributors/merge': { title: 'Merge Contributors', parent: '/keeper/contributors' },
	'/keeper/contributors/merge/review': {
		title: 'Merge Contributors',
		parent: '/keeper/contributors/merge'
	}
};

const DYNAMIC_ROUTE_PATTERNS: Array<{
	pattern: RegExp;
	title: string;
	getParent: (match: RegExpMatchArray) => ParentRouteInfo;
}> = [
	{
		// /keeper/series/[id]
		pattern: /^\/keeper\/series\/([^/]+)$/,
		title: 'Series',
		getParent: () => ({ href: '/keeper/series', label: 'Series' })
	},
	{
		// /keeper/events/[id]/edit
		pattern: /^\/keeper\/events\/([^/]+)\/edit$/,
		title: 'Edit Event',
		getParent: (m) => ({ href: `/keeper/events/${m[1]}`, label: 'Event' })
	},
	{
		// /keeper/events/[id]
		pattern: /^\/keeper\/events\/([^/]+)$/,
		title: 'Event',
		getParent: () => ({ href: '/keeper/events', label: 'Events' })
	},
	{
		// /keeper/contributors/[id]
		pattern: /^\/keeper\/contributors\/([^/]+)$/,
		title: 'Contributor',
		getParent: () => ({ href: '/keeper/contributors', label: 'Contributors' })
	},
	{
		// /keeper/artefacts/[id]/edit
		pattern: /^\/keeper\/artefacts\/([^/]+)\/edit$/,
		title: 'Edit Artefact',
		getParent: (m) => ({ href: `/keeper/artefacts/${m[1]}`, label: 'Artefact' })
	},
	{
		// /keeper/artefacts/[id]
		pattern: /^\/keeper\/artefacts\/([^/]+)$/,
		title: 'Artefact',
		getParent: () => ({ href: '/keeper/artefacts', label: 'Artefacts' })
	}
];

export function getRouteTitle(href: string): string | null {
	const cleanPath = href.replace(/\/$/, '') || '/';
	if (STATIC_ROUTES[cleanPath]) {
		return STATIC_ROUTES[cleanPath].title;
	}
	for (const dyn of DYNAMIC_ROUTE_PATTERNS) {
		if (dyn.pattern.test(cleanPath)) {
			return dyn.title;
		}
	}
	return null;
}

export function getBreadcrumbs(currentPathname: string, explicitHref?: string): ParentRouteInfo[] {
	const crumbs: ParentRouteInfo[] = [];
	const seen = new Set<string>();

	let node = getParentRoute(currentPathname, explicitHref);
	// Exclude the Home root ('/') — trail starts at the first named section.
	while (!seen.has(node.href) && node.href !== '/') {
		crumbs.push(node);
		seen.add(node.href);
		node = getParentRoute(node.href);
	}

	return crumbs.reverse();
}

export function getParentRoute(currentPathname: string, explicitHref?: string): ParentRouteInfo {
	if (explicitHref) {
		const cleanHref = explicitHref.replace(/\/$/, '') || '/';
		const label = getRouteTitle(cleanHref) ?? 'Back';
		return { href: explicitHref, label };
	}

	const cleanPath = currentPathname.replace(/\/$/, '') || '/';

	// 1. Check exact static routes first
	if (STATIC_ROUTES[cleanPath]) {
		const parentHref = STATIC_ROUTES[cleanPath].parent;
		const label = STATIC_ROUTES[parentHref]?.title ?? 'Back';
		return { href: parentHref, label };
	}

	// 2. Check dynamic patterns
	for (const dyn of DYNAMIC_ROUTE_PATTERNS) {
		const match = cleanPath.match(dyn.pattern);
		if (match) {
			return dyn.getParent(match);
		}
	}

	// 3. Fallback: segment truncation
	const segments = cleanPath.split('/').filter(Boolean);
	if (segments.length > 1) {
		segments.pop();
		const parentHref = '/' + segments.join('/');
		const label = getRouteTitle(parentHref) ?? 'Back';
		return { href: parentHref, label };
	}

	return { href: '/', label: 'Home' };
}
