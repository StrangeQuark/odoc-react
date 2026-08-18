import type { ReactNode } from 'react';

type FormFieldProps = {
  children: ReactNode;
  error?: string;
  hint?: string;
  id: string;
  label: string;
};

/** A labelled native control with consistently announced help and errors. */
export function FormField({
  children,
  error,
  hint,
  id,
  label,
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
