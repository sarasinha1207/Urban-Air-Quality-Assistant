interface Option {
  readonly value: string;
  readonly label: string;
}

interface SelectFieldProps {
  name: string;
  label: string;
  options: readonly Option[];
  defaultValue: string;
}

/** A labelled native select. */
export function SelectField({ name, label, options, defaultValue }: SelectFieldProps) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={defaultValue}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface CheckFieldProps {
  name: string;
  value?: string;
  label: string;
}

/** A labelled native checkbox with a large click target. */
export function CheckField({ name, value, label }: CheckFieldProps) {
  const id = `${name}-${value ?? "yes"}`;
  return (
    <div className="check">
      <input id={id} type="checkbox" name={name} value={value ?? "on"} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}
