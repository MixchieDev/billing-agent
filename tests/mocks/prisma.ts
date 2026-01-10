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
});

// Export type for use in tests
export type MockPrismaClient = DeepMockProxy<PrismaClient>;
