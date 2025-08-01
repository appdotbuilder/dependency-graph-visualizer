
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { graphsTable } from '../db/schema';
import { getGraphs } from '../handlers/get_graphs';

describe('getGraphs', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no graphs exist', async () => {
    const result = await getGraphs();
    expect(result).toEqual([]);
  });

  it('should return all graphs with correct properties', async () => {
    // Create test graphs
    const testGraphs = await db.insert(graphsTable)
      .values([
        {
          name: 'Graph 1',
          description: 'First test graph',
          graph_data: JSON.stringify({ tasks: [], dependencies: [] })
        },
        {
          name: 'Graph 2',
          description: null,
          graph_data: JSON.stringify({ tasks: [], dependencies: [] })
        }
      ])
      .returning()
      .execute();

    const result = await getGraphs();

    expect(result).toHaveLength(2);
    
    // Check first graph
    const graph1 = result.find(g => g.name === 'Graph 1');
    expect(graph1).toBeDefined();
    expect(graph1!.id).toBeDefined();
    expect(graph1!.name).toEqual('Graph 1');
    expect(graph1!.description).toEqual('First test graph');
    expect(graph1!.graph_data).toEqual(JSON.stringify({ tasks: [], dependencies: [] }));
    expect(graph1!.created_at).toBeInstanceOf(Date);
    expect(graph1!.updated_at).toBeInstanceOf(Date);

    // Check second graph
    const graph2 = result.find(g => g.name === 'Graph 2');
    expect(graph2).toBeDefined();
    expect(graph2!.id).toBeDefined();
    expect(graph2!.name).toEqual('Graph 2');
    expect(graph2!.description).toBeNull();
    expect(graph2!.graph_data).toEqual(JSON.stringify({ tasks: [], dependencies: [] }));
    expect(graph2!.created_at).toBeInstanceOf(Date);
    expect(graph2!.updated_at).toBeInstanceOf(Date);
  });

  it('should return graphs ordered by creation time', async () => {
    // Create test graphs with slight delay to ensure different timestamps
    const graph1 = await db.insert(graphsTable)
      .values({
        name: 'First Graph',
        description: 'Created first',
        graph_data: JSON.stringify({ tasks: [], dependencies: [] })
      })
      .returning()
      .execute();

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    const graph2 = await db.insert(graphsTable)
      .values({
        name: 'Second Graph',
        description: 'Created second',
        graph_data: JSON.stringify({ tasks: [], dependencies: [] })
      })
      .returning()
      .execute();

    const result = await getGraphs();

    expect(result).toHaveLength(2);
    expect(result[0].name).toEqual('First Graph');
    expect(result[1].name).toEqual('Second Graph');
    expect(result[0].created_at <= result[1].created_at).toBe(true);
  });
});
