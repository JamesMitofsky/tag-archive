import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { DC, skyFrame } from './engine';
import { SKY_PROPERTIES, skyHeadScript, skyHeadStyle } from './headScript';
import { SKY_PALETTE } from './palette';

/**
 * Run the inline head script the way a browser would — but in a fresh V8
 * context holding only stand-ins for the few DOM objects it touches. Nothing
 * from this module graph is reachable there, so this also proves `skyFrame`
 * and `paintSky` survive being stringified: any reference to an import or a
 * module-level binding would throw, and the script would silently paint
 * nothing.
 */
function runHeadScript(search: string) {
	const properties = new Map<string, string>();
	const classes = new Set<string>();
	let themeColor = '';
	const errors: unknown[] = [];
	const code = skyHeadScript
		.replace(/^<script>/, '')
		.replace(/<\/script>$/, '')
		// Surface errors the script would otherwise swallow.
		.replace('catch(e){}', 'catch(e){errors.push(e)}');
	runInNewContext(code, {
		errors,
		location: { search },
		URLSearchParams,
		document: {
			documentElement: {
				style: { setProperty: (k: string, v: string) => properties.set(k, v) },
				classList: {
					toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name))
				}
			},
			querySelector: () => ({ setAttribute: (_: string, v: string) => (themeColor = v) })
		}
	});
	return { properties, classes, themeColor, errors };
}

describe('skyHeadScript', () => {
	it('paints the frame for ?sky-at= in an isolated context, before any app code runs', () => {
		const at = '2026-06-21T20:45:00-04:00';
		const { properties, themeColor, errors } = runHeadScript(`?sky-at=${at}`);
		const expected = skyFrame(Date.parse(at), SKY_PALETTE, DC.lat, DC.lon);

		expect(errors).toEqual([]);
		expect(properties.get('--sky-0')).toBe(expected.hex[0]);
		expect(properties.get('--sky-2')).toBe(expected.hex[2]);
		expect(Number(properties.get('--sky-clouds'))).toBeCloseTo(expected.clouds);
		expect(themeColor).toBe(expected.hex[0]);
		expect(properties.get('--sky-2-0')).toBe(expected.glowHex[2][0]);
		expect(properties.get('--sky-x')).toBe(`${(expected.sun.x * 100).toFixed(2)}%`);
	});

	it('lights the stars only once the sky has any', () => {
		expect(runHeadScript('?sky-at=2026-06-22T01:00:00-04:00').classes.has('sky-starry')).toBe(true);
		expect(runHeadScript('?sky-at=2026-06-21T13:00:00-04:00').classes.has('sky-starry')).toBe(
			false
		);
	});

	it('falls back to the current time without a preview parameter', () => {
		const { properties, errors } = runHeadScript('');
		expect(errors).toEqual([]);
		expect(properties.get('--sky-0')).toMatch(/^#[0-9a-f]{6}$/);
	});

	it('cannot be broken out of by its own content', () => {
		// Only the final closing tag; nothing inside could end the script early.
		expect(skyHeadScript.match(/<\/script/gi)).toHaveLength(1);
	});
});

describe('skyHeadStyle', () => {
	it('registers every property the head script paints, and nothing else', () => {
		const { properties } = runHeadScript('');
		expect(SKY_PROPERTIES.map((p) => p.name).sort()).toEqual([...properties.keys()].sort());
		for (const { name } of SKY_PROPERTIES) expect(skyHeadStyle).toContain(`@property ${name}{`);
	});

	it('defaults to the midday sky', () => {
		const defaults = new Map(SKY_PROPERTIES.map((p) => [p.name, p.initial]));
		expect(defaults.get('--sky-0')).toBe('#94cae7');
		expect(defaults.get('--sky-1-8')).toBe(defaults.get('--sky-1'));
		expect(defaults.get('--sky-stars')).toBe('0');
	});
});
