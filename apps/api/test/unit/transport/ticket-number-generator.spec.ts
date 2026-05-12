import { BadRequestException } from '@nestjs/common';
import {
  TICKET_NUMBER_REGEX,
  TicketNumberGeneratorService,
} from '../../../src/modules/transport/services/ticket-number-generator.service';

/**
 * TRP-02 / ADR-0009 — ticket number format validation.
 *
 * Format: <SITE_CODE>-<YYYYMMDD>-<DEVICE_SHORT_ID>-<LOCAL_SEQ>
 * Regex:  ^[A-Z0-9]{2,10}-\d{8}-[A-Z0-9]{2,10}-\d{4,}$
 */
describe('TicketNumberGeneratorService (TRP-02, ADR-0009)', () => {
  let svc: TicketNumberGeneratorService;

  beforeEach(() => {
    svc = new TicketNumberGeneratorService();
  });

  it('regex accepts canonical example CIV01-20260615-MOB42-0007', () => {
    expect(TICKET_NUMBER_REGEX.test('CIV01-20260615-MOB42-0007')).toBe(true);
  });

  it('validate returns parts for canonical example', () => {
    const parts = svc.validate('CIV01-20260615-MOB42-0007');
    expect(parts).toEqual({
      siteCode: 'CIV01',
      yyyymmdd: '20260615',
      deviceShortId: 'MOB42',
      localSeq: '0007',
    });
  });

  it('rejects lowercase site code', () => {
    expect(() => svc.validate('civ01-20260615-MOB42-0007')).toThrow(
      BadRequestException,
    );
  });

  it('rejects missing day component', () => {
    expect(() => svc.validate('CIV01-202606-MOB42-0007')).toThrow(
      BadRequestException,
    );
  });

  it('rejects 3-digit sequence', () => {
    expect(() => svc.validate('CIV01-20260615-MOB42-007')).toThrow(
      BadRequestException,
    );
  });

  it('accepts >4-digit sequence (no upper bound)', () => {
    expect(TICKET_NUMBER_REGEX.test('CIV01-20260615-MOB42-12345')).toBe(true);
  });

  it('format pads sequence to 4 digits', () => {
    const out = svc.format({
      siteCode: 'CIV01',
      yyyymmdd: '20260615',
      deviceShortId: 'MOB42',
      localSeq: '7',
    });
    expect(out).toBe('CIV01-20260615-MOB42-0007');
  });

  it('two simulated devices produce unique numbers on same day', () => {
    // Simulate device A and device B both starting at seq 1.
    const dayA = svc.format({
      siteCode: 'CIV01',
      yyyymmdd: '20260615',
      deviceShortId: 'MOB01',
      localSeq: '1',
    });
    const dayB = svc.format({
      siteCode: 'CIV01',
      yyyymmdd: '20260615',
      deviceShortId: 'MOB02',
      localSeq: '1',
    });
    expect(dayA).not.toBe(dayB);
    expect(new Set([dayA, dayB]).size).toBe(2);
  });
});
