
import { db } from '../db';
import { graphsTable } from '../db/schema';
import { type Graph } from '../schema';

export async function getGraphs(): Promise<Graph[]> {
  try {
    const results = await db.select()
      .from(graphsTable)
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch graphs:', error);
    throw error;
  }
}
