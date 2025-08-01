
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { graphsTable, tasksTable, dependenciesTable } from '../db/schema';
import { analyzeGraph } from '../handlers/analyze_graph';

describe('analyzeGraph', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return null for non-existent graph', async () => {
    const result = await analyzeGraph(999);
    expect(result).toBeNull();
  });

  it('should analyze empty graph', async () => {
    // Create empty graph
    const graphs = await db.insert(graphsTable)
      .values({
        name: 'Empty Graph',
        description: 'Graph with no tasks',
        graph_data: '{"tasks":[], "dependencies":[]}'
      })
      .returning()
      .execute();

    const result = await analyzeGraph(graphs[0].id);

    expect(result).not.toBeNull();
    expect(result!.graph_id).toBe(graphs[0].id);
    expect(result!.has_cycles).toBe(false);
    expect(result!.cycles).toHaveLength(0);
    expect(result!.topological_order).toHaveLength(0);
    expect(Object.keys(result!.task_levels)).toHaveLength(0);
  });

  it('should analyze simple linear dependency chain', async () => {
    // Create graph
    const graphs = await db.insert(graphsTable)
      .values({
        name: 'Linear Graph',
        description: 'Simple linear dependency chain',
        graph_data: '{"tasks":[], "dependencies":[]}'
      })
      .returning()
      .execute();

    const graphId = graphs[0].id;

    // Create tasks: A -> B -> C
    await db.insert(tasksTable)
      .values([
        { graph_id: graphId, task_id: 'A', name: 'Task A', status: 'pending' },
        { graph_id: graphId, task_id: 'B', name: 'Task B', status: 'pending' },
        { graph_id: graphId, task_id: 'C', name: 'Task C', status: 'pending' }
      ])
      .execute();

    // Create dependencies: B depends on A, C depends on B
    await db.insert(dependenciesTable)
      .values([
        { graph_id: graphId, task_id: 'B', depends_on_task_id: 'A' },
        { graph_id: graphId, task_id: 'C', depends_on_task_id: 'B' }
      ])
      .execute();

    const result = await analyzeGraph(graphId);

    expect(result).not.toBeNull();
    expect(result!.has_cycles).toBe(false);
    expect(result!.cycles).toHaveLength(0);
    expect(result!.topological_order).toEqual(['A', 'B', 'C']);
    expect(result!.task_levels).toEqual({
      'A': 0,
      'B': 1,
      'C': 2
    });
  });

  it('should detect simple cycle', async () => {
    // Create graph
    const graphs = await db.insert(graphsTable)
      .values({
        name: 'Cyclic Graph',
        description: 'Graph with a simple cycle',
        graph_data: '{"tasks":[], "dependencies":[]}'
      })
      .returning()
      .execute();

    const graphId = graphs[0].id;

    // Create tasks with cycle: A -> B -> A
    await db.insert(tasksTable)
      .values([
        { graph_id: graphId, task_id: 'A', name: 'Task A', status: 'pending' },
        { graph_id: graphId, task_id: 'B', name: 'Task B', status: 'pending' }
      ])
      .execute();

    // Create circular dependencies
    await db.insert(dependenciesTable)
      .values([
        { graph_id: graphId, task_id: 'B', depends_on_task_id: 'A' },
        { graph_id: graphId, task_id: 'A', depends_on_task_id: 'B' }
      ])
      .execute();

    const result = await analyzeGraph(graphId);

    expect(result).not.toBeNull();
    expect(result!.has_cycles).toBe(true);
    expect(result!.cycles.length).toBeGreaterThan(0);
    expect(result!.topological_order).toBeNull();
    expect(Object.keys(result!.task_levels)).toHaveLength(0);

    // Check that cycle contains the problematic nodes
    const foundCycle = result!.cycles.find(cycle => 
      cycle.includes('A') && cycle.includes('B')
    );
    expect(foundCycle).toBeDefined();
  });

  it('should handle complex graph with multiple branches', async () => {
    // Create graph
    const graphs = await db.insert(graphsTable)
      .values({
        name: 'Complex Graph',
        description: 'Graph with multiple branches and levels',
        graph_data: '{"tasks":[], "dependencies":[]}'
      })
      .returning()
      .execute();

    const graphId = graphs[0].id;

    // Create complex dependency structure:
    //     A
    //   /   \
    //  B     C
    //   \   /
    //     D
    await db.insert(tasksTable)
      .values([
        { graph_id: graphId, task_id: 'A', name: 'Task A', status: 'pending' },
        { graph_id: graphId, task_id: 'B', name: 'Task B', status: 'pending' },
        { graph_id: graphId, task_id: 'C', name: 'Task C', status: 'pending' },
        { graph_id: graphId, task_id: 'D', name: 'Task D', status: 'pending' }
      ])
      .execute();

    await db.insert(dependenciesTable)
      .values([
        { graph_id: graphId, task_id: 'B', depends_on_task_id: 'A' },
        { graph_id: graphId, task_id: 'C', depends_on_task_id: 'A' },
        { graph_id: graphId, task_id: 'D', depends_on_task_id: 'B' },
        { graph_id: graphId, task_id: 'D', depends_on_task_id: 'C' }
      ])
      .execute();

    const result = await analyzeGraph(graphId);

    expect(result).not.toBeNull();
    expect(result!.has_cycles).toBe(false);
    expect(result!.cycles).toHaveLength(0);
    
    // Should have valid topological order
    expect(result!.topological_order).not.toBeNull();
    expect(result!.topological_order!).toHaveLength(4);
    expect(result!.topological_order![0]).toBe('A'); // A should be first
    expect(result!.topological_order![3]).toBe('D'); // D should be last

    // Check task levels
    expect(result!.task_levels['A']).toBe(0);
    expect(result!.task_levels['B']).toBe(1);
    expect(result!.task_levels['C']).toBe(1);
    expect(result!.task_levels['D']).toBe(2);
  });

  it('should handle isolated tasks with no dependencies', async () => {
    // Create graph
    const graphs = await db.insert(graphsTable)
      .values({
        name: 'Isolated Tasks',
        description: 'Graph with tasks that have no dependencies',
        graph_data: '{"tasks":[], "dependencies":[]}'
      })
      .returning()
      .execute();

    const graphId = graphs[0].id;

    // Create isolated tasks
    await db.insert(tasksTable)
      .values([
        { graph_id: graphId, task_id: 'X', name: 'Task X', status: 'pending' },
        { graph_id: graphId, task_id: 'Y', name: 'Task Y', status: 'pending' },
        { graph_id: graphId, task_id: 'Z', name: 'Task Z', status: 'pending' }
      ])
      .execute();

    // No dependencies created

    const result = await analyzeGraph(graphId);

    expect(result).not.toBeNull();
    expect(result!.has_cycles).toBe(false);
    expect(result!.cycles).toHaveLength(0);
    expect(result!.topological_order).toHaveLength(3);
    
    // All isolated tasks should be at level 0
    expect(result!.task_levels['X']).toBe(0);
    expect(result!.task_levels['Y']).toBe(0);
    expect(result!.task_levels['Z']).toBe(0);
  });
});
