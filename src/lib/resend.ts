import { Resend } from "resend";

let _client: Resend | null = null;

export function getResend(): Resend {
  if (!_client) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }
    _client = new Resend(process.env.RESEND_API_KEY);
  }
  return _client;
}
