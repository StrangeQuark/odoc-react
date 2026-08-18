import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Dialog } from './Dialog';

export type MenuItem = {
  disabled?: boolean;
  label: string;
  onSelect: () => void;
};

export function Menu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="menu">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((visible) => !visible)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        {label}
      </button>
      {open && (
        <div
          className="menu__items"
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type TabItem = { content: ReactNode; id: string; label: string };

export function Tabs({
  ariaLabel,
  items,
}: {
  ariaLabel: string;
  items: TabItem[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const active = items[activeIndex];

  const move = (nextIndex: number) => {
    setActiveIndex(nextIndex);
    requestAnimationFrame(() => tabs.current[nextIndex]?.focus());
  };

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      move((index + 1) % items.length);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move((index - 1 + items.length) % items.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      move(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      move(items.length - 1);
    }
  };

  if (!active) return null;
  return (
    <div className="tabs">
      <div role="tablist" aria-label={ariaLabel}>
        {items.map((item, index) => {
          const selected = index === activeIndex;
          const tabId = `${id}-${item.id}-tab`;
          const panelId = `${id}-${item.id}-panel`;
          return (
            <button
              key={item.id}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={tabId}
              aria-controls={panelId}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <section
        role="tabpanel"
        id={`${id}-${active.id}-panel`}
        aria-labelledby={`${id}-${active.id}-tab`}
      >
        {active.content}
      </section>
    </div>
  );
}

export type ComboboxOption = { id: string; label: string };

export function Combobox({
  label,
  onChange,
  onQueryChange,
  options,
  value,
}: {
  label: string;
  onChange: (option: ComboboxOption) => void;
  onQueryChange: (query: string) => void;
  options: ComboboxOption[];
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const matches = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(value.toLocaleLowerCase()),
  );
  const select = (option: ComboboxOption) => {
    onChange(option);
    setOpen(false);
  };

  return (
    <div className="combobox">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        role="combobox"
        value={value}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-activedescendant={
          open && matches[activeIndex]
            ? `${inputId}-${matches[activeIndex].id}`
            : undefined
        }
        onChange={(event) => {
          onQueryChange(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && matches.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
          } else if (event.key === 'ArrowUp' && matches.length) {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && open && matches[activeIndex]) {
            event.preventDefault();
            select(matches[activeIndex]);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul id={listboxId} role="listbox" aria-label={`${label} options`}>
          {matches.map((option, index) => (
            <li
              key={option.id}
              id={`${inputId}-${option.id}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(option)}
            >
              {option.label}
            </li>
          ))}
          {matches.length === 0 && <li role="status">No matching options.</li>}
        </ul>
      )}
    </div>
  );
}

export function Pagination({
  currentPage,
  onPageChange,
  pageCount,
}: {
  currentPage: number;
  onPageChange: (page: number) => void;
  pageCount: number;
}) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        Previous
      </button>
      <span aria-current="page">Page {currentPage}</span>
      <button
        type="button"
        disabled={currentPage >= pageCount}
        onClick={() => onPageChange(currentPage + 1)}
      >
        Next
      </button>
    </nav>
  );
}

export type BreadcrumbItem = {
  href?: string;
  label: string;
};

/**
 * A semantic breadcrumb trail. The final item is always the current location;
 * callers can use links for earlier locations without duplicating aria-current
 * markup in every page frame.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (!items.length) return null;
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {current || !item.href ? (
                <span aria-current={current ? 'page' : undefined}>
                  {item.label}
                </span>
              ) : (
                <a href={item.href}>{item.label}</a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Optional visual hint only: callers must keep the underlying control named. */
export function Tooltip({
  children,
  content,
}: {
  children: ReactNode;
  content: string;
}) {
  return (
    <span className="tooltip">
      {children}
      <span className="tooltip__content" role="tooltip">
        {content}
      </span>
    </span>
  );
}

export function Drawer({
  children,
  isOpen,
  onClose,
  title,
}: {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title: string;
}) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} className="drawer" title={title}>
      <div className="drawer__content">{children}</div>
    </Dialog>
  );
}
