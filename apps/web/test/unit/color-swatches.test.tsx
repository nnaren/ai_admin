import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ColorSwatches } from '../../src/tabs/gateways/ColorSwatches.js';

describe('ColorSwatches', () => {
  it('shows the palette inline and reports the chosen color', () => {
    const onChange = vi.fn();
    render(<ColorSwatches value="blue" onChange={onChange} />);
    expect(screen.getByTestId('color-blue')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('color-green')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('color-green'));
    expect(onChange).toHaveBeenCalledWith('green');
  });
});
