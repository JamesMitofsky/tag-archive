# File Upload

File upload dropzone and input patterns for selecting files.

```svelte
<script lang="ts">
	import FileIcon from '@lucide/svelte/icons/file';
	import { FileUpload } from '@skeletonlabs/skeleton-svelte';
</script>

<FileUpload>
	<FileUpload.Label>Upload your files</FileUpload.Label>
	<FileUpload.Dropzone>
		<FileIcon class="size-10" />
		<span>Select file or drag here.</span>
		<FileUpload.Trigger>Browse Files</FileUpload.Trigger>
		<FileUpload.HiddenInput />
	</FileUpload.Dropzone>
	<FileUpload.ItemGroup>
		<FileUpload.Context>
			{#snippet children(fileUpload)}
				{#each fileUpload().acceptedFiles as file (file.name)}
					<FileUpload.Item {file}>
						<FileUpload.ItemName>{file.name}</FileUpload.ItemName>
						<FileUpload.ItemSizeText>{file.size} bytes</FileUpload.ItemSizeText>
						<FileUpload.ItemDeleteTrigger />
					</FileUpload.Item>
				{/each}
			{/snippet}
		</FileUpload.Context>
	</FileUpload.ItemGroup>
	<FileUpload.ClearTrigger>Clear Files</FileUpload.ClearTrigger>
</FileUpload>

```

## Disabled

Set the `disabled` prop to enable the disabled state.

```svelte
<script lang="ts">
	import { FileUpload } from '@skeletonlabs/skeleton-svelte';
</script>

<FileUpload disabled>
	<FileUpload.Label>Upload your files</FileUpload.Label>
	<FileUpload.Dropzone>
		<FileUpload.Trigger>Browse Files</FileUpload.Trigger>
		<FileUpload.HiddenInput />
	</FileUpload.Dropzone>
	<FileUpload.ItemGroup>
		<FileUpload.Context>
			{#snippet children(fileUpload)}
				{#each fileUpload().acceptedFiles as file (file.name)}
					<FileUpload.Item {file}>
						<FileUpload.ItemName>{file.name}</FileUpload.ItemName>
						<FileUpload.ItemSizeText>{file.size} bytes</FileUpload.ItemSizeText>
						<FileUpload.ItemDeleteTrigger />
					</FileUpload.Item>
				{/each}
			{/snippet}
		</FileUpload.Context>
	</FileUpload.ItemGroup>
</FileUpload>

```

## Button Only

Replace the interface with a simple "browse" button.

```svelte
<script lang="ts">
	import { FileUpload } from '@skeletonlabs/skeleton-svelte';
</script>

<FileUpload class="w-fit" onFileAccept={console.log}>
	<FileUpload.Trigger>Browse Files</FileUpload.Trigger>
	<FileUpload.HiddenInput />
</FileUpload>

```

## Direction

Set the text direction (`ltr` or `rtl`) using the `dir` prop.

```svelte
<script lang="ts">
	import { FileUpload } from '@skeletonlabs/skeleton-svelte';
</script>

<FileUpload dir="rtl">
	<FileUpload.Label>Upload your files</FileUpload.Label>
	<FileUpload.Dropzone>
		<FileUpload.Trigger>Browse Files</FileUpload.Trigger>
		<FileUpload.HiddenInput />
	</FileUpload.Dropzone>
	<FileUpload.ItemGroup>
		<FileUpload.Context>
			{#snippet children(fileUpload)}
				{#each fileUpload().acceptedFiles as file (file.name)}
					<FileUpload.Item {file}>
						<FileUpload.ItemName>{file.name}</FileUpload.ItemName>
						<FileUpload.ItemSizeText>{file.size} bytes</FileUpload.ItemSizeText>
						<FileUpload.ItemDeleteTrigger />
					</FileUpload.Item>
				{/each}
			{/snippet}
		</FileUpload.Context>
	</FileUpload.ItemGroup>
</FileUpload>

```

## Anatomy

Here's an overview of how the FileUpload component is structured in code:

```svelte
<script lang="ts">
	import { FileUpload } from '@skeletonlabs/skeleton-svelte';
</script>

<FileUpload>
	<FileUpload.Dropzone>
		<FileUpload.Trigger />
		<FileUpload.HiddenInput />
	</FileUpload.Dropzone>
	<FileUpload.ItemGroup>
		<FileUpload.Item>
			<FileUpload.ItemName />
			<FileUpload.ItemSizeText />
			<FileUpload.ItemDeleteTrigger />
		</FileUpload.Item>
	</FileUpload.ItemGroup>
	<FileUpload.ClearTrigger />
</FileUpload>
```

## API Reference

### Root

