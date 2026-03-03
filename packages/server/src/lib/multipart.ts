import crypto from "node:crypto";

export class BinaryMultipartBuilder {
  private readonly boundary = `boundary-${crypto.randomUUID()}`;
  private readonly parts: Array<{
    name: string;
    content: Uint8Array;
    headers?: Record<string, string>;
  }> = [];

  addPart(
    name: string,
    content: unknown,
    headers?: Record<string, string>,
  ): void {
    let data: Uint8Array;
    if (content instanceof Uint8Array) {
      data = content;
    } else if (typeof content === "string") {
      data = new TextEncoder().encode(content);
    } else {
      data = new TextEncoder().encode(JSON.stringify(content));
    }

    this.parts.push({ name, content: data, headers });
  }

  setPartHeaders(name: string, headers: Record<string, string>): void {
    const part = this.parts.find((candidate) => candidate.name === name);
    if (part) {
      part.headers = { ...(part.headers ?? {}), ...headers };
    }
  }

  getPartContent(name: string): string | undefined {
    const part = this.parts.find((candidate) => candidate.name === name);
    return part ? new TextDecoder().decode(part.content) : undefined;
  }

  getPartBytes(name: string): Uint8Array | undefined {
    const part = this.parts.find((candidate) => candidate.name === name);
    return part?.content;
  }

  build(): { body: Uint8Array; contentType: string } {
    const chunks: Uint8Array[] = [];
    const encoder = new TextEncoder();

    for (const part of this.parts) {
      const customHeaders = Object.entries(part.headers ?? {})
        .map(([key, value]) => `${key}: ${value}\r\n`)
        .join("");
      chunks.push(
        encoder.encode(
          `--${this.boundary}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Disposition: form-data; name="${part.name}"\r\n${customHeaders}\r\n`,
        ),
      );
      chunks.push(part.content);
      chunks.push(encoder.encode("\r\n"));
    }

    chunks.push(encoder.encode(`--${this.boundary}--\r\n`));

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const output = new Uint8Array(totalLength);

    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }

    return {
      body: output,
      contentType: `multipart/mixed; boundary=${this.boundary}`,
    };
  }
}
