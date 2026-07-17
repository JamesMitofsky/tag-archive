# QR Code

Render scannable QR codes with a frame, overlay, pattern, and download trigger.

```svelte
<script lang="ts">
	import favicon from '@/assets/favicon.png';
	import { QrCode } from '@skeletonlabs/skeleton-svelte';
</script>

<QrCode value="https://skeleton.dev">
	<QrCode.Frame class="size-full max-size-36">
		<QrCode.Pattern />
	</QrCode.Frame>
	<QrCode.Overlay class="bg-white rounded-full p-1">
		<img src={favicon.src} alt="Skeleton Logo" class="size-12" />
	</QrCode.Overlay>
	<QrCode.DownloadTrigger fileName="skeleton-dev" mimeType="image/png">Download</QrCode.DownloadTrigger>
</QrCode>

```

## Frame Colors

Use brand color for the frame and a contrasting fill for the QR pattern.

```svelte
<script lang="ts">
	import { QrCode } from '@skeletonlabs/skeleton-svelte';
</script>

<QrCode value="https://skeleton.dev">
	<QrCode.Frame class="size-full max-size-36 bg-brand-dark">
		<QrCode.Pattern class="fill-brand-contrast-dark" />
	</QrCode.Frame>
	<QrCode.Overlay />
</QrCode>

```

## Overlay

Demonstrates an overlay with an icon and a contrasting square background to separate it visually from the pattern.

```svelte
<script lang="ts">
	import favicon from '@/assets/favicon.png';
	import { QrCode } from '@skeletonlabs/skeleton-svelte';
</script>

<QrCode value="https://skeleton.dev">
	<QrCode.Frame class="size-full max-size-36">
		<QrCode.Pattern />
	</QrCode.Frame>
	<QrCode.Overlay class="bg-white rounded-full p-1">
		<img src={favicon.src} alt="Skeleton Logo" class="size-12" />
	</QrCode.Overlay>
</QrCode>

```

## Clickable Download

Wrap the visual frame/pattern in the download trigger so clicking the code initiates a download.

```svelte
<script lang="ts">
	import { QrCode } from '@skeletonlabs/skeleton-svelte';
</script>

<QrCode value="https://skeleton.dev">
	<QrCode.DownloadTrigger fileName="skeleton-dev" mimeType="image/png">
		<QrCode.Frame class="size-full max-size-36">
			<QrCode.Pattern />
		</QrCode.Frame>
	</QrCode.DownloadTrigger>
</QrCode>

```

## Anatomy

Here's an overview of how the QrCode component is structured in code:

```svelte
<script lang="ts">
	import { QrCode } from '@skeletonlabs/skeleton-svelte';
</script>

<QrCode value="https://skeleton.dev">
	<QrCode.Frame>
		<QrCode.Pattern />
	</QrCode.Frame>
	<QrCode.Overlay />
	<QrCode.DownloadTrigger />
</QrCode>
```

## API Reference

### Root

| Prop          | Description                                                                                                 | Type                                                     | Default |
| ------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------- |
| value         | The controlled value to encode.                                                                             | string \| undefined                                      | -       |
| defaultValue  | The initial value to encode when rendered.&#xA;Use when you don't need to control the value of the qr code. | string \| undefined                                      | -       |
| ids           | The element ids.                                                                                            | Partial\<\{ root: string; frame: string; }> \| undefined | -       |
| encoding      | The qr code encoding options.                                                                               | QrCodeGenerateOptions \| undefined                       | -       |
| onValueChange | Callback fired when the value changes.                                                                      | ((details: ValueChangeDetails) => void) \| undefined     | -       |
| pixelSize     | The pixel size of the qr code.                                                                              | number \| undefined                                      | -       |
| dir           | The document's text/writing direction.                                                                      | "ltr" \| "rtl" \| undefined                              | "ltr"   |
| getRootNode   | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                  | (() => ShadowRoot \| Node \| Document) \| undefined      | -       |
| element       | Render the element yourself                                                                                 | Snippet\<\[HTMLAttributes\<"div">]> \| undefined         | -       |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => QrCodeApi\<PropTypes>                      | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                     | Default |
| -------- | ----------- | ---------------------------------------- | ------- |
| children | -           | Snippet\<\[() => QrCodeApi\<PropTypes>]> | -       |

### DownloadTrigger

| Prop     | Description                 | Type                                                | Default |
| -------- | --------------------------- | --------------------------------------------------- | ------- |
| mimeType | The mime type of the image. | DataUrlType                                         | -       |
| quality  | The quality of the image.   | number \| undefined                                 | -       |
| fileName | The name of the file.       | string                                              | -       |
| element  | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### Frame

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"svg">]> \| undefined | -       |

### Pattern

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"path">]> \| undefined | -       |

### Overlay

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

