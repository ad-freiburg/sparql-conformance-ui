import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAllEntries,
  getOverviewEntries,
  normalizeServiceData
} from './testDetailsHelpers.js';


test('query overview includes ordered SERVICE endpoint data', () => {
  const serviceData = [
    { endpoint: 'http://first.example/sparql', fileName: 'first.ttl', content: 'first' },
    { endpoint: 'http://second.example/sparql', fileName: 'second.ttl', content: 'second' }
  ];
  const entries = getOverviewEntries({
    typeName: 'QueryEvaluationTest',
    status: 'Passed',
    serviceData
  });
  const entry = entries.find(({ key }) => key === 'serviceData');

  assert.equal(entry.valueType, 'serviceData');
  assert.deepEqual(entry.value, serviceData);
});


test('historical query records omit the SERVICE section', () => {
  const entries = getOverviewEntries({
    typeName: 'QueryEvaluationTest',
    status: 'Passed'
  });

  assert.equal(entries.some(({ key }) => key === 'serviceData'), false);
});


test('malformed fixtures are ignored without reordering valid fixtures', () => {
  const fixtures = normalizeServiceData([
    null,
    { endpoint: '', content: 'invalid' },
    { endpoint: 'http://first.example/sparql', content: '' },
    { endpoint: 'http://missing-content.example/sparql' },
    { endpoint: 'http://second.example/sparql', fileName: 42, content: 'second' }
  ]);

  assert.deepEqual(fixtures, [
    { endpoint: 'http://first.example/sparql', content: '' },
    { endpoint: 'http://second.example/sparql', content: 'second' }
  ]);
  assert.deepEqual(normalizeServiceData({ endpoint: 'not-an-array', content: '' }), []);
});


test('details include SERVICE data and the execution query', () => {
  const entries = getAllEntries({
    executionQuery: 'SELECT * WHERE { SERVICE <http://local/mock> {} }',
    serviceData: [{
      endpoint: 'http://example.org/sparql',
      content: '<urn:s> <urn:p> <urn:o> .'
    }]
  });

  assert.equal(entries.find(({ key }) => key === 'executionQuery').value,
    'SELECT * WHERE { SERVICE <http://local/mock> {} }');
  assert.equal(entries.find(({ key }) => key === 'serviceData').value.length, 1);
});
