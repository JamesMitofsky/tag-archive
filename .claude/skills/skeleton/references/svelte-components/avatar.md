# Avatar

An image with a fallback for representing the user.

```svelte
<script lang="ts">
	import { Avatar } from '@skeletonlabs/skeleton-svelte';
</script>

<div class="flex items-center gap-8">
	<!-- Small -->
	<Avatar class="size-10">
		<Avatar.Image src="https://i.pravatar.cc/40?img=48" alt="small" />
		<Avatar.Fallback>SK</Avatar.Fallback>
	</Avatar>
	<!-- Base -->
	<Avatar>
		<Avatar.Image src="https://i.pravatar.cc/60?img=48" alt="base" />
		<Avatar.Fallback>SK</Avatar.Fallback>
	</Avatar>
	<!-- Large -->
	<Avatar class="size-20">
		<Avatar.Image src="https://i.pravatar.cc/80?img=48" alt="large" />
		<Avatar.Fallback>SK</Avatar.Fallback>
	</Avatar>
</div>

```

## Fallback

Use a fallback when an image fails to load or is unavailable.

```svelte
<script lang="ts">
	import { Avatar } from '@skeletonlabs/skeleton-svelte';
</script>

<Avatar>
	<Avatar.Fallback>SK</Avatar.Fallback>
</Avatar>

```

## Filter

Apply [SVG Filters](/docs/\[framework]/guides/cookbook/svg-filters) to avatar images.

```svelte
<script lang="ts">
	import { Avatar } from '@skeletonlabs/skeleton-svelte';
</script>

<Avatar>
	<Avatar.Image src="https://i.pravatar.cc/150?img=48" class="filter-[url(#apollo)]" alt="filtered" />
	<Avatar.Fallback>SK</Avatar.Fallback>
</Avatar>

<svg class="absolute -left-full w-0 h-0">
	<filter id="apollo" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
		<feColorMatrix
			values="0.8 0.6 -0.4 0.1 0,
    0 1.2 0.05 0 0,
    0 -1 3 0.02 0,
    0 0 0 50 0"
			result="final"
			in="SourceGraphic"
		></feColorMatrix>
	</filter>
</svg>

```

## Anatomy

Here's an overview of how the Avatar component is structured in code:

```svelte
<script lang="ts">
	import { Avatar } from '@skeletonlabs/skeleton-svelte';
</script>

<Avatar>
	<Avatar.Image />
	<Avatar.Fallback />
</Avatar>
```

## API Reference

### Root

| Prop           | Description                                                                                | Type                                                                       | Default |
| -------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------- |
| onStatusChange | Functional called when the image loading status changes.                                   | ((details: StatusChangeDetails) => void) \| undefined                      | -       |
| ids            | The ids of the elements in the avatar. Useful for composition.                             | Partial\<\{ root: string; image: string; fallback: string; }> \| undefined | -       |
| getRootNode    | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron. | (() => ShadowRoot \| Node \| Document) \| undefined                        | -       |
| dir            | The document's text/writing direction.                                                     | "ltr" \| "rtl" \| undefined                                                | "ltr"   |
| element        | Render the element yourself                                                                | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                           | -       |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => AvatarApi\<PropTypes>                      | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                     | Default |
| -------- | ----------- | ---------------------------------------- | ------- |
| children | -           | Snippet\<\[() => AvatarApi\<PropTypes>]> | -       |

### Image

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"img">]> \| undefined | -       |

### Fallback

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

