
import { db } from '../db';
import { graphsTable } from '../db/schema';
import { eq } from 'drizzle-orm';

export async function deleteGraph(graphId: number): Promise<boolean> {
  try {
    // Delete the graph - cascade will handle tasks and dependencies
    const result = await db.delete(graphsTable)
      .where(eq(graphsTable.id, graphId))
      .returning()
      .execute();

    // Return true if a record was deleted, false if no record found
    return result.length > 0;
  } catch (error) {
    console.error('Graph deletion failed:', error);
    throw error;
  }
}
