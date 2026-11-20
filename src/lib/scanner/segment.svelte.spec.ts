import { expect, it } from 'vitest';
import { segmentCorners } from './segment';

/**
 * The real model, in a real browser, on a scene the edge detector gets wrong:
 * a dark page on a desk, with a brighter, sharper-edged rectangle (a screen)
 * behind it. Slow for a unit test (it loads the runtime and the model), which
 * is why this is the only one that runs them.
 */
it('finds the page, not the strongest edges in the photo', async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 900;
	canvas.height = 1200;
	const ctx = canvas.getContext('2d')!;
	// Desk.
	ctx.fillStyle = '#6f7480';
	ctx.fillRect(0, 0, 900, 1200);
	// A lit screen across the top of the frame.
	ctx.fillStyle = '#e9e4ee';
	ctx.fillRect(330, 0, 570, 150);
	// The page, slightly turned.
	const page = [
		{ x: 200, y: 260 },
		{ x: 700, y: 290 },
		{ x: 680, y: 1010 },
		{ x: 170, y: 990 }
	];
	ctx.fillStyle = '#23262b';
	ctx.beginPath();
	for (const p of page) ctx.lineTo(p.x, p.y);
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = '#d8d8d8';
	ctx.font = 'bold 72px sans-serif';
	ctx.fillText('FIELD', 300, 480);

	const result = await segmentCorners(canvas);

	expect(result.status).toBe('found');
	if (result.status !== 'found') return;
	const { topLeft, topRight, bottomRight, bottomLeft } = result.corners;
	[topLeft, topRight, bottomRight, bottomLeft].forEach((p, i) => {
		// The mask is 320px across, so one of its pixels is ~4px here.
		expect(Math.hypot(p.x - page[i].x, p.y - page[i].y)).toBeLessThan(20);
	});
}, 60_000);
