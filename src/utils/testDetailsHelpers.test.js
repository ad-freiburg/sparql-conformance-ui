import assert from 'node:assert/strict';
import test from 'node:test';

import { getOverviewEntries } from './testDetailsHelpers.js';

const queryFile = 'SELECT * WHERE { ?s ?p ?o }';
const queryLog = 'Engine response';

function getSyntaxOverview(typeName, overrides = {}) {
  return getOverviewEntries({
    typeName,
    comment: '',
    queryFile,
    queryLog,
    ...overrides
  });
}

function valuesByLabel(entries) {
  return Object.fromEntries(entries.map(({ label, value }) => [label, value]));
}

for (const typeName of [
  'NegativeSyntaxTest',
  'PositiveSyntaxTest',
  'PositiveSyntaxTest11',
  'NegativeSyntaxTest11',
  'PositiveUpdateSyntaxTest11',
  'NegativeUpdateSyntaxTest11'
]) {
  test(`${typeName} includes the query and engine response`, () => {
    const entries = getSyntaxOverview(typeName);

    assert.deepEqual(valuesByLabel(entries), {
      Comment: '',
      'Query File': queryFile,
      'Query Result': queryLog
    });
  });
}

test('an empty comment does not remove syntax-test details', () => {
  const entries = getSyntaxOverview('NegativeSyntaxTest', { comment: undefined });

  assert.equal(entries.find(({ label }) => label === 'Query File')?.value, queryFile);
  assert.equal(entries.find(({ label }) => label === 'Query Result')?.value, queryLog);
});

test('an unknown test type does not use the syntax-test layout', () => {
  const entries = getSyntaxOverview('UnrelatedTest');

  assert.deepEqual(entries.map(({ label }) => label), ['Comment']);
});
