<script lang="ts">
	// Email templates render server-side via `render()` from `svelte/server` into a
	// static HTML string (see ../email.ts). Styles are INLINE by design — email
	// clients (Gmail, Outlook) strip <style> blocks and don't grok Tailwind or
	// oklch(), so the landing-page theme is hand-translated to hex/table layout.
	//
	// Sign-in is the only OTP flow: this app is passwordless (no email-verification
	// or forget-password codes), so the copy is fixed rather than keyed off a type.
	//
	// `logoUrl` is an absolute URL to the handwritten wordmark PNG (built from
	// env.ORIGIN at the call site). Email clients can't resolve relative paths, so
	// the header image must be fully-qualified.
	let { otp, logoUrl }: { otp: string; logoUrl: string } = $props();

	// Split into two groups of three for readability. Falls back to the whole
	// string if it isn't the expected 6 chars.
	const otpGroups = otp.length === 6 ? [otp.slice(0, 3), otp.slice(3)] : [otp];

	const intro = 'Use this code to connect';

	// Landing-page palette (layout.css / Sky.svelte tokens → email-safe hex).
	const sky = '#8ecbe6'; // Sky.svelte watercolor-paper backdrop
	const muted = '#757575'; // --muted-foreground
	const border = '#e5e7eb';
	const primarySoft = '#e3f2f9'; // light-blue code well (tint of --primary)
	const primaryBorder = '#a7d8ea'; // --primary
	const navy = '#22304a'; // --primary-foreground

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

		<!-- Full-bleed sky, table-based for Outlook. -->
		<table
			role="presentation"
			width="100%"
			cellpadding="0"
			cellspacing="0"
			style="background-color:{sky};"
		>
			<tbody>
				<tr>
					<td align="center" style="padding:40px 16px;">
						<!-- Floating white card, echoing the artefact cards on the landing page. -->
						<table
							role="presentation"
							width="100%"
							cellpadding="0"
							cellspacing="0"
							style="max-width:440px; background-color:#ffffff; border-radius:8px; border:1px solid rgba(0,0,0,0.05); box-shadow:0 10px 25px rgba(0,0,0,0.12);"
						>
							<tbody>
								<tr>
									<td style="padding:32px 32px 24px 32px;">
										<!-- Wordmark: handwritten Temperance Alley Archive header. -->
										<img
											src={logoUrl}
											alt="TAG Archive"
											width="320"
											height="85"
											style="display:block; width:320px; max-width:100%; height:auto; margin:0 0 20px 0; border:0;"
										/>

										<p
											style="margin:0 0 24px 0; font-family:{serif}; font-size:15px; line-height:1.5; color:{muted};"
										>
											{intro}
										</p>

										<!-- Code well: auto-width table, centered, so it hugs the digits
								     instead of stretching to the card edges. -->
										<table role="presentation" align="center" cellpadding="0" cellspacing="0">
											<tbody>
												<tr>
													<td
														align="center"
														style="padding:18px 12px; background-color:{primarySoft}; border:1px solid {primaryBorder}; border-radius:8px;"
													>
														<!-- Tight letter-spacing within each group, a wide gap between
											     groups. padding-left on the first group balances the trailing
											     letter-spacing of the last, keeping the row centered. -->
														{#each otpGroups as group, i (i)}
															<span
																style="font-family:{sans}; font-size:30px; font-weight:600; letter-spacing:0.25em; color:{navy}; {i ===
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
											style="margin:24px 0 0 0; text-align:center; font-family:{serif}; font-size:13px; line-height:1.5; color:{muted};"
										>
											Expires in 5 minutes
										</p>
									</td>
								</tr>
							</tbody>
						</table>

						<p
							style="margin:20px 0 0 0; text-align:center; font-family:{serif}; font-size:12px; line-height:1.5; color:{navy}; opacity:0.7;"
						>
							If you didn't request this, you can safely ignore this email.
						</p>
					</td>
				</tr>
			</tbody>
		</table>
	</body>
</html>
