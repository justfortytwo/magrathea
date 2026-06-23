// rollback — restore the prior version set after a bad update.
//
// The counterpart to `update`'s manual-rollback safety model. update records the
// pre-upgrade set into state.json's `previous`; rollback re-installs exactly that
// set and rotates the ledger back. This is the ONLY safety net under the
// "latest-compatible, no bill-of-materials" policy: there's no canonical "known
// good" list except what we captured at the last successful install.

import { readState, recordVersionSet } from '../state.js';
import { runDoctorChecks } from './doctor.js';

export async function runRollback(_argv: string[]): Promise<number> {
  // TODO(impl):
  // Real local validation of the rollback ledger.
  const state = readState();
  if (!state) {
    process.stderr.write('rollback: nothing to roll back — run `fortytwo init` first.\n');
    return 2;
  }
  if (!state.previous) {
    process.stderr.write('rollback: no prior version set recorded (only one install so far, or already rolled back).\n');
    return 2;
  }
  // BLOCKED: the actual re-install of the previous set needs the npm registry
  // (same blocker as `update`). The ledger is valid and the target is known —
  // we just can't fetch the versions until the engine packages are published.
  void recordVersionSet; void runDoctorChecks;
  process.stderr.write(
    'rollback: not available yet — restoring the previous set re-installs from npm, ' +
    'and the @justfortytwo/* engine packages are not published. Would restore:\n' +
    state.previous.map((p) => `  ${p.name}@${p.resolved}`).join('\n') + '\n',
  );
  return 2;
}
