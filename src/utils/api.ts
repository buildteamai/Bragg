function isTransientNetworkError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : '';
  return (
    err instanceof TypeError ||
    /failed to fetch|networkerror|load failed|network request failed|connection reset|econnreset|temporarily unavailable/i.test(
      msg
    )
  );
}

export async function fetchApiWithRetry(
  url: string,
  init: RequestInit = {},
  options: {
    maxAttempts?: number;
    onRetry?: (attempt: number, maxAttempts: number) => void;
  } = {}
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? 4;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        credentials: 'same-origin',
        cache: 'no-store',
        ...init,
      });

      if (
        (response.status === 502 ||
          response.status === 503 ||
          response.status === 504) &&
        attempt < maxAttempts
      ) {
        options.onRetry?.(attempt + 1, maxAttempts);
        await new Promise((resolve) =>
          window.setTimeout(resolve, 900 * attempt)
        );
        continue;
      }

      return response;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts && isTransientNetworkError(err)) {
        options.onRetry?.(attempt + 1, maxAttempts);
        await new Promise((resolve) =>
          window.setTimeout(resolve, 800 * attempt)
        );
        continue;
      }
      break;
    }
  }

  if (isTransientNetworkError(lastError)) {
    throw new Error(
      'Unable to reach the reconstruction server after retrying. The preview server may have just restarted — please click Build 3D Mesh again or refresh the page.'
    );
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Network request to server failed.');
}

export async function parseApiJson<T = any>(response: Response): Promise<T> {
  const rawText = await response.text();
  const trimmed = rawText.trim();

  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!response.ok) {
        const msg =
          typeof parsed?.error === 'string' && parsed.error.trim()
            ? parsed.error.trim()
            : `Request failed (HTTP ${response.status}).`;
        throw new Error(msg);
      }
      return parsed as T;
    } catch (err) {
      // If JSON.parse threw a SyntaxError, handle HTML / non-JSON response below.
      if (!(err instanceof SyntaxError)) {
        throw err;
      }
    }
  }

  if (response.status === 413) {
    throw new Error(
      'Uploaded files exceed the server payload limit. Try smaller PDFs or fewer attachments.'
    );
  }
  if (response.status === 504 || response.status === 502 || response.status === 503) {
    throw new Error(
      `The server gateway was temporarily unavailable (HTTP ${response.status}). Please try again.`
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error('Session access expired or denied. Refresh the page and try again.');
  }

  const looksLikeHtml = /^<!doctype\s+html|^<html/i.test(trimmed);
  if (looksLikeHtml) {
    throw new Error(
      `Server returned an HTML page instead of JSON (HTTP ${response.status}). Refresh the page or try again with smaller files.`
    );
  }

  throw new Error(
    trimmed
      ? `Unexpected server response (HTTP ${response.status}): ${trimmed.slice(0, 140)}`
      : `Empty server response (HTTP ${response.status}).`
  );
}

export interface JobStatusPayload<T> {
  status: 'running' | 'completed' | 'failed';
  stage?: string;
  blueprint?: T;
  error?: string;
}

export async function pollBlueprintJob<T>(
  statusUrl: string,
  onStage?: (stage: string) => void,
  maxWaitMs = 340_000
): Promise<T> {
  const startedAt = Date.now();
  let consecutivePollErrors = 0;

  while (Date.now() - startedAt < maxWaitMs) {
    const delayMs = consecutivePollErrors > 0 ? Math.min(3500, 1200 + consecutivePollErrors * 450) : 1200;
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));

    try {
      const res = await fetch(statusUrl, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const data = await parseApiJson<JobStatusPayload<T>>(res);
      consecutivePollErrors = 0;

      if (data.stage && onStage) {
        onStage(data.stage);
      }

      if (data.status === 'completed') {
        if (!data.blueprint) {
          throw new Error('Server completed the job without returning a valid CAD blueprint.');
        }
        return data.blueprint;
      }

      if (data.status === 'failed') {
        throw new Error(data.error || 'Geometric reconstruction failed on the server.');
      }
    } catch (err: any) {
      // Surface definite job failures (404 expired job, explicit server failure) immediately;
      // retry transient network/proxy hiccups generously during long multi-stage builds.
      if (!isTransientNetworkError(err)) {
        throw err;
      }
      consecutivePollErrors += 1;
      if (onStage) {
        onStage(`Connection hiccup while checking build progress — reconnecting (${consecutivePollErrors}/12)...`);
      }
      if (consecutivePollErrors >= 12) {
        throw new Error(
          'Lost connection to the server while waiting for the build to finish. Please try again.'
        );
      }
    }
  }

  throw new Error('Reconstruction timed out waiting for the server. Please try again.');
}
