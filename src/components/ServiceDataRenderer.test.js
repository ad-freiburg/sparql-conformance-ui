import assert from 'node:assert/strict';
import test from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ServiceDataRenderer from './ServiceDataRenderer.js';


test('fixture content is escaped as text and empty content stays visible', () => {
  const markup = renderToStaticMarkup(createElement(ServiceDataRenderer, {
    fixtures: [
      {
        endpoint: 'http://example.org/<endpoint>&value',
        fileName: '<fixture>.ttl',
        content: '<script>globalThis.injected = true</script> & <urn:s>'
      },
      {
        endpoint: 'http://empty.example/sparql',
        content: ''
      }
    ]
  }));

  assert.equal(markup.includes('<script>'), false);
  assert.equal(markup.includes('&lt;script&gt;'), true);
  assert.equal(markup.includes('&lt;endpoint&gt;&amp;value'), true);
  assert.equal(markup.includes('&lt;fixture&gt;.ttl'), true);
  assert.match(markup, /<pre[^>]*><\/pre>/);
});
