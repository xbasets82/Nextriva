import { expect, test } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from './App.js';

test('the React application renders its technical placeholder', () => {
  const markup = renderToStaticMarkup(createElement(App));
  expect(markup).toContain('<h1>Nextriva</h1>');
});
