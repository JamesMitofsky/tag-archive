/**
 * Lets a page move the sky's clouds with its own view, as parallax (see
 * ./clouds). The Sky, mounted once in the layout, hands itself in here; a
 * page that moves (the Archive Stream) tells it how its view moved every
 * frame, and lets go when it leaves, at which the clouds go back to drifting
 * on their own from wherever they stand.
 *
 * The page calls straight into the Sky, inside its own frame, so the clouds
 * are placed in the same frame as what moved them rather than a frame behind.
 */

import type { ViewMove } from './clouds.ts';

export type CloudDriver = {
	move(move: ViewMove): void;
	release(): void;
};

let driver: CloudDriver | null = null;

/** The Sky takes the clouds' steering. Returns its undoing. */
export function driveClouds(next: CloudDriver): () => void {
	driver = next;
	return () => {
		if (driver === next) driver = null;
	};
}

/** The view moved: the clouds follow, by their share. Nothing, with no sky to move. */
export function steerClouds(move: ViewMove): void {
	driver?.move(move);
}

/** The view is gone: the clouds drift on their own again. */
export function releaseClouds(): void {
	driver?.release();
}
