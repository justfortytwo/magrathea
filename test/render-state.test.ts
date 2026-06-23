import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderTemplate, renderPersona, loadPersonaManifest,
  type PersonaFile,
} from '../src/render.js';
import {
  writeIdentity, readIdentity, recordVersionSet, readState,
  type Identity, type Answers, type VersionPin,
} from '../src/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERSONA_DIR = resolve(__dirname, '../../persona'); // sibling package in the monorepo layout

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ft-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

// Identity is a flat answers map keyed by the persona manifest field keys
// (snake_case) — exactly the {{tokens}} the templates use.
const identity = (answers: Answers = {}, over: Partial<Identity> = {}): Identity => ({
  identityVersion: 1,
  answers: { agent_name: 'Aria', owner_name: 'Alice', owner_timezone: 'Europe/Lisbon', ...answers },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
});

function templatesDir(): string {
  const t = mkdtempSync(join(tmpdir(), 'ft-tpl-'));
  writeFileSync(join(t, 'CLAUDE.md.tmpl'), '# {{agent_name}}');
  writeFileSync(join(t, 'OWNER.md.tmpl'), 'owner: {{owner_name}}');
  return t;
}
const files: PersonaFile[] = [
  { template: 'CLAUDE.md.tmpl', output: 'CLAUDE.md', mode: 'managed' },
  { template: 'OWNER.md.tmpl', output: 'context/OWNER.md', mode: 'captured' },
];

describe('renderTemplate', () => {
  it('substitutes flat snake_case answer keys', () => {
    expect(renderTemplate('{{agent_name}} serves {{owner_name}} in {{owner_timezone}}', identity().answers))
      .toBe('Aria serves Alice in Europe/Lisbon');
  });
  it('renders a list value as bullet continuation (slots after a leading "- ")', () => {
    expect(renderTemplate('- {{owner_values}}', { owner_values: ['curiosity', 'rigor', 'candor'] }))
      .toBe('- curiosity\n- rigor\n- candor');
  });
  it('fails loudly on a missing required variable (no half-filled persona)', () => {
    expect(() => renderTemplate('hi {{owner_nope}}', identity().answers)).toThrow(/missing required variable/);
  });
});

