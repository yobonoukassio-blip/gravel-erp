import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { HeaderComponent } from './header.component';
import { SidenavComponent } from './sidenav.component';

@Component({
  selector: 'gravel-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatSidenavModule,
    HeaderComponent,
    SidenavComponent,
  ],
  template: `
    <mat-sidenav-container class="layout-root" hasBackdrop="false" autosize>
      <mat-sidenav mode="side" opened class="layout-sidenav">
        <gravel-sidenav />
      </mat-sidenav>
      <mat-sidenav-content class="layout-content">
        <gravel-header />
        <main class="layout-main">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [
    `
      :host { display: block; height: 100vh; }

      .layout-root {
        height: 100vh;
        background: var(--gv-bg);
      }

      .layout-sidenav {
        width: 248px;
        background: var(--gv-nav-bg);
        color: var(--gv-nav-text);
        border-right: 0 !important;
      }

      .layout-content {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: var(--gv-bg);
      }

      .layout-main {
        flex: 1 1 auto;
        padding: var(--gv-space-6) var(--gv-space-8);
        max-width: 1600px;
        width: 100%;
        animation: gv-fade-in var(--gv-duration-3) var(--gv-ease) both;
      }

      @media (max-width: 960px) {
        .layout-sidenav { width: 220px; }
        .layout-main { padding: var(--gv-space-5); }
      }
    `,
  ],
})
export class MainLayoutComponent {}
