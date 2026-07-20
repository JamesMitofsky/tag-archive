<script lang="ts">
	// Sent when an admin creates a Cloud Keeper account for someone. Mirrors
	// OtpEmail's inline, table-based, email-safe styling (clients strip <style>
	// blocks and don't grok Tailwind/oklch, so the theme is hand-translated to
	// hex/table layout). This app is passwordless — there's nothing to accept; the
	// recipient signs in whenever they like via an emailed one-time code.
	let { signInUrl }: { signInUrl: string } = $props();

	// Landing-page palette (layout.css / Sky.svelte tokens → email-safe hex).
	const sky = '#8ecbe6'; // Sky.svelte watercolor-paper backdrop
	const ink = '#2b2b2b'; // --foreground
	const muted = '#757575'; // --muted-foreground
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
		<title>Your TAG Archive account is ready</title>
	</head>
	<body style="margin:0; padding:0; background-color:{sky}; font-family:{serif};">
		<!-- Preheader: inbox preview text, visually hidden. -->
		<div
			style="display:none; overflow:hidden; line-height:1px; max-height:0; max-width:0; opacity:0;"
		>
			An account has been created for you — sign in with an email code.
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
									An account has been created for you. Sign in with an email code:
								</p>

								<!-- Sign-in button -->
								<table role="presentation" cellpadding="0" cellspacing="0">
									<tbody>
									<tr>
										<td align="center" style="border-radius:8px; background-color:{navy};">
											<a
												href={signInUrl}
												style="display:inline-block; padding:12px 28px; font-family:{serif}; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border:1px solid {primaryBorder}; border-radius:8px;"
											>
												Sign in
											</a>
										</td>
									</tr>
									</tbody>
								</table>
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
