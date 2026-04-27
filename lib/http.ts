import { NextResponse } from "next/server";
import type { ApiErrorCode } from "@/types";
import { fail, ok } from "@/lib/validation";

type ZodParseResult<T> = { success: true; data: T } | { success: false; error: { message: string } };

type ZodSchema<T> = {
  safeParse(value: unknown): ZodParseResult<T>;
};

type ParseJsonBodyOptions<T> = {
  emptyBody?: T | (() => T);
};

export type JsonBodyParseResult<T> = { success: true; data: T } | { success: false; response: NextResponse };

export function jsonOk<T>(data: T) {
  return NextResponse.json(ok(data));
}

export function jsonError(code: ApiErrorCode, message: string, status = 400) {
  return NextResponse.json(fail(code, message), { status });
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodSchema<T>,
  options: ParseJsonBodyOptions<T> = {}
): Promise<JsonBodyParseResult<T>> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return {
      success: false,
      response: jsonError("VALIDATION_ERROR", "Unable to read request body.", 422)
    };
  }

  let payload: unknown;
  if (!text.trim()) {
    if (!Object.prototype.hasOwnProperty.call(options, "emptyBody")) {
      return {
        success: false,
        response: jsonError("VALIDATION_ERROR", "Request body is required.", 422)
      };
    }

    const emptyBody = options.emptyBody;
    payload = typeof emptyBody === "function" ? (emptyBody as () => T)() : emptyBody;
  } else {
    try {
      payload = JSON.parse(text);
    } catch {
      return {
        success: false,
        response: jsonError("VALIDATION_ERROR", "Malformed JSON body.", 422)
      };
    }
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      response: jsonError("VALIDATION_ERROR", parsed.error.message, 422)
    };
  }

  return { success: true, data: parsed.data };
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
