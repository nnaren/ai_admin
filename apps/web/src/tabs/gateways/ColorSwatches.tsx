import { GATEWAY_COLORS, resolveGatewayColor, type GatewayColor } from './colors.js';

interface ColorSwatchesProps {
  value?: string;
  onChange: (color: GatewayColor) => void;
}

const COLOR_LABELS: Record<GatewayColor, string> = {
  blue: '蓝色',
  green: '绿色',
  amber: '琥珀色',
  rose: '玫红色',
  violet: '紫色',
  cyan: '青色',
  slate: '灰色',
};

export function ColorSwatches({ value, onChange }: ColorSwatchesProps): JSX.Element {
  const current = resolveGatewayColor(value);

  return (
    <div className="gcp-color-picker" role="listbox" aria-label="卡片颜色">
      {GATEWAY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="option"
          aria-selected={current === color}
          aria-label={COLOR_LABELS[color]}
          className={`gcp-swatch gcp-swatch-${color}${current === color ? ' active' : ''}`}
          data-testid={`color-${color}`}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}
