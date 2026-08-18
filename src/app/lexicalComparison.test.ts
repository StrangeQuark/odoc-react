import { createHeadlessEditor } from '@lexical/headless';
import {
  $createListItemNode,
  $createListNode,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import { $createHeadingNode, HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { describe, expect, it } from 'vitest';

/**
 * P0-009 comparison probe. This deliberately stays test-only: Odoc selected
 * Tiptap, but we retain a real Lexical execution check over the same core
 * document capabilities so the ADR records an evidence-based alternative.
 */
describe('Lexical comparison probe', () => {
  it('constructs the core rich-document subset headlessly and keeps hostile text inert', () => {
    const editor = createHeadlessEditor({
      namespace: 'odoc-p0-editor-comparison',
      nodes: [
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        TableNode,
        TableRowNode,
        TableCellNode,
      ],
      onError: (error) => {
        throw error;
      },
    });

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();

        const heading = $createHeadingNode('h2');
        heading.append($createTextNode('Architecture overview'));
        root.append(heading);

        const list = $createListNode('bullet');
        const item = $createListItemNode();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Keyboard-first editing'));
        item.append(paragraph);
        list.append(item);
        root.append(list);

        const hostileText = $createParagraphNode();
        hostileText.append($createTextNode('<script>never execute()</script>'));
        root.append(hostileText);
      },
      { discrete: true },
    );

    const document = editor.getEditorState().toJSON();
    expect(document.root.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'heading', tag: 'h2' }),
        expect.objectContaining({ type: 'list', listType: 'bullet' }),
      ]),
    );
    expect(JSON.stringify(document)).toContain(
      '<script>never execute()</script>',
    );
    expect(JSON.stringify(document)).not.toContain('javascript:');
  });
});
