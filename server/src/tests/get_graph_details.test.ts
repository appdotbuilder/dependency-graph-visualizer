
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { graphsTable, tasksTable, dependenciesTable } from '../db/schema';
import { getGraphDetails } from '../handlers/get_graph_details';

describe('getGraphDetails', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return null for non-existent graph', async () => {
    const result = await getGraphDetails(999);
    expect(result).toBeNull();
  });

  it('should return graph details with empty tasks and dependencies', async () => {
    // Create a graph with no tasks
    const graphResult = await db.insert(graphsTable)
      .values({
        name: 'Empty Graph',
        description: 'A graph with no tasks',
        graph_data: JSON.stringify({ tasks: [], dependencies: [] })
      })
      .returning()
      .execute();

    const graphId = graphResult[0].id;
    const result = await getGraphDetails(graphId);

    expect(result).not.toBeNull();
    expect(result!.graph.name).toEqual('Empty Graph');
    expect(result!.graph.description).toEqual('A graph with no tasks');
    expect(result!.tasks).toHaveLength(0);
    expect(result!.dependencies).toHaveLength(0);
    expect(result!.analysis.has_cycles).toBe(false);
    expect(result!.analysis.cycles).toHaveLength(0);
    expect(result!.analysis.topological_order).toEqual([]);
    expect(result!.analysis.task_levels).toEqual({});
  });

  it('should return graph details with tasks but no dependencies', async () => {
    // Create a graph
    const graphResult = await db.insert(graphsTable)
      .values({
        name: 'Simple Graph',
        description: 'A graph with independent tasks',
        graph_data: JSON.stringify({ tasks: ['A', 'B'], dependencies: [] })
      })
      .returning()
      .execute();

    const graphId = graphResult[0].id;

    // Create tasks
    await db.insert(tasksTable)
      .values([
        {
          graph_id: graphId,
          task_id: 'A',
          name: 'Task A',
          status: 'pending',
          description: 'First task'
        },
        {
          graph_id: graphId,
          task_id: 'B',
          name: 'Task B',
          status: 'completed',
          description: 'Second task'
        }
      ])
      .execute();

    const result = await getGraphDetails(graphId);

    expect(result).not.toBeNull();
    expect(result!.graph.name).toEqual('Simple Graph');
    expect(result!.tasks).toHaveLength(2);
    expect(result!.dependencies).toHaveLength(0);
    expect(result!.analysis.has_cycles).toBe(false);
    expect(result!.analysis.cycles).toHaveLength(0);
    expect(result!.analysis.topological_order).toHaveLength(2);
    expect(result!.analysis.topological_order).toContain('A');
    expect(result!.analysis.topological_order).toContain('B');
    expect(result!.analysis.task_levels['A']).toEqual(0);
    expect(result!.analysis.task_levels['B']).toEqual(0);
  });

  it('should return graph details with linear dependency chain', async () => {
    // Create a graph
    const graphResult = await db.insert(graphsTable)
      .values({
        name: 'Linear Graph',
        description: 'A->B->C chain',
        graph_data: JSON.stringify({ tasks: ['A', 'B', 'C'], dependencies: [['A', 'B'], ['B', 'C']] })
      })
      .returning()
      .execute();

    const graphId = graphResult[0].id;

    // Create tasks
    await db.insert(tasksTable)
      .values([
        {
          graph_id: graphId,
          task_id: 'A',
          name: 'Task A',
          status: 'completed'
        },
        {
          graph_id: graphId,
          task_id: 'B',
          name: 'Task B',
          status: 'in_progress'
        },
        {
          graph_id: graphId,
          task_id: 'C',
          name: 'Task C',
          status: 'pending'
        }
      ])
      .execute();

    // Create dependencies: A->B->C
    await db.insert(dependenciesTable)
      .values([
        {
          graph_id: graphId,
          task_id: 'B',
          depends_on_task_id: 'A'
        },
        {
          graph_id: graphId,
          task_id: 'C',
          depends_on_task_id: 'B'
        }
      ])
      .execute();

    const result = await getGraphDetails(graphId);

    expect(result).not.toBeNull();
    expect(result!.graph.name).toEqual('Linear Graph');
    expect(result!.tasks).toHaveLength(3);
    expect(result!.dependencies).toHaveLength(2);
    expect(result!.analysis.has_cycles).toBe(false);
    expect(result!.analysis.cycles).toHaveLength(0);
    expect(result!.analysis.topological_order).toEqual(['A', 'B', 'C']);
    expect(result!.analysis.task_levels['A']).toEqual(0);
    expect(result!.analysis.task_levels['B']).toEqual(1);
    expect(result!.analysis.task_levels['C']).toEqual(2);
  });

  it('should detect cycles in graph dependencies', async () => {
    // Create a graph with cycles
    const graphResult = await db.insert(graphsTable)
      .values({
        name: 'Cyclic Graph',
        description: 'A->B->A cycle',
        graph_data: JSON.stringify({ tasks: ['A', 'B'], dependencies: [['A', 'B'], ['B', 'A']] })
      })
      .returning()
      .execute();

    const graphId = graphResult[0].id;

    // Create tasks
    await db.insert(tasksTable)
      .values([
        {
          graph_id: graphId,
          task_id: 'A',
          name: 'Task A',
          status: 'blocked'
        },
        {
          graph_id: graphId,
          task_id: 'B',
          name: 'Task B',
          status: 'blocked'
        }
      ])
      .execute();

    // Create cyclic dependencies: A->B->A
    await db.insert(dependenciesTable)
      .values([
        {
          graph_id: graphId,
          task_id: 'B',
          depends_on_task_id: 'A'
        },
        {
          graph_id: graphId,
          task_id: 'A',
          depends_on_task_id: 'B'
        }
      ])
      .execute();

    const result = await getGraphDetails(graphId);

    expect(result).not.toBeNull();
    expect(result!.analysis.has_cycles).toBe(true);
    expect(result!.analysis.cycles.length).toBeGreaterThan(0);
    expect(result!.analysis.topological_order).toBeNull();
    expect(Object.keys(result!.analysis.task_levels)).toHaveLength(0);
  });

  it('should handle complex graph with multiple dependency levels', async () => {
    // Create a complex graph: A->C, B->C, C->D, C->E
    const graphResult = await db.insert(graphsTable)
      .values({
        name: 'Complex Graph',
        description: 'Multi-level dependencies',
        graph_data: JSON.stringify({ 
          tasks: ['A', 'B', 'C', 'D', 'E'], 
          dependencies: [['A', 'C'], ['B', 'C'], ['C', 'D'], ['C', 'E']] 
        })
      })
      .returning()
      .execute();

    const graphId = graphResult[0].id;

    // Create tasks
    await db.insert(tasksTable)
      .values([
        { graph_id: graphId, task_id: 'A', name: 'Task A', status: 'completed' },
        { graph_id: graphId, task_id: 'B', name: 'Task B', status: 'completed' },
        { graph_id: graphId, task_id: 'C', name: 'Task C', status: 'in_progress' },
        { graph_id: graphId, task_id: 'D', name: 'Task D', status: 'pending' },
        { graph_id: graphId, task_id: 'E', name: 'Task E', status: 'pending' }
      ])
      .execute();

    // Create dependencies
    await db.insert(dependenciesTable)
      .values([
        { graph_id: graphId, task_id: 'C', depends_on_task_id: 'A' },
        { graph_id: graphId, task_id: 'C', depends_on_task_id: 'B' },
        { graph_id: graphId, task_id: 'D', depends_on_task_id: 'C' },
        { graph_id: graphId, task_id: 'E', depends_on_task_id: 'C' }
      ])
      .execute();

    const result = await getGraphDetails(graphId);

    expect(result).not.toBeNull();
    expect(result!.analysis.has_cycles).toBe(false);
    expect(result!.analysis.cycles).toHaveLength(0);
    expect(result!.analysis.topological_order).not.toBeNull();
    expect(result!.analysis.topological_order!).toHaveLength(5);
    
    // Verify levels are correct
    expect(result!.analysis.task_levels['A']).toEqual(0);
    expect(result!.analysis.task_levels['B']).toEqual(0);
    expect(result!.analysis.task_levels['C']).toEqual(1);
    expect(result!.analysis.task_levels['D']).toEqual(2);
    expect(result!.analysis.task_levels['E']).toEqual(2);
    
    // Verify topological order respects dependencies
    const order = result!.analysis.topological_order!;
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('C'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('E'));
  });
});
