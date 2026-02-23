"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import * as bcrypt from "bcryptjs";

export const seedAll = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("Seeding database (hashing password)...");
    const hashedPassword = await bcrypt.hash("admin123", 12);
    await ctx.runMutation(internal.seedData.seedDatabase, { hashedPassword });
    console.log("Seeding complete!");
  },
});
