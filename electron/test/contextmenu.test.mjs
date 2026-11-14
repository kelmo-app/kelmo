import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { buildTemplate } = createRequire(import.meta.url)('../context-menu.cjs');

test('text field: cut/copy/paste follow what the field allows', () => {
  const t = buildTemplate({ isEditable: true, editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true } });
  const by = (r) => t.find((i) => i.role === r);
  assert.equal(by('paste').enabled, true);
  assert.equal(by('cut').enabled, false);
  assert.ok(by('selectAll') && by('undo'));
});
test('selected page text offers Copy; plain page offers nothing', () => {
  assert.deepEqual(buildTemplate({ isEditable: false, selectionText: 'abc' }).map((i) => i.role).filter(Boolean), ['copy', 'selectAll']);
  assert.deepEqual(buildTemplate({ isEditable: false, selectionText: '' }), []);
});
