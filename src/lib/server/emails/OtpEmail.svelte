<script lang="ts">
	// Email templates render server-side via `render()` from `svelte/server` into a
	// static HTML string (see ../email.ts). Styles are INLINE by design — email
	// clients (Gmail, Outlook) strip <style> blocks and don't grok Tailwind or
	// oklch(), so the landing-page theme is hand-translated to hex/table layout.
	//
	// Sign-in is the only OTP flow: this app is passwordless (no email-verification
	// or forget-password codes), so the copy is fixed rather than keyed off a type.
	let { otp }: { otp: string } = $props();

	const intro = 'Use this code to connect';

	// Landing-page palette (layout.css / Sky.svelte tokens → email-safe hex).
	const sky = '#8ecbe6'; // Sky.svelte watercolor-paper backdrop
	const ink = '#2b2b2b'; // --foreground
	const muted = '#757575'; // --muted-foreground
	const border = '#e5e7eb';
	const primarySoft = '#e3f2f9'; // light-blue code well (tint of --primary)
	const primaryBorder = '#a7d8ea'; // --primary
	const navy = '#22304a'; // --primary-foreground

	// Palatino-first serif stack mirrors layout.css --font-sans, with web-safe
	// Georgia/serif fallbacks for clients lacking the primary faces.
	const serif =
		"'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', Palatino, Georgia, serif";
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
								<!-- Wordmark -->
								<p
									style="margin:0 0 24px 0; font-family:{serif}; font-size:18px; font-weight:600; letter-spacing:0.02em; color:{ink};"
								>
									TAG&nbsp;Archive
								</p>

								<p style="margin:0 0 24px 0; font-family:{serif}; font-size:15px; line-height:1.5; color:{muted};">
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
											<span
												style="font-family:{serif}; font-size:30px; font-weight:700; letter-spacing:0.35em; color:{navy};"
											>
												{otp}
											</span>
										</td>
									</tr>
									</tbody>
								</table>

								<p style="margin:24px 0 0 0; text-align:center; font-family:{serif}; font-size:13px; line-height:1.5; color:{muted};">
									Expires in 5 minutes
								</p>
							</td>
						</tr>
						</tbody>
					</table>

					<p style="margin:20px 0 0 0; text-align:center; font-family:{serif}; font-size:12px; line-height:1.5; color:{navy}; opacity:0.7;">
						If you didn't request this, you can safely ignore this email.
					</p>
				</td>
			</tr>
			</tbody>
		</table>
	</body>
</html>
