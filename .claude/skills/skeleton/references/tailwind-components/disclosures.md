# Disclosures

Toggle the visibility of collapsible content using the native HTML details element.

```astro
<details class="disclosure">
	<summary>How long does shipping take?</summary>
	<div class="disclosure-content">
		<p>
			Standard orders ship within 1-2 business days and arrive in 3-5 business days. Expedited shipping is available at checkout for
			next-day delivery in most regions.
		</p>
	</div>
</details>

```

## Group

Wrap with `disclosure-group` and share a [`name`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details#name) attribute so only one item stays open at a time.

```astro
<div class="disclosure-group">
	<details class="disclosure" name="faq">
		<summary>How long does shipping take?</summary>
		<div class="disclosure-content">
			<p>
				Standard orders ship within 1-2 business days and arrive in 3-5 business days. Expedited shipping is available at checkout for
				next-day delivery in most regions.
			</p>
		</div>
	</details>
	<hr class="hr" />
	<details class="disclosure" name="faq">
		<summary>What is your return policy?</summary>
		<div class="disclosure-content">
			<p>
				Returns are accepted within 30 days of delivery. Items must be unused and in their original packaging. We provide a prepaid return
				label for orders over $50.
			</p>
		</div>
	</details>
	<hr class="hr" />
	<details class="disclosure" name="faq">
		<summary><span>Do you ship internationally?</span></summary>
		<div class="disclosure-content">
			<p>
				Yes, we ship to over 60 countries. International orders typically arrive within 7-14 business days, and any applicable customs fees
				are calculated at checkout.
			</p>
		</div>
	</details>
</div>

```

## Open

Add the `open` attribute to render a disclosure expanded by default.

```astro
<details class="disclosure" open>
	<summary>How long does shipping take?</summary>
	<div class="disclosure-content">
		<p>
			Standard orders ship within 1-2 business days and arrive in 3-5 business days. Expedited shipping is available at checkout for
			next-day delivery in most regions.
		</p>
	</div>
</details>

```

## Animation

The slide animation is a progressive enhancement via [::details-content](https://developer.mozilla.org/en-US/docs/Web/CSS/::details-content) and [interpolate-size: allow-keywords](https://developer.mozilla.org/en-US/docs/Web/CSS/interpolate-size). For unsupported browsers this will fall back to the native instant toggle.

