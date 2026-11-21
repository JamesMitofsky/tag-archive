<script lang="ts">
	// Sent when an admin creates a Cloud Keeper account for someone. Mirrors
	// OtpEmail's inline, table-based, email-safe styling (clients strip <style>
	// blocks and don't grok Tailwind/oklch, so the theme is hand-translated to
	// hex/table layout). This app is passwordless — there's nothing to accept; the
	// recipient signs in whenever they like via an emailed one-time code.
	//
	// `logoSrc` is the handwritten wordmark's `<img src>`: `cid:…` in a sent email,
	// where the PNG travels as an inline attachment (see ../email.ts), and a data
	// URI in the dev gallery, which renders in a browser.
	let { signInUrl, logoSrc }: { signInUrl: string; logoSrc: string } = $props();

	// Landing-page palette (layout.css / Sky.svelte tokens → email-safe hex).
	// Everything sits straight on the sky, so every line of text is navy: it
	// reads at 7.4:1 there, where the site's gray muted text manages only 2.6:1.
	const sky = '#8ecbe6'; // Sky.svelte watercolor-paper backdrop
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
			An account has been created for this email — sign in.
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
											style="display:block; width:280px; max-width:100%; height:auto; margin:0 auto 28px auto; border:0;"
										/>

										<p
											style="margin:0 0 24px 0; text-align:center; font-family:{serif}; font-size:17px; line-height:1.5; color:{navy};"
										>
											An account has been created for this email
										</p>

										<!-- Sign-in button: a white pill on the sky, the same slip as the
										     code well in OtpEmail. -->
										<table
											role="presentation"
											align="center"
											cellpadding="0"
											cellspacing="0"
											style="margin:0 auto;"
										>
											<tbody>
												<tr>
													<td
														align="center"
														style="border-radius:9999px; background-color:#ffffff; box-shadow:0 6px 18px rgba(34,48,74,0.14);"
													>
														<a
															href={signInUrl}
															style="display:inline-block; padding:12px 28px; font-family:{serif}; font-size:22px; font-weight:600; color:{navy}; text-decoration:none; border-radius:9999px;"
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
	</body>
</html>
