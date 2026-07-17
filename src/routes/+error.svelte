<script lang="ts">
	import { page } from '$app/state';
	import Sky from '$lib/components/Sky.svelte';

	// 404 gets a friendlier line; any other status shows its own message.
	let is404 = $derived(page.status === 404);
	let message = $derived(is404 ? 'This page drifted off.' : (page.error?.message ?? 'Something went wrong.'));
</script>

<main class="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
	<Sky />

	<div
		class="relative z-10 max-w-md rounded-sm bg-white/95 px-8 py-10 text-center text-gray-900 shadow-xl ring-1 ring-black/5"
	>
		<p class="text-6xl font-medium tracking-tight text-gray-800">{page.status}</p>
		<p class="mt-3 text-sm text-gray-600">{message}</p>
		<a
			href="/"
			class="mt-6 inline-block rounded-lg border border-white/40 bg-white/25 px-4 py-2 text-sm text-gray-800 shadow-sm backdrop-blur-md transition-colors hover:bg-white/40"
		>
			Back to search
		</a>
	</div>
</main>
