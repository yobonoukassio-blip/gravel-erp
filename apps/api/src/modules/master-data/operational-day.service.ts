import { Injectable } from '@nestjs/common';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * OperationalDayService — pure resolver. D-19, D-20, D-21. PITFALLS.md #9.
 *
 * The "business date" is the calendar day in the site's local timezone that
 * STARTED at `shift_start_local`. Events with local time `>= shift_start_local`
 * belong to the SAME local date; events earlier belong to the PREVIOUS date.
 *
 * Boundary policy (Pitfall #7):
 *   - Lower bound inclusive  (>=)
 *   - Upper bound exclusive  (<)
 *
 * DST policy (D-21): we use the SITE's IANA timezone, which date-fns-tz handles
 * correctly across fall-back (duplicated 02:30) and spring-forward (skipped
 * 02:30). For the fall-back case, both occurrences of 02:30 local map back to
 * the same business_date (i.e. the local calendar wins; we don't try to
 * disambiguate by UTC offset).
 */
@Injectable()
export class OperationalDayService {
  /**
   * Resolve the business_date for an event observed at `eventUtc` for a site
   * whose local timezone is `siteIanaTz` and whose shift boundary is
   * `shiftStartLocal` (HH:mm[:ss], 24h).
   *
   * Returns the local calendar date as `YYYY-MM-DD`.
   */
  resolveBusinessDate(
    siteIanaTz: string,
    shiftStartLocal: string,
    eventUtc: Date,
  ): string {
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(shiftStartLocal)) {
      throw new Error(`Invalid shiftStartLocal '${shiftStartLocal}', expected HH:mm[:ss]`);
    }

    // Local calendar date + time of the event.
    const localDate = formatInTimeZone(eventUtc, siteIanaTz, 'yyyy-MM-dd');
    const localTime = formatInTimeZone(eventUtc, siteIanaTz, 'HH:mm:ss');

    // Compare HH:mm:ss strings — lexical order matches chronological order
    // because both are zero-padded 24h.
    const shiftStartNorm =
      shiftStartLocal.length === 5 ? shiftStartLocal + ':00' : shiftStartLocal;

    if (localTime >= shiftStartNorm) {
      return localDate;
    }
    // Before shift start: belongs to the PREVIOUS local calendar date.
    // Compute by subtracting 1 day in the local zone.
    return formatInTimeZone(
      this.shiftLocalDay(eventUtc, siteIanaTz, -1),
      siteIanaTz,
      'yyyy-MM-dd',
    );
  }

  /**
   * Compute UTC instant that, when projected into `tz`, has the local date
   * shifted by `days` (positive or negative) at the same local clock time.
   */
  private shiftLocalDay(eventUtc: Date, tz: string, days: number): Date {
    const localIso = formatInTimeZone(eventUtc, tz, "yyyy-MM-dd'T'HH:mm:ss");
    // Parse local components manually.
    const [datePart, timePart] = localIso.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const shifted = new Date(Date.UTC(y, m - 1, d + days));
    const newLocalIso = `${shifted.toISOString().slice(0, 10)}T${timePart}`;
    return fromZonedTime(newLocalIso, tz);
  }

  /**
   * Build the OperationalDay UTC window [startedAtUtc, endedAtUtc) for a given
   * business_date in the site's timezone.
   */
  computeUtcWindow(
    siteIanaTz: string,
    shiftStartLocal: string,
    businessDate: string,
  ): { startedAtUtc: Date; endedAtUtc: Date } {
    const shiftStartNorm =
      shiftStartLocal.length === 5 ? shiftStartLocal + ':00' : shiftStartLocal;
    const startedAtUtc = fromZonedTime(`${businessDate}T${shiftStartNorm}`, siteIanaTz);

    // Next-day same local time.
    const [y, m, d] = businessDate.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const nextDate = next.toISOString().slice(0, 10);
    const endedAtUtc = fromZonedTime(`${nextDate}T${shiftStartNorm}`, siteIanaTz);
    return { startedAtUtc, endedAtUtc };
  }
}
