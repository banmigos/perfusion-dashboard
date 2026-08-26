import { NextResponse } from "next/server";

// Internal liveness endpoint. Reachable only inside the tailnet — see
// CLAUDE.md deployment rules. Not a public API.
export function GET() {
  return NextResponse.json(
    { ok: true, version: process.env.npm_package_version ?? "0.0.0" },
    { status: 200 },
  );
}
