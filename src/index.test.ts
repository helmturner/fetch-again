import { describe, it, expect, TestOptions } from "vitest";
import fetchWithRetry, { RetryOptions } from ".";

const settings: TestOptions = { timeout: 30000 };

describe.concurrent(
  "fetchWithRetryCompatibilityTesting",
  async () => {
    it("should retry 408 when used with the default fetch", async () => {
      const counter = { count: 0 };

      const response = await fetchWithRetry(
        {
          retries: 3,
          onRetry: (result, count) => {
            counter.count++;
          },
        },
        "https://httpstat.us/408",
        {
          method: "GET",
        }
      );
      expect(response).not.toBeInstanceOf(Error);
      if (response instanceof Error) return;
      expect(response.status).toBe(408);
      expect(counter.count).toBe(3);
      expect(response.ok).toBe(false);
    });

    it("should retry 413 when used with the default fetch", async () => {
      const counter = { count: 0 };
      const config: RetryOptions = {
        retries: 3,
        onRetry: (result, count) => {
          counter.count++;
        },
      };

      const response = await fetchWithRetry(config, "https://httpstat.us/413", {
        method: "GET",
      });

      expect(response.status).toBe(413);
      expect(counter.count).toBe(3);
      expect(response.ok).toBe(false);
    });

    it("should throw if a 3rd-party fetcher is supplied without retryOn also being supplied", async () => {
      const axios = await import("axios").then((module) => module.default);
      const counter = { count: 0 };
      // @ts-expect-error
      const config: RetryOptions<
        typeof axios.get<any>,
        import("axios").AxiosError
      > = {
        fetchFn: axios.get,
        retries: 3,
        onRetry: (result, count) => {
          counter.count++;
        },
      };

      expect(
        fetchWithRetry(config, "https://httpstat.us/413", {
          method: "GET",
        })
      ).rejects.toThrow();
    });
  },
  settings
);

//408, 413, 429, 500, 502, 503, 504
