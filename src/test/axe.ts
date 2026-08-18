import axe from 'axe-core';

/** Run the same baseline WCAG rules used by component tests. */
export async function expectNoAxeViolations(element: Element): Promise<void> {
  const result = await axe.run(element, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa'],
    },
  });

  if (result.violations.length > 0) {
    throw new Error(
      result.violations
        .map((violation) => `${violation.id}: ${violation.help}`)
        .join('\n'),
    );
  }
}
