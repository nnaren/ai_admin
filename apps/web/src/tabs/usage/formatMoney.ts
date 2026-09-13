export function formatMoney(amount: number | undefined, currency = 'USD'): string {
  const value = amount ?? 0;
  if (currency === 'CNY' || currency === 'RMB') return `¥${value.toFixed(2)}`;
  return `$${value.toFixed(2)}`;
}

export function formatTokens(tokens: number | undefined): string {
  return `${(tokens ?? 0).toLocaleString('en-US')} tokens`;
}
