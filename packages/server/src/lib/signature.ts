import { serializeDictionary } from "structured-headers";

export function buildExpoSignatureHeader(
  signatureBase64: string,
  keyId: string,
): string {
  // Match Expo custom server behavior:
  // dictionary members with string values (`sig`, `keyid`) on multipart part header.
  return serializeDictionary({
    sig: signatureBase64,
    keyid: keyId,
  });
}
