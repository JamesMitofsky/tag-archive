import type { PageLoad } from './$types';

// Unlisted: reachable by link only. X-Robots-Tag on the HTML response (set during
// SSR — `setHeaders` is a no-op on client navigations, where no crawler is
// involved) backs up the <meta name="robots"> in the page head. The audio files
// get the same header from netlify.toml, since they are served straight off the
// CDN and never pass through this load.
//
// Deliberately NOT listed in robots.txt: a Disallow there would advertise the
// path to anyone reading the file, and would stop crawlers from fetching the page
// at all — so they would never see the noindex, and could still index the bare
// URL from an inbound link.
export const load: PageLoad = ({ setHeaders }) => {
	setHeaders({ 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
};
