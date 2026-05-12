import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';
import { LeafletModule } from '@asymmetrik/ngx-leaflet';
import * as L from 'leaflet';

/**
 * Formly custom field: Leaflet polygon drawer → emits GeoJSON
 * `{type:'Polygon', coordinates:[[[lng,lat],...]]}`.
 *
 * Sequential clicks append vertices. Double-click closes the polygon. The
 * form control receives a closed GeoJSON Polygon (first vertex repeated as
 * last per RFC 7946).
 */
@Component({
  selector: 'gravel-polygon-picker-leaflet',
  standalone: true,
  imports: [CommonModule, LeafletModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      data-testid="polygon-picker-leaflet"
      class="polygon-picker"
      leaflet
      [leafletOptions]="mapOptions"
      [leafletLayers]="layers"
      (leafletClick)="onMapClick($event)"
      (leafletDblClick)="onDoubleClick()"
      style="height:360px;width:100%;border:1px solid #ddd;border-radius:4px;"
    ></div>
    <p *ngIf="vertices.length > 0" data-testid="polygon-vertex-count">
      {{ vertices.length }} sommet(s)
    </p>
  `,
})
export class PolygonPickerLeafletType extends FieldType<FieldTypeConfig> {
  vertices: L.LatLng[] = [];
  layers: L.Layer[] = [];
  private polyline?: L.Polyline;

  readonly mapOptions: L.MapOptions = {
    layers: [
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap contributors',
      }),
    ],
    zoom: 12,
    center: L.latLng(5.345, -4.024),
  };

  onMapClick(event: L.LeafletMouseEvent): void {
    this.vertices = [...this.vertices, event.latlng];
    this.redraw();
  }

  onDoubleClick(): void {
    if (this.vertices.length < 3) return;
    const closed = [...this.vertices, this.vertices[0]];
    const coordinates = closed.map((v) => [v.lng, v.lat]);
    this.formControl.setValue({
      type: 'Polygon',
      coordinates: [coordinates],
    });
    this.formControl.markAsDirty();

    const polygon = L.polygon(closed);
    this.layers = [polygon];
  }

  private redraw(): void {
    if (this.polyline) {
      this.layers = this.layers.filter((l) => l !== this.polyline);
    }
    this.polyline = L.polyline(this.vertices, { color: '#3949ab' });
    this.layers = [...this.layers, this.polyline];
  }
}
