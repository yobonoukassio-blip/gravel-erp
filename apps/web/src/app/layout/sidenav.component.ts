import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'gravel-sidenav',
  standalone: true,
  imports: [CommonModule, RouterModule, MatListModule, MatIconModule, TranslocoModule],
  template: `
    <mat-nav-list>
      <a mat-list-item routerLink="/dashboard" routerLinkActive="active">
        <mat-icon matListItemIcon>dashboard</mat-icon>
        <span>{{ 'nav.dashboard' | transloco }}</span>
      </a>
      <a mat-list-item routerLink="/alerts-inbox" routerLinkActive="active">
        <mat-icon matListItemIcon>notifications</mat-icon>
        <span>{{ 'nav.alertsInbox' | transloco }}</span>
      </a>
      <a mat-list-item routerLink="/foration" routerLinkActive="active">
        <mat-icon matListItemIcon>construction</mat-icon>
        <span>Foration</span>
      </a>
      <a mat-list-item routerLink="/extraction" routerLinkActive="active">
        <mat-icon matListItemIcon>landscape</mat-icon>
        <span>Extraction</span>
      </a>
      <a mat-list-item routerLink="/transport" routerLinkActive="active">
        <mat-icon matListItemIcon>local_shipping</mat-icon>
        <span>Transport</span>
      </a>
      <a mat-list-item routerLink="/stockpile" routerLinkActive="active">
        <mat-icon matListItemIcon>inventory_2</mat-icon>
        <span>Stockpile</span>
      </a>
      <a mat-list-item routerLink="/fuel" routerLinkActive="active">
        <mat-icon matListItemIcon>local_gas_station</mat-icon>
        <span>Carburant</span>
      </a>
      <a mat-list-item routerLink="/hse" routerLinkActive="active">
        <mat-icon matListItemIcon>health_and_safety</mat-icon>
        <span>HSE</span>
      </a>
      <a mat-list-item routerLink="/rh" routerLinkActive="active">
        <mat-icon matListItemIcon>badge</mat-icon>
        <span>RH</span>
      </a>
      <a mat-list-item routerLink="/sites" routerLinkActive="active">
        <mat-icon matListItemIcon>terrain</mat-icon>
        <span>{{ 'nav.sites' | transloco }}</span>
      </a>
      <a mat-list-item routerLink="/permits" routerLinkActive="active">
        <mat-icon matListItemIcon>policy</mat-icon>
        <span>{{ 'nav.permits' | transloco }}</span>
      </a>
      <a mat-list-item routerLink="/activity-log" routerLinkActive="active">
        <mat-icon matListItemIcon>list_alt</mat-icon>
        <span>{{ 'nav.activityLog' | transloco }}</span>
      </a>
    </mat-nav-list>
  `,
  styles: [`.active { background: rgba(0,0,0,0.06); }`],
})
export class SidenavComponent {}
