export type SearchTextPart = {
  text: string;
  highlighted: boolean;
};

function queryTerms(query: string): string[] {
  return [...new Set(query.toLocaleLowerCase().trim().split(/\s+/))]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
}

/**
 * Splits display text into ordinary and matched pieces. The caller renders the
 * pieces as React text, never as HTML, so an untrusted page title/body cannot
 * turn search highlighting into markup.
 */
export function searchTextParts(text: string, query: string): SearchTextPart[] {
  const terms = queryTerms(query);
  if (!text || terms.length === 0) return [{ text, highlighted: false }];

  const expression = new RegExp(
    `(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi',
  );
  return text
    .split(expression)
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      highlighted: terms.includes(part.toLocaleLowerCase()),
    }));
}

/** Keeps search results scannable while preserving the context around a hit. */
export function searchSnippet(text: string, query: string, maximum = 220): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maximum) return compact;

  const terms = queryTerms(query);
  const firstMatch = terms
    .map((term) => compact.toLocaleLowerCase().indexOf(term))
    .filter((index) => index >= 0)
    .reduce<number | null>((earliest, index) =>
      earliest === null || index < earliest ? index : earliest,
    null);
  const start = Math.max(0, (firstMatch ?? 0) - 72);
  const end = Math.min(compact.length, start + maximum);
  return `${start > 0 ? '…' : ''}${compact.slice(start, end)}${end < compact.length ? '…' : ''}`;
}
