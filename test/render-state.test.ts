import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderTemplate, renderPersona, type PersonaFile } from '../src/render.js';
import { writeIdentity, readIdentity, recordVersionSet, readState, type Identity, type VersionPin } from '../src/state.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'mg-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const identity = (over: Partial<Identity> = {}): Identity => ({
  identityVersion: 1, agentName: 'Aria', owner: { name: 'Alice', timezone: 'Europe/Lisbon' },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
});

function templatesDir(): string {
  const t = mkdtempSync(join(tmpdir(), 'mg-tpl-'));
  writeFileSync(join(t, 'CLAUDE.md.tmpl'), '# {{agentName}}');
  writeFileSync(join(t, 'OWNER.md.tmpl'), 'owner: {{owner.name}}');
  return t;
}
const files: PersonaFile[] = [
  { template: 'CLAUDE.md.tmpl', output: 'CLAUDE.md', mode: 'managed' },
  { template: 'OWNER.md.tmpl', output: 'context/OWNER.md', mode: 'captured' },
];

describe('renderTemplate', () => {
  it('substitutes dotted identity paths', () => {
    expect(renderTemplate('{{agentName}} serves {{owner.name}} in {{owner.timezone}}', identity()))
      .toBe('Aria serves Alice in Europe/Lisbon');
  });
  it('fails loudly on a missing required variable (no half-filled persona)', () => {
    expect(() => renderTemplate('hi {{owner.nope}}', identity())).toThrow(/missing required variable/);
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
    const r2 = renderPersona(identity({ agentName: 'Nova' }), { root: dir, files, templatesDir: tpl });
    expect(r2.skipped).toEqual(['context/OWNER.md']);
    expect(readFileSync(join(dir, 'context/OWNER.md'), 'utf8')).toBe('HAND EDITED');  // preserved
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('# Nova');            // managed refreshed
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

describe('state', () => {
  it('writeIdentity stamps updatedAt and preserves createdAt across writes', () => {
    writeIdentity(identity({ createdAt: '2020-01-01T00:00:00.000Z' }), dir);
    const a = readIdentity(dir)!;
    expect(a.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(a.updatedAt).not.toBe('2026-01-01T00:00:00.000Z'); // re-stamped
    writeIdentity({ ...a, agentName: 'Nova' }, dir);
    const b = readIdentity(dir)!;
    expect(b.createdAt).toBe('2020-01-01T00:00:00.000Z');     // preserved
    expect(b.agentName).toBe('Nova');
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
