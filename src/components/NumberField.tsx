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
  return (
    <label className="number-field">
      <span>{label}</span>
      <div className="input-wrap">
        <input
          aria-label={label}
          inputMode="decimal"
          type="number"
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
    </label>
  );
}
