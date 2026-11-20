import { NSSF_EMPLOYEE, NSSF_EMPLOYER, PAYE_BRACKETS } from '../constants';
import { PayrollEntry } from '../types';

/**
 * Calculates Uganda monthly PAYE using URA progressive brackets.
 */
export function calculateUgPaye(grossMonthlyUgx: number): number {
  const gross = Math.max(0, Math.round(grossMonthlyUgx));
  if (gross <= 235000) return 0;

  let tax = 0;
  for (const bracket of PAYE_BRACKETS) {
    if (gross <= bracket.min) break;
    const upper = bracket.max === Infinity ? gross : Math.min(gross, bracket.max);
    const lowerBound = bracket.min === 0 ? 0 : bracket.min - 1;
    const taxableSlice = Math.max(0, upper - lowerBound);
    tax += taxableSlice * bracket.rate;
  }

  return Math.round(tax);
}

export function calculatePayrollEntry(params: {
  memberUid: string;
  memberName: string;
  role: string;
  grossSalaryUgx: number;
}): PayrollEntry {
  const gross = Math.max(0, Math.round(params.grossSalaryUgx));
  const payeTaxUgx = calculateUgPaye(gross);
  const nssfEmployeeUgx = Math.round(gross * NSSF_EMPLOYEE);
  const nssfEmployerUgx = Math.round(gross * NSSF_EMPLOYER);
  const netPayUgx = Math.max(0, gross - payeTaxUgx - nssfEmployeeUgx);

  return {
    memberUid: params.memberUid,
    memberName: params.memberName,
    role: params.role,
    grossSalaryUgx: gross,
    payeTaxUgx,
    nssfEmployeeUgx,
    nssfEmployerUgx,
    netPayUgx,
  };
}
