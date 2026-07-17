# Marquee

Auto-scrolls content like logos, announcements, or featured items.

```svelte
<script lang="ts">
	import { Marquee } from '@skeletonlabs/skeleton-svelte';

	const items = [
		{ emoji: '🐉', label: 'Dragon' },
		{ emoji: '🧙', label: 'Wizard' },
		{ emoji: '⚔️', label: 'Knight' },
		{ emoji: '💀', label: 'Skeleton' },
		{ emoji: '🏰', label: 'Castle' },
		{ emoji: '🧝', label: 'Elf' },
		{ emoji: '🗡️', label: 'Rogue' },
		{ emoji: '🛡️', label: 'Paladin' },
	];
</script>

<Marquee autoFill pauseOnInteraction>
	<Marquee.Edge side="start" />
	<Marquee.Viewport>
		<Marquee.Context>
			{#snippet children(marquee)}
				{#each Array.from({ length: marquee().contentCount }) as _, index}
					<Marquee.Content {index}>
						{#each items as item}
							<div class="card bg-surface-100-900 flex items-center gap-3 px-6 py-4 whitespace-nowrap">
								<span class="text-3xl">{item.emoji}</span>
								<span class="font-medium">{item.label}</span>
							</div>
						{/each}
					</Marquee.Content>
				{/each}
			{/snippet}
		</Marquee.Context>
	</Marquee.Viewport>
	<Marquee.Edge side="end" />
</Marquee>

```

## Usage

Access `contentCount` via `Marquee.Context` to render the correct number of content blocks. Zag handles duplication for seamless looping — your items only need to be written once inside `Marquee.Content`.

```svelte
<Marquee autoFill pauseOnInteraction>
	<Marquee.Edge side="start" />
	<Marquee.Viewport>
		<Marquee.Context>
			{#snippet children(marquee)}
				{#each Array.from({ length: marquee().contentCount }) as _, index}
					<Marquee.Content {index}>
						<!-- items here -->
					</Marquee.Content>
				{/each}
			{/snippet}
		</Marquee.Context>
	</Marquee.Viewport>
	<Marquee.Edge side="end" />
</Marquee>
```

## Controlled

Use `useMarquee` to control pause state from outside the component.

```svelte
<script lang="ts">
	import { Marquee, useMarquee } from '@skeletonlabs/skeleton-svelte';

	const marquee = useMarquee(() => ({ autoFill: true, pauseOnInteraction: true }));
</script>

<button onclick={() => marquee().togglePause()}>Toggle Pause</button>
<Marquee.Provider value={marquee}>...</Marquee.Provider>
```

## Anatomy

Here's an overview of how the Marquee component is structured in code:

```svelte
<script lang="ts">
	import { Marquee } from '@skeletonlabs/skeleton-svelte';
</script>

<Marquee>
	<Marquee.Edge side="start" />
	<Marquee.Viewport>
		<Marquee.Context>
			{#snippet children(marquee)}
				{#each Array.from({ length: marquee().contentCount }) as _, index}
					<Marquee.Content {index}>
						<!-- items -->
					</Marquee.Content>
				{/each}
			{/snippet}
		</Marquee.Context>
	</Marquee.Viewport>
	<Marquee.Edge side="end" />
</Marquee>
```

## API Reference

### Root

| Prop               | Description                                                                                                      | Type                                                                                            | Default |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------- |
| ids                | The ids of the elements in the marquee. Useful for composition.                                                  | Partial\<\{ root: string; viewport: string; content: (index: number) => string; }> \| undefined | -       |
| translations       | The localized messages to use.                                                                                   | IntlTranslations \| undefined                                                                   | -       |
| side               | The side/direction the marquee scrolls towards.                                                                  | Side \| undefined                                                                               | "start" |
| speed              | The speed of the marquee animation in pixels per second.                                                         | number \| undefined                                                                             | 50      |
| delay              | The delay before the animation starts (in seconds).                                                              | number \| undefined                                                                             | 0       |
| loopCount          | The number of times to loop the animation (0 = infinite).                                                        | number \| undefined                                                                             | 0       |
| spacing            | The spacing between marquee items.                                                                               | string \| undefined                                                                             | "1rem"  |
| autoFill           | Whether to automatically duplicate content to fill the container.                                                | boolean \| undefined                                                                            | false   |
| pauseOnInteraction | Whether to pause the marquee on user interaction (hover, focus).                                                 | boolean \| undefined                                                                            | false   |
| reverse            | Whether to reverse the animation direction.                                                                      | boolean \| undefined                                                                            | false   |
| paused             | Whether the marquee is paused.                                                                                   | boolean \| undefined                                                                            | -       |
| defaultPaused      | Whether the marquee is paused by default.                                                                        | boolean \| undefined                                                                            | false   |
| onPauseChange      | Function called when the pause status changes.                                                                   | ((details: PauseStatusDetails) => void) \| undefined                                            | -       |
| onLoopComplete     | Function called when the marquee completes one loop iteration.                                                   | (() => void) \| undefined                                                                       | -       |
| onComplete         | Function called when the marquee completes all loops and stops.&#xA;Only fires for finite loops (loopCount > 0). | (() => void) \| undefined                                                                       | -       |
| dir                | The document's text/writing direction.                                                                           | "ltr" \| "rtl" \| undefined                                                                     | "ltr"   |
| getRootNode        | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                       | (() => ShadowRoot \| Node \| Document) \| undefined                                             | -       |
| element            | Render the element yourself                                                                                      | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                                | -       |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => MarqueeApi\<PropTypes>                     | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                      | Default |
| -------- | ----------- | ----------------------------------------- | ------- |
| children | -           | Snippet\<\[() => MarqueeApi\<PropTypes>]> | -       |

### Viewport

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Content

| Prop    | Description                                                            | Type                                             | Default |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------------ | ------- |
| index   | The index of the content instance (0 for original, 1+ for duplicates). | number                                           | -       |
| element | Render the element yourself                                            | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Edge

| Prop    | Description                                     | Type                                             | Default |
| ------- | ----------------------------------------------- | ------------------------------------------------ | ------- |
| side    | The side where the edge gradient should appear. | Side                                             | -       |
| element | Render the element yourself                     | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

