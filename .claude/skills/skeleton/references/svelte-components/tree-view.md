# Tree View

Used to display hierarchical data.

```svelte
<script lang="ts">
	import FileIcon from '@lucide/svelte/icons/file';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import { TreeView, createTreeViewCollection } from '@skeletonlabs/skeleton-svelte';

	interface Node {
		id: string;
		name: string;
		children?: Node[];
	}

	const collection = createTreeViewCollection<Node>({
		nodeToValue: (node) => node.id,
		nodeToString: (node) => node.name,
		rootNode: {
			id: 'root',
			name: '',
			children: [
				{
					id: 'node_modules',
					name: 'node_modules',
					children: [
						{
							id: 'node_modules/@skeletonlabs',
							name: '@skeletonlabs',
							children: [
								{
									id: 'node_modules/@skeletonlabs/skeleton',
									name: 'skeleton',
								},
							],
						},
					],
				},
				{
					id: 'package.json',
					name: 'package.json',
				},
			],
		},
	});
</script>

<TreeView {collection}>
	<TreeView.Label>File System</TreeView.Label>
	<TreeView.Tree>
		{#each collection.rootNode.children || [] as node, index (node)}
			{@render treeNode(node, [index])}
		{/each}
	</TreeView.Tree>
</TreeView>

{#snippet treeNode(node: Node, indexPath: number[])}
	<TreeView.NodeProvider value={{ node, indexPath }}>
		{#if node.children}
			<TreeView.Branch>
				<TreeView.BranchControl>
					<TreeView.BranchIndicator />
					<TreeView.BranchText>
						<FolderIcon class="size-4" />
						{node.name}
					</TreeView.BranchText>
				</TreeView.BranchControl>
				<TreeView.BranchContent>
					<TreeView.BranchIndentGuide />
					{#each node.children as childNode, childIndex (childNode)}
						{@render treeNode(childNode, [...indexPath, childIndex])}
					{/each}
				</TreeView.BranchContent>
			</TreeView.Branch>
		{:else}
			<TreeView.Item>
				<FileIcon class="size-4" />
				{node.name}
			</TreeView.Item>
		{/if}
	</TreeView.NodeProvider>
{/snippet}

```

## Controlled

Reactively set and control the state values.

```svelte
<script lang="ts">
	import FileIcon from '@lucide/svelte/icons/file';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import { TreeView, createTreeViewCollection } from '@skeletonlabs/skeleton-svelte';

	interface Node {
		id: string;
		name: string;
		children?: Node[];
	}

	const collection = createTreeViewCollection<Node>({
		nodeToValue: (node) => node.id,
		nodeToString: (node) => node.name,
		rootNode: {
			id: 'root',
			name: '',
			children: [
				{
					id: 'node_modules',
					name: 'node_modules',
					children: [
						{
							id: 'node_modules/@skeletonlabs',
							name: '@skeletonlabs',
							children: [
								{
									id: 'node_modules/@skeletonlabs/skeleton',
									name: 'skeleton',
								},
							],
						},
					],
				},
				{
					id: 'package.json',
					name: 'package.json',
				},
			],
		},
	});
</script>

<TreeView {collection}>
	<TreeView.Label>File System</TreeView.Label>
	<TreeView.Tree>
		{#each collection.rootNode.children || [] as node, index (node)}
			{@render treeNode(node, [index])}
		{/each}
	</TreeView.Tree>
</TreeView>

{#snippet treeNode(node: Node, indexPath: number[])}
	<TreeView.NodeProvider value={{ node, indexPath }}>
		{#if node.children}
			<TreeView.Branch>
				<TreeView.BranchControl>
					<TreeView.BranchIndicator />
					<TreeView.BranchText>
						<FolderIcon class="size-4" />
						{node.name}
					</TreeView.BranchText>
				</TreeView.BranchControl>
				<TreeView.BranchContent>
					<TreeView.BranchIndentGuide />
					{#each node.children as childNode, childIndex (childNode)}
						{@render treeNode(childNode, [...indexPath, childIndex])}
					{/each}
				</TreeView.BranchContent>
			</TreeView.Branch>
		{:else}
			<TreeView.Item>
				<FileIcon class="size-4" />
				{node.name}
			</TreeView.Item>
		{/if}
	</TreeView.NodeProvider>
{/snippet}

```

