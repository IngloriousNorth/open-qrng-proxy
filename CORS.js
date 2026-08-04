// Helper: Fetch with strict timeout handling
async function fetchWithTimeout(
  resource: string,
  options: RequestInit = {},
  timeoutMs: number = 5000,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

export default async function handler(req: Request): Promise<Response> {
  // 1. Handle CORS preflight checks
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  // 2. Extract requested count from query params (default 1, max 64)
  const url = new URL(req.url);
  const requestedCount = Math.min(
    Math.max(parseInt(url.searchParams.get("count") || "1"), 1),
    64,
  );

  try {
    // 3. Fetch from qrandom.io using the requested parameters
    const targetUrl = `https://qrandom.io/api/random/int?min=0&max=255`;

    const qrngRes = await fetchWithTimeout(
      targetUrl,
      {
        headers: {
          "User-Agent": "ValTown-Quantum-Proxy/1.0",
          "Accept": "application/json",
        },
      },
      4000, // 4 second timeout budget
    );

    const rawText = await qrngRes.text();
    const qrng = JSON.parse(rawText);

    // 4. Return Quantum Entropy Payload
    return new Response(
      JSON.stringify({
        number: qrng.number,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (qrngError: any) {
    console.error(`qrandom.io request failed: ${qrngError.message}`);

    // Return upstream failure directly to the client
    return new Response(
      JSON.stringify({
        error: "Quantum entropy source unreachable",
        details: qrngError.message,
      }),
      {
        status: 502, // Bad Gateway
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
}
