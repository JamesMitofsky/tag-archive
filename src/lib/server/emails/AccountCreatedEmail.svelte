<script lang="ts">
	// Sent when an admin creates a Cloud Keeper account for someone. Mirrors
	// OtpEmail's inline, table-based, email-safe styling (clients strip <style>
	// blocks and don't grok Tailwind/oklch, so the theme is hand-translated to
	// hex/table layout). This app is passwordless — there's nothing to accept; the
	// recipient signs in whenever they like via an emailed one-time code.
	//
	// `logoUrl` is an absolute URL to the handwritten wordmark PNG (built from
	// env.ORIGIN at the call site). Email clients can't resolve relative paths, so
	// the header image must be fully-qualified.
	let { signInUrl, logoUrl }: { signInUrl: string; logoUrl: string } = $props();

	// Landing-page palette (layout.css / Sky.svelte tokens → email-safe hex).
	const sky = '#8ecbe6'; // Sky.svelte watercolor-paper backdrop
	const muted = '#757575'; // --muted-foreground
	const primaryBorder = '#a7d8ea'; // --primary

	// Frosted pill button, mirroring the site's BackButton (rounded-full, subtle
	// border, translucent-white fill, gray-700 text, soft shadow). The site's
	// backdrop-blur/alpha don't survive email clients or read on a white card, so
	// the translucent-over-sky look is hand-baked to opaque email-safe hex.
	const btnText = '#374151'; // Tailwind gray-700 (BackButton text)
	const btnBg = '#eef7fb'; // white/25 frost over the sky palette, flattened

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
			An account has been created for this email — sign in.
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

								<p style="margin:0 0 24px 0; font-family:{serif}; font-size:15px; line-height:1.5; color:{muted};">
									An account has been created for this email
								</p>

								<!-- Sign-in button: centered frosted pill, matching the site's BackButton. -->
								<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
									<tbody>
									<tr>
										<td align="center">
											<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
												<tbody>
												<tr>
													<td align="center" style="border-radius:9999px; background-color:{btnBg};">
														<a
															href={signInUrl}
															style="display:inline-block; padding:12px 24px; font-family:{serif}; font-size:22px; font-weight:600; color:{btnText}; text-decoration:none; border:1px solid {primaryBorder}; border-radius:9999px; box-shadow:0 1px 2px rgba(0,0,0,0.06);"
														>
															Sign in&nbsp;&rarr;
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
				</td>
			</tr>
			</tbody>
		</table>
	</body>
</html>
