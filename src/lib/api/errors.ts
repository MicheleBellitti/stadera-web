/**
 * `ApiError` carries the HTTP status code plus the parsed `ErrorBody` from
 * the backend. We need both: status drives retry/redirect logic (e.g. 401
 * → redirect to landing), the body carries a stable `code` and human
 * `message` for UI surfacing.
 *
 * `openapi-fetch` returns `{ data, error, response }` rather than
 * throwing so callers can pattern-match exhaustively. For TanStack Query
 * hooks we want the conventional throw-on-error contract — `unwrap()`
 * bridges the two.
 */

import type { components } from "./types";

export type ErrorBody = components["schemas"]["ErrorBody"];

export class ApiError extends Error {
	readonly status: number;
	readonly body: ErrorBody | undefined;

	constructor(status: number, body: ErrorBody | undefined) {
		super(body?.message ?? `API error ${status}`);
		this.name = "ApiError";
		this.status = status;
		this.body = body;
	}
}

type FetchResult<T> = {
	data?: T;
	error?: ErrorBody;
	response: Response;
};

/**
 * Convert `openapi-fetch`'s `{data, error, response}` triple into a
 * throw-on-error promise. For 2xx with no body (e.g. 204 No Content)
 * `data` is `undefined` and we return `undefined as T` — callers
 * intentionally typing `T = void` get clean ergonomics.
 */
export async function unwrap<T>(p: Promise<FetchResult<T>>): Promise<T> {
	const { data, error, response } = await p;
	if (error !== undefined) {
		throw new ApiError(response.status, error);
	}
	if (!response.ok) {
		throw new ApiError(response.status, undefined);
	}
	return data as T;
}
