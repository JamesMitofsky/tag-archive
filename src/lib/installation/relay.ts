/**
 * The line between the iPad and the projector: a WebSocket each, to a small
 * relay (the Cloudflare Worker in relay/) that passes every message from one
 * side to the other. Both devices only ever connect outward, so it works on a
 * phone hotspot, which keeps the devices on it from reaching each other
 * directly.
 *
 * Built to be left running for a whole evening on a cellular connection: it
 * reconnects with backoff, and a heartbeat the relay answers by itself spots a
 * socket that has silently died (which, on cellular, is how sockets die)
 * rather than waiting for the browser to notice.
 *
 * Where the relay is comes from the page's URL (`?relay=…&room=…&key=…`),
 * remembered on the device so a later visit needs none of it, or from
 * PUBLIC_INSTALLATION_RELAY_URL. The same pages can point at a relay on the
 * laptop (`wrangler dev`) when a local network is set up instead.
 */

export type Role = 'pad' | 'screen';

/** What the iPad sends. Distances are the iPad's CSS px; velocities px/s. */
export type PadMessage =
	{ t: 'down' } | { t: 'd'; dx: number; dy: number } | { t: 'up'; vx: number; vy: number };

/** What the projector sends back: the color of what is in focus, for the iPad's glow. */
export type ScreenMessage = { t: 'focus'; rgb: [number, number, number] | null };

/** Either side measuring the round trip to the other. */
type PeerControl = { t: 'ping'; ts: number } | { t: 'pong'; ts: number };

export type RelayMessage = PadMessage | ScreenMessage;

export type RelayState = 'connecting' | 'open' | 'closed';

export type RelayConfig = { url: string; room: string; key: string };

/** The relay answers this itself, without waking (see relay/src/index.ts). */
export const HEARTBEAT = 'hb';
const HEARTBEAT_EVERY_MS = 3000;
/** No heartbeat back for this long and the socket is taken for dead. */
const HEARTBEAT_TIMEOUT_MS = 8000;
const PING_EVERY_MS = 2000;
/** The peer counts as present while its pongs are this recent. */
const PEER_TIMEOUT_MS = 6000;
const BACKOFF_MS = [250, 500, 1000, 2000, 4000];

const STORAGE_PREFIX = 'archive-stream:';
const FIELDS = ['relay', 'room', 'key'] as const;

function store(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

/**
 * The relay to use: from the URL when it says (and then remembered on this
 * device), else what this device remembers, else `fallbackUrl`. Null when
 * there's no relay URL or key to go on.
 */
export function readRelayConfig(
	search: Pick<URLSearchParams, 'get'>,
	fallbackUrl?: string
): RelayConfig | null {
	const storage = store();
	const value: Record<(typeof FIELDS)[number], string | null> = {
		relay: null,
		room: null,
		key: null
	};
	for (const field of FIELDS) {
		const given = search.get(field);
		if (given) {
			value[field] = given;
			try {
				storage?.setItem(STORAGE_PREFIX + field, given);
			} catch {
				// Private browsing: it simply won't be remembered.
			}
		} else {
			try {
				value[field] = storage?.getItem(STORAGE_PREFIX + field) ?? null;
			} catch {
				value[field] = null;
			}
		}
	}
	const url = value.relay || fallbackUrl;
	if (!url || !value.key) return null;
	return { url: url.replace(/\/+$/, ''), room: value.room || 'main', key: value.key };
}

export function relaySocketUrl(config: RelayConfig, role: Role): string {
	const base = config.url.replace(/^http/, 'ws');
	const query = new URLSearchParams({ role, key: config.key });
	return `${base}/room/${encodeURIComponent(config.room)}?${query}`;
}

export type RelayStatus = {
	state: RelayState;
	/** The last round trip to the other device (ms), or null before the first. */
	rtt: number | null;
	/** Whether the other device has answered recently. */
	peer: boolean;
	/** Messages received in the last second. */
	rate: number;
};

export type Relay = {
	send(message: RelayMessage): void;
	close(): void;
};

export function connectRelay(options: {
	config: RelayConfig;
	role: Role;
	onMessage: (message: RelayMessage) => void;
	onStatus?: (status: RelayStatus) => void;
}): Relay {
	const { config, role, onMessage, onStatus } = options;
	let socket: WebSocket | null = null;
	let closed = false;
	let attempt = 0;
	let lastHeartbeat = 0;
	let lastPeer = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	const status: RelayStatus = { state: 'connecting', rtt: null, peer: false, rate: 0 };
	let received = 0;

	const report = () => onStatus?.({ ...status });

	const sendRaw = (data: string) => {
		if (socket?.readyState === WebSocket.OPEN) socket.send(data);
	};

	const open = () => {
		if (closed) return;
		status.state = 'connecting';
		report();
		const ws = new WebSocket(relaySocketUrl(config, role));
		socket = ws;
		ws.onopen = () => {
			attempt = 0;
			lastHeartbeat = performance.now();
			status.state = 'open';
			report();
		};
		ws.onmessage = (event) => {
			if (typeof event.data !== 'string') return;
			if (event.data === HEARTBEAT) {
				lastHeartbeat = performance.now();
				return;
			}
			let message: RelayMessage | PeerControl;
			try {
				message = JSON.parse(event.data);
			} catch {
				return;
			}
			received++;
			if (message.t === 'ping') {
				sendRaw(JSON.stringify({ t: 'pong', ts: message.ts } satisfies PeerControl));
			} else if (message.t === 'pong') {
				lastPeer = performance.now();
				status.rtt = Math.round(performance.now() - message.ts);
				status.peer = true;
			} else {
				lastPeer = performance.now();
				onMessage(message);
			}
		};
		ws.onclose = () => {
			if (socket !== ws) return;
			socket = null;
			status.state = 'closed';
			status.peer = false;
			report();
			if (closed) return;
			const wait = BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)];
			reconnectTimer = setTimeout(open, wait);
		};
		// An error is always followed by a close, which reconnects.
		ws.onerror = () => {};
	};

	const heartbeat = setInterval(() => {
		if (socket?.readyState !== WebSocket.OPEN) return;
		if (performance.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
			// Dead without saying so: drop it and start again.
			const dead = socket;
			socket = null;
			dead.onclose = null;
			dead.close();
			status.state = 'closed';
			status.peer = false;
			report();
			open();
			return;
		}
		sendRaw(HEARTBEAT);
	}, HEARTBEAT_EVERY_MS);

	const ping = setInterval(() => {
		sendRaw(JSON.stringify({ t: 'ping', ts: performance.now() } satisfies PeerControl));
		status.peer = performance.now() - lastPeer < PEER_TIMEOUT_MS;
		status.rate = Math.round((received * 1000) / PING_EVERY_MS);
		received = 0;
		report();
	}, PING_EVERY_MS);

	open();

	return {
		send(message) {
			sendRaw(JSON.stringify(message));
		},
		close() {
			closed = true;
			clearInterval(heartbeat);
			clearInterval(ping);
			clearTimeout(reconnectTimer);
			socket?.close();
			socket = null;
		}
	};
}
