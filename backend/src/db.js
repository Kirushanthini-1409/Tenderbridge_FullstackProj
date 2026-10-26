import { PrismaClient } from '@prisma/client';

let client;
export function getDb() {
  client ??= new PrismaClient();
  return client;
}

export async function disconnectDb() {
  if (client) await client.$disconnect();
}
