import { labToHex } from './color';
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
 * does nothing, and the registered defaults (`skyHeadStyle`) — the midday
 * sky — stand.
 */
const body = [
	'var t=Date.now(),q=new URLSearchParams(location.search).get("sky-at");',
	'if(q&&!isNaN(Date.parse(q)))t=Date.parse(q);',
	`(${paintSky})((${skyFrame})(t,${JSON.stringify(SKY_PALETTE)},${DC.lat},${DC.lon}),document.documentElement);`
].join('');

export const skyHeadScript = `<script>(function(){try{${body}}catch(e){}})()</` + 'script>';

/** The midday sky: the palette's highest keyframe, where the sky holds. */
const midday = labToHex(SKY_PALETTE.colours.at(-1)!);

/** Every custom property `paintSky` writes, registered with its type and the
    midday sky as its default. Registration is what lets the occasional
    catch-up (a tab coming back after hours away) transition them — a gradient
    can't be transitioned itself, and an unregistered property can only flip;
    routine steps are too small to see and don't. The defaults are what shows
    before the head script runs, or without JS. */
export const SKY_PROPERTIES: { name: string; syntax: string; initial: string }[] = [
	...[0, 1, 2].map((k) => ({ name: `--sky-${k}`, syntax: '<color>', initial: midday })),
	...Array.from({ length: SKY_PALETTE.glow.stops }, (_, i) => ({
		name: `--sky-glow-${i}`,
		syntax: '<color>',
		initial: midday
	})),
	{ name: '--sky-x', syntax: '<length-percentage>', initial: '50%' },
	{ name: '--sky-y', syntax: '<length-percentage>', initial: '0%' },
	{ name: '--sky-reach', syntax: '<length-percentage>', initial: '111.8%' },
	{ name: '--sky-clouds', syntax: '<number>', initial: '1' },
	{ name: '--sky-stars', syntax: '<number>', initial: '0' }
];

const css = [
	...SKY_PROPERTIES.map(
		({ name, syntax, initial }) =>
			`@property ${name}{syntax:'${syntax}';inherits:true;initial-value:${initial}}`
	),
	`:root.sky-catch-up{transition-property:${SKY_PROPERTIES.map((p) => p.name).join(',')};` +
		'transition-duration:1.2s;transition-timing-function:var(--ease-in-out-sine)}'
].join('');

/** The registrations above, and the catch-up transition over all of them, as
    a <style> for the document head. */
export const skyHeadStyle = `<style>${css}</style>`;
