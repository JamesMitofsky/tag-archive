# Iconography

Learn about the Skeleton iconography system.

Skeleton takes an agnostic approach to icons, allowing you to use any combination of SVGs, emoji, unicode, or dedicated icon libraries. Mix and match to fulfill your project's unique requirements.

## Lucide

```svelte
<script lang="ts">
	import AnchorIcon from '@lucide/svelte/icons/anchor';
	import BellIcon from '@lucide/svelte/icons/bell';
	import CameraIcon from '@lucide/svelte/icons/camera';
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import CoffeeIcon from '@lucide/svelte/icons/coffee';
	import CompassIcon from '@lucide/svelte/icons/compass';
	import CrownIcon from '@lucide/svelte/icons/crown';
	import FeatherIcon from '@lucide/svelte/icons/feather';
	import FlameIcon from '@lucide/svelte/icons/flame';
	import GemIcon from '@lucide/svelte/icons/gem';
	import GhostIcon from '@lucide/svelte/icons/ghost';
	import GiftIcon from '@lucide/svelte/icons/gift';
	import HeartIcon from '@lucide/svelte/icons/heart';
	import KeyIcon from '@lucide/svelte/icons/key';
	import LeafIcon from '@lucide/svelte/icons/leaf';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import MusicIcon from '@lucide/svelte/icons/music';
	import RocketIcon from '@lucide/svelte/icons/rocket';
	import SkullIcon from '@lucide/svelte/icons/skull';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import StarIcon from '@lucide/svelte/icons/star';
	import SunIcon from '@lucide/svelte/icons/sun';
	import SwordsIcon from '@lucide/svelte/icons/swords';
	import UserRoundIcon from '@lucide/svelte/icons/user-round';
	import ZapIcon from '@lucide/svelte/icons/zap';
</script>

<div class="grid grid-cols-5 gap-4 place-items-center">
	<HeartIcon class="size-12" />
	<UserRoundIcon class="size-12" />
	<RocketIcon class="size-12" />
	<CrownIcon class="size-12" />
	<CompassIcon class="size-12" />
	<SparklesIcon class="size-12" />
	<FlameIcon class="size-12" />
	<LeafIcon class="size-12" />
	<MusicIcon class="size-12" />
	<GemIcon class="size-12" />
	<CameraIcon class="size-12" />
	<MoonIcon class="size-12" />
	<SkullIcon class="size-12" />
	<SunIcon class="size-12" />
	<FeatherIcon class="size-12" />
	<AnchorIcon class="size-12" />
	<KeyIcon class="size-12" />
	<BellIcon class="size-12" />
	<StarIcon class="size-12" />
	<GiftIcon class="size-12" />
	<CloudIcon class="size-12" />
	<CoffeeIcon class="size-12" />
	<ZapIcon class="size-12" />
	<GhostIcon class="size-12" />
	<SwordsIcon class="size-12" />
</div>

```

While Skeleton is icon-agnostic, we recommend [Lucide](https://lucide.dev/) for its broad framework support and clean aesthetic. All examples found on this site use Lucide, but feel free to substitute with any alternative.

<figure class="linker bg-noise">
  <a href="https://lucide.dev/guide/packages/lucide-svelte" target="_blank" class="btn preset-filled">
    Install Lucide
  </a>
</figure>

## Sizes

You can size icons and related elements using the following utility classes:

* `size-elem-*`
* `h-elem-*`
* `w-elem-*`

> TIP: Tailwind Components (buttons, badges, chips, field sizes, etc) adjust icon size automatically for any SVG-based icons (such as Lucide). Explicitly setting the size is redundant.

```astro
---
import { HeartIcon } from 'lucide-react';
---

<div class="grid grid-cols-[repeat(auto-fit,12rem)] auto-rows-[12rem] place-content-center w-full">
	<div class="flex flex-col items-center justify-center gap-2">
		<HeartIcon className="size-elem-xs" />
		<code class="code">xs</code>
	</div>
	<div class="flex flex-col items-center justify-center gap-2">
		<HeartIcon className="size-elem-sm" />
		<code class="code">sm</code>
	</div>
	<div class="flex flex-col items-center justify-center gap-2">
		<HeartIcon className="size-elem-base" />
		<code class="code preset-filled">base</code>
	</div>
	<div class="flex flex-col items-center justify-center gap-2">
		<HeartIcon className="size-elem-lg" />
		<code class="code">lg</code>
	</div>
	<div class="flex flex-col items-center justify-center gap-2">
		<HeartIcon className="size-elem-xl" />
		<code class="code">xl</code>
	</div>
	<div class="flex flex-col items-center justify-center gap-2">
		<HeartIcon className="size-elem-2xl" />
		<code class="code">2xl</code>
	</div>
	<div class="flex flex-col items-center justify-center gap-2">
		<HeartIcon className="size-elem-3xl" />
		<code class="code">3xl</code>
	</div>
	<div class="flex flex-col items-center justify-center gap-2">
		<HeartIcon className="size-elem-4xl" />
		<code class="code">4xl</code>
	</div>
	<div class="flex flex-col items-center justify-center gap-2">
		<HeartIcon className="size-elem-5xl" />
		<code class="code">5xl</code>
	</div>
	<div class="flex flex-col items-center justify-center gap-2">
		<HeartIcon className="size-elem-6xl" />
		<code class="code">6xl</code>
	</div>
	<div class="flex flex-col items-center justify-center gap-2">
		<HeartIcon className="size-elem-7xl" />
		<code class="code">7xl</code>
	</div>
	<div class="flex flex-col items-center justify-center gap-2">
		<HeartIcon className="size-elem-8xl" />
		<code class="code">8xl</code>
	</div>
	<div class="flex flex-col items-center justify-center gap-2">
		<HeartIcon className="size-elem-9xl" />
		<code class="code">9xl</code>
	</div>
</div>

```

Icon sizes are based on Tailwind's built in `--text-*` property, which means you can match icon sizes as follows.

```html
<div class="flex items-center gap-4">
	<SomeIcon class="size-elem-{size}" />
	<div class="h-elem-{size}">...</div>
</div>
```

As well as extend with custom icon sizes as expected.

```css
:root {
	--text-10xl: --spacing(42); /* 168px */
}
```

```css
@utility icon-10xl {
	width: var(--text-10xl);
	height: var(--text-10xl);
}
```

## Alternatives

Looking for something a bit different? Check out these other popular alternatives.

{/* prettier-ignore */}

* [Iconify](https://iconify.design/): provides a vast array of icon sets supported by popular icon libraries.
* [Font Awesome](https://fontawesome.com/): provides a huge variety of icons in their free tier.
* [SimpleIcons](https://simpleicons.org/): provides an excellent selection of brand icons.

{/* prettier-ignore */}

## Tailwind Utilities

