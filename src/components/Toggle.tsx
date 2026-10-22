import './toggle.css';

type ToggleProps = {
  checked: boolean;
  onChange: () => void;
  label: string;
  tone?: 'dark' | 'steel';
  showState?: boolean;
};

/** A capsule switch: the bar inside lights up when current flows through it. */
export function Toggle({ checked, onChange, label, tone = 'dark', showState = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle toggle--${tone}${showState ? ' toggle--stated' : ''}`}
      onClick={onChange}
    >
      {showState && <span className="toggle-state">{checked ? 'On' : 'Off'}</span>}
      <span className="toggle-bar" />
    </button>
  );
}
