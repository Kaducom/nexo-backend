export function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

export function formatDateTime(value: string) {
  if (!value) return "Sem data";
  const date = new Date(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

export function formatRelativeDays(value: string) {
  if (!value) return "Sem data";

  const now = Date.now();
  const target = new Date(value).getTime();
  const diffMs = target - now;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return overdueDays === 1
      ? "Atrasado há 1 dia"
      : `Atrasado há ${overdueDays} dias`;
  }

  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Amanhã";

  return `Em ${diffDays} dias`;
}

export function localDateTimeValue(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
