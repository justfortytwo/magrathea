// forget — redact/remove specific memories from the memory MCP store.
//
// The data-hygiene verb: the owner asks the assistant to forget something
// (a person, a topic, a date range, a specific entry). This is a privileged
// operation against the canonical memory store, distinct from the assistant's
// own turn-time memory writes.

export async function runForget(_argv: string[]): Promise<number> {
  // BLOCKED: forget needs a deletion/redaction surface on @justfortytwo/memory
  // (delete from the store AND the derived FTS + embedding indexes so recall
  // can't resurface a removed entry). The memory package does not expose one
  // yet, so this command cannot honor a forget request safely. When that API
  // lands, wire selectors here: --id, --query (semantic match + confirm),
  // --since/--until (range), --entity, with a confirmation summary + --yes.
  process.stderr.write(
    'forget: not yet available — it requires a deletion/redaction API in ' +
    '@justfortytwo/memory (not implemented). Until then, no command can remove ' +
    'stored memories; do not assume a forget succeeded.\n',
  );
  return 2;
}
