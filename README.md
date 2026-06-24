# @justfortytwo/installer

The all-in-one installer and lifecycle CLI for **fortytwo** — a personal
assistant built on Claude Code. One package ships two bins:

- **`create-fortytwo`** — the install-time alias; with no verb it runs `init`.
- **`fortytwo`** — the everyday lifecycle alias for the verbs below.

## Quick start

```sh
npm install @justfortytwo/installer   # in your project (or a fresh directory)
npx create-fortytwo init              # capture your details, install the engine,
                                      # and scaffold the persona
```

You only install **this** package — `init` installs the engine packages it needs
on demand (`@justfortytwo/gate`, `/memory`, `/persona`, `/telegram`). Pass
`--no-install` to manage them yourself, and `--yes` (with `--answers <file.json>`
or `FORTYTWO_*` env) for non-interactive installs.

## The two-surface model

fortytwo is delivered as **two surfaces**, and this CLI is the single
operator interface over both:

1. **The npm engine.** The reusable machinery — the memory MCP server, the
   safety gate, the channel adapters, and the local embedder — published as
   `@justfortytwo/*` packages and wired in as Claude Code plugins. This is
   shared, versioned code.
2. **The scaffolded persona.** `CLAUDE.md` + `context/*` — who the assistant is
   and who it serves. This is **not** a plugin. It is per-user, personal, and
   gitignored. The CLI **scaffolds** it by rendering the `@justfortytwo/persona`
   package's `templates/` (guided by its `manifest.json`) against your captured
   answers in `.fortytwo/identity.json`. Re-rendering is idempotent and never
   clobbers fields you've captured or hand-edited.

Secrets live only in a gitignored `.env`; your captured identity lives in the
gitignored `.fortytwo/identity.json`; neither is ever committed.

## Verbs

| Verb       | What it does |
|------------|--------------|
| `init`     | Install any missing engine packages, then capture your assistant's name + owner details (interactive, or via flags/env for CI). Writes `.fortytwo/identity.json`, secrets + `ALLOWED_CHAT_IDS` to `.env`, wires `.mcp.json`, renders the persona, provisions local infra (pulls the embedder model, migrates the memory DB), and records the installed version set. |
| `pair`     | Issue a one-time `/login` pairing code to bind another chat/device to a channel. |
| `doctor`   | Health-check the engine: assert the gate's `POLICY_SCHEMA_VERSION` and memory's `MEMORY_TOOL_CONTRACT_VERSION` match what this CLI expects, confirm the memory DB is migrated, cross-check installed sibling versions against the declared compatibility ranges, and check the embedder model is pulled (warn-only). |
| `update`   | Resolve the latest in-range version of each engine package, install, then run `doctor` to verify. On failure it points you to `rollback`. |
| `rollback` | Restore the previous version set recorded before the last `update`. |
| `enrich`   | Capture more answers to deepen the persona, then re-render (no clobber). |
| `forget`   | Redact or remove specific memories from the memory store. |
| `unbind`   | Revoke a channel binding (un-pair a chat / drop it from the allowlist). |

Run `fortytwo <verb> --help` for verb-specific options.

## Update safety

Distribution follows a **semver-ranges, latest-compatible** policy — there is no
curated bill-of-materials. `update` installs the latest in-range version of each
engine package and then runs `doctor` as a post-install health check. **Rollback
is manual**: the prior version set is recorded before every update, so
`fortytwo rollback` can restore exactly the set that was running before.

## The embedder

The engine uses a **local** embedder for privacy — personal data never leaves
your machine. The standard model is `qwen3-embedding:0.6b`, served by Ollama;
`init` pulls it and `doctor` verifies it.

## Requirements

- Node.js >= 18
- [Ollama](https://ollama.com/) for the local embedder (optional but
  recommended — the engine degrades gracefully without it)

## License

MIT © 2026 Enrico Deleo

---

Created and maintained by [**Enrico Deleo**](https://enricodeleo.com).
