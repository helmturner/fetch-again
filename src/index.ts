



/**
 * The options object for the fetchWithRetry function.
 * @template TFetchFn The type of the function passed as fetchFn. If not
 * provided, the global fetch function will be used. If the global fetch
 * is not available, node-fetch will be used, if installed.
 * @template TErrorType The type of the error that will be thrown if the
 * request cannot be retried. Defaults to the return type of the fetchFn.
 *
 * @example (using axios)
 * ```typescript
 * const options: RetryOptions<typeof axios.get<SomeRemoteAPIData>, AxiosError> = {
 *   fetchFn: axios.get,
 *   retries: 3,
 *   factor: 2,
 *   minTimeout: 1000,
 *   maxTimeout: 10_000,
 *   randomize: false,
 *   retryOn: (result, count) => {
 *     // `result` is typed as either TErrorType or the return type of TFetchFn here.
 *   },
 *   onRetry: (result, count) => {
 *     // `result` is typed as either TErrorType or the return type of TFetchFn here.
 *   }
 * ```
 */

export type RetryOptions<
  TFetchFn extends
    | ((...arguments_: any[]) => Promise<any>)
    | undefined = undefined,
  TErrorType = TFetchFn extends undefined
    ? ResultOf<DefaultFetch>
    : ResultOf<TFetchFn>
> = Omit<
  Parameters<
    TFetchFn extends undefined
      ? typeof fetchWithRetry<
          Parameters<DefaultFetch>,
          ResultOf<DefaultFetch>,
          DefaultFetch,
          TErrorType
        >
      : typeof fetchWithRetry<
          Parameters<TFetchFn>,
          ResultOf<TFetchFn>,
          TFetchFn,
          TErrorType
        >
  >[0],
  "fetchFn" | "retryOn"
> &
  (TFetchFn extends undefined
    ? {
        fetchFn?: undefined;
        retryOn?: (result: ResultOf<DefaultFetch>, count: number) => boolean;
      }
    : {
        fetchFn: TFetchFn;
        retryOn: (result: ResultOf<TFetchFn>, count: number) => boolean;
      });

type DefaultFetch = ResultOf<typeof getDefaultFetchImplementation>;
type ResultOf<T> = T extends (...args: any[]) => Promise<infer P>
  ? P
  : T extends (...args: any[]) => infer R
  ? R
  : never;

const defaultRetryTest = (result: unknown, count: number) => {
  if (count === 0) return false;

  if (typeof result !== "object") {
    throw new TypeError(
      `Unexpected result type: Expected object, got ${typeof result}`
    );
  }

  if (result === null) return true;
  if ("ok" in result) return !result.ok;

  const returnCode = Object.values(result).find((value): value is number => {
    return typeof value === "number" && value > 99 && value < 600;
  });

  if (returnCode) {
    return new Set([408, 413, 429, 500, 502, 503, 504]).has(returnCode);
  }

  throw new TypeError(
    "Unable to determine if request can be retried. " +
      "If you are manually providing a fetch function, " +
      "you must also provide a retryOn function."
  );
};

async function getDefaultFetchImplementation() {
  if (typeof fetch !== "undefined") return fetch;
  if (typeof window !== "undefined" && window.fetch) return window.fetch;
  if (typeof global !== "undefined" && global.fetch) return global.fetch;
  try {
    const { default: nodeFetch } = await import("node-fetch");
    return nodeFetch;
  } catch {
    throw new Error(
      "Unable to find fetch implementation. " +
        "Either pass `fetchFn` and `retryOn` in the options object " +
        "or install `node-fetch` as a dependency."
    );
  }
}

export default async function fetchWithRetry<
  TFetchParams extends any[] = any[],
  TReturn = ResultOf<DefaultFetch>,
  TCustomFetchFn extends
    | ((any: any) => Promise<TReturn>)
    | undefined = undefined,
  TError = TReturn
>(
  options: (undefined extends TCustomFetchFn
    ? { retryOn?: (result: TReturn | TError, count: number) => boolean }
    : { retryOn: (result: TReturn | TError, count: number) => boolean }) & {
    fetchFn?: TCustomFetchFn | undefined;
    retries?: number | undefined;
    factor?: number | undefined;
    minTimeout?: number | undefined;
    maxTimeout?: number | undefined;
    randomize?: boolean | undefined;
    onRetry?: ((result: TReturn | TError, count: number) => void) | undefined;
  },
  ...fetchArguments: TFetchParams
): Promise<TReturn | TError> {
  if (options.fetchFn && !options.retryOn) {
    throw new TypeError(
      "If you are manually providing a fetch function, " +
        "you must also provide a retryOn function. " +
        "If you wish to use the global fetch or node-fetch, " +
        "do not provide a fetchFn; whichever is available will be used."
    );
  }

  const config = {
    fetchFn: options.fetchFn ?? (await getDefaultFetchImplementation()),
    retries: options.retries ?? 3,
    factor: options.factor ?? 2,
    minTimeout: options.minTimeout ?? 1000,
    maxTimeout: options.maxTimeout ?? 10_000,
    randomize: options.randomize ?? false,
    retryOn: options.retryOn ?? defaultRetryTest,
    onRetry: options.onRetry ?? (() => void 0),
  };

  let retries = config.retries;
  const factor = config.factor;
  const minTimeout = config.minTimeout;
  const maxTimeout = config.maxTimeout;
  const randomize = config.randomize;
  const retryOn = config.retryOn;
  const onRetry = config.onRetry;

  return new Promise((resolve, reject) => {
    const _fetch = config.fetchFn.bind(
      config.fetchFn,
      ...fetchArguments
    ) as () => Promise<TReturn | TError>;
    const attempt = () => {
      _fetch()
        .then((result) => handleResult(result, resolve))
        .catch((error) => handleResult(error, reject));

      function handleResult(
        result: TReturn | TError,
        resolveOrReject: typeof resolve | typeof reject
      ) {
        if (retryOn(result, retries)) {
          onRetry(result, retries);
          if (retries === 0) {
            reject(result);
            return;
          }

          retries -= 1;

          const timeout = Math.min(
            maxTimeout,
            minTimeout * factor ** (config.retries - retries)
          );

          setTimeout(attempt, randomize ? timeout * Math.random() : timeout);
        } else {
          resolveOrReject(result);
        }
      }
    };

    attempt();
  });
}
