<script lang="ts">
	import ArtefactCreateForm from '#lib/components/ArtefactCreateForm.svelte';
	import BackButton from '#lib/components/BackButton.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>New artefact · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<!-- The create form is a fresh sheet of paper, like the artefact pages. -->
		<BackButton class="mb-6" />

		<section class="rounded-sm bg-white/95 p-6 shadow-xl ring-1 ring-black/5">
			<h1 class="text-2xl font-semibold tracking-tight text-gray-900">New artefact</h1>
			<ArtefactCreateForm
				{form}
				requireLocation
				explainProgramAreas
				locations={data.locations}
				people={data.people}
			/>
		</section>
	</div>
</main>
