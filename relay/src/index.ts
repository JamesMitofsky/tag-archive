/**
 * The Archive Stream relay. The iPad ("pad") and the projector ("screen") each
 * open a WebSocket to the same room, and every message from one side is passed
 * to the other side unchanged. It keeps no state and stores nothing.
 *
 * A Durable Object holds each room, because a WebSocket must stay with one
 * instance to reach its peers. It uses the hibernation API, so a quiet room
 * costs nothing while it waits, and it answers the clients' heartbeat ("hb")
 * itself without waking (see src/lib/installation/relay.ts).
 *
 * Only a client carrying the shared key (the RELAY_KEY secret) is let in.
 */

import { DurableObject } from 'cloudflare:workers';

type Env = {
	ROOM: DurableObjectNamespace<Room>;
	RELAY_KEY?: string;
};

type Role = 'pad' | 'screen';

const ROOM_PATH = /^\/room\/([A-Za-z0-9_-]{1,64})$/;
/** Messages are a few dozen bytes; anything much bigger isn't from our pages. */
const MAX_MESSAGE = 2048;

/** Compares without leaking, by timing, how much of the key was right. */
function sameKey(given: string, expected: string): boolean {
	const a = new TextEncoder().encode(given);
	const b = new TextEncoder().encode(expected);
	let diff = a.length ^ b.length;
	for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
	return diff === 0;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const match = ROOM_PATH.exec(url.pathname);
		if (!match) return new Response('Archive Stream relay\n', { status: 404 });
		if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
			return new Response('Expected a WebSocket\n', { status: 426 });
		}
		const role = url.searchParams.get('role');
		if (role !== 'pad' && role !== 'screen') {
			return new Response('Unknown role\n', { status: 400 });
		}
		if (!env.RELAY_KEY || !sameKey(url.searchParams.get('key') ?? '', env.RELAY_KEY)) {
			return new Response('Forbidden\n', { status: 403 });
		}
		const room = env.ROOM.get(env.ROOM.idFromName(match[1]));
		return room.fetch(request);
	}
} satisfies ExportedHandler<Env>;

export class Room extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('hb', 'hb'));
	}

	async fetch(request: Request): Promise<Response> {
		const role = new URL(request.url).searchParams.get('role') as Role;
		const { 0: client, 1: server } = new WebSocketPair();
		this.ctx.acceptWebSocket(server, [role]);
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		if (typeof message !== 'string' || message.length > MAX_MESSAGE) return;
		const [role] = this.ctx.getTags(ws);
		const other: Role = role === 'pad' ? 'screen' : 'pad';
		for (const peer of this.ctx.getWebSockets(other)) {
			try {
				peer.send(message);
			} catch {
				// A peer mid-close; it will reconnect on its own.
			}
		}
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
		try {
			ws.close(code, reason);
		} catch {
			// Already closed.
		}
	}
}
