import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedVerificationDeletions, replacedVerificationDeletions } from '../src/lib/verificationRetention.ts';

const old = { nationalIdPath: 'id-old', selfiePath: 'selfie-old', profilePath: 'profile-old' };
test('approval deletes verification evidence, not profile photo', () => {
  assert.deepEqual(approvedVerificationDeletions(old), ['id-old', 'selfie-old']);
  assert.deepEqual(approvedVerificationDeletions({ ...old, nationalIdPath: 'profile-old' }), ['selfie-old']);
});
test('resubmission deletes old evidence only after complete replacement, never reused or profile files', () => {
  assert.throws(() => replacedVerificationDeletions(old, { nationalIdPath: '', selfiePath: 'new-selfie', profilePath: 'new-profile' }));
  assert.deepEqual(replacedVerificationDeletions(old, { nationalIdPath: 'new-id', selfiePath: 'selfie-old', profilePath: 'new-profile' }), ['id-old']);
});
