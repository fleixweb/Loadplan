export default function NumberField({
  label,
  value,
  onChange,
  min = 1,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const invalid =
    !Number.isFinite(value) ||
    value < min ||
    (max !== undefined && value > max);
  return (
    <label className="number-field">
      <span>{label}</span>
      <div className="input-wrap">
        <input
          aria-label={label}
          inputMode="decimal"
          type="number"
          required
          aria-invalid={invalid}
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? NaN : Number(e.target.value))
          }
        />
        {suffix && <em>{suffix}</em>}
      </div>
      {invalid && (
        <small className="number-error">
          请输入 {min}
          {max === undefined ? " 及以上" : `–${max}`} 的数值
        </small>
      )}
    </label>
  );
}
