// Reader-facing dates: Asia/Bangkok, Buddhist-era year (AGENTS.md "Thai first").
// The formatter is module-scoped; creating one per call is measurable inside the 10 ms CPU budget.

const thaiDate = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** e.g. `14 ต.ค. 2569`. `ms` is an epoch-millisecond timestamp (UTC). */
export function formatThaiDate(ms: number): string {
  return thaiDate.format(new Date(ms));
}

const thaiYear = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
});

/** Buddhist-era year at build time, for the footer copyright ("2569", no era label). */
export function currentThaiYear(): string {
  const year = thaiYear.formatToParts(new Date()).find((part) => part.type === 'year');
  return year?.value ?? thaiYear.format(new Date());
}
