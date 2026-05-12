import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Ticket number format (ADR-0009 — refined in 02-W2-P04, TRP-02):
 *   `<SITE_CODE>-<YYYYMMDD>-<DEVICE_SHORT_ID>-<LOCAL_SEQ>`
 *   e.g. `CIV01-20260615-MOB42-0007`
 *
 * Generated offline-first on the device. Server only VALIDATES the format and
 * uniqueness (UNIQUE (tenant_id, ticket_number)). The server NEVER renumbers.
 */
export const TICKET_NUMBER_REGEX =
  /^[A-Z0-9]{2,10}-\d{8}-[A-Z0-9]{2,10}-\d{4,}$/;

export interface TicketNumberParts {
  siteCode: string;
  yyyymmdd: string;
  deviceShortId: string;
  localSeq: string;
}

@Injectable()
export class TicketNumberGeneratorService {
  /**
   * Validate format. Throws BadRequestException with `INVALID_TICKET_NUMBER_FORMAT`
   * if the format is not compliant.
   */
  validate(ticketNumber: string): TicketNumberParts {
    if (!TICKET_NUMBER_REGEX.test(ticketNumber)) {
      throw new BadRequestException({
        code: 'INVALID_TICKET_NUMBER_FORMAT',
        message: `Ticket number '${ticketNumber}' does not match ${TICKET_NUMBER_REGEX.source}`,
      });
    }
    const [siteCode, yyyymmdd, deviceShortId, localSeq] = ticketNumber.split('-');
    return { siteCode, yyyymmdd, deviceShortId, localSeq };
  }

  /**
   * Server-side canonical formatter — only used by tests / debug surfaces.
   * Production numbers are always generated client-side (offline-first).
   */
  format(parts: TicketNumberParts): string {
    const seqStr = parts.localSeq.padStart(4, '0');
    const out = `${parts.siteCode}-${parts.yyyymmdd}-${parts.deviceShortId}-${seqStr}`;
    this.validate(out);
    return out;
  }
}
