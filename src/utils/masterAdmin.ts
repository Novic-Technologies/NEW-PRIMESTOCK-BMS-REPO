import { User } from '../types';

export const MASTER_ADMIN_EMAILS = ['davidmagero22@gmail.com'];

export function isMasterEmail(email?: string | null): boolean {
  if (!email) return false;
  return MASTER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export function isMasterUser(user?: User | null, hasMasterDoc = false): boolean {
  if (!user) return false;
  return hasMasterDoc || isMasterEmail(user.email);
}
