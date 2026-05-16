import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * CamelCaseInterceptor — global response transformer.
 *
 * Converts snake_case object keys to camelCase recursively in any JSON
 * response body. Matches the contract Angular components expect:
 *   { tenant_id, first_name, fuel_type } → { tenantId, firstName, fuelType }
 *
 * Bypasses non-objects (strings, numbers, dates, buffers) and only
 * transforms keys — values pass through untouched.
 */
@Injectable()
export class CamelCaseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => transform(data)));
  }
}

const SNAKE_TO_CAMEL = /_([a-z0-9])/g;

function snakeToCamel(key: string): string {
  // Skip already-camelCased or special keys (starting with _ or uppercase)
  if (!key.includes('_') || key.startsWith('_')) return key;
  return key.replace(SNAKE_TO_CAMEL, (_, c) => c.toUpperCase());
}

function transform(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map(transform);
  if (input instanceof Date) return input;
  if (Buffer.isBuffer(input)) return input;
  if (typeof input !== 'object') return input;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    out[snakeToCamel(key)] = transform(value);
  }
  return out;
}
