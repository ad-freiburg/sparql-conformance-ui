import { createElement } from 'react';

/** Render validated SERVICE fixtures entirely as React text content. */
export default function ServiceDataRenderer({ fixtures = [] }) {
  return createElement(
    'div',
    { className: 'space-y-4' },
    fixtures.map((fixture, index) => createElement(
      'article',
      {
        className: 'rounded border border-gray-200 bg-gray-50 p-3',
        key: `${fixture.endpoint}-${index}`
      },
      createElement(
        'div',
        { className: 'mb-2 flex flex-wrap items-baseline gap-x-2 text-sm' },
        createElement(
          'span',
          { className: 'font-semibold text-gray-700' },
          'Endpoint:'
        ),
        createElement(
          'code',
          { className: 'select-all break-all text-gray-900' },
          fixture.endpoint
        )
      ),
      fixture.fileName
        ? createElement(
            'div',
            { className: 'mb-2 text-sm text-gray-600' },
            createElement(
              'span',
              { className: 'font-semibold' },
              'Fixture: '
            ),
            fixture.fileName
          )
        : null,
      createElement(
        'pre',
        {
          className: 'min-h-[2.5rem] max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border bg-white p-3 text-left font-mono text-sm text-gray-900'
        },
        fixture.content
      )
    ))
  );
}
