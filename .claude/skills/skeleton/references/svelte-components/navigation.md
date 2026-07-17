# Navigation

Navigation patterns for apps (bar, rail, sidebar, toggle).

## Bar

```svelte
<script lang="ts">
	import BikeIcon from '@lucide/svelte/icons/bike';
	import BookIcon from '@lucide/svelte/icons/book';
	import HouseIcon from '@lucide/svelte/icons/house';
	import TreePalmIcon from '@lucide/svelte/icons/tree-palm';
	import { Navigation } from '@skeletonlabs/skeleton-svelte';

	const links = [
		{ label: 'Home', href: '/#', icon: HouseIcon },
		{ label: 'Entertainment', href: '/#', icon: BookIcon },
		{ label: 'Recreation', href: '/#', icon: BikeIcon },
		{ label: 'Relaxation', href: '/#', icon: TreePalmIcon },
	];
</script>

<div class="w-[375px] h-[200px] grid grid-rows-[1fr_auto] border border-surface-200-800">
	<div class="flex justify-center items-center">
		<p class="opacity-60">...</p>
	</div>
	<!-- --- -->
	<Navigation layout="bar">
		<Navigation.Menu class="grid grid-cols-4 gap-2">
			{#each links as link (link)}
				{@const Icon = link.icon}
				<Navigation.TriggerAnchor href={link.href}>
					<Icon class="size-5" />
					<Navigation.TriggerText>{link.label}</Navigation.TriggerText>
				</Navigation.TriggerAnchor>
			{/each}
		</Navigation.Menu>
	</Navigation>
	<!-- --- -->
</div>

```

* Recommended for small sized screens (ex: mobile).
* Ideal for vertical screen layouts.
* Should be fixed to the bottom of the viewport.
* Supports 3-5 tiles based on contents and viewport width.
* Consider progressive enhancement with the [Virtual Keyboard API](https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API).

## Rail

```svelte
<script lang="ts">
	import BikeIcon from '@lucide/svelte/icons/bike';
	import BookIcon from '@lucide/svelte/icons/book';
	import HouseIcon from '@lucide/svelte/icons/house';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import SkullIcon from '@lucide/svelte/icons/skull';
	import TreePalmIcon from '@lucide/svelte/icons/tree-palm';
	import { Navigation } from '@skeletonlabs/skeleton-svelte';

	const links = [
		{ label: 'Home', href: '/#', icon: HouseIcon },
		{ label: 'Entertainment', href: '/#', icon: BookIcon },
		{ label: 'Recreation', href: '/#', icon: BikeIcon },
		{ label: 'Relaxation', href: '/#', icon: TreePalmIcon },
	];
</script>

<div class="w-full h-[640px] grid grid-cols-[auto_1fr] border border-surface-200-800">
	<!-- --- -->
	<Navigation layout="rail">
		<Navigation.Header>
			<Navigation.TriggerAnchor href="/#" title="View Homepage" aria-label="View Homepage">
				<SkullIcon class="size-8" />
			</Navigation.TriggerAnchor>
		</Navigation.Header>
		<Navigation.Content>
			<Navigation.Menu>
				{#each links as link (link)}
					{@const Icon = link.icon}
					<Navigation.TriggerAnchor href={link.href}>
						<Icon class="size-5" />
						<Navigation.TriggerText>{link.label}</Navigation.TriggerText>
					</Navigation.TriggerAnchor>
				{/each}
			</Navigation.Menu>
		</Navigation.Content>
		<Navigation.Footer>
			<Navigation.TriggerAnchor href="/#" title="Settings" aria-label="Settings">
				<SettingsIcon class="size-5" />
			</Navigation.TriggerAnchor>
		</Navigation.Footer>
	</Navigation>
	<!-- --- -->
	<div class="flex justify-center items-center">
		<p class="opacity-50">Contents</p>
	</div>
</div>

```

* Recommended for medium sized screens (ex: tablet).
* Ideal for horizontal screen layouts.
* Should be fixed to the left or right of the viewport.
* Supports 3-7 tiles based on contents and viewport height.

## Sidebar

