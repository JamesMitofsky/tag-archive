# Forms and Inputs

Various form and input styles.

```astro
<form class="card bg-surface-100-900 p-4 w-full max-w-md mx-auto space-y-4">
	<header>
		<h3 class="h3">Account</h3>
	</header>
	<fieldset class="fieldset space-y-2">
		<legend class="legend">Account Details</legend>
		<label class="label">
			<span class="label-text">Email</span>
			<input class="input" type="email" placeholder="you@example.com" />
		</label>
	</fieldset>
	<fieldset class="fieldset space-y-2">
		<legend class="legend">Shipping Address</legend>
		<label class="label">
			<span class="label-text">Street</span>
			<input class="input" type="text" placeholder="123 Main St" />
		</label>
		<label class="label">
			<span class="label-text">City</span>
			<select class="select">
				<option disabled selected>Select a city</option>
				<option value="nyc">New York</option>
				<option value="la">Los Angeles</option>
				<option value="chi">Chicago</option>
			</select>
		</label>
	</fieldset>
	<fieldset class="fieldset space-y-2">
		<legend class="legend">Notes</legend>
		<label class="label">
			<span class="label-text">Delivery Instructions</span>
			<textarea class="textarea" rows="3" placeholder="Delivery instructions..."></textarea>
		</label>
	</fieldset>
	<footer class="flex justify-end">
		<button type="submit" class="btn preset-filled">Submit</button>
	</footer>
</form>

```

## Requirements

