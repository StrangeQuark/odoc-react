import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JavaDocType } from './App';

describe('JavaDocType', () => {
  it('renders a static type, member signature, and JavaDoc tags as safe text', () => {
    const { container } = render(
      <JavaDocType snapshot={{
        id: 'snapshot-1', sourcePath: 'src/main/java/example/Guide.java', packageName: 'example',
        typeName: 'Guide', typeKind: 'class', documentation: '<script>inert</script>',
        refreshedAt: '2026-08-23T00:00:00Z',
        members: [{
          kind: 'method', name: 'open', signature: 'public boolean open()', documentation: 'Opens the guide.',
          tags: [{ kind: 'return', subject: '', description: 'whether it opened' }],
        }],
      }} />,
    );

    expect(screen.getByRole('heading', { name: 'class Guide' })).toBeVisible();
    expect(screen.getByText('public boolean open()')).toBeVisible();
    expect(screen.getByText('@return — whether it opened')).toBeVisible();
    expect(screen.getByText('<script>inert</script>')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
  });
});
