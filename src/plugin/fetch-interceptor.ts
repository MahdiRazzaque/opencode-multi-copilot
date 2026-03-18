import { resolveRoute } from "../routing/model-routing.js";
import type { BaseUrlStrategy } from "../network/base-url-strategy.js";
import type { ModelMapping } from "../types.js";

type MappingStoreLike = {
  load(): Promise<ModelMapping>;
};

type FetchLike = (request: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type TokenServiceLike = {
  forceRefresh(alias: string): Promise<{
    accessToken: string;
    alias: string;
    enterpriseUrl: string | null;
  }>;
  getAccountCredentials(alias: string): Promise<{
    accessToken: string;
    alias: string;
    enterpriseUrl: string | null;
  }>;
  listAuthenticatedAliases(): Promise<string[]>;
};

export function createInterceptingFetch(input: {
  baseUrlStrategy: BaseUrlStrategy;
  downstreamFetch: FetchLike;
  mappingStore: MappingStoreLike;
  tokenService: TokenServiceLike;
}) {
  return async (request: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const originalUrl = request instanceof Request ? request.url : request.toString();
    const requestBody = await readRequestBody(request, init);
    const mapping = await input.mappingStore.load();
    const authenticatedAliases = await input.tokenService.listAuthenticatedAliases();
    const route = resolveRoute({
      authenticatedAliases,
      mapping,
      requestBody,
    });
    const account = await input.tokenService.getAccountCredentials(route.alias);
    const firstRequest = createAuthorisedRequest(
      request,
      init,
      input.baseUrlStrategy.resolveApiUrl(account, originalUrl),
      account.accessToken,
    );
    const firstResponse = await input.downstreamFetch(
      firstRequest,
    );

    if (firstResponse.status !== 401) {
      return firstResponse;
    }

    const refreshed = await input.tokenService.forceRefresh(route.alias);
    const retriedRequest = createAuthorisedRequest(
      request,
      init,
      input.baseUrlStrategy.resolveApiUrl(
        {
          alias: route.alias,
          accessToken: refreshed.accessToken,
          enterpriseUrl: refreshed.enterpriseUrl,
        },
        originalUrl,
      ),
      refreshed.accessToken,
    );
    return input.downstreamFetch(
      retriedRequest,
    );
  };
}

async function readRequestBody(
  request: RequestInfo | URL,
  init?: RequestInit,
): Promise<string | null> {
  const body = init?.body;

  if (typeof body === "string") {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }

  if (request instanceof Request) {
    return request.clone().text();
  }

  return null;
}

function createAuthorisedRequest(
  request: RequestInfo | URL,
  init: RequestInit | undefined,
  url: URL,
  accessToken: string,
): Request {
  const baseRequest = request instanceof Request ? request.clone() : undefined;
  const method = init?.method ?? baseRequest?.method ?? "GET";
  const headers = new Headers(init?.headers ?? baseRequest?.headers);
  const body = init?.body ?? readRequestBodyInit(baseRequest, method);

  headers.delete("authorization");
  headers.delete("x-api-key");
  headers.set("authorization", `Bearer ${accessToken}`);

  const requestInit: RequestInit = {
    headers,
    method,
  };

  const cache = init?.cache ?? baseRequest?.cache;
  const credentials = init?.credentials ?? baseRequest?.credentials;
  const integrity = init?.integrity ?? baseRequest?.integrity;
  const keepalive = init?.keepalive ?? baseRequest?.keepalive;
  const mode = init?.mode ?? baseRequest?.mode;
  const redirect = init?.redirect ?? baseRequest?.redirect;
  const referrer = init?.referrer ?? baseRequest?.referrer;
  const referrerPolicy = init?.referrerPolicy ?? baseRequest?.referrerPolicy;
  const signal = init?.signal ?? baseRequest?.signal;

  if (body !== undefined) {
    requestInit.body = body;
  }
  if (cache !== undefined) {
    requestInit.cache = cache;
  }
  if (credentials !== undefined) {
    requestInit.credentials = credentials;
  }
  if (integrity !== undefined) {
    requestInit.integrity = integrity;
  }
  if (keepalive !== undefined) {
    requestInit.keepalive = keepalive;
  }
  if (mode !== undefined) {
    requestInit.mode = mode;
  }
  if (redirect !== undefined) {
    requestInit.redirect = redirect;
  }
  if (referrer !== undefined) {
    requestInit.referrer = referrer;
  }
  if (referrerPolicy !== undefined) {
    requestInit.referrerPolicy = referrerPolicy;
  }
  if (signal !== undefined) {
    requestInit.signal = signal;
  }

  return new Request(url, requestInit);
}

function readRequestBodyInit(
  request: Request | undefined,
  method: string,
): BodyInit | null | undefined {
  if (!request) {
    return undefined;
  }

  if (method === "GET" || method === "HEAD") {
    return undefined;
  }

  return request.body;
}
