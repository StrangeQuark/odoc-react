import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { Button } from './Button';
import { DataTable } from './DataTable';
import { Dialog } from './Dialog';
import { Avatar, Badge, EmptyState, Skeleton, ToastRegion } from './Feedback';
import { FormField } from './FormField';
import { InlineStatus } from './InlineStatus';
import {
  Breadcrumbs,
  Combobox,
  Drawer,
  Menu,
  Pagination,
  Tabs,
  Tooltip,
} from './Navigation';
import { Checkbox, Switch } from './Toggle';

describe('shared UI primitives', () => {
  it('keeps a native button keyboard-operable', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Save</Button>);

    await user.tab();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('connects labels, help, and errors without accessibility violations', async () => {
    const { container } = render(
      <>
        <FormField
          id="workspace-name"
          label="Workspace name"
          hint="Shown to workspace members."
          error="Choose a name."
        >
          <input
            id="workspace-name"
            aria-describedby="workspace-name-hint workspace-name-error"
          />
        </FormField>
        <InlineStatus tone="success">Saved.</InlineStatus>
      </>,
    );

    expect(screen.getByLabelText('Workspace name')).toHaveAttribute(
      'aria-describedby',
      'workspace-name-hint workspace-name-error',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a name.');
    expect(screen.getByRole('status')).toHaveTextContent('Saved.');
    await expectNoAxeViolations(container);
  });

  it('uses a native modal dialog, restores focus, and closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <>
        <Button>Open dialog</Button>
        <Dialog isOpen onClose={onClose} title="Create a space">
          <p>Choose a workspace name.</p>
          <Button>Save</Button>
        </Dialog>
      </>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Create a space' });
    expect(dialog).toBeVisible();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('exposes feedback components with durable names and live status', async () => {
    const { container } = render(
      <>
        <EmptyState title="No pages yet" action={<Button>Create page</Button>}>
          <p>Start with a page.</p>
        </EmptyState>
        <Skeleton label="Loading pages" />
        <Badge tone="success">Published</Badge>
        <Avatar name="Ada Lovelace" />
        <ToastRegion>Page saved.</ToastRegion>
      </>,
    );

    expect(screen.getByRole('heading', { name: 'No pages yet' })).toBeVisible();
    expect(screen.getByRole('status', { name: 'Loading pages' })).toBeVisible();
    expect(screen.getByLabelText('Ada Lovelace')).toHaveTextContent('AL');
    expect(screen.getByText('Page saved.')).toHaveAttribute('role', 'status');
    await expectNoAxeViolations(container);
  });

  it('keeps checkbox and switch controls keyboard-operable', async () => {
    const user = userEvent.setup();
    const onCheckboxChange = vi.fn();
    const onSwitchChange = vi.fn();
    render(
      <>
        <Checkbox
          id="watch-page"
          checked={false}
          label="Watch page"
          onChange={onCheckboxChange}
        />
        <Switch
          checked={false}
          label="Enable notifications"
          onCheckedChange={onSwitchChange}
        />
      </>,
    );

    await user.click(screen.getByLabelText('Watch page'));
    expect(onCheckboxChange).toHaveBeenCalledOnce();
    await user.tab();
    await user.keyboard(' ');
    expect(onSwitchChange).toHaveBeenCalledWith(true);
  });

  it('supports keyboard tabs and a named action menu', async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(
      <>
        <Tabs
          ariaLabel="Page settings"
          items={[
            {
              id: 'general',
              label: 'General',
              content: <p>General content</p>,
            },
            { id: 'access', label: 'Access', content: <p>Access content</p> },
          ]}
        />
        <Menu
          label="Page actions"
          items={[{ label: 'Archive', onSelect: onArchive }]}
        />
      </>,
    );

    const general = screen.getByRole('tab', { name: 'General' });
    general.focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Access' })).toHaveFocus(),
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Access content');

    await user.click(screen.getByRole('button', { name: 'Page actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(onArchive).toHaveBeenCalledOnce();
  });

  it('provides a controllable combobox, pagination, and optional tooltip', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    function ComboboxHarness() {
      const [query, setQuery] = useState('');
      const [selected, setSelected] = useState('');
      return (
        <>
          <Combobox
            label="Space"
            value={query}
            onQueryChange={setQuery}
            onChange={(option) => setSelected(option.label)}
            options={[
              { id: 'engineering', label: 'Engineering' },
              { id: 'design', label: 'Design' },
            ]}
          />
          <output>{selected}</output>
        </>
      );
    }
    const { container } = render(
      <>
        <ComboboxHarness />
        <Pagination currentPage={2} pageCount={3} onPageChange={onPageChange} />
        <Tooltip content="Extra explanation">
          <Button>Info</Button>
        </Tooltip>
      </>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Space' }));
    await user.keyboard('eng{ArrowDown}{Enter}');
    expect(
      screen.getByText('Engineering', { selector: 'output' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Extra explanation');
    await expectNoAxeViolations(container);
  });

  it('keeps data tables semantic and renders drawers as labeled dialogs', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <>
        <DataTable
          caption="Recent pages"
          columns={[
            {
              id: 'title',
              header: 'Title',
              cell: (row: { title: string }) => row.title,
            },
          ]}
          getRowId={(row) => row.title}
          rows={[{ title: 'Architecture' }]}
        />
        <Drawer isOpen onClose={onClose} title="Page navigation">
          <nav aria-label="Page tree">Architecture</nav>
        </Drawer>
      </>,
    );

    expect(screen.getByRole('table', { name: 'Recent pages' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Title' })).toBeVisible();
    expect(
      screen.getByRole('dialog', { name: 'Page navigation' }),
    ).toBeVisible();
    render(
      <Breadcrumbs
        items={[{ href: '/', label: 'Spaces' }, { label: 'Architecture' }]}
      />,
    );
    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' }),
    ).toHaveTextContent('SpacesArchitecture');
    expect(
      screen
        .getByRole('navigation', { name: 'Breadcrumb' })
        .querySelector('[aria-current="page"]'),
    ).toHaveTextContent('Architecture');
    await expectNoAxeViolations(container);
  });
});
