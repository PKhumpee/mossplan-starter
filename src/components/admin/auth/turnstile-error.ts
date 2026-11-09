const INVALID_SITE_KEY_CODES = new Set(['110100', '110110', '400020']);

/** Turns a Turnstile client error code into the action the site owner needs to take. */
export function turnstileErrorMessage(code: string, hostname: string): string {
  if (code === '110200') {
    return `Turnstile ยังไม่อนุญาตโดเมน ${hostname} ให้เพิ่มโดเมนนี้ใน Hostname Management ของ widget ใน Cloudflare Dashboard แล้วรีเฟรชหน้านี้`;
  }
  if (INVALID_SITE_KEY_CODES.has(code)) {
    return 'Turnstile site key ไม่ถูกต้อง ให้ตรวจ key ของ widget ใน Cloudflare Dashboard';
  }
  return `ตรวจสอบความปลอดภัยไม่สำเร็จ (รหัส ${code}) ให้รีเฟรชหน้านี้แล้วลองอีกครั้ง`;
}
