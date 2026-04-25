import { NextResponse } from "next/server";
import type { ApiErrorCode } from "@/types";
import { fail, ok } from "@/lib/validation";

export function jsonOk<T>(data: T) {
  return NextResponse.json(ok(data));
}

export function jsonError(code: ApiErrorCode, message: string, status = 400) {
  return NextResponse.json(fail(code, message), { status });
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