```svelte
<script lang="ts">
	import BedDoubleIcon from '@lucide/svelte/icons/bed-double';
	import BikeIcon from '@lucide/svelte/icons/bike';
	import BookIcon from '@lucide/svelte/icons/book';
	import BubblesIcon from '@lucide/svelte/icons/bubbles';
	import HouseIcon from '@lucide/svelte/icons/house';
	import MountainIcon from '@lucide/svelte/icons/mountain';
	import PopcornIcon from '@lucide/svelte/icons/popcorn';
	import SailboatIcon from '@lucide/svelte/icons/sailboat';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import SkullIcon from '@lucide/svelte/icons/skull';
	import TreePalmIcon from '@lucide/svelte/icons/tree-palm';
	import TvIcon from '@lucide/svelte/icons/tv';
	import { Navigation } from '@skeletonlabs/skeleton-svelte';

	const linksSidebar = {
		entertainment: [
			{ label: 'Books', href: '/#', icon: BookIcon },
			{ label: 'Movies', href: '/#', icon: PopcornIcon },
			{ label: 'Television', href: '/#', icon: TvIcon },
		],
		recreation: [
			{ label: 'Biking', href: '/#', icon: BikeIcon },
			{ label: 'Sailing', href: '/#', icon: SailboatIcon },
			{ label: 'Hiking', href: '/#', icon: MountainIcon },
		],
		relaxation: [
			{ label: 'Lounge', href: '/#', icon: TreePalmIcon },
			{ label: 'Spa', href: '/#', icon: BubblesIcon },
			{ label: 'Sleep', href: '/#', icon: BedDoubleIcon },
		],
	};
</script>

<div class="w-full h-[728px] grid grid-cols-[auto_1fr] items-stretch border border-surface-200-800">
	<!-- --- -->
	<Navigation layout="sidebar" class="grid grid-rows-[auto_1fr_auto] gap-4">
		<Navigation.Header>
			<a href="https://www.skeleton.dev" class="btn-icon btn-icon-lg preset-filled-primary-500">
				<SkullIcon class="size-6" />
			</a>
		</Navigation.Header>
		<Navigation.Content>
			<Navigation.Group>
				<Navigation.Menu>
					<Navigation.TriggerAnchor href="/">
						<HouseIcon class="size-4" />
						<Navigation.TriggerText>Home</Navigation.TriggerText>
					</Navigation.TriggerAnchor>
				</Navigation.Menu>
			</Navigation.Group>
			{#each Object.entries(linksSidebar) as [category, links]}
				<Navigation.Group>
					<Navigation.Label class="capitalize pl-2">{category}</Navigation.Label>
					<Navigation.Menu>
						{#each links as link (link)}
							{@const Icon = link.icon}
							<Navigation.TriggerAnchor href={link.href} title={link.label} aria-label={link.label}>
								<Icon class="size-4" />
								<Navigation.TriggerText>{link.label}</Navigation.TriggerText>
							</Navigation.TriggerAnchor>
						{/each}
					</Navigation.Menu>
				</Navigation.Group>
			{/each}
		</Navigation.Content>
		<Navigation.Footer>
			<Navigation.TriggerAnchor href="/" title="Settings" aria-label="Settings">
				<SettingsIcon class="size-4" />
				<Navigation.TriggerText>Settings</Navigation.TriggerText>
			</Navigation.TriggerAnchor>
		</Navigation.Footer>
	</Navigation>
	<!-- --- -->
	<div class="flex justify-center items-center">
		<p class="opacity-50">Contents</p>
	</div>
</div>

```

* Recommended for large sized screens (ex: desktop).
* Ideal for horizontal screen layouts.
* Should be fixed to the left or right of the viewport.
* Supports multiple groups of links for deep navigation.
* Supports a label field per each group.
* Can scroll vertically if contents extend beyond the viewport height.

## Toggle Layout

Using reactive state we can dynamically switch between multiple layouts. Tap the double arrow icon to toggle.

```svelte
<script lang="ts">
	import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
	import BikeIcon from '@lucide/svelte/icons/bike';
	import BookIcon from '@lucide/svelte/icons/book';
	import HouseIcon from '@lucide/svelte/icons/house';
	import TreePalmIcon from '@lucide/svelte/icons/tree-palm';
	import { Navigation } from '@skeletonlabs/skeleton-svelte';

	const links = [
		{ label: 'Home', href: '/#', icon: HouseIcon },
		{ label: 'Entertainment', href: '/#', icon: BookIcon },
		{ label: 'Recreation', href: '/#', icon: BikeIcon },
		{ label: 'Relaxation', href: '/#', icon: TreePalmIcon },
	];

	const buttonClasses = 'btn hover:preset-tonal';
	let anchorRail = `${buttonClasses} aspect-square w-full max-w-[84px] flex flex-col items-center gap-0.5`;
	let anchorSidebar = `${buttonClasses} justify-start px-2 w-full`;

	let layoutRail = $state(true);

	function toggleLayout() {
		layoutRail = !layoutRail;
	}
</script>

<div class="w-full h-[728px] grid grid-cols-[auto_1fr] items-stretch border border-surface-200-800">
	<!-- --- -->
	<Navigation layout={layoutRail ? 'rail' : 'sidebar'} class={layoutRail ? '' : 'grid grid-rows-[1fr_auto] gap-4'}>
		<Navigation.Content>
			<Navigation.Header>
				<Navigation.Trigger onclick={toggleLayout}>
					<ArrowLeftRightIcon class={layoutRail ? 'size-5' : 'size-4'} />
					{#if !layoutRail}<span>Resize</span>{/if}
				</Navigation.Trigger>
			</Navigation.Header>
			<Navigation.Menu>
				{#each links as link (link)}
					{@const Icon = link.icon}
					<Navigation.TriggerAnchor>
						<Icon class={layoutRail ? 'size-5' : 'size-4'} />
						<Navigation.TriggerText>{link.label}</Navigation.TriggerText>
					</Navigation.TriggerAnchor>
				{/each}
			</Navigation.Menu>
		</Navigation.Content>
	</Navigation>
	<!-- --- -->
	<div class="flex justify-center items-center">
		<pre class="pre">Layout: {layoutRail ? 'Rail' : 'Sidebar'}</pre>
	</div>
</div>

```

## Anatomy

Here's an overview of how the Navigation component is structured in code:

```svelte
<script lang="ts">
	import { Navigation } from '@skeletonlabs/skeleton-svelte';
</script>

<Navigation>
	<Navigation.Header />
	<Navigation.Content>
		<Navigation.Group>
			<Navigation.Label />
			<Navigation.Menu />
		</Navigation.Group>
	</Navigation.Content>
	<Navigation.Footer />
</Navigation>
```

## API Reference

### Root

| Prop    | Description                                                                                  | Type                                             | Default |
| ------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------- |
| layout  | Sets the data-layout attribute, which modifies the visual presentation of the component set. | "bar" \| "rail" \| "sidebar" \| undefined        | bar     |
| element | Render the element yourself                                                                  | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Header

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"header">]> \| undefined | -       |

### Content

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Group

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Label

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Menu

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Trigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### TriggerAnchor

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"anchor">]> \| undefined | -       |

### TriggerText

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

### Footer

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"footer">]> \| undefined | -       |

