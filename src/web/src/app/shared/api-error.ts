import { HttpErrorResponse } from '@angular/common/http';

/**
 * Turns an HTTP failure into a message that is safe to render.
 *
 * The API always answers with `{ statusCode, error, message, path, timestamp }`,
 * so the payload message is preferred over the generic Angular transport text.
 */
export function describeHttpError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const payload = error.error?.message;
    if (typeof payload === 'string' && payload.trim()) {
      return payload;
    }
    if (Array.isArray(payload) && payload.length > 0) {
      return payload.join(', ');
    }
    return error.message;
  }

  return error instanceof Error ? error.message : 'Unexpected request error';
}
