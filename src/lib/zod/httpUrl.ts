import { z } from "zod";

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Trimmed, absolute http(s) URL. Rejects javascript:, ftp:, relative, etc. */
export const httpUrl = z
  .string()
  .trim()
  .refine(isHttpUrl, "must be an http(s) URL");

/** Like `httpUrl`, but a blank string is allowed and becomes null. */
export const optionalHttpUrl = z
  .string()
  .trim()
  .refine((v) => v === "" || isHttpUrl(v), "must be an http(s) URL")
  .transform((v) => (v === "" ? null : v));
