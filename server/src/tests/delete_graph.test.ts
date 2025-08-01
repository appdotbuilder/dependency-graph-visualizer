
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { graphsTable, tasksTable, dependenciesTable } from '../db/schema';
import { deleteGraph } from '../handlers/delete_graph';
import { eq } from 'drizzle-orm';

describe('deleteGraph', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should delete an existing graph', async () => {
    // Create test graph
    const graphResult = await db.insert(graphsTable)
      .values({
        name: 'Test Graph',
        description: 'A test graph',
        graph_data: JSON.stringify({ tasks: [], dependencies: [] })
      })
      .returning()
      .execute();

    const graphId = graphResult[0].id;

    // Delete the graph
    const result = await deleteGraph(graphId);

    expect(result).toBe(true);

    // Verify graph was deleted
    const graphs = await db.select()
      .from(graphsTable)
      .where(eq(graphsTable.id, graphId))
      .execute();

    expect(graphs).toHaveLength(0);
  });

  it('should return false for non-existent graph', async () => {
    const result = await deleteGraph(999);

    expect(result).toBe(false);
  });

  it('should cascade delete related tasks and dependencies', async () => {
    // Create test graph
    const graphResult = await db.insert(graphsTable)
      .values({
        name: 'Test Graph with Tasks',
        description: 'A test graph with tasks and dependencies',
        graph_data: JSON.stringify({ tasks: [], dependencies: [] })
      })
      .returning()
      .execute();

    const graphId = graphResult[0].id;

    // Create test tasks
    await db.insert(tasksTable)
      .values([
        {
          graph_id: graphId,
          task_id: 'task1',
          name: 'Task 1',
          status: 'pending',
          description: 'First task'
        },
        {
          graph_id: graphId,
          task_id: 'task2',
          name: 'Task 2',
          status: 'pending',
          description: 'Second task'
        }
      ])
      .execute();

    // Create test dependency
    await db.insert(dependenciesTable)
      .values({
        graph_id: graphId,
        task_id: 'task2',
        depends_on_task_id: 'task1'
      })
      .execute();

    // Verify data exists before deletion
    const tasksBefore = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.graph_id, graphId))
      .execute();

    const dependenciesBefore = await db.select()
      .from(dependenciesTable)
      .where(eq(dependenciesTable.graph_id, graphId))
      .execute();

    expect(tasksBefore).toHaveLength(2);
    expect(dependenciesBefore).toHaveLength(1);

    // Delete the graph
    const result = await deleteGraph(graphId);

    expect(result).toBe(true);

    // Verify cascade deletion worked
    const tasksAfter = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.graph_id, graphId))
      .execute();

    const dependenciesAfter = await db.select()
      .from(dependenciesTable)
      .where(eq(dependenciesTable.graph_id, graphId))
      .execute();

    expect(tasksAfter).toHaveLength(0);
    expect(dependenciesAfter).toHaveLength(0);
  });

  it('should not affect other graphs when deleting', async () => {
    // Create two test graphs
    const graphResults = await db.insert(graphsTable)
      .values([
        {
          name: 'Graph 1',
          description: 'First graph',
          graph_data: JSON.stringify({ tasks: [], dependencies: [] })
        },
        {
          name: 'Graph 2',
          description: 'Second graph',
          graph_data: JSON.stringify({ tasks: [], dependencies: [] })
        }
      ])
      .returning()
      .execute();

    const graph1Id = graphResults[0].id;
    const graph2Id = graphResults[1].id;

    // Create tasks for both graphs
    await db.insert(tasksTable)
      .values([
        {
          graph_id: graph1Id,
          task_id: 'task1',
          name: 'Task 1 Graph 1',
          status: 'pending'
        },
        {
          graph_id: graph2Id,
          task_id: 'task1',
          name: 'Task 1 Graph 2',
          status: 'pending'
        }
      ])
      .execute();

    // Delete first graph
    const result = await deleteGraph(graph1Id);

    expect(result).toBe(true);

    // Verify second graph and its tasks remain
    const remainingGraphs = await db.select()
      .from(graphsTable)
      .where(eq(graphsTable.id, graph2Id))
      .execute();

    const remainingTasks = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.graph_id, graph2Id))
      .execute();

    expect(remainingGraphs).toHaveLength(1);
    expect(remainingTasks).toHaveLength(1);
    expect(remainingGraphs[0].name).toBe('Graph 2');
    expect(remainingTasks[0].name).toBe('Task 1 Graph 2');
  });
});
