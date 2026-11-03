export const CLIENT_SAFE_RESPONSE = Symbol('CLIENT_SAFE_RESPONSE');

export interface ClientSafeResponse {
  readonly [CLIENT_SAFE_RESPONSE]: true;
}

/**
 * Marks an exception response body as written for the client.
 *
 * `GlobalHttpExceptionFilter` flattens unmarked 5xx payloads to avoid leaking
 * internal details. A handler that builds a deliberate, failure-reporting body
 * (for example the health endpoint listing the unhealthy dependencies) can opt
 * out of that flattening by marking the response with this helper. The marker
 * is non-enumerable, so it never reaches the serialized JSON.
 */
export function markClientSafeResponse<T extends object>(
  response: T,
): T & ClientSafeResponse {
  Object.defineProperty(response, CLIENT_SAFE_RESPONSE, {
    value: true,
    enumerable: false,
  });

  return response as T & ClientSafeResponse;
}

export function isClientSafeResponse(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[CLIENT_SAFE_RESPONSE] === true
  );
}
