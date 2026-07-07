/**
 * Mock Prisma client for testing
 */

import { DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaClient } from '@/generated/prisma';

// Create a deep mock of Prisma client
export const prismaMock = mockDeep<PrismaClient>();

// Reset mock before each test
beforeEach(() => {
  mockReset(prismaMock);

  // Mirror Prisma's $transaction so batched read sites work under test:
  //  - array form  → resolve every PrismaPromise in the batch (like the real
  //    client), preserving order so per-call mockResolvedValueOnce sequences
  //    still line up.
  //  - callback form → invoke the interactive callback with the mock client.
  (prismaMock.$transaction as unknown as jest.Mock).mockImplementation(
    (arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : (arg as (tx: typeof prismaMock) => unknown)(prismaMock)
  );
});

// Export type for use in tests
export type MockPrismaClient = DeepMockProxy<PrismaClient>;