## Multiple Selection

* Windows: Hold <kbd class="kbd">Ctrl</kbd> + left click with mouse.
* MacOS: Hold <kbd class="kbd">⌘</kbd> + left click with mouse.

```svelte
<script lang="ts">
	import FileIcon from '@lucide/svelte/icons/file';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import { TreeView, createTreeViewCollection } from '@skeletonlabs/skeleton-svelte';

	interface Node {
		id: string;
		name: string;
		children?: Node[];
	}

	const collection = createTreeViewCollection<Node>({
		nodeToValue: (node) => node.id,
		nodeToString: (node) => node.name,
		rootNode: {
			id: 'root',
			name: '',
			children: [
				{
					id: 'node_modules',
					name: 'node_modules',
					children: [
						{
							id: 'node_modules/@skeletonlabs',
							name: '@skeletonlabs',
							children: [
								{
									id: 'node_modules/@skeletonlabs/skeleton',
									name: 'skeleton',
								},
							],
						},
					],
				},
				{
					id: 'package.json',
					name: 'package.json',
				},
			],
		},
	});
</script>

<TreeView {collection} selectionMode="multiple">
	<TreeView.Label>File System</TreeView.Label>
	<TreeView.Tree>
		{#each collection.rootNode.children || [] as node, index (node)}
			{@render treeNode(node, [index])}
		{/each}
	</TreeView.Tree>
</TreeView>

{#snippet treeNode(node: Node, indexPath: number[])}
	<TreeView.NodeProvider value={{ node, indexPath }}>
		{#if node.children}
			<TreeView.Branch>
				<TreeView.BranchControl>
					<TreeView.BranchIndicator />
					<TreeView.BranchText>
						<FolderIcon class="size-4" />
						{node.name}
					</TreeView.BranchText>
				</TreeView.BranchControl>
				<TreeView.BranchContent>
					<TreeView.BranchIndentGuide />
					{#each node.children as childNode, childIndex (childNode)}
						{@render treeNode(childNode, [...indexPath, childIndex])}
					{/each}
				</TreeView.BranchContent>
			</TreeView.Branch>
		{:else}
			<TreeView.Item>
				<FileIcon class="size-4" />
				{node.name}
			</TreeView.Item>
		{/if}
	</TreeView.NodeProvider>
{/snippet}

```

## Provider Pattern

