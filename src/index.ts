export type RetryOptions<T> = T extends (
  ...arguments_: infer Arguments
) => Promise<infer Result>
  ? {
      fetchFn?: ((...arguments_: Arguments) => Promise<Result>) | undefined;
      retries?: number | undefined;
      factor?: number | undefined;
      minTimeout?: number | undefined;
      maxTimeout?: number | undefined;
      randomize?: boolean | undefined;
      onRetry?: ((result: Error | Result, count: number) => void) | undefined;
      retryOn?:
        | ((result: Error | Result, count: number) => boolean)
        | undefined;
    }
  : never;

const defaultRetryTest = <T>(result: Error | T, count: number) => {
  if (count === 0) return false;

  if (typeof result !== "object") {
    throw new TypeError(
      `Unexpected result type: Expected object, got ${typeof result}`
    );
  }

  if (result === null) return true;
  if (result instanceof Error) return true;
  if ("ok" in result) return !result.ok;

  const returnCode = Object.values(result).find((value): value is number => {
    return typeof value === "number" && value > 99 && value < 600;
  });

  if (returnCode) {
    return new Set([408, 413, 429, 500, 502, 503, 504]).has(returnCode);
  }

  throw new TypeError(
    "Unable to determine retriability of result. " +
      "The fetch implementation provided may not be supported;" +
      "Please file an issue at github.com/helmturner/fetch-again " +
      "to request support for this fetch implementation or to report a bug."
  );
};

const getDefaultFetchImplementation = async () => {
  if (typeof fetch !== "undefined") return fetch;
  if (typeof window !== "undefined") return window.fetch;
  if (typeof global !== "undefined") return global.fetch;
  if (typeof require !== "undefined") {
    try {
      const { default: nodeFetch } = await import("node-fetch");
      return nodeFetch;
    } catch {
      throw new Error(
        "Unable to find fetch implementation. " +
          "Either provide a fetch function in the options object " +
          "or install node-fetch as a dependency."
      );
    }
  }
};

export default async function fetchWithRetry<
  TFetchParams extends [],
  TReturn,
  T extends (...arguments_: TFetchParams) => Promise<TReturn>
>(...parameters: [RetryOptions<T>, ...TFetchParams]) {
  const [options, ...fetchArguments] = parameters;
  const config = {
    fetchFn:
      options.fetchFn ??
      ((await getDefaultFetchImplementation()) as unknown as T),
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
    const attempt = () => {
      config.fetchFn
        .apply(config.fetchFn, fetchArguments)
        .then((result) => handleResult(result, resolve))
        .catch((error) => handleResult(error, reject));

      function handleResult(
        result: Error | TReturn,
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
