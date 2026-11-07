import { NextResponse } from "next/server";

// Clears the HttpOnly dashboard session cookie and returns to the login page.
// Uses a RELATIVE Location header: behind a tunnel the request URL resolves to
// the internal host (localhost:3001), which would redirect the browser to the
// wrong origin.
export async function POST() {
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/treasurer/login" },
  });
  response.cookies.delete("treasurer_token");
  return response;
}
