# fetch-again

[![npm version](https://badge.fury.io/js/fetch-again.svg)](https://badge.fury.io/js/fetch-again)

A tiny, dependency-free TS library for adding retry logic to your favorite fetch implementation.

## HERE BE DRAGONS

This library is not intended for production use.

## Installation

Using npm:

```bash
npm install @helmturner/fetch-again
```

Using yarn:

```bash
yarn add @helmturner/fetch-again
```

## Usage

```typescript
import fetchWithRetry from "@helmturner/fetch-again";

const response = await fetchWithRetry(options, "https://example.com", {
  method: "POST",
  body: JSON.stringify({ foo: "bar" }),
});
```

## API

### `fetchWithRetry(options, ...fetchArguments)` -> `Promise<Response>` | `Promise<Error>`

#### `options`

##### `fetchFn` (optional)

A fetch implementation to use. If not provided, the library will attempt to find a fetch implementation in the following order:

1. `fetch` (global)
2. `window.fetch` (browser)
3. `global.fetch` (node)
4. `require("node-fetch")` (must be installed as a dependency)

##### `retries` (optional)

The number of times to retry the request. Defaults to `3`.

##### `factor` (optional)

The exponential factor to use. Defaults to `2`. The timeout between retries will grow by this factor between each retry, e.g. for a factor of `2` the timeout will double with each retry.

##### `minTimeout` (optional)

The minimum timeout between retries, in milliseconds. Defaults to `1000`.

##### `maxTimeout` (optional)

The maximum timeout between retries, in milliseconds. Defaults to `10000`.

##### `randomize` (optional)

Whether to randomize the timeout between retries. Defaults to `false`.

##### `onRetry` (optional)

A callback to be called after each retry. The callback will be passed the result of the request (regardless of whether returned or thrown) and the number of retries remaining. Defaults to a no-op.

##### `retryOn` (optional)

A function that determines whether to retry the request. The function will be passed the result of the request (regardless of whether it was returned or thrown) and the number of retries remaining.

By default, the following steps are taken to determine whether to retry:

1. If the number of retries remaining is `0`, the request will not be retried.
2. If the result is an instance of `Error` or `null`, the request will be retried.
3. If the result has an `ok` property, the request will only be retried if the value of `ok` is **falsey**
4. Otherwise, If the result has any property that is a number between `100` and `599` inclusive, the request will be retried only if the value of that property is `408`, `413`, `429`, `500`, `502`, `503` or `504`.
5. If none of the above conditions are met, an error will be thrown.

**_IT IS HIGHLY RECOMMENDED THAT YOU PROVIDE A CUSTOM `retryOn` FUNCTION IF USING A FETCH IMPLEMENTATION OTHER THAN `node-fetch` OR THE `fetch` API_**

#### `...fetchArguments`

The arguments to pass to the fetch implementation. The arguments should be the same as the arguments you would pass to the fetch implementation you are using - TypeScript will type them according to the fetch function passed.

## Examples

With default `fetch` implementation:

```typescript
import fetchWithRetry from "@helmturner/fetch-again";

const options = {
  retries: 5,
  factor: 2,
  minTimeout: 1000,
  maxTimeout: 10000,
  randomize: true,
  onRetry: (result, count) => {
    console.log(`Retrying request. ${count} retries remaining.`);
  },
  retryOn: (result, count) => {
    if (count === 0) return false;
    if (result instanceof Error) return true;
    if (result.status === 429) return true;
    return false;
  },
};

const response = await fetchWithRetry(options, "https://example.com", {
  method: "POST",
  body: JSON.stringify({ foo: "bar" }),
});
```

With custom `fetch` implementation:

```typescript
import fetchWithRetry from "@helmturner/fetch-again";
import axios from "axios";

const options = {
  fetchFn: axios,
  retries: 5,
  factor: 2,
  minTimeout: 1000,
  maxTimeout: 10000,
  randomize: true,
  onRetry: (result, count) => {
    console.log(`Retrying request. ${count} retries remaining.`);
  },
  retryOn: (result, count) => {
    if (count === 0) return false;
    if (error.response && typeof error.response.status === "number") {
      return [408, 413, 429, 500, 502, 503, 504].includes(
        error.response.status
      );
    }
    return true;
  },
};

const response = await fetchWithRetry(options, {
    url: "https://example.com",
    method: "get",
});
```

## License

ISC License (ISC)
Copyright (c) 2023 Helm Turner
