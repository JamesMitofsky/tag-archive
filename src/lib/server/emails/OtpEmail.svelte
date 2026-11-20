<script lang="ts">
	// Email templates render server-side via `render()` from `svelte/server` into a
	// static HTML string (see ../email.ts). Styles are INLINE by design — email
	// clients (Gmail, Outlook) strip <style> blocks and don't grok Tailwind or
	// oklch(), so the landing-page theme is hand-translated to hex/table layout.
	//
	// Sign-in is the only OTP flow: this app is passwordless (no email-verification
	// or forget-password codes), so the copy is fixed rather than keyed off a type.
	//
	// `logoSrc` is the handwritten wordmark's `<img src>`: `cid:…` in a sent email,
	// where the PNG travels as an inline attachment (see ../email.ts), and a data
	// URI in the dev gallery, which renders in a browser.
	let { otp, logoSrc }: { otp: string; logoSrc: string } = $props();

	// Split into two groups of three for readability. Falls back to the whole
	// string if it isn't the expected 6 chars.
	const otpGroups = otp.length === 6 ? [otp.slice(0, 3), otp.slice(3)] : [otp];

	// Landing-page palette (layout.css / Sky.svelte tokens → email-safe hex).
	// Everything sits straight on the sky, so every line of text is navy: it
	// reads at 7.4:1 there, where the site's gray muted text manages only 2.6:1.
	const sky = '#8ecbe6'; // Sky.svelte watercolor-paper backdrop
	const navy = '#22304a'; // --primary-foreground
	const frost = 'rgba(255,255,255,0.45)'; // translucent white code well
	const frostOnSky = '#c1e2f1'; // the same frost flattened onto the sky

	// Palatino-first serif stack mirrors layout.css --font-sans, with web-safe
	// Georgia/serif fallbacks for clients lacking the primary faces.
	const serif =
		"'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', Palatino, Georgia, serif";

	// Web-safe sans stack for the code digits — cleaner, less ambiguous glyphs
	// than the Palatino serif for reading a one-time code.
	const sans = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";
</script>

<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="color-scheme" content="light" />
		<title>Your TAG Archive sign-in code</title>
	</head>
	<body style="margin:0; padding:0; background-color:{sky}; font-family:{serif};">
		<!-- Preheader: inbox preview text, visually hidden. -->
		<div
			style="display:none; overflow:hidden; line-height:1px; max-height:0; max-width:0; opacity:0;"
		>
			{otp} is your TAG Archive code — expires in 5 minutes.
		</div>

		<!-- Full-bleed sky, table-based for Outlook (bgcolor for clients that drop
		     the inline background). -->
		<table
			role="presentation"
			width="100%"
			cellpadding="0"
			cellspacing="0"
			bgcolor={sky}
			style="background-color:{sky};"
		>
			<tbody>
				<tr>
					<td align="center" style="padding:48px 24px;">
						<table
							role="presentation"
							width="100%"
							cellpadding="0"
							cellspacing="0"
							style="max-width:400px;"
						>
							<tbody>
								<tr>
									<td align="center">
										<!-- Wordmark: handwritten TAG Archive, black ink on the sky. -->
										<img
											src={logoSrc}
											alt="TAG Archive"
											width="280"
											height="75"
											style="display:block; width:280px; max-width:100%; height:auto; margin:0 auto 32px auto; border:0;"
										/>

										<!-- Code well: a frosted slip on the sky, auto-width so it hugs the
										     digits instead of stretching to the column's edges. The hex is
										     that frost already laid over the sky, for clients that drop
										     rgba(); the rest read the rgba() background-color after it. -->
										<table role="presentation" align="center" cellpadding="0" cellspacing="0">
											<tbody>
												<tr>
													<td
														align="center"
														style="padding:18px 20px; background:{frostOnSky}; background-color:{frost}; border-radius:10px; box-shadow:0 2px 6px rgba(34,48,74,0.08);"
													>
														<!-- Tight letter-spacing within each group, a wide gap between
														     groups. padding-left on the first group balances the trailing
														     letter-spacing of the last, keeping the row centered. -->
														{#each otpGroups as group, i (i)}
															<span
																style="font-family:{sans}; font-size:32px; font-weight:600; letter-spacing:0.25em; color:{navy}; {i ===
																0
																	? 'padding-left:0.25em;'
																	: 'margin-left:0.5em;'}"
															>
																{group}
															</span>
														{/each}
													</td>
												</tr>
											</tbody>
										</table>

										<p
											style="margin:20px 0 0 0; text-align:center; font-family:{serif}; font-size:14px; line-height:1.5; color:{navy};"
										>
											Expires in 5 minutes
										</p>

										<p
											style="margin:40px 0 0 0; text-align:center; font-family:{serif}; font-size:12px; line-height:1.5; color:{navy};"
										>
											If you didn't request this, you can safely ignore this email.
										</p>
									</td>
								</tr>
							</tbody>
						</table>
					</td>
				</tr>
			</tbody>
		</table>
	</body>
</html>
