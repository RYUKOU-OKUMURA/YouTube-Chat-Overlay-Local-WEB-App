import { describe, expect, test } from "vitest";
import { classifyYouTubeError } from "@/server/youtube/api";

describe("classifyYouTubeError", () => {
  test("maps invalid_grant to unauthorized", () => {
    expect(
      classifyYouTubeError({
        response: {
          status: 400,
          data: {
            error: "invalid_grant",
            error_description: "Token has been expired or revoked."
          }
        }
      })
    ).toMatchObject({
      kind: "unauthorized",
      retryable: false
    });
  });

  test("maps HTTP 401 to unauthorized", () => {
    expect(
      classifyYouTubeError({
        response: {
          status: 401,
          data: {
            error: {
              message: "Unauthorized"
            }
          }
        }
      })
    ).toMatchObject({
      kind: "unauthorized",
      retryable: false
    });
  });

  test("maps HTTP 403 permission and scope errors to unauthorized", () => {
    expect(
      classifyYouTubeError({
        response: {
          status: 403,
          data: {
            error: {
              errors: [{ reason: "insufficientPermissions" }],
              message: "Request had insufficient authentication scopes."
            }
          }
        }
      })
    ).toMatchObject({
      kind: "unauthorized",
      message: expect.stringContaining("Reconnect YouTube OAuth"),
      retryable: false
    });
  });
});
