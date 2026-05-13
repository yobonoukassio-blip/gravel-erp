import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'gravel-sidenav',
  standalone: true,
  imports: [CommonModule, RouterModule, MatListModule, MatIconModule, MatDividerModule],
  template: `
    <div class="sidenav-header">
      <span class="sidenav-logo">⛏ Gravel</span>
    </div>

    <mat-nav-list dense>
      <!-- Tableau de bord -->
      <a mat-list-item routerLink="/dashboard" routerLinkActive="active">
        <mat-icon matListItemIcon>dashboard</mat-icon>
        <span matListItemTitle>Dashboard</span>
      </a>
      <a mat-list-item routerLink="/alerts-inbox" routerLinkActive="active">
        <mat-icon matListItemIcon>notifications</mat-icon>
        <span matListItemTitle>Alertes</span>
      </a>

      <mat-divider />

      <!-- Production -->
      <div class="nav-section">PRODUCTION</div>
      <a mat-list-item routerLink="/foration" routerLinkActive="active">
        <mat-icon matListItemIcon>construction</mat-icon>
        <span matListItemTitle>Foration</span>
      </a>
      <a mat-list-item routerLink="/tir" routerLinkActive="active">
        <mat-icon matListItemIcon>bolt</mat-icon>
        <span matListItemTitle>Tir de mine</span>
      </a>
      <a mat-list-item routerLink="/extraction" routerLinkActive="active">
        <mat-icon matListItemIcon>landscape</mat-icon>
        <span matListItemTitle>Extraction</span>
      </a>
      <a mat-list-item routerLink="/concassage" routerLinkActive="active">
        <mat-icon matListItemIcon>settings</mat-icon>
        <span matListItemTitle>Concassage</span>
      </a>
      <a mat-list-item routerLink="/transport" routerLinkActive="active">
        <mat-icon matListItemIcon>local_shipping</mat-icon>
        <span matListItemTitle>Transport</span>
      </a>
      <a mat-list-item routerLink="/stockpile" routerLinkActive="active">
        <mat-icon matListItemIcon>inventory_2</mat-icon>
        <span matListItemTitle>Stockpile</span>
      </a>

      <mat-divider />

      <!-- Commercial -->
      <div class="nav-section">COMMERCIAL</div>
      <a mat-list-item routerLink="/ventes" routerLinkActive="active">
        <mat-icon matListItemIcon>receipt_long</mat-icon>
        <span matListItemTitle>Ventes & BL</span>
      </a>
      <a mat-list-item routerLink="/finance" routerLinkActive="active">
        <mat-icon matListItemIcon>account_balance</mat-icon>
        <span matListItemTitle>Finance</span>
      </a>

      <mat-divider />

      <!-- Opérations -->
      <div class="nav-section">OPÉRATIONS</div>
      <a mat-list-item routerLink="/fuel" routerLinkActive="active">
        <mat-icon matListItemIcon>local_gas_station</mat-icon>
        <span matListItemTitle>Carburant</span>
      </a>
      <a mat-list-item routerLink="/maintenance" routerLinkActive="active">
        <mat-icon matListItemIcon>build</mat-icon>
        <span matListItemTitle>Maintenance</span>
      </a>
      <a mat-list-item routerLink="/hse" routerLinkActive="active">
        <mat-icon matListItemIcon>health_and_safety</mat-icon>
        <span matListItemTitle>HSE</span>
      </a>
      <a mat-list-item routerLink="/rh" routerLinkActive="active">
        <mat-icon matListItemIcon>badge</mat-icon>
        <span matListItemTitle>RH</span>
      </a>

      <mat-divider />

      <!-- Administration -->
      <div class="nav-section">ADMIN</div>
      <a mat-list-item routerLink="/sites" routerLinkActive="active">
        <mat-icon matListItemIcon>terrain</mat-icon>
        <span matListItemTitle>Sites</span>
      </a>
      <a mat-list-item routerLink="/activity-log" routerLinkActive="active">
        <mat-icon matListItemIcon>list_alt</mat-icon>
        <span matListItemTitle>Journal activité</span>
      </a>
    </mat-nav-list>
  `,
  styles: [`
    .sidenav-header {
      padding: 16px;
      background: #1e293b;
      color: #fff;
    }
    .sidenav-logo {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: .04em;
    }
    .nav-section {
      padding: 12px 16px 4px;
      font-size: 10px;
      font-weight: 700;
      color: #94a3b8;
      letter-spacing: .08em;
    }
    .active {
      background: rgba(30, 41, 59, 0.08) !important;
      border-right: 3px solid #1D4ED8;
    }
  `],
})
export class SidenavComponent {}
