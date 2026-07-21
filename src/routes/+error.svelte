<script lang="ts">
	import { page } from '$app/state';

	// 404 gets a friendlier line; any other error hides its raw message.
	let is404 = $derived(page.status === 404);
	let subtitle = $derived(
		is404 ? 'this page has drifted off...' : 'Something seems to have gone wrong... sorry about that!'
	);
</script>

<main class="relative flex min-h-screen items-center justify-center overflow-hidden p-4">

	<div class="relative z-10 max-w-md px-8 py-10 text-center text-gray-900">
		<p class="text-6xl font-medium tracking-tight text-gray-800 font-friendly">Whoops</p>
		<p class="mt-3 text-sm text-gray-600 font-friendly">{subtitle}</p>
		<a
			href="/"
			class="mt-16 inline-block rounded-lg border border-white/40 bg-white/25 px-4 py-2 text-lg italic text-gray-800 shadow-sm backdrop-blur-md transition-colors hover:bg-white/40"
		>
			Fly back to the Archive
		</a>
	</div>
</main>
