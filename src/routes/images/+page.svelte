<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { PublicImage, PublicImageSet } from '#lib/images/types.ts';
	import { imageSetLabel, withoutTitleLine } from '#lib/images/label.ts';
	import { formatPartialDate } from '#lib/partialDate.ts';
	import { loadImageSets } from '#lib/dataset.ts';
	import { filterImageSets } from '#lib/search.ts';
	import CardCloud from '#lib/components/CardCloud.svelte';
	import ImageStack, { PRINT_SIZES } from '#lib/components/ImageStack.svelte';
	import Photograph from '#lib/components/Photograph.svelte';
	import Drawing from '#lib/components/Drawing.svelte';

	/** The query parameter naming the open set, so a set can be linked to. */
	const SET_PARAM = 'set';

	/** One photograph as it floats in its open set, carrying its own alt text. */
	type SetPhoto = PublicImage & { alt: string };

	/**
	 * The open set, read off the address. Opening one is a shallow navigation to
	 * `?set=ID` (`goto` with `shallow`), so back puts it away again and the
	 * address can be shared. `page.url` keeps the address the page was loaded
	 * at, and `page.shallow` carries the shallow entry's own; a shared link or a
	 * reload arrives with no shallow entry, but with the set in `page.url`.
	 */
	const openSet = $derived.by(() => {
		const raw = (page.shallow?.url ?? page.url).searchParams.get(SET_PARAM);
		const id = raw === null ? NaN : Number(raw);
		return Number.isSafeInteger(id) ? id : null;
	});

	function changeSet(id: number | null) {
		const url = new URL(location.href);
		if (id !== null) {
			url.searchParams.set(SET_PARAM, String(id));
			void goto(url, { shallow: true, state: { ...page.state, imageSet: id } });
		} else if (page.state.imageSet === openSet) {
			// This entry was pushed by opening the set, so the one under it is the
			// cloud of sets: step back onto it, as the browser's own back would.
			history.back();
		} else {
			// Opened from a link or a reload: nothing of ours underneath to step back
			// to, so put it away where it stands.
			url.searchParams.delete(SET_PARAM);
			void goto(url, { shallow: true, replace: true, state: {} });
		}
	}

	/**
	 * Sets the reader has reached for (pointer over, or focus), whose
	 * photographs are fetched ahead of opening. Opening spills every photograph
	 * out from under the set's top print, and one still loading would slide out
	 * as a blank and fade in. The pile only ever draws its first three, so for a
	 * larger set the rest would otherwise first be asked for at that moment.
	 * Kept for the life of the page, so the browser keeps them to hand.
	 */
	let warmed = $state<PublicImageSet[]>([]);
	function warm(set: PublicImageSet) {
		if (!warmed.some((s) => s.id === set.id)) warmed.push(set);
	}

	function photos(set: PublicImageSet): SetPhoto[] {
		const label = imageSetLabel(set);
		const n = set.images.length;
		return set.images.map((image, i) => ({
			...image,
			alt: n === 1 ? label : `${label}, photograph ${i + 1} of ${n}`
		}));
	}
</script>

<CardCloud
	load={loadImageSets}
	filter={filterImageSets}
	dateOf={(set) => set.date}
	ariaLabel="Search images"
	card={stack}
	{placeholderMark}
	packet={{
		open: openSet,
		onchange: changeSet,
		contents: photos,
		card: photo,
		heading,
		openRatio: (image) => image.height / image.width,
		closeLabel: 'Back to all images',
		warm
	}}
/>

<!-- The warmed sets' photographs, fetched off-screen through the same
     component and `sizes` as a loose print in an open set, so the browser picks
     the very same file for both. -->
<div class="pointer-events-none fixed top-0 -left-[9999px] w-12" aria-hidden="true">
	{#each warmed as set (set.id)}
		{#each set.images as image (image.id)}
			<Photograph
				src={image.url}
				width={image.width}
				height={image.height}
				alt=""
				sizes={PRINT_SIZES}
				loading="eager"
			/>
		{/each}
	{/each}
</div>

{#snippet placeholderMark()}
	<!-- h-8, a step taller than the others: the tall capital leaves the lowercase
	     a smaller share of the drawing, and h-8 brings it level with theirs. -->
	<Drawing
		src="/drawing/text/images.webp"
		alt=""
		aria-hidden="true"
		width="429"
		height="226"
		class="h-8 w-auto"
	/>
{/snippet}

<!-- No sheet of paper here, unlike the other clouds: a set is its photographs.
     Closed, it floats as a pile of prints; opened, the pile spills across the
     sky and every photograph floats on its own. While it is spilled (`spilled`)
     the pile's own card stays where it was, as its first photograph alone: the
     rest of the pile is out as cards of their own, and slides back under it
     when the set is put away. -->
{#snippet stack(item: PublicImageSet, _isOpen: boolean, spilled: boolean)}
	<!-- Spilled, it is one of the open set's prints, and takes clicks only on
	     the print like the rest of them (`hit`). -->
	<ImageStack
		images={spilled ? item.images.slice(0, 1) : item.images}
		alt={spilled ? photos(item)[0].alt : imageSetLabel(item)}
		hit={spilled}
	/>
{/snippet}

<!-- One photograph of the open set: a lone print, and opened, the print alone
     at the size of the box, which the cloud gives the photograph's own shape. -->
{#snippet photo(image: SetPhoto, isOpen: boolean)}
	{#if isOpen}
		<!-- Fitted on both axes rather than stretched to the box: while the box
		     grows from a sheet into the photograph's shape it is neither. -->
		<div class="[container-type:size] grid h-full w-full place-items-center">
			<Photograph
				src={image.url}
				width={image.width}
				height={image.height}
				alt={image.alt}
				sizes="90vw"
				placeholder={image.placeholder}
				loading="eager"
				class="w-[min(100cqw,100cqh*var(--photo-ratio))] rounded-[2px] shadow-2xl"
			/>
		</div>
	{:else}
		<!-- Only the print takes the click: beside it is sky, which puts the set away. -->
		<ImageStack images={[image]} alt={image.alt} hit />
	{/if}
{/snippet}

<!-- The plate naming the open set, where the searchbar was. -->
{#snippet heading(set: PublicImageSet)}
	{@const label = imageSetLabel(set)}
	{@const caption = withoutTitleLine(set.description, label)}
	{@const count = set.images.length}
	<p class="text-sm leading-snug font-medium">{label}</p>
	<p class="mt-0.5 text-xs text-gray-700">
		{[
			set.date && formatPartialDate(set.date),
			count === 1 ? '1 photograph' : `${count} photographs`
		]
			.filter(Boolean)
			.join(' · ')}
	</p>
	{#if caption}
		<p class="mt-1 line-clamp-3 text-xs leading-relaxed whitespace-pre-line text-gray-700">
			{caption}
		</p>
	{/if}
{/snippet}
