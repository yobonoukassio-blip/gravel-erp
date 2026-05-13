import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type OhadaTarget = 'sage' | 'ciel' | 'odoo';

/**
 * OhadaExportService (FIN-05).
 *
 * Generates accountant-ready CSV export of analytical_entry rows for a period.
 * Format adapts per target (Sage / Ciel / Odoo). OHADA discipline:
 * the ERP owns ANALYTICAL accounting only; classical/general accounting
 * stays in the accountant's tool (per project CLAUDE.md constraint).
 */
@Injectable()
export class OhadaExportService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async exportForPeriod(params: {
    tenantId: string;
    siteId: string;
    periodFrom: string;
    periodTo: string;
    target: OhadaTarget;
  }): Promise<string> {
    const entries = await this.ds.query<
      Array<{
        entry_date: string;
        cost_center: string;
        activity: string;
        label: string;
        amount_minor: string;
        currency: string;
        debit_credit: 'D' | 'C';
      }>
    >(
      `SELECT entry_date::text, cost_center, activity, label,
              amount_minor_units::text AS amount_minor, currency, debit_credit
       FROM analytical_entry
       WHERE tenant_id = $1 AND site_id = $2
         AND entry_date BETWEEN $3 AND $4
       ORDER BY entry_date, cost_center`,
      [params.tenantId, params.siteId, params.periodFrom, params.periodTo],
    );

    switch (params.target) {
      case 'sage':
        return this.formatSage(entries);
      case 'ciel':
        return this.formatCiel(entries);
      case 'odoo':
        return this.formatOdoo(entries);
    }
  }

  /** Sage 100 OHADA: tab-separated with header — date | cc | activity | label | amount | DC | currency */
  private formatSage(rows: Array<{ entry_date: string; cost_center: string; activity: string; label: string; amount_minor: string; currency: string; debit_credit: 'D' | 'C' }>): string {
    const header = ['Date', 'CostCenter', 'Activity', 'Label', 'AmountMinor', 'Currency', 'DebitCredit'].join('\t');
    const lines = rows.map(
      (r) =>
        [r.entry_date, r.cost_center, r.activity, r.label, r.amount_minor, r.currency, r.debit_credit].join('\t'),
    );
    return [header, ...lines].join('\n');
  }

  /** Ciel: semicolon-separated, decimal converted (XOF has 0 decimals — display as integer) */
  private formatCiel(rows: Array<{ entry_date: string; cost_center: string; activity: string; label: string; amount_minor: string; currency: string; debit_credit: 'D' | 'C' }>): string {
    const lines = rows.map((r) => {
      // XOF has 0 decimals — amount_minor IS the displayable value. EUR/USD have 2 decimals → divide by 100.
      const displayAmount =
        r.currency === 'XOF' ? r.amount_minor : (Number(r.amount_minor) / 100).toFixed(2);
      return [r.entry_date, r.cost_center, r.activity, r.label, displayAmount, r.currency, r.debit_credit].join(';');
    });
    return lines.join('\n');
  }

  /** Odoo: JSON-friendly CSV with quoted strings */
  private formatOdoo(rows: Array<{ entry_date: string; cost_center: string; activity: string; label: string; amount_minor: string; currency: string; debit_credit: 'D' | 'C' }>): string {
    const header = 'date,cost_center,activity,label,amount_minor,currency,dr_cr';
    const lines = rows.map(
      (r) =>
        `${r.entry_date},${r.cost_center},${r.activity},"${r.label.replace(/"/g, '""')}",${r.amount_minor},${r.currency},${r.debit_credit}`,
    );
    return [header, ...lines].join('\n');
  }
}