| Prop                 | Description                                                                                                       | Type                                                                                                                                                                                                                                                                                                   | Default  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| name                 | The name of the underlying file input                                                                             | string \| undefined                                                                                                                                                                                                                                                                                    | -        |
| ids                  | The ids of the elements. Useful for composition.                                                                  | Partial\<\{ root: string; dropzone: string; hiddenInput: string; trigger: string; label: string; item: (id: string) => string; itemName: (id: string) => string; itemSizeText: (id: string) => string; itemPreview: (id: string) => string; itemDeleteTrigger: (id: string) => string; }> \| undefined | -        |
| translations         | The localized messages to use.                                                                                    | IntlTranslations \| undefined                                                                                                                                                                                                                                                                          | -        |
| accept               | The accept file types                                                                                             | Record\<string, string\[]> \| FileMimeType \| FileMimeType\[] \| undefined                                                                                                                                                                                                                             | -        |
| disabled             | Whether the file input is disabled                                                                                | boolean \| undefined                                                                                                                                                                                                                                                                                   | -        |
| required             | Whether the file input is required                                                                                | boolean \| undefined                                                                                                                                                                                                                                                                                   | -        |
| allowDrop            | Whether to allow drag and drop in the dropzone element                                                            | boolean \| undefined                                                                                                                                                                                                                                                                                   | true     |
| maxFileSize          | The maximum file size in bytes                                                                                    | number \| undefined                                                                                                                                                                                                                                                                                    | Infinity |
| minFileSize          | The minimum file size in bytes                                                                                    | number \| undefined                                                                                                                                                                                                                                                                                    | 0        |
| maxFiles             | The maximum number of files                                                                                       | number \| undefined                                                                                                                                                                                                                                                                                    | 1        |
| preventDocumentDrop  | Whether to prevent the drop event on the document                                                                 | boolean \| undefined                                                                                                                                                                                                                                                                                   | true     |
| validate             | Function to validate a file                                                                                       | ((file: File, details: FileValidateDetails) => FileError\[] \| null) \| undefined                                                                                                                                                                                                                      | -        |
| defaultAcceptedFiles | The default accepted files when rendered.&#xA;Use when you don't need to control the accepted files of the input. | File\[] \| undefined                                                                                                                                                                                                                                                                                   | -        |
| acceptedFiles        | The controlled accepted files                                                                                     | File\[] \| undefined                                                                                                                                                                                                                                                                                   | -        |
| onFileChange         | Function called when the value changes, whether accepted or rejected                                              | ((details: FileChangeDetails) => void) \| undefined                                                                                                                                                                                                                                                    | -        |
| onFileAccept         | Function called when the file is accepted                                                                         | ((details: FileAcceptDetails) => void) \| undefined                                                                                                                                                                                                                                                    | -        |
| onFileReject         | Function called when the file is rejected                                                                         | ((details: FileRejectDetails) => void) \| undefined                                                                                                                                                                                                                                                    | -        |
| capture              | The default camera to use when capturing media                                                                    | "user" \| "environment" \| undefined                                                                                                                                                                                                                                                                   | -        |
| directory            | Whether to accept directories, only works in webkit browsers                                                      | boolean \| undefined                                                                                                                                                                                                                                                                                   | -        |
| invalid              | Whether the file input is invalid                                                                                 | boolean \| undefined                                                                                                                                                                                                                                                                                   | -        |
| readOnly             | Whether the file input is read-only                                                                               | boolean \| undefined                                                                                                                                                                                                                                                                                   | -        |
| transformFiles       | Function to transform the accepted files to apply transformations                                                 | ((files: File\[]) => Promise\<File\[]>) \| undefined                                                                                                                                                                                                                                                   | -        |
| locale               | The current locale. Based on the BCP 47 definition.                                                               | string \| undefined                                                                                                                                                                                                                                                                                    | "en-US"  |
| dir                  | The document's text/writing direction.                                                                            | "ltr" \| "rtl" \| undefined                                                                                                                                                                                                                                                                            | "ltr"    |
| getRootNode          | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                        | (() => ShadowRoot \| Node \| Document) \| undefined                                                                                                                                                                                                                                                    | -        |
| element              | Render the element yourself                                                                                       | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                                                                                                                                                                                                                                       | -        |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | () => FileUploadApi\<PropTypes>                  | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type             | Default |
| -------- | ----------- | ---------------- | ------- |
| children | -           | Snippet\<\[any]> | -       |

### Label

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"label">]> \| undefined | -       |

### Dropzone

| Prop         | Description                                        | Type                                             | Default |
| ------------ | -------------------------------------------------- | ------------------------------------------------ | ------- |
| disableClick | Whether to disable the click event on the dropzone | boolean \| undefined                             | -       |
| element      | Render the element yourself                        | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Trigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### ClearTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

### HiddenInput

| Prop    | Description                 | Type                                               | Default |
| ------- | --------------------------- | -------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"input">]> \| undefined | -       |

### ItemGroup

| Prop    | Description                 | Type                                            | Default |
| ------- | --------------------------- | ----------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"ul">]> \| undefined | -       |

### Item

| Prop    | Description                 | Type                                            | Default |
| ------- | --------------------------- | ----------------------------------------------- | ------- |
| file    | -                           | File                                            | -       |
| type    | -                           | ItemType \| undefined                           | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"li">]> \| undefined | -       |

### ItemName

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ItemSizeText

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### ItemDeleteTrigger

| Prop    | Description                 | Type                                                | Default |
| ------- | --------------------------- | --------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"button">]> \| undefined | -       |

