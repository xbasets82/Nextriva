import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardTitle } from './card.js';

describe('CardTitle', () => {
  it('preserves its content and forwarded presentation props', () => {
    render(
      <CardTitle className="custom-title" data-testid="card-title">
        Quality checks
      </CardTitle>,
    );

    const title = screen.getByTestId('card-title');
    expect(title.textContent).toBe('Quality checks');
    expect(title.getAttribute('data-slot')).toBe('card-title');
    expect(title.className).toContain('custom-title');
  });
});
