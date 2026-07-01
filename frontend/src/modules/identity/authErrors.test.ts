import { describe, expect, it } from "vitest";

import { ApiError } from "../../shared/api/client";
import { loginErrorMessage, registerErrorMessage } from "./authErrors";

describe("registerErrorMessage", () => {
  it("reports a real email conflict", () => {
    const err = new ApiError(400, { detail: "REGISTER_USER_ALREADY_EXISTS" }, "");
    expect(registerErrorMessage(err)).toMatch(/ya está registrado/i);
  });

  it("surfaces the password reason from an object detail", () => {
    const err = new ApiError(
      400,
      { detail: { code: "REGISTER_INVALID_PASSWORD", reason: "Password too short" } },
      "",
    );
    expect(registerErrorMessage(err)).toContain("Password too short");
  });

  it("does not blame the email for a server error", () => {
    const err = new ApiError(500, { detail: "Internal Server Error" }, "");
    expect(registerErrorMessage(err)).toMatch(/servidor/i);
    expect(registerErrorMessage(err)).not.toMatch(/correo/i);
  });

  it("reports a connection problem for non-API errors", () => {
    expect(registerErrorMessage(new TypeError("Failed to fetch"))).toMatch(/conexión/i);
  });
});

describe("loginErrorMessage", () => {
  it("reports bad credentials", () => {
    const err = new ApiError(400, { detail: "LOGIN_BAD_CREDENTIALS" }, "");
    expect(loginErrorMessage(err)).toMatch(/incorrectos/i);
  });

  it("reports a server error distinctly", () => {
    const err = new ApiError(503, { detail: "Service Unavailable" }, "");
    expect(loginErrorMessage(err)).toMatch(/servidor/i);
  });
});
