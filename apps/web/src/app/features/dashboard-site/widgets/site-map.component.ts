import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';

export interface SiteMapZone {
  id: string;
  label: string;
  coordinates: [number, number][];
  color?: string;
}

export interface SiteMapMarker {
  id: string;
  label: string;
  lat: number;
  lng: number;
  type: 'bench' | 'stockpile' | 'fuel_tank' | 'equipment';
  status?: string;
}

/**
 * SiteMapComponent — Leaflet wrapper for the site plan (DSH-01, D2-91).
 *
 * Phase 2: static positions only (no live telematics — IoT is Phase 5).
 * Displays: zones (polygons), bench markers, stockpile markers,
 * fuel tank markers. Equipment positions are manual-entry placeholders.
 *
 * Leaflet is loaded via dependency; tiles are OSM (swappable to MapTiler
 * via environment config).
 */
@Component({
  selector: 'gravel-site-map',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="map-wrapper">
      <div #mapContainer class="leaflet-map" [attr.aria-label]="'Site map'"></div>
      <span class="map-phase-note">
        Positions terrain (Phase 2 — statique, télématique IoT Phase 5)
      </span>
    </div>
  `,
  styles: [`
    .map-wrapper  { position: relative; }
    .leaflet-map  { height: 400px; width: 100%; border-radius: 8px; }
    .map-phase-note {
      position: absolute;
      bottom: 8px; right: 8px;
      background: rgba(255,255,255,.85);
      padding: 2px 8px;
      font-size: 11px;
      border-radius: 4px;
      pointer-events: none;
    }
  `],
})
export class SiteMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  @Input() center: [number, number] = [5.354, -4.005]; // Default: Abidjan area
  @Input() zoom = 14;
  @Input() zones: SiteMapZone[] = [];
  @Input() markers: SiteMapMarker[] = [];

  private map: L.Map | null = null;

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = null;
  }

  private initMap(): void {
    const el = this.mapContainer.nativeElement;
    if (!el) return;

    this.map = L.map(el, {
      center: this.center,
      zoom: this.zoom,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(this.map);

    this.renderZones();
    this.renderMarkers();
  }

  private renderZones(): void {
    if (!this.map) return;
    for (const zone of this.zones) {
      L.polygon(zone.coordinates, {
        color: zone.color ?? '#3b82f6',
        fillOpacity: 0.15,
        weight: 2,
      })
        .bindPopup(zone.label)
        .addTo(this.map);
    }
  }

  private renderMarkers(): void {
    if (!this.map) return;
    for (const m of this.markers) {
      const icon = this.iconForType(m.type);
      L.marker([m.lat, m.lng], { icon })
        .bindPopup(`<b>${m.label}</b>${m.status ? `<br/>${m.status}` : ''}`)
        .addTo(this.map);
    }
  }

  private iconForType(type: SiteMapMarker['type']): L.DivIcon {
    const colors: Record<string, string> = {
      bench: '#8b5cf6',
      stockpile: '#f59e0b',
      fuel_tank: '#ef4444',
      equipment: '#6b7280',
    };
    const color = colors[type] ?? '#6b7280';
    return L.divIcon({
      html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
      className: '',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
  }
}
