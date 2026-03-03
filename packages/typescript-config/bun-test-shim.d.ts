declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function expect(actual: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toBeNull(): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toMatch(expected: RegExp | string): void;
    toThrow(expected?: string | RegExp): void;
    rejects: {
      toThrow(expected?: string | RegExp): Promise<void>;
    };
  };
}
