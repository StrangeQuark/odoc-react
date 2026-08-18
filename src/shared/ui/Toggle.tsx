import type { ChangeEventHandler } from 'react';

export function Checkbox({
  checked,
  id,
  label,
  onChange,
}: {
  checked: boolean;
  id: string;
  label: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <label className="checkbox-control" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

/** Native button behavior with explicit switch state for assistive technology. */
export function Switch({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="switch-control"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
    >
      <span aria-hidden="true" className="switch-control__track">
        <span className="switch-control__thumb" />
      </span>
      <span>{label}</span>
    </button>
  );
}
