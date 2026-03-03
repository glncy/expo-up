import crypto from "node:crypto";

export function signRSASHA256(
  data: string | Uint8Array,
  privateKey: string,
): string {
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(data);
  return sign.sign(privateKey, "base64");
}
