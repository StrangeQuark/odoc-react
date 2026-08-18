import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonTone = 'primary' | 'secondary' | 'danger';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: ButtonTone;
};

/**
 * The shared button owns the stable semantic API while CSS owns the visual
 * tokens. It intentionally remains a native button so keyboard, disabled, and
 * form semantics do not need to be recreated in every feature.
 */
export function Button({
  children,
  className,
  tone = 'primary',
  type = 'button',
  ...props
}: ButtonProps) {
  const toneClass = tone === 'primary' ? '' : `button--${tone}`;
  return (
    <button
      {...props}
      type={type}
      className={[toneClass, className].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  );
}
