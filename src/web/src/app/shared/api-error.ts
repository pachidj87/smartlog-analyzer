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
    return 'No se pudo completar la solicitud. Comprueba la conexión e inténtalo de nuevo.';
  }

  return error instanceof Error
    ? error.message
    : 'Se produjo un error inesperado en la solicitud.';
}
