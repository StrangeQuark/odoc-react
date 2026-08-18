import { useState } from 'react';
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

/**
 * A deliberately small, dependency-free component catalog. It is available at
 * /ui-preview in a running frontend so visual/keyboard review does not require
 * a work-in-progress product screen or a separate Storybook deployment.
 */
export function ComponentCatalog() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('None');
  const [page, setPage] = useState(1);

  return (
    <main id="main-content" className="catalog-page">
      <p className="eyebrow">Internal quality surface</p>
      <h1>Odoc component catalog</h1>
      <p className="lede">
        Shared controls are reviewed here before feature code adopts them.
      </p>

      <section aria-labelledby="catalog-navigation">
        <h2 id="catalog-navigation">Navigation</h2>
        <Breadcrumbs
          items={[
            { label: 'Spaces', href: '/' },
            { label: 'Engineering', href: '/' },
            { label: 'Architecture' },
          ]}
        />
        <Tabs
          ariaLabel="Catalog views"
          items={[
            { id: 'overview', label: 'Overview', content: <p>Overview</p> },
            { id: 'activity', label: 'Activity', content: <p>Activity</p> },
          ]}
        />
        <div className="catalog-row">
          <Menu
            label="Page actions"
            items={[{ label: 'Archive', onSelect: () => undefined }]}
          />
          <Pagination currentPage={page} pageCount={3} onPageChange={setPage} />
          <Button tone="secondary" onClick={() => setDrawerOpen(true)}>
            Open navigation drawer
          </Button>
        </div>
      </section>

      <section aria-labelledby="catalog-inputs">
        <h2 id="catalog-inputs">Inputs and feedback</h2>
        <div className="catalog-grid">
          <FormField id="catalog-title" label="Page title" hint="Required">
            <input id="catalog-title" defaultValue="Architecture" />
          </FormField>
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
          <p className="muted" aria-live="polite">
            Selected space: {selected}
          </p>
          <Checkbox
            id="catalog-watch"
            label="Watch this page"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <Switch
            label="Enable notifications"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
          <InlineStatus tone="success">Saved just now.</InlineStatus>
        </div>
      </section>

      <section aria-labelledby="catalog-actions">
        <h2 id="catalog-actions">Actions and states</h2>
        <div className="catalog-row">
          <Button>Publish</Button>
          <Button tone="secondary">Cancel</Button>
          <Button tone="danger">Delete</Button>
          <Tooltip content="Add this page to your favorites.">
            <Button aria-label="Favorite page" tone="secondary">
              Favorite
            </Button>
          </Tooltip>
          <Button tone="secondary" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>
        </div>
        <div className="catalog-row">
          <Badge>Draft</Badge>
          <Badge tone="success">Published</Badge>
          <Badge tone="danger">Restricted</Badge>
          <Avatar name="Ada Lovelace" />
          <Skeleton label="Loading catalog sample" />
          <ToastRegion>Page saved.</ToastRegion>
        </div>
        <EmptyState
          title="No templates yet"
          action={<Button>Create template</Button>}
        >
          <p>Start with a reusable documentation template.</p>
        </EmptyState>
      </section>

      <section aria-labelledby="catalog-table">
        <h2 id="catalog-table">Table</h2>
        <DataTable
          caption="Recent pages"
          columns={[
            {
              id: 'title',
              header: 'Title',
              cell: (row: { author: string; title: string }) => row.title,
            },
            {
              id: 'author',
              header: 'Author',
              cell: (row: { author: string; title: string }) => row.author,
            },
          ]}
          getRowId={(row) => row.title}
          rows={[{ author: 'Ada Lovelace', title: 'Architecture' }]}
        />
      </section>

      <Dialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Create a page"
      >
        <p>Use the shared dialog for a focus-contained task.</p>
        <Button onClick={() => setDialogOpen(false)}>Done</Button>
      </Dialog>
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Page navigation"
      >
        <nav aria-label="Page tree">
          <a href="#catalog-navigation">Architecture</a>
        </nav>
      </Drawer>
    </main>
  );
}
