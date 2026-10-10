<script lang="ts">
	import { DC, skyFrame } from '$lib/sky/engine';
	import { SKY_PALETTE } from '$lib/sky/palette';
	import { nextRepaintDelay } from '$lib/sky/schedule';

	// Dev-only: today's sky over DC as a strip of 10-minute columns, the
	// scheduler's repaint cadence underneath, and links that preview any moment
	// on the real site via `?sky-at=` (or a whole day via `?sky-speed=`).
	const frameAt = (ms: number) => skyFrame(ms, SKY_PALETTE, DC.lat, DC.lon);
	const MINUTE = 60_000;

	// Local midnight in DC, whatever the viewer's own timezone.
	const dcDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format();
	const midnight = (() => {
		const guess = Date.parse(`${dcDay}T00:00:00Z`);
		const hourThere = Number(
			new Intl.DateTimeFormat('en-US', {
				timeZone: 'America/New_York',
				hour: 'numeric',
				hourCycle: 'h23'
			}).format(guess)
		);
		return guess - (hourThere === 0 ? 0 : (hourThere - 24) * 60 * MINUTE);
	})();

	const columns = Array.from({ length: 144 }, (_, i) => {
		const at = midnight + i * 10 * MINUTE;
		return { at, frame: frameAt(at), delay: nextRepaintDelay(at, frameAt) };
	});

	const time = (ms: number) =>
		new Date(ms).toLocaleTimeString('en-US', {
			timeZone: 'America/New_York',
			hour: 'numeric',
			minute: '2-digit'
		});

	// Moments worth previewing: where the sun crosses these elevations today.
	const marks: [string, number][] = [
		['Dawn (−6°)', -6],
		['Sunrise', -0.833],
		['Golden hour (+6°)', 6]
	];
	const crossings = marks.flatMap(([label, elevation]) => {
		const found: { label: string; at: number }[] = [];
		for (let m = 0; m < 24 * 60; m++) {
			const a = frameAt(midnight + m * MINUTE).elevation;
			const b = frameAt(midnight + (m + 1) * MINUTE).elevation;
			if (a < elevation !== b < elevation) {
				const rising = b > a;
				found.push({
					label: rising ? label : label.replace('Dawn', 'Dusk').replace('Sunrise', 'Sunset'),
					at: midnight + m * MINUTE
				});
			}
		}
		return found;
	});
	const moments = [...crossings].sort((a, b) => a.at - b.at);
	const preview = (at: number) => `/?sky-at=${encodeURIComponent(new Date(at).toISOString())}`;
</script>

<main class="mx-auto max-w-5xl bg-white/90 p-6 pt-24 text-sm text-gray-800">
	<h1 class="text-xl font-semibold">Sky over Washington, DC — {dcDay}</h1>
	<p class="mt-1 text-gray-600">
		Columns are 10 minutes apart. The bar under each shows how long the live sky sleeps before its
		next repaint there (taller = longer).
	</p>

	<div class="mt-4 flex h-40 overflow-hidden rounded">
		{#each columns as column (column.at)}
			<a
				href={preview(column.at)}
				title="{time(column.at)} · {column.frame.elevation.toFixed(1)}°"
				class="flex-1"
				style="background: linear-gradient({column.frame.hex[0]}, {column.frame.hex[1]}, {column
					.frame.hex[2]})"
			></a>
		{/each}
	</div>
	<div class="flex h-10 items-end">
		{#each columns as column (column.at)}
			<div class="flex-1 bg-gray-400" style="height: {(column.delay / 900_000) * 100}%"></div>
		{/each}
	</div>

	<h2 class="mt-6 font-semibold">Preview on the site</h2>
	<ul class="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
		{#each moments as moment (moment.at)}
			<li>
				<a class="underline" href={preview(moment.at)}>{moment.label} · {time(moment.at)}</a>
			</li>
		{/each}
		<li>
			<a class="underline" href={preview(midnight + 13 * 60 * MINUTE)}>Midday · 1:00 PM</a>
		</li>
		<li>
			<a class="underline" href={preview(midnight + 23 * 60 * MINUTE)}>Night · 11:00 PM</a>
		</li>
		<li>
			<a
				class="underline"
				href="/?sky-at={encodeURIComponent(new Date(midnight).toISOString())}&sky-speed=600"
			>
				Time-lapse: today in 2.4 minutes
			</a>
		</li>
	</ul>
</main>
