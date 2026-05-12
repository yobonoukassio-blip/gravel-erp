import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';
import { LeafletModule } from '@asymmetrik/ngx-leaflet';
import * as L from 'leaflet';

/**
 * Formly custom field: Leaflet map → emits GeoJSON `{type:'Point', coordinates:[lng,lat]}`.
 * Clicking the map sets the marker. The Formly form control receives the
 * GeoJSON payload directly, ready for the API.
 */
@Component({
  selector: 'gravel-gps-picker-leaflet',
  standalone: true,
  imports: [CommonModule, LeafletModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      data-testid="gps-picker-leaflet"
      class="gps-picker"
      leaflet
      [leafletOptions]="mapOptions"
      [leafletLayers]="layers"
      (leafletClick)="onMapClick($event)"
      style="height:300px;width:100%;border:1px solid #ddd;border-radius:4px;"
    ></div>
    <p *ngIf="formControl.value as v" class="gps-readout" data-testid="gps-readout">
      lat: {{ v.coordinates[1] | number: '1.4-4' }}, lng:
      {{ v.coordinates[0] | number: '1.4-4' }}
    </p>
  `,
})
export class GpsPickerLeafletType extends FieldType<FieldTypeConfig> {
  private marker?: L.Marker;
  layers: L.Layer[] = [];

  readonly mapOptions: L.MapOptions = {
    layers: [
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap contributors',
      }),
    ],
    zoom: 6,
    center: L.latLng(7.539, -5.547),
  };

  onMapClick(event: L.LeafletMouseEvent): void {
    const lat = event.latlng.lat;
    const lng = event.latlng.lng;

    if (this.marker) {
      this.marker.setLatLng(event.latlng);
    } else {
      this.marker = L.marker(event.latlng);
      this.layers = [...this.layers, this.marker];
    }

    this.formControl.setValue({
      type: 'Point',
      coordinates: [lng, lat],
    });
    this.formControl.markAsDirty();
  }
}
