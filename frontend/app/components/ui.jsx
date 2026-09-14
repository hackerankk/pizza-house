import { X } from 'lucide-react';

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

const buttonVariants = {
  primary: 'bg-tph-button text-tph-buttonText hover:bg-tph-buttonHover border-transparent shadow-soft',
  ghost: 'bg-transparent text-tph-primary border-tph-border hover:bg-tph-primary/10',
  danger: 'bg-tph-danger text-white hover:bg-red-700 border-transparent',
  subtle: 'bg-tph-primary/10 text-tph-primary hover:bg-tph-primary/15 border-transparent'
};

export function Button({ className = '', variant = 'primary', children, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-button border px-4 py-2 text-sm font-bold transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-4 focus-visible:outline-tph-accent/40 disabled:pointer-events-none disabled:opacity-60',
        buttonVariants[variant] || buttonVariants.primary,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ className = '', as: Component = 'input', ...props }) {
  return (
    <Component
      className={cn(
        'w-full rounded-lg border border-tph-border bg-tph-surface/90 px-3 py-3 text-tph-text outline-none transition focus:border-tph-accent focus:ring-4 focus:ring-tph-accent/20',
        className
      )}
      {...props}
    />
  );
}

export function Select({ className = '', children, ...props }) {
  return (
    <select
      className={cn('w-full rounded-lg border border-tph-border bg-tph-surface/90 px-3 py-3 text-tph-text outline-none transition focus:border-tph-accent focus:ring-4 focus:ring-tph-accent/20', className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Card({ className = '', children, ...props }) {
  return (
    <section className={cn('rounded-tph border border-tph-border bg-tph-surface p-5 shadow-soft', className)} {...props}>
      {children}
    </section>
  );
}

export function Badge({ className = '', tone = 'neutral', children }) {
  const tones = {
    neutral: 'bg-tph-primary/10 text-tph-primary',
    success: 'bg-green-100 text-green-800 dark:bg-green-900/35 dark:text-green-200',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/35 dark:text-amber-200',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/35 dark:text-red-200'
  };
  return <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold', tones[tone] || tones.neutral, className)}>{children}</span>;
}

export function Modal({ title, children, onClose, className = '' }) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-5" role="dialog" aria-modal="true">
      <section className={cn('max-h-[calc(100vh-40px)] w-full max-w-xl overflow-auto rounded-2xl border border-tph-border bg-tph-surface shadow-tph', className)}>
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-tph-border bg-tph-surface p-5">
          <h2 className="m-0 text-2xl font-black">{title}</h2>
          <Button type="button" variant="ghost" className="h-10 w-10 rounded-full p-0" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function Drawer({ children, side = 'right', className = '' }) {
  return (
    <div className="fixed inset-0 z-[80] bg-black/45">
      <aside className={cn('fixed bottom-0 top-0 w-full max-w-md overflow-auto bg-tph-surface p-5 shadow-tph', side === 'left' ? 'left-0' : 'right-0', className)}>
        {children}
      </aside>
    </div>
  );
}

export function Toggle({ checked, label, description, className = '', ...props }) {
  return (
    <label className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-tph-border bg-tph-surface p-3', className)}>
      <span className="grid gap-1">
        <strong>{label}</strong>
        {description ? <small className="text-tph-text/60">{description}</small> : null}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} {...props} />
      <span className={cn('relative h-6 w-11 rounded-full transition', checked ? 'bg-tph-primary' : 'bg-tph-border')}>
        <span className={cn('absolute top-1 h-4 w-4 rounded-full bg-white transition', checked ? 'left-6' : 'left-1')} />
      </span>
    </label>
  );
}

export function Tabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className={cn('flex gap-2 overflow-x-auto rounded-full border border-tph-border bg-tph-surface p-1', className)}>
      {tabs.map(tab => (
        <button key={tab.value} type="button" className={cn('rounded-full px-4 py-2 text-sm font-extrabold transition', active === tab.value ? 'bg-tph-primary text-white' : 'text-tph-text/70 hover:bg-tph-primary/10')} onClick={() => onChange(tab.value)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Dropdown({ className = '', children, ...props }) {
  return (
    <select className={cn('min-h-10 rounded-full border border-tph-border bg-tph-surface px-3 text-sm font-bold text-tph-text', className)} {...props}>
      {children}
    </select>
  );
}

export function Toast({ tone = 'info', children }) {
  const tones = {
    info: 'border-tph-border bg-tph-surface',
    success: 'border-green-700 bg-green-50 text-green-900 dark:bg-green-950/50 dark:text-green-100',
    warning: 'border-amber-600 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100',
    error: 'border-red-700 bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-100'
  };
  return <p className={cn('rounded-lg border px-4 py-3 font-bold', tones[tone] || tones.info)}>{children}</p>;
}
