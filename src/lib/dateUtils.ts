export function getTodayInBrazil(): string {
  const date = new Date();
  const brazilDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

  const year = brazilDate.getFullYear();
  const month = String(brazilDate.getMonth() + 1).padStart(2, '0');
  const day = String(brazilDate.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getYesterdayInBrazil(): string {
  const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const brazilDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

  const year = brazilDate.getFullYear();
  const month = String(brazilDate.getMonth() + 1).padStart(2, '0');
  const day = String(brazilDate.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function formatDateToBrazil(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function formatDateDisplay(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export function getDateRangeInBrazil(daysAgo: number): { start: string; end: string } {
  const today = getTodayInBrazil();
  const endDate = new Date(today + 'T00:00:00');
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysAgo);

  return {
    start: formatDateToBrazil(startDate),
    end: today
  };
}

export function getWeekRangeInBrazil(): { start: string; end: string } {
  const today = getTodayInBrazil();
  const now = new Date(today + 'T12:00:00');
  const dayOfWeek = now.getDay(); // 0 = domingo
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - dayOfWeek);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return { start: formatDateToBrazil(sunday), end: formatDateToBrazil(saturday) };
}

export function getMonthRangeInBrazil(): { start: string; end: string } {
  const today = getTodayInBrazil();
  const brazilDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const firstDay = new Date(brazilDate.getFullYear(), brazilDate.getMonth(), 1);
  return {
    start: formatDateToBrazil(firstDay),
    end: today
  };
}

export function getLastMonthRangeInBrazil(): { start: string; end: string } {
  const date = new Date();
  const brazilDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const first = new Date(brazilDate.getFullYear(), brazilDate.getMonth() - 1, 1);
  const last = new Date(brazilDate.getFullYear(), brazilDate.getMonth(), 0);
  return { start: formatDateToBrazil(first), end: formatDateToBrazil(last) };
}

export function isDateInRange(dateStr: string, startStr: string, endStr: string): boolean {
  const date = new Date(dateStr + 'T00:00:00');
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');

  return date >= start && date <= end;
}

export function normalizeDateFromDB(dbDate: string): string {
  const date = new Date(dbDate);
  const brazilDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

  const year = brazilDate.getFullYear();
  const month = String(brazilDate.getMonth() + 1).padStart(2, '0');
  const day = String(brazilDate.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
