export function normalizePhone(input: string): string {
  const compact = input.trim().replace(/[\s-]/g, "");

  if (/^1\d{10}$/.test(compact)) {
    return `+86${compact}`;
  }

  if (/^\+86\d{11}$/.test(compact)) {
    return compact;
  }

  if (/^\+\d{6,15}$/.test(compact)) {
    return compact;
  }

  return compact;
}

export function validatePhone(input: string): boolean {
  const phone = normalizePhone(input);

  if (/^\+861[3-9]\d{9}$/.test(phone)) {
    return true;
  }

  return /^\+[1-9]\d{5,14}$/.test(phone);
}

export function getPhoneDisplay(phone?: string | null, email?: string | null): string {
  return phone?.trim() || email?.trim() || "未登录用户";
}
