import { GATEWAY_COLORS, resolveGatewayColor, type GatewayColor } from './colors.js';

interface ColorSwatchesProps {
  value?: string;
  onChange: (color: GatewayColor) => void;
}

export function ColorSwatches({ value, onChange }: ColorSwatchesProps): JSX.Element {
  const current = resolveGatewayColor(value);

  return (
    <div className="gcp-color-picker" role="listbox" aria-label="Card color">
      {GATEWAY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="option"
          aria-selected={current === color}
          aria-label={color}
          className={`gcp-swatch gcp-swatch-${color}${current === color ? ' active' : ''}`}
          data-testid={`color-${color}`}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}
