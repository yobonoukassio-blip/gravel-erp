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
      <a mat-list-item routerLink="/sites" routerLinkActive="active">
        <mat-icon matListItemIcon>terrain</mat-icon>
        <span>{{ 'nav.sites' | transloco }}</span>
      </a>
      <a mat-list-item routerLink="/zones" routerLinkActive="active">
        <mat-icon matListItemIcon>map</mat-icon>
        <span>{{ 'nav.zones' | transloco }}</span>
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
