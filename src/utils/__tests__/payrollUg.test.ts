import { describe, expect, it } from 'vitest';
import { calculatePayrollEntry, calculateUgPaye } from '../payrollUg';

describe('Uganda PAYE & NSSF Payroll Calculations', () => {
  it('returns zero PAYE at or below the 235,000 UGX threshold', () => {
    expect(calculateUgPaye(0)).toBe(0);
    expect(calculateUgPaye(-50000)).toBe(0);
    expect(calculateUgPaye(235000)).toBe(0);
  });

  it('computes 10% bracket between 235,001 and 335,000 UGX', () => {
    expect(calculateUgPaye(300000)).toBe(6500);
    expect(calculateUgPaye(335000)).toBe(10000);
  });

  it('computes 20% bracket between 335,001 and 410,000 UGX', () => {
    expect(calculateUgPaye(410000)).toBe(25000);
  });

  it('computes 30% top bracket above 410,000 UGX', () => {
    expect(calculateUgPaye(500000)).toBe(52000);
    expect(calculateUgPaye(1000000)).toBe(202000);
    expect(calculateUgPaye(12000000)).toBe(3502000);
  });

  it('computes 5% employee NSSF, 10% employer NSSF, and net pay accurately', () => {
    const entry = calculatePayrollEntry({
      memberUid: 'emp-1',
      memberName: 'Grace Namukasa',
      role: 'cashier',
      grossSalaryUgx: 1000000,
    });

    expect(entry.grossSalaryUgx).toBe(1000000);
    expect(entry.payeTaxUgx).toBe(202000);
    expect(entry.nssfEmployeeUgx).toBe(50000);
    expect(entry.nssfEmployerUgx).toBe(100000);
    expect(entry.netPayUgx).toBe(748000);
  });

  it('clamps negative gross salaries to zero across all fields', () => {
    const entry = calculatePayrollEntry({
      memberUid: 'emp-2',
      memberName: 'Inactive Staff',
      role: 'inventory',
      grossSalaryUgx: -150000,
    });

    expect(entry.grossSalaryUgx).toBe(0);
    expect(entry.payeTaxUgx).toBe(0);
    expect(entry.nssfEmployeeUgx).toBe(0);
    expect(entry.nssfEmployerUgx).toBe(0);
    expect(entry.netPayUgx).toBe(0);
  });
});
