import { DC, paintSky, skyFrame } from './engine';
import { SKY_PALETTE } from './palette';

/**
 * The inline <head> script that paints the sky before the page first renders,
 * so a night visit never flashes the daytime blue first. It runs the very same
 * `skyFrame` / `paintSky` the live updates use — stringified, which is why
 * those two must stay self-contained (see ./engine). Computing it in the
 * browser rather than on the server keeps it right even if a page is ever
 * served from a cache or restored from the back/forward cache.
 *
 * Honours `?sky-at=` like the live clock (see ./schedule). On any error it
 * does nothing, and the CSS defaults — the midday sky — stand.
 */
const body = [
	'var t=Date.now(),q=new URLSearchParams(location.search).get("sky-at");',
	'if(q&&!isNaN(Date.parse(q)))t=Date.parse(q);',
	`(${paintSky})((${skyFrame})(t,${JSON.stringify(SKY_PALETTE)},${DC.lat},${DC.lon}),document.documentElement);`
].join('');

export const skyHeadScript = `<script>(function(){try{${body}}catch(e){}})()</` + 'script>';
