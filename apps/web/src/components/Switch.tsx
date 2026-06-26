export default function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5',
        'transition-colors duration-200 ease-out cursor-pointer',
        checked ? '' : 'bg-slate-300 dark:bg-slate-700',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
      style={checked ? { background: 'var(--primary)' } : undefined}
    >
      <span
        className={[
          'inline-block h-6 w-6 rounded-full bg-white shadow-sm',
          'transition-transform duration-200 ease-out',
          checked ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}
