/**
 * Soft-deleted (anonymized) users keep the row for FK integrity but use this email pattern.
 * Exclude them from user lists, counts, and login.
 */
export const ACTIVE_USER_SQL = `email NOT LIKE 'deleted-%@invalid.local'`;

export function isSoftDeletedEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && /^deleted-.+@invalid\.local$/i.test(email);
}