describe('renderPersona — idempotent, non-clobbering', () => {
  it('renders managed + captured outputs on first run', () => {
    const tpl = templatesDir();
    const r = renderPersona(identity(), { root: dir, files, templatesDir: tpl });
    expect(r.written.sort()).toEqual(['CLAUDE.md', 'context/OWNER.md']);
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('# Aria');
    expect(readFileSync(join(dir, 'context/OWNER.md'), 'utf8')).toBe('owner: Alice');
    rmSync(tpl, { recursive: true, force: true });
  });

  it('re-render refreshes MANAGED but never clobbers a CAPTURED edit', () => {
    const tpl = templatesDir();
    renderPersona(identity(), { root: dir, files, templatesDir: tpl });
    writeFileSync(join(dir, 'context/OWNER.md'), 'HAND EDITED'); // user owns the captured output
    const r2 = renderPersona(identity({ agent_name: 'Nova' }), { root: dir, files, templatesDir: tpl });
    expect(r2.skipped).toEqual(['context/OWNER.md']);
    expect(readFileSync(join(dir, 'context/OWNER.md'), 'utf8')).toBe('HAND EDITED');  // preserved
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('# Nova');              // managed refreshed
    rmSync(tpl, { recursive: true, force: true });
  });

  it('dryRun writes nothing but reports the plan', () => {
    const tpl = templatesDir();
    const r = renderPersona(identity(), { root: dir, files, templatesDir: tpl, dryRun: true });
    expect(r.written.length).toBe(2);
    expect(() => readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toThrow();
    rmSync(tpl, { recursive: true, force: true });
  });

  it('rejects an output path that escapes the project root (no traversal)', () => {
    const tpl = templatesDir();
    expect(() => renderPersona(identity(), {
      root: dir, templatesDir: tpl,
      files: [{ template: 'CLAUDE.md.tmpl', output: '../escape.md', mode: 'managed' }],
    })).toThrow(/escapes project root/);
    rmSync(tpl, { recursive: true, force: true });
  });
});

describe('loadPersonaManifest', () => {
  it('reads files + derives required/optional vars + templatesDir from a package dir', () => {
    const pkg = mkdtempSync(join(tmpdir(), 'ft-pkg-'));
    mkdirSync(join(pkg, 'templates'), { recursive: true });
    writeFileSync(join(pkg, 'manifest.json'), JSON.stringify({
      manifestVersion: 1,
      files: [{ template: 'CLAUDE.md.tmpl', output: 'CLAUDE.md', mode: 'managed' }],
      fields: [
        { key: 'agent_name', prompt: 'p', type: 'string', required: true },
        { key: 'owner_bio_short', prompt: 'p', type: 'text', required: false },
      ],
    }));
    const m = loadPersonaManifest(pkg);
    expect(m.files).toHaveLength(1);
    expect(m.requiredVars).toContain('agent_name');
    expect(m.optionalVars).toContain('owner_bio_short');
    expect(m.templatesDir).toBe(join(pkg, 'templates'));
    rmSync(pkg, { recursive: true, force: true });
  });

  // The real contract: the installer must render the SHIPPED persona templates
  // against a complete answers map with zero missing-variable failures. This is
  // the end-to-end proof that manifest, templates, and renderer agree.
  it('renders the real @justfortytwo/persona templates end-to-end', () => {
    const m = loadPersonaManifest(PERSONA_DIR);
    expect(m.files.length).toBeGreaterThan(0);
    const allKeys = [...m.requiredVars, ...m.optionalVars];
    const answers: Answers = Object.fromEntries(allKeys.map((k) => [k, `val-${k}`]));
    const r = renderPersona(identity(answers), { root: dir, personaPackageDir: PERSONA_DIR });
    expect(r.written.length + r.skipped.length).toBe(m.files.length);
    for (const w of r.written) expect(existsSync(join(dir, w))).toBe(true);
  });
});

describe('state', () => {
  it('writeIdentity stamps updatedAt and preserves createdAt across writes', () => {
    writeIdentity(identity({}, { createdAt: '2020-01-01T00:00:00.000Z' }), dir);
    const a = readIdentity(dir)!;
    expect(a.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(a.updatedAt).not.toBe('2026-01-01T00:00:00.000Z'); // re-stamped
    writeIdentity({ ...a, answers: { ...a.answers, agent_name: 'Nova' } }, dir);
    const b = readIdentity(dir)!;
    expect(b.createdAt).toBe('2020-01-01T00:00:00.000Z');     // preserved
    expect(b.answers.agent_name).toBe('Nova');
  });

  it('recordVersionSet rotates current -> previous so rollback has a target', () => {
    const v1: VersionPin[] = [{ name: '@justfortytwo/memory', range: '^0.1.0', resolved: '0.1.0' }];
    const v2: VersionPin[] = [{ name: '@justfortytwo/memory', range: '^0.1.0', resolved: '0.1.1' }];
    recordVersionSet(v1, dir);
    expect(readState(dir)!.previous).toBeNull();   // first install
    recordVersionSet(v2, dir);
    const s = readState(dir)!;
    expect(s.current).toEqual(v2);
    expect(s.previous).toEqual(v1);                // the rollback target
  });

  it('does not burn the rollback target when the same set is recorded twice', () => {
    const v1: VersionPin[] = [{ name: '@justfortytwo/memory', range: '^0.1.0', resolved: '0.1.0' }];
    recordVersionSet(v1, dir);
    recordVersionSet(v1, dir); // identical re-record (e.g. re-running `update`)
    expect(readState(dir)!.previous).toBeNull(); // previous NOT overwritten with v1
  });
});
