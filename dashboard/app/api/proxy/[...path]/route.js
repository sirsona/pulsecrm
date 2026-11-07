// Runtime proxy from the browser to the private Express API.
// Keeping this in Next.js means the browser only needs the dashboard origin:
// no public API URL, no CORS configuration, and no tokens baked into the build.

const EXPRESS_URL = process.env.EXPRESS_URL || "http://localhost:5000";

async function proxy(request, context) {
  const { path } = await context.params;
  const target = `${EXPRESS_URL}/api/${path.join("/")}${request.nextUrl.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const method = request.method;
  const body = ["GET", "HEAD"].includes(method)
    ? undefined
    : await request.arrayBuffer();

  let res;
  try {
    res = await fetch(target, {
      method,
      headers,
      body,
      redirect: "manual",
    });
  } catch (error) {
    return Response.json(
      { error: { message: `API unavailable: ${error.message}` } },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers(res.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");

  return new Response(res.body, {
    status: res.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
