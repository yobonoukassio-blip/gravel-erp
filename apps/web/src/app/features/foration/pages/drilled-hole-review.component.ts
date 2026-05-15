import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { ForationApiService, DrilledHole } from '../services/foration-api.service';

/**
 * Read-only review of drilled holes for a plan.
 *
 * Columns include `tolerance_violation` rendered as a red badge when true
 * (D2-12). Read-only because drilled_hole is append-only — corrections
 * happen on mobile via a new row with `corrects_hole_id`.
 *
 * TODO(map): Plot gps_point coordinates with Leaflet + OSM tiles in a
 * follow-up. (OSS-only; no MapTiler.)
 */
@Component({
  selector: 'gravel-drilled-hole-review',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="hole-review">
      <h1>{{ 'foration.drilled_hole_review_title' | transloco }}</h1>
      <ag-grid-angular
        class="ag-theme-material"
        style="width: 100%; height: 600px"
        [rowData]="rows()"
        [columnDefs]="columnDefs"
      />
      <p class="hint">tolerance_violation rows are flagged red.</p>
    </div>
  `,
  styles: [
    `
      .badge-violation { background: #c62828; color: white; padding: 2px 8px; border-radius: 12px; }
      .badge-ok { background: #2e7d32; color: white; padding: 2px 8px; border-radius: 12px; }
      .hint { margin-top: 0.5rem; color: #666; font-size: 0.85rem; }
    `,
  ],
})
export class DrilledHoleReviewComponent implements OnInit {
  private readonly api = inject(ForationApiService);
  private readonly route = inject(ActivatedRoute);

  readonly rows = signal<DrilledHole[]>([]);

  readonly columnDefs: ColDef<any>[] = [
    { field: 'holeIndexInPlan', headerName: 'Hole Index', width: 100 },
    {
      field: 'gpsPoint',
      headerName: 'Gps',
      width: 220,
      valueFormatter: (p) => {
        const v = p.value as { coordinates: [number, number] } | null;
        return v ? `${v.coordinates[1].toFixed(5)}, ${v.coordinates[0].toFixed(5)}` : '—';
      },
    },
    { field: 'gpsAccuracyM', headerName: 'Gps Accuracy M', width: 140 },
    { field: 'actualDepthM', headerName: 'Actual Depth M', width: 140 },
    { field: 'actualDiameterMm', headerName: 'Actual Diameter Mm', width: 150 },
    {
      field: 'toleranceViolation',
      headerName: 'Tolerance Violation',
      width: 160,
      cellRenderer: (p: { value: boolean }) =>
        p.value
          ? `<span class="badge-violation">tolerance_violation</span>`
          : `<span class="badge-ok">OK</span>`,
    },
    { field: 'operatorId', headerName: 'Operator', width: 160 },
    { field: 'machineId', headerName: 'Machine', width: 160 },
    { field: 'fuelLitersConsumed', headerName: 'Fuel Liters', width: 130 },
  ];

  ngOnInit(): void {
    const planId = this.route.snapshot.queryParamMap.get('plan_id');
    if (!planId) return;
    this.api.listHoles(planId).subscribe((rows) => this.rows.set(rows));
  }
}
