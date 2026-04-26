/**
 * Browser-side typed client for the Stadera backend.
 *
 * Built on `openapi-fetch` consuming the codegen output in `./types.ts`.
 * The URL strings (`/me`, `/today`, …) are TYPED — calling
 * `api.GET("/typo")` is a compile error. Request bodies and response
 * shapes are inferred from the OpenAPI spec.
 *
 * `credentials: "include"` is required because the backend sets the
 * `stadera_session` cookie on a different port (8080) and the browser
 * only sends cookies on cross-origin requests when this is set
 * explicitly. Without it every authenticated endpoint returns 401.
 */

import createClient from "openapi-fetch";
import type { paths } from "./types";

export const API_URL =
	process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export const api = createClient<paths>({
	baseUrl: API_URL,
	credentials: "include",
});
