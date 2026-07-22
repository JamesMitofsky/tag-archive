<script lang="ts">
	let { data } = $props();
</script>

<div class="mx-auto max-w-2xl p-6">
	<h1 class="mb-1 text-xl font-semibold">Email previews</h1>
	<p class="mb-6 text-sm text-gray-600">Dev-only. Rendered server-side.</p>

	{#each data.previews as preview (preview.label)}
		<section class="mb-8">
			<h2 class="mb-1 text-sm font-medium text-gray-700">{preview.label}</h2>
			<p class="mb-2 text-sm text-gray-500">
				<span class="text-gray-400">Subject:</span>
				{preview.subject}
			</p>
			<!-- srcdoc isolates the email's own <html> doc from the app's styles. -->
			<iframe
				title={preview.label}
				srcdoc={preview.html}
				class="h-[560px] w-full rounded-md border border-gray-300 bg-white"
			></iframe>
		</section>
	{/each}
</div>
