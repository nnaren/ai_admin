export function formatMoney(amount: number | undefined, currency = 'USD'): string {
  const parts = splitMoney(amount, currency);
  return `${parts.symbol}${parts.amount}`;
}

/** Symbol and amount as separate pieces so each can be styled on its own. */
export interface MoneyParts {
  /** '¥' for CNY/RMB, '$' otherwise. */
  symbol: string;
  /** Fixed 2-decimal number, e.g. '3.17'. */
  amount: string;
}

export function splitMoney(amount: number | undefined, currency = 'USD'): MoneyParts {
  const value = amount ?? 0;
  const code = (currency || 'USD').toUpperCase();
  return {
    symbol: code === 'CNY' || code === 'RMB' ? '¥' : '$',
    amount: value.toFixed(2),
  };
}

export function formatTokens(tokens: number | undefined): string {
  return `${(tokens ?? 0).toLocaleString('en-US')} tokens`;
}