Skeleton relies on the official [Tailwind Forms](https://github.com/tailwindlabs/tailwindcss-forms) plugin to normalize form styling, also known as a reset. This plugin is <u>required</u> if you wish to use any form utility classes provided on this page.

<figure class="card-filled-enhanced flex justify-center gap-4 p-8">
  <a class="btn preset-filled" href="https://github.com/tailwindlabs/tailwindcss-forms" target="_blank">
    View on Github
  </a>
</figure>

Install the `@tailwindcss/forms` package, then implement the `@plugin` directive in your global stylesheet.

```sh
npm install -D @tailwindcss/forms
```

```css
@import 'tailwindcss';
@plugin '@tailwindcss/forms';

/* ...Skeleton config here... */
```

## Browser Support

The quality and appearance of native and semantic HTML form elements can vary between both operating systems and browser vendors. Skeleton does its best to adhere to progressive enhancement best practices. However, we advise you validate support for each element per your target audience.

***

## Fieldsets

Use the optional `.fieldset` and `.legend` classes to group related form controls with an accessible title.

```astro
<form class="w-full max-w-md mx-auto space-y-4">
	<fieldset class="fieldset space-y-2">
		<legend class="legend">Account Details</legend>
		<label class="label">
			<span class="label-text">Email</span>
			<input class="input" type="email" placeholder="you@example.com" />
		</label>
		<label class="label">
			<span class="label-text">Password</span>
			<input class="input" type="password" placeholder="••••••••" />
		</label>
	</fieldset>
</form>

```

## Labels

Use `.label` and `.label-text` for styling the visible label text.

```astro
<form class="mx-auto w-full max-w-md space-y-4">
	<!-- Wrapped -->
	<label class="label">
		<span class="label-text">First Name</span>
		<input class="input" type="text" placeholder="Jane" />
	</label>
	<!-- Siblings -->
	<div class="space-y-1">
		<label class="label label-text" for="lastname">Last Name</label>
		<input class="input" type="text" id="lastname" name="lastname" placeholder="Doe" />
	</div>
</form>

```

## Input

Apply the `.input` class to all standard box-shaped [input types](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input#input_types).

```astro
<div class="mx-auto w-full max-w-md space-y-4">
	<!-- Standard Inputs -->
	<form class="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
		<!-- text -->
		<label class="label">
			<span class="label-text">Input</span>
			<input class="input" type="text" placeholder="Input" />
		</label>
		<!-- password -->
		<label class="label">
			<span class="label-text">Input: password</span>
			<input class="input" type="password" placeholder="Input" />
		</label>
		<!-- email -->
		<label class="label">
			<span class="label-text">Input: email</span>
			<input class="input" type="email" placeholder="Input" />
		</label>
		<!-- url -->
		<label class="label">
			<span class="label-text">Input: url</span>
			<input class="input" type="url" placeholder="Input" />
		</label>
		<!-- tel -->
		<label class="label">
			<span class="label-text">Input: tel</span>
			<input class="input" type="tel" placeholder="Input" />
		</label>
		<!-- search -->
		<label class="label">
			<span class="label-text">Input: search</span>
			<input class="input" type="search" placeholder="Input" />
		</label>
		<!-- number -->
		<label class="label">
			<span class="label-text">Input: number</span>
			<input class="input" type="number" placeholder="Input" />
		</label>
	</form>

	<hr class="hr col-span-2" />

	<!-- File Input -->
	<form class="col-span-2">
		<label class="label">
			<span class="label-text">File Input</span>
			<input class="input" type="file" />
		</label>
	</form>

	<hr class="hr col-span-2" />

	<!-- Date/Time Inputs -->
	<form class="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
		<!-- date -->
		<label class="label">
			<span class="label-text">Input: date</span>
			<input class="input" type="date" placeholder="Input" />
		</label>
		<!-- datetime-local -->
		<label class="label">
			<span class="label-text">Input: datetime-local</span>
			<input class="input" type="datetime-local" placeholder="Input" />
		</label>
		<!-- month -->
		<label class="label">
			<span class="label-text">Input: month</span>
			<input class="input" type="month" placeholder="Input" />
		</label>
		<!-- time -->
		<label class="label">
			<span class="label-text">Input: time</span>
			<input class="input" type="time" placeholder="Input" />
		</label>
		<!-- week -->
		<label class="label">
			<span class="label-text">Input: week</span>
			<input class="input" type="week" placeholder="Input" />
		</label>
	</form>
</div>

```

## Select

Apply the `.select` class to `<select>` elements for single or multiple option menus.

```astro
<form class="mx-auto w-full max-w-md space-y-4">
	<!-- Basic Placeholder -->
	<label class="label">
		<span class="label-text">Basic Placeholder</span>
		<select class="select">
			<option disabled selected>Preferred Flavor</option>
			<option value="1">Strawberry</option>
			<option value="2">Grape</option>
			<option value="3">Watermelon</option>
			<option value="4">Apple</option>
			<option value="5">Mango</option>
		</select>
	</label>
	<!-- Optgroup -->
	<label class="label">
		<span class="label-text">Optgroup</span>
		<select class="select">
			<optgroup label="Berries">
				<option value="strawberry">Strawberry</option>
				<option value="blueberry">Blueberry</option>
				<option value="raspberry">Raspberry</option>
			</optgroup>
			<optgroup label="Citrus">
				<option value="orange">Orange</option>
				<option value="lemon">Lemon</option>
				<option value="lime">Lime</option>
			</optgroup>
			<optgroup label="Tropical">
				<option value="mango">Mango</option>
				<option value="pineapple">Pineapple</option>
				<option value="coconut">Coconut</option>
			</optgroup>
		</select>
	</label>
	<!-- Using Divider -->
	<label class="label">
		<span class="label-text">Using Divider</span>
		<select class="select">
			<option value="strawberry">Strawberry</option>
			<option value="grape">Grape</option>
			<option value="watermelon">Watermelon</option>
			<hr />
			<option value="dragonfruit">Dragonfruit</option>
			<option value="lychee">Lychee</option>
			<option value="passionfruit">Passionfruit</option>
		</select>
	</label>
</form>

```

## Textarea

Apply the `.textarea` class to `<textarea>` elements for multi-line text input.

```astro
<form class="mx-auto w-full max-w-md space-y-4">
	<textarea class="textarea" rows="4" placeholder="Tell us more..."></textarea>
</form>

```

## Checkboxes

Use `type="checkbox"` for inputs that allow one or more independent options to be toggled on or off.

```astro
<form class="space-y-2">
	<label class="flex items-center space-x-2">
		<input class="checkbox" type="checkbox" checked />
		<p>Option 1</p>
	</label>
	<label class="flex items-center space-x-2">
		<input class="checkbox" type="checkbox" />
		<p>Option 2</p>
	</label>
	<label class="flex items-center space-x-2">
		<input class="checkbox" type="checkbox" />
		<p>Option 3</p>
	</label>
</form>

```

## Radio Groups

Use `type="radio"` to present a set of mutually exclusive options where only one can be selected.

```astro
<form class="space-y-2">
	<label class="flex items-center space-x-2">
		<input class="radio" type="radio" checked name="radio-direct" value="1" />
		<p>Option 1</p>
	</label>
	<label class="flex items-center space-x-2">
		<input class="radio" type="radio" name="radio-direct" value="2" />
		<p>Option 2</p>
	</label>
	<label class="flex items-center space-x-2">
		<input class="radio" type="radio" name="radio-direct" value="3" />
		<p>Option 3</p>
	</label>
</form>

```

## Range

Use `type="range"` to allow selection of a numeric value from a continuous or stepped range via a slider.

```astro
<form class="mx-auto w-full max-w-md">
	<label class="label">
		<span class="label-text">Range</span>
		<input class="input" type="range" value="75" max="100" />
	</label>
</form>

```

## Progress

Use `<progress>` to indicate the completion status of a task, such as a file upload or loading operation.

```astro
<form class="mx-auto w-full max-w-md">
	<label class="label">
		<span class="label-text">Progress</span>
		<progress class="progress" value="50" max="100"></progress>
	</label>
</form>

```

## Meter

Use `<meter>` to represent a scalar value within a known range, such as disk usage, battery level, or a score.

```astro
<form class="mx-auto flex w-full max-w-md flex-col gap-4">
	<label class="label">
		<span class="label-text">Optimum</span>
		<meter class="meter" value="80" min="0" max="100" low="33" high="66" optimum="80"></meter>
	</label>
	<label class="label">
		<span class="label-text">Suboptimum</span>
		<meter class="meter" value="50" min="0" max="100" low="33" high="66" optimum="80"></meter>
	</label>
	<label class="label">
		<span class="label-text">Even Less Good</span>
		<meter class="meter" value="20" min="0" max="100" low="33" high="66" optimum="80"></meter>
	</label>
</form>

```

## Color

Use `type="color"` to provide a native color picker for selecting a single color value.

```astro
<form class="mx-auto w-full max-w-md">
	<div class="grid grid-cols-[auto_1fr] gap-2">
		<input class="input" type="color" value="#bada55" />
		<input class="input" type="text" value="#bada55" readonly tabindex="-1" />
	</div>
</form>

```

***

## Field Sizes

Use `field-{size}` paired with: `xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl`

```astro
<form class="mx-auto w-full max-w-md grid grid-cols-[auto_1fr_auto] items-center gap-4">
	<!-- xs -->
	<span class="label-text text-right">xs</span>
	<input class="input field-xs" type="text" placeholder="Input" />
	<button class="btn btn-xs preset-filled">Button</button>

	<!-- sm -->
	<span class="label-text text-right">sm</span>
	<input class="input field-sm" type="text" placeholder="Input" />
	<button class="btn btn-sm preset-filled">Button</button>

	<!-- base -->
	<span class="label-text text-right">base</span>
	<input class="input field-base" type="text" placeholder="Input" />
	<button class="btn btn-base preset-filled">Button</button>

	<!-- lg -->
	<span class="label-text text-right">lg</span>
	<input class="input field-lg" type="text" placeholder="Input" />
	<button class="btn btn-lg preset-filled">Button</button>

	<!-- xl -->
	<span class="label-text text-right">xl</span>
	<input class="input field-xl" type="text" placeholder="Input" />
	<button class="btn btn-xl preset-filled">Button</button>

	<!-- NOTE: 2x|3xl|4xl|5xl|6xl|7xl|8xl|9xl tructated for space -->
</form>

```

## Field Groups

Apply `field-group` to create a grouping of related box-shaped fields or buttons. This acts as a [grid](https://tailwindcss.com/docs/display#grid) container, allowing for column configuration. Make use of [Presets](/docs/\[framework]/tailwind-utilities/presets) to style label columns.

```astro
---
import { CheckIcon, CircleDollarSignIcon, SearchIcon } from 'lucide-react';
---

<form class="w-full space-y-8">
	<!-- Website -->
	<div class="field-group grid-cols-[auto_1fr_auto]">
		<label class="label label-text preset-tonal" for="url">https://</label>
		<input class="input" type="text" name="url" id="url" placeholder="www.example.com" />
	</div>

	<!-- Amount -->
	<div class="field-group grid-cols-[auto_1fr_auto]">
		<label class="label label-text preset-tonal-primary" for="amount" title="Money" aria-label="Money">
			<CircleDollarSignIcon size={16} />
		</label>
		<input class="input" type="text" name="amount" id="amount" placeholder="Amount" />
		<select class="select" name="currency" id="currency">
			<option>USD</option>
			<option>CAD</option>
			<option>EUR</option>
		</select>
	</div>

	<!-- Username -->
	<div class="field-group grid-cols-[auto_1fr_auto]">
		<label class="label label-text preset-tonal-secondary" for="username">Username</label>
		<input class="input" type="text" name="username" id="username" placeholder="Enter Username..." />
		<button class="btn preset-filled" title="Username already in use.">
			<CheckIcon size={16} />
		</button>
	</div>

	<!-- Search -->
	<!-- NOTE: Supports field and button sizes -->
	<div class="field-group grid-cols-[auto_1fr_auto]">
		<label class="label label-text preset-tonal-tertiary" for="search">
			<SearchIcon size={16} />
		</label>
		<input class="input field-xl" type="search" name="search" id="search" placeholder="Search..." />
		<button class="btn btn-xl preset-filled">Submit</button>
	</div>
</form>

```

