# Archive Stream

An installation mode for the archive. A projector shows every public artefact page, photograph and
event floating as a field on water, with a fixed lens in the middle of the screen. A frosted iPad,
which shows nothing of the archive, is the only control. One finger moves the water under the lens,
and whatever drifts into the lens blooms to full size, with its title and date below it.

| Where                  | What                                                                  |
| ---------------------- | --------------------------------------------------------------------- |
| `/installation`        | The projector page.                                                   |
| `/installation/pad`    | The iPad page.                                                        |
| `relay/`               | This Cloudflare Worker, which passes messages between the two.        |
| `src/lib/installation` | The motion (`physics.ts`), the layout (`field.ts`) and the transport. |

## Why a relay

Vercel can't hold a WebSocket open, and an iPhone's Personal Hotspot is reported to stop the devices
on it from reaching each other directly. So both pages connect _out_ to this Worker, which forwards
every message from the iPad to the projector and the focus color back. It stores nothing. A Durable
Object holds each room, using the hibernation API, so an idle room costs nothing, and it answers
the clients' `hb` heartbeat without waking up. That heartbeat is how a silently dead cellular
socket gets noticed and replaced within about 8 seconds.

Over a phone hotspot, expect a 60–150 ms round trip. The projector never applies a touch raw: each
drag moves a target that the field follows on a spring, so bunched packets read as the water's
viscosity rather than as stutter.

## Deploy (once)

From `relay/`, using the wrangler the site already depends on:

```bash
../node_modules/.bin/wrangler login
```

```bash
openssl rand -hex 16
```

```bash
../node_modules/.bin/wrangler secret put RELAY_KEY
```

Paste the random value when asked; this is the key both pages carry.

```bash
../node_modules/.bin/wrangler deploy
```

It prints the Worker's address, e.g. `https://archive-stream-relay.<account>.workers.dev`. In Vercel,
set `PUBLIC_INSTALLATION_RELAY_URL` to that address with `wss://` in place of `https://`, then
redeploy. You can also skip that and pass `?relay=wss://…` to both pages.

The Durable Object uses SQLite-backed storage (`new_sqlite_classes`), which Cloudflare's free plan
allows.

## On the night

Both pages sit behind the access gate. Open each once with a pass, through the door or a keeper
sign-in, and add `?key=<RELAY_KEY>`. The key, relay and room are remembered on each device, so
later visits don't need them in the URL.

**Projector laptop.** Open `https://<site>/installation?key=<RELAY_KEY>` in Chrome. For a chrome-less
window, quit Chrome and start it in kiosk mode:

```bash
open -a "Google Chrome" --args --kiosk "https://<site>/installation"
```

- Press `d` for the operator overlay (connection, round trip, frame rate) and `f` for fullscreen.
- A mouse drag on the laptop also moves the field, as a fallback if the iPad's connection drops.

**iPad.** Open `https://<site>/installation/pad?key=<RELAY_KEY>` in Safari. Then turn on Guided
Access (Settings › Accessibility › Guided Access), triple-click the top button, and circle Safari's
toolbar so it ignores touches. A Home Screen icon also works, but a Home Screen web app keeps its own
cookies, so it needs its own pass and can't be reopened through the door if it's ever closed.

The iPad's corner shows a small red mark only while it is disconnected.

Neither page goes to the locked page if its pass lapses mid-evening (see `KEEPS_WORK_WHEN_LOCKED`).
The projector keeps the archive it loaded at the start.

## Tuning

The feel lives in `TUNING` in `src/lib/installation/physics.ts`: gain, glide half-life, the magnet,
and the idle current. `?gain=` on the projector's URL overrides the gain without a deploy. The lens
size, bloom size and density are constants at the top of `src/routes/installation/+page.svelte` and
in `layoutField`.

## Locally

From `relay/`:

```bash
printf 'RELAY_KEY=localtest\n' > .dev.vars
```

```bash
../node_modules/.bin/wrangler dev --port 8787
```

Then run the site with `PUBLIC_INSTALLATION_RELAY_URL=ws://127.0.0.1:8787` and open both pages with
`?key=localtest`.

For a local network instead of a hotspot (a travel router, or Mac Internet Sharing), run the relay
with `wrangler dev --ip 0.0.0.0` on the laptop and serve the site with `pnpm dev --host`. Open both
pages over plain `http`, because an `https` page can't open a `ws://` socket on the local network,
and pass `?relay=ws://<laptop>.local:8787`.
