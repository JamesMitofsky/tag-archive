// Single source of truth for email subject lines. Consumed by the send helpers
// in ../email.ts and surfaced in the dev email gallery (routes/dev/emails) so
// the preview matches exactly what recipients see — no duplicated strings.

export const otpEmailSubject = (otp: string): string => `${otp} is your Cloud Keeper sign-in code`;

export const accountCreatedEmailSubject = 'Your Cloud Keeper account is ready';
