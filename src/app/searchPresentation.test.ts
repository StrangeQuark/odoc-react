import { describe, expect, it } from 'vitest';
import { searchSnippet, searchTextParts } from './searchPresentation';

describe('search presentation', () => {
  it('highlights title/body terms without treating page content as HTML', () => {
    expect(searchTextParts('Architecture <script>alert(1)</script>', 'architecture script')).toEqual([
      { text: 'Architecture', highlighted: true },
      { text: ' <', highlighted: false },
      { text: 'script', highlighted: true },
      { text: '>alert(1)</', highlighted: false },
      { text: 'script', highlighted: true },
      { text: '>', highlighted: false },
    ]);
  });

  it('builds a compact result snippet around the first matching term', () => {
    const source = `${'Before '.repeat(30)}deployment guide ${'After '.repeat(30)}`;

    expect(searchSnippet(source, 'deployment')).toContain('deployment guide');
    expect(searchSnippet(source, 'deployment')).toMatch(/^…/);
    expect(searchSnippet(source, 'deployment')).toMatch(/…$/);
  });

  it('does not alter short text that has no match', () => {
    expect(searchSnippet('A short page body', 'missing')).toBe('A short page body');
  });
});
