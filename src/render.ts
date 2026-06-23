// render.ts — materialize the PERSONA SURFACE.
//
// Two-surface model:
//   1. The npm "engine" (guide MCP, safety gate, channel adapters, embedder) —
//      installed as @justfortytwo/* packages, wired as Claude Code plugins.
//   2. The PERSONA — CLAUDE.md + context/* . This is NOT a plugin. It is per-user,
//      gitignored, and personal. The CLI SCAFFOLDS it by rendering the
//      @justfortytwo/ford package's `templates/` against the user's captured
//      `.fortytwo/identity.json`, guided by that package's manifest.
//
// IDEMPOTENCE CONTRACT: re-rendering must NOT clobber captured fields. A user who
// hand-edits context/SOUL.md after init keeps those edits on the next
// `update`/`enrich` re-render. Strategy: MANAGED outputs are (re)written every
// run; CAPTURED outputs are written only on first render (when absent).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import type { Identity } from './state.js';

/** Maps each persona template to an output path + render mode. */
export interface PersonaFile {
  /** Template path, relative to the persona package's templates dir. */
  template: string;
  /** Output path, relative to the project root. */
  output: string;
  /** CAPTURED = write-once (user-owned after); MANAGED = re-render every run. */
  mode: 'captured' | 'managed';
}

/** Mirrors @justfortytwo/ford's persona manifest (the file map + var declarations). */
export interface PersonaManifest {
  manifestVersion: number;
  files: PersonaFile[];
  requiredVars: string[];
  optionalVars?: string[];
}

export interface RenderOptions {
  /** Project root that receives CLAUDE.md + context/*. Defaults to cwd. */
  root?: string;
  /** Resolved location of the @justfortytwo/ford package (for loadPersonaManifest). */
  personaPackageDir?: string;
  /** If true, report what WOULD be written without touching disk. */
  dryRun?: boolean;
  /** Injected file map (hermetic/testable; bypasses loadPersonaManifest). */
  files?: PersonaFile[];
  /** Directory the `template` paths are resolved against. */
  templatesDir?: string;
}

export interface RenderResult {
  written: string[];
  skipped: string[]; // captured outputs left untouched because they already exist
}

/** Resolve a dotted path (e.g. `owner.name`) into the identity object. */
function getPath(obj: unknown, path: string): unknown {
  // own-property only: a template `{{toString}}` / `{{__proto__}}` must hit the
  // fail-loud path, not resolve a prototype member into the rendered persona.
  return path.split('.').reduce<unknown>(
    (acc, key) =>
      acc && typeof acc === 'object' && Object.prototype.hasOwnProperty.call(acc, key)
        ? (acc as Record<string, unknown>)[key]
        : undefined,
    obj,
  );
}

/**
 * Substitute `{{dotted.var}}` references with identity values. Fails LOUDLY on a
 * referenced variable that's missing/null — a half-filled persona (empty owner
 * name, blank agent name) is worse than a clear error at scaffold time.
 */
export function renderTemplate(template: string, identity: Identity): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const v = getPath(identity, path);
    if (v === undefined || v === null) {
      throw new Error(`renderTemplate: missing required variable {{${path}}} in identity`);
    }
    return Array.isArray(v) ? v.join(', ') : String(v);
  });
}

/**
 * Locate the installed @justfortytwo/ford package and read its manifest.
 * TODO(wire): resolve via createRequire(import.meta.url).resolve(
 *   '@justfortytwo/ford/manifest.json') so we honor the user's installed
 *   version. Note: ford currently ships a *field* manifest (the init prompts);
 *   reconcile it to also carry the `files` map this renderer needs, or derive
 *   the file map by scanning the package's templates dir.
 */
export function loadPersonaManifest(_personaPackageDir?: string): PersonaManifest {
  throw new Error('TODO(wire): loadPersonaManifest — resolve @justfortytwo/ford and read its file map');
}

/**
 * Render the whole persona surface. Idempotent and non-clobbering:
 *   - MANAGED outputs: always (re)written from templates.
 *   - CAPTURED outputs: written only if they don't already exist; if present,
 *     left exactly as the user edited them (recorded in `skipped`).
 */
export function renderPersona(identity: Identity, opts: RenderOptions = {}): RenderResult {
  const root = resolve(opts.root ?? process.cwd());
  const files = opts.files ?? loadPersonaManifest(opts.personaPackageDir).files;
  if (!opts.templatesDir) {
    throw new Error('renderPersona: templatesDir is required (or wire loadPersonaManifest)');
  }
  const tplRoot = resolve(opts.templatesDir);
  const written: string[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    // Defense-in-depth: even though the manifest ships in the trusted ford
    // package, never let an output/template path escape its root via `..`.
    const outPath = resolve(root, f.output);
    if (outPath !== root && !outPath.startsWith(root + sep)) {
      throw new Error(`renderPersona: output path escapes project root: ${f.output}`);
    }
    if (f.mode === 'captured' && existsSync(outPath)) {
      skipped.push(f.output);
      continue;
    }
    const tplPath = resolve(tplRoot, f.template);
    if (!tplPath.startsWith(tplRoot + sep)) {
      throw new Error(`renderPersona: template path escapes templates dir: ${f.template}`);
    }
    const rendered = renderTemplate(readFileSync(tplPath, 'utf8'), identity);
    if (!opts.dryRun) {
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, rendered, 'utf8');
    }
    written.push(f.output);
  }
  return { written, skipped };
}
