import {
  useEffect,
  useId,
  useRef,
  type DialogHTMLAttributes,
  type ReactNode,
} from 'react';

type DialogProps = Omit<DialogHTMLAttributes<HTMLDialogElement>, 'open'> & {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title: string;
  tone?: 'dialog' | 'alertdialog';
};

/**
 * A native modal dialog with focus containment and focus restoration. Feature
 * code supplies the form/content; this wrapper owns the browser-modal details
 * so every modal does not reinvent Escape and focus behavior.
 */
export function Dialog({
  children,
  isOpen,
  onCancel,
  onClose,
  title,
  tone = 'dialog',
  ...props
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const supportsNativeModal =
    typeof HTMLDialogElement !== 'undefined' &&
    typeof HTMLDialogElement.prototype.showModal === 'function';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen) return undefined;

    const previouslyFocused = document.activeElement;
    if (typeof dialog.showModal === 'function' && !dialog.open) {
      dialog.showModal();
    }

    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <dialog
      {...props}
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel?.(event);
        onClose();
      }}
      // `showModal` sets the actual modal state in browsers. The attribute is
      // retained only as a small jsdom/no-dialog fallback for component tests.
      open={supportsNativeModal ? undefined : true}
      role={tone}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
    </dialog>
  );
}
