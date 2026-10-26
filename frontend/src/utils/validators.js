export const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
export const isPositiveNumber = value => Number.isFinite(Number(value)) && Number(value) >= 0;
export const required = value => String(value ?? '').trim().length > 0;
