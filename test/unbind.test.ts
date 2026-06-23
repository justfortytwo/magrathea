import { describe, it, expect } from 'vitest';
import { pruneChannels } from '../src/commands/unbind.js';
import type { ChannelBinding } from '../src/state.js';

const ch = (over: Partial<ChannelBinding> = {}): ChannelBinding => ({ channel: 'telegram', allowedChatIds: ['42'], ...over });

describe('pruneChannels', () => {
  it('removes the binding that holds a given chatId', () => {
    const channels = [ch({ allowedChatIds: ['42'] }), ch({ allowedChatIds: ['99'] })];
    const { kept, removed } = pruneChannels(channels, { chatId: '42' });
    expect(removed).toHaveLength(1);
    expect(kept).toEqual([ch({ allowedChatIds: ['99'] })]);
  });

  it('removes every binding for a channel with all=true', () => {
    const channels = [ch({ allowedChatIds: ['42'] }), ch({ allowedChatIds: ['99'] })];
    const { kept, removed } = pruneChannels(channels, { all: true, channel: 'telegram' });
    expect(removed).toHaveLength(2);
    expect(kept).toEqual([]);
  });

  it('leaves bindings for other channels untouched', () => {
    const channels = [ch({ channel: 'telegram', allowedChatIds: ['42'] }), ch({ channel: 'slack', allowedChatIds: ['42'] })];
    const { kept, removed } = pruneChannels(channels, { channel: 'telegram', chatId: '42' });
    expect(removed).toHaveLength(1);
    expect(kept).toEqual([ch({ channel: 'slack', allowedChatIds: ['42'] })]);
  });

  it('returns no removals when nothing matches', () => {
    const channels = [ch({ allowedChatIds: ['42'] })];
    const { kept, removed } = pruneChannels(channels, { chatId: 'nope' });
    expect(removed).toHaveLength(0);
    expect(kept).toEqual(channels);
  });
});
