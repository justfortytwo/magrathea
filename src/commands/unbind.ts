// unbind — revoke a channel binding (the inverse of `pair`).
//
// Removes the binding from identity.json's `channels`. The actual authorization
// today is the static ALLOWED_CHAT_IDS in .env, so unbind also reminds the owner
// to drop the id there. (Server-side challenge revocation is N/A until dynamic
// pairing lands in the channel adapter — see pair.ts.)

import { readIdentity, writeIdentity, type ChannelBinding } from '../state.js';

interface UnbindFlags {
  channel?: string;
  chatId?: string;
  all?: boolean;
}

/**
 * Pure prune: drop bindings matching the selector. With `all`, drop every
 * binding for the (optional) channel; otherwise drop bindings whose
 * allowedChatIds include `chatId`. Bindings for other channels are untouched.
 */
export function pruneChannels(
  channels: ChannelBinding[],
  sel: { channel?: string; chatId?: string; all?: boolean },
): { kept: ChannelBinding[]; removed: ChannelBinding[] } {
  const removed: ChannelBinding[] = [];
  const kept = channels.filter((c) => {
    if (sel.channel && c.channel !== sel.channel) return true;
    const match = sel.all === true || (sel.chatId != null && (c.allowedChatIds ?? []).includes(sel.chatId));
    if (match) { removed.push(c); return false; }
    return true;
  });
  return { kept, removed };
}

function parseUnbindArgs(argv: string[]): UnbindFlags {
  const flags: UnbindFlags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === '--all') flags.all = true;
    else if (a === '--channel') flags.channel = argv[++i];
    else if (a === '--chat-id') flags.chatId = argv[++i];
  }
  return flags;
}

export async function runUnbind(argv: string[]): Promise<number> {
  const root = process.cwd();
  const flags = parseUnbindArgs(argv);
  const identity = readIdentity(root);
  if (!identity) {
    process.stderr.write('unbind: no .fortytwo/identity.json — run `fortytwo init` first.\n');
    return 2;
  }
  if (!flags.all && !flags.chatId) {
    process.stderr.write('unbind: specify --chat-id <id> or --all (optionally --channel <name>).\n');
    return 2;
  }
  const { kept, removed } = pruneChannels(identity.channels ?? [], flags);
  if (removed.length === 0) {
    process.stdout.write('unbind: no matching binding found; nothing changed.\n');
    return 0;
  }
  writeIdentity({ ...identity, channels: kept }, root);
  const ids = removed.flatMap((c) => c.allowedChatIds ?? []);
  process.stdout.write(`✓ removed ${removed.length} binding(s) from identity.json\n`);
  if (ids.length) {
    process.stdout.write(`  Also remove ${ids.join(', ')} from ALLOWED_CHAT_IDS in .env to fully revoke access.\n`);
  }
  return 0;
}
