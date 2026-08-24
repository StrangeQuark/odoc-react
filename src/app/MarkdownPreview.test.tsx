import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownPreview } from './App';

describe('MarkdownPreview', () => {
  it('renders hostile README markup as inert text', () => {
    const { container } = render(
      <MarkdownPreview content={'# Safe heading\n\n<script>alert("no")</script>'} />,
    );

    expect(screen.getByRole('heading', { name: 'Safe heading' })).toBeVisible();
    expect(screen.getByText('<script>alert("no")</script>')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
  });
});
