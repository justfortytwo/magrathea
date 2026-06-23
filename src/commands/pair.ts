// pair — issue a one-time `/login` pairing code for a channel.
//
// Unlike init (which also provisions), pair is the standalone "bind another
// device/chat" verb. It mints a short-lived code; the owner sends `/login <code>`
// from the target chat, and the channel adapter confirms the binding (adding the
// chat to the allowlist and recording it in identity.json's `channels`).
//
// This is the lifecycle counterpart to `unbind`.

import type { Identity } from '../state.js';

interface PairFlags {
  /** Which channel to pair. Defaults to telegram (the only adapter at v0). */
  channel?: 'telegram' | string;
  /** Optional TTL override for the code. */
  ttlSeconds?: number;
}

export async function runPair(_argv: string[]): Promise<number> {
  // BLOCKED: dynamic /login pairing requires that an issued challenge be
  // redeemable by the SEPARATELY-RUNNING bridge. TelegramAdapter currently keeps
  // pending challenges in an in-memory Map, so a code minted by this CLI process
  // is invisible to the bridge process — cross-process pairing can't work until
  // @justfortytwo/telegram persists challenges in its store. The path that works
  // today is the static allowlist: set ALLOWED_CHAT_IDS in .env (fortytwo init
  // writes it), which the bridge authorizes against directly.
  void resolveChannel;
  process.stderr.write(
    'pair: dynamic /login pairing is not available yet (it needs cross-process ' +
    'challenge persistence in @justfortytwo/telegram). For now, authorize a chat ' +
    'by adding its id to ALLOWED_CHAT_IDS in .env.\n',
  );
  return 2;
}

function resolveChannel(_flags: PairFlags, _identity: Identity | null): string {
  return 'telegram';
}