Use the [Provider Pattern](/docs/\[framework]/get-started/fundamentals#provider-pattern) to gain access to the `collapse` and `expand` methods on the `TreeView` instance.

```svelte
<script lang="ts">
	import FileIcon from '@lucide/svelte/icons/file';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import { TreeView, createTreeViewCollection, useTreeView } from '@skeletonlabs/skeleton-svelte';

	interface Node {
		id: string;
		name: string;
		children?: Node[];
	}

	const collection = createTreeViewCollection<Node>({
		nodeToValue: (node) => node.id,
		nodeToString: (node) => node.name,
		rootNode: {
			id: 'root',
			name: '',
			children: [
				{
					id: 'node_modules',
					name: 'node_modules',
					children: [
						{
							id: 'node_modules/@skeletonlabs',
							name: '@skeletonlabs',
							children: [
								{
									id: 'node_modules/@skeletonlabs/skeleton',
									name: 'skeleton',
								},
							],
						},
					],
				},
				{
					id: 'package.json',
					name: 'package.json',
				},
			],
		},
	});

	const id = $props.id();
	const treeView = useTreeView({
		id: id,
		collection: collection,
	});
</script>

<div class="w-full flex flex-col items-center gap-4">
	<TreeView.Provider value={treeView}>
		<TreeView.Label>File System</TreeView.Label>
		<TreeView.Tree>
			{#each collection.rootNode.children || [] as node, index (node)}
				{@render treeNode(node, [index])}
			{/each}
		</TreeView.Tree>
	</TreeView.Provider>

	<div class="flex gap-2">
		<button class="btn preset-filled" onclick={() => treeView().collapse()}> Collapse </button>
		<button class="btn preset-filled" onclick={() => treeView().expand()}> Expand </button>
	</div>
</div>

{#snippet treeNode(node: Node, indexPath: number[])}
	<TreeView.NodeProvider value={{ node, indexPath }}>
		{#if node.children}
			<TreeView.Branch>
				<TreeView.BranchControl>
					<TreeView.BranchIndicator />
					<TreeView.BranchText>
						<FolderIcon class="size-4" />
						{node.name}
					</TreeView.BranchText>
				</TreeView.BranchControl>
				<TreeView.BranchContent>
					<TreeView.BranchIndentGuide />
					{#each node.children as childNode, childIndex (childNode)}
						{@render treeNode(childNode, [...indexPath, childIndex])}
					{/each}
				</TreeView.BranchContent>
			</TreeView.Branch>
		{:else}
			<TreeView.Item>
				<FileIcon class="size-4" />
				{node.name}
			</TreeView.Item>
		{/if}
	</TreeView.NodeProvider>
{/snippet}

```

## Lazy Loading

Utilize promises to asynchronously load large node lists.

```svelte
<script lang="ts">
	import FileIcon from '@lucide/svelte/icons/file';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import LoaderIcon from '@lucide/svelte/icons/loader';
	import { TreeView, createTreeViewCollection, type TreeViewRootProps } from '@skeletonlabs/skeleton-svelte';

	interface Node {
		id: string;
		name: string;
		children?: Node[];
		childrenCount?: number;
	}

	const response: Record<string, Node[]> = {
		node_modules: [
			{
				id: 'node_modules/@skeletonlabs',
				name: '@skeletonlabs',
				childrenCount: 3,
			},
		],
		'node_modules/@skeletonlabs': [
			{
				id: 'node_modules/@skeletonlabs/skeleton',
				name: 'skeleton',
			},
			{
				id: 'node_modules/@skeletonlabs/skeleton-react',
				name: 'skeleton-react',
			},
			{
				id: 'node_modules/@skeletonlabs/skeleton-svelte',
				name: 'skeleton-svelte',
			},
		],
	};

	let collection = $state(
		createTreeViewCollection<Node>({
			nodeToValue: (node) => node.id,
			nodeToString: (node) => node.name,
			rootNode: {
				id: 'root',
				name: '',
				children: [
					{
						id: 'node_modules',
						name: 'node_modules',
						childrenCount: 1,
					},
					{
						id: 'package.json',
						name: 'package.json',
					},
				],
			},
		}),
	);

	const loadChildren: TreeViewRootProps['loadChildren'] = async (details) => {
		await new Promise((resolve) => setTimeout(resolve, 1000));
		return response[details.node.id] || [];
	};

	const onLoadChildrenComplete: TreeViewRootProps['onLoadChildrenComplete'] = (details) => {
		collection = details.collection;
	};
</script>

<TreeView {collection} {loadChildren} {onLoadChildrenComplete}>
	<TreeView.Label>File System</TreeView.Label>
	<TreeView.Tree>
		{#each collection.rootNode.children || [] as node, index (node)}
			{@render treeNode(node, [index])}
		{/each}
	</TreeView.Tree>
</TreeView>

{#snippet treeNode(node: Node, indexPath: number[])}
	<TreeView.NodeProvider value={{ node, indexPath }}>
		{#if node.children || node.childrenCount}
			<TreeView.Branch>
				<TreeView.BranchControl>
					<TreeView.BranchIndicator class="data-loading:hidden" />
					<TreeView.BranchIndicator class="hidden data-loading:inline animate-spin">
						<LoaderIcon class="size-4" />
					</TreeView.BranchIndicator>
					<TreeView.BranchText>
						<FolderIcon class="size-4" />
						{node.name}
					</TreeView.BranchText>
				</TreeView.BranchControl>
				<TreeView.BranchContent>
					<TreeView.BranchIndentGuide />
					{#each node.children ?? [] as childNode, childIndex (childNode)}
						{@render treeNode(childNode, [...indexPath, childIndex])}
					{/each}
				</TreeView.BranchContent>
			</TreeView.Branch>
		{:else}
			<TreeView.Item>
				<FileIcon class="size-4" />
				{node.name}
			</TreeView.Item>
		{/if}
	</TreeView.NodeProvider>
{/snippet}

```

## Anatomy

Here's an overview of how the TreeView component is structured in code:

```svelte
<script lang="ts">
	import { TreeView } from '@skeletonlabs/skeleton-svelte';
</script>

<TreeView>
	<TreeView.Label />
	<TreeView.Tree>
		<TreeView.Branch>
			<TreeView.BranchControl>
				<TreeView.BranchTrigger />
				<TreeView.BranchIndicator />
				<TreeView.BranchText />
			</TreeView.BranchControl>
			<TreeView.BranchContent>
				<TreeView.Item>
					<TreeView.ItemText />
				</TreeView.Item>
			</TreeView.BranchContent>
		</TreeView.Branch>
	</TreeView.Tree>
</TreeView>
```

## API Reference

### NodeContext

| Prop     | Description | Type                         | Default |
| -------- | ----------- | ---------------------------- | ------- |
| children | -           | Snippet\<\[() => NodeProps]> | -       |

### Root

| Prop                   | Description                                                                                                                                 | Type                                                                                                    | Default  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| translations           | Specifies the localized strings that identifies the accessibility elements and their states                                                 | IntlTranslations \| undefined                                                                           | -        |
| collection             | The tree collection data                                                                                                                    | TreeCollection\<T> \| undefined                                                                         | -        |
| ids                    | The ids of the tree elements. Useful for composition.                                                                                       | Partial\<\{ root: string; tree: string; label: string; node: (value: string) => string; }> \| undefined | -        |
| expandedValue          | The controlled expanded node ids                                                                                                            | string\[] \| undefined                                                                                  | -        |
| defaultExpandedValue   | The initial expanded node ids when rendered.&#xA;Use when you don't need to control the expanded node value.                                | string\[] \| undefined                                                                                  | -        |
| selectedValue          | The controlled selected node value                                                                                                          | string\[] \| undefined                                                                                  | -        |
| defaultSelectedValue   | The initial selected node value when rendered.&#xA;Use when you don't need to control the selected node value.                              | string\[] \| undefined                                                                                  | -        |
| defaultCheckedValue    | The initial checked node value when rendered.&#xA;Use when you don't need to control the checked node value.                                | string\[] \| undefined                                                                                  | -        |
| checkedValue           | The controlled checked node value                                                                                                           | string\[] \| undefined                                                                                  | -        |
| defaultFocusedValue    | The initial focused node value when rendered.&#xA;Use when you don't need to control the focused node value.                                | string \| null \| undefined                                                                             | -        |
| focusedValue           | The value of the focused node                                                                                                               | string \| null \| undefined                                                                             | -        |
| selectionMode          | Whether the tree supports multiple selection&#xA;- "single": only one node can be selected&#xA;- "multiple": multiple nodes can be selected | "single" \| "multiple" \| undefined                                                                     | "single" |
| onExpandedChange       | Called when the tree is opened or closed                                                                                                    | ((details: ExpandedChangeDetails\<T>) => void) \| undefined                                             | -        |
| onSelectionChange      | Called when the selection changes                                                                                                           | ((details: SelectionChangeDetails\<T>) => void) \| undefined                                            | -        |
| onFocusChange          | Called when the focused node changes                                                                                                        | ((details: FocusChangeDetails\<T>) => void) \| undefined                                                | -        |
| onCheckedChange        | Called when the checked value changes                                                                                                       | ((details: CheckedChangeDetails) => void) \| undefined                                                  | -        |
| canRename              | Function to determine if a node can be renamed                                                                                              | ((node: T, indexPath: IndexPath) => boolean) \| undefined                                               | -        |
| onRenameStart          | Called when a node starts being renamed                                                                                                     | ((details: RenameStartDetails\<T>) => void) \| undefined                                                | -        |
| onBeforeRename         | Called before a rename is completed. Return false to prevent the rename.                                                                    | ((details: RenameCompleteDetails) => boolean) \| undefined                                              | -        |
| onRenameComplete       | Called when a node label rename is completed                                                                                                | ((details: RenameCompleteDetails) => void) \| undefined                                                 | -        |
| onLoadChildrenComplete | Called when a node finishes loading children                                                                                                | ((details: LoadChildrenCompleteDetails\<T>) => void) \| undefined                                       | -        |
| onLoadChildrenError    | Called when loading children fails for one or more nodes                                                                                    | ((details: LoadChildrenErrorDetails\<T>) => void) \| undefined                                          | -        |
| expandOnClick          | Whether clicking on a branch should open it or not                                                                                          | boolean \| undefined                                                                                    | true     |
| typeahead              | Whether the tree supports typeahead search                                                                                                  | boolean \| undefined                                                                                    | true     |
| loadChildren           | Function to load children for a node asynchronously.&#xA;When provided, branches will wait for this promise to resolve before expanding.    | ((details: LoadChildrenDetails\<T>) => Promise\<T\[]>) \| undefined                                     | -        |
| scrollToIndexFn        | Function to scroll to a specific index.&#xA;Useful for virtualized tree views.                                                              | ((details: ScrollToIndexDetails\<T>) => void) \| undefined                                              | -        |
| dir                    | The document's text/writing direction.                                                                                                      | "ltr" \| "rtl" \| undefined                                                                             | "ltr"    |
| getRootNode            | A root node to correctly resolve document in custom environments. E.x.: Iframes, Electron.                                                  | (() => ShadowRoot \| Node \| Document) \| undefined                                                     | -        |
| element                | Render the element yourself                                                                                                                 | Snippet\<\[HTMLAttributes\<"div">]> \| undefined                                                        | -        |

### Provider

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| value   | -                           | any                                              | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Context

| Prop     | Description | Type                                            | Default |
| -------- | ----------- | ----------------------------------------------- | ------- |
| children | -           | Snippet\<\[() => TreeViewApi\<PropTypes, any>]> | -       |

### Tree

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Label

| Prop    | Description                 | Type                                            | Default |
| ------- | --------------------------- | ----------------------------------------------- | ------- |
| level   | The level of the heading.   | 1 \| 2 \| 3 \| 4 \| 5 \| 6 \| undefined         | -       |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"h3">]> \| undefined | -       |

### NodeProvider

| Prop     | Description                                                   | Type                       | Default |
| -------- | ------------------------------------------------------------- | -------------------------- | ------- |
| value    | -                                                             | NodeProps                  | -       |
| children | The default slot content to be rendered within the component. | Snippet\<\[]> \| undefined | -       |

### Branch

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### BranchControl

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### BranchText

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

### BranchIndicator

| Prop    | Description                 | Type                                              | Default |
| ------- | --------------------------- | ------------------------------------------------- | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"span">]> \| undefined | -       |

### BranchContent

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### BranchIndentGuide

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

### Item

| Prop    | Description                 | Type                                             | Default |
| ------- | --------------------------- | ------------------------------------------------ | ------- |
| element | Render the element yourself | Snippet\<\[HTMLAttributes\<"div">]> \| undefined | -       |

## Integrations

