
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { graphsTable, tasksTable, dependenciesTable } from '../db/schema';
import { getTaskDetails } from '../handlers/get_task_details';

describe('getTaskDetails', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return null for non-existent task', async () => {
    const result = await getTaskDetails(999, 'non-existent');
    expect(result).toBeNull();
  });

  it('should return task with empty dependencies and dependents', async () => {
    // Create a graph
    const graphResult = await db.insert(graphsTable)
      .values({
        name: 'Test Graph',
        description: 'A test graph',
        graph_data: JSON.stringify({})
      })
      .returning()
      .execute();

    const graphId = graphResult[0].id;

    // Create a standalone task
    await db.insert(tasksTable)
      .values({
        graph_id: graphId,
        task_id: 'task1',
        name: 'Standalone Task',
        status: 'pending',
        description: 'A task with no dependencies'
      })
      .execute();

    const result = await getTaskDetails(graphId, 'task1');

    expect(result).not.toBeNull();
    expect(result!.task.task_id).toEqual('task1');
    expect(result!.task.name).toEqual('Standalone Task');
    expect(result!.task.status).toEqual('pending');
    expect(result!.task.description).toEqual('A task with no dependencies');
    expect(result!.dependencies).toHaveLength(0);
    expect(result!.dependents).toHaveLength(0);
  });

  it('should return task with dependencies and dependents', async () => {
    // Create a graph
    const graphResult = await db.insert(graphsTable)
      .values({
        name: 'Test Graph',
        description: 'A complex test graph',
        graph_data: JSON.stringify({})
      })
      .returning()
      .execute();

    const graphId = graphResult[0].id;

    // Create tasks
    await db.insert(tasksTable)
      .values([
        {
          graph_id: graphId,
          task_id: 'task1',
          name: 'Task 1',
          status: 'completed',
          description: 'First task'
        },
        {
          graph_id: graphId,
          task_id: 'task2',
          name: 'Task 2',
          status: 'pending',
          description: 'Second task'
        },
        {
          graph_id: graphId,
          task_id: 'task3',
          name: 'Task 3',
          status: 'in_progress',
          description: 'Third task'
        },
        {
          graph_id: graphId,
          task_id: 'task4',
          name: 'Task 4',
          status: 'pending',
          description: 'Fourth task'
        }
      ])
      .execute();

    // Create dependencies: task3 depends on task1 and task2, task4 depends on task3
    await db.insert(dependenciesTable)
      .values([
        {
          graph_id: graphId,
          task_id: 'task3',
          depends_on_task_id: 'task1'
        },
        {
          graph_id: graphId,
          task_id: 'task3',
          depends_on_task_id: 'task2'
        },
        {
          graph_id: graphId,
          task_id: 'task4',
          depends_on_task_id: 'task3'
        }
      ])
      .execute();

    const result = await getTaskDetails(graphId, 'task3');

    expect(result).not.toBeNull();
    expect(result!.task.task_id).toEqual('task3');
    expect(result!.task.name).toEqual('Task 3');
    expect(result!.task.status).toEqual('in_progress');

    // Check dependencies (task3 depends on task1 and task2)
    expect(result!.dependencies).toHaveLength(2);
    const dependencyIds = result!.dependencies.map(d => d.task_id).sort();
    expect(dependencyIds).toEqual(['task1', 'task2']);

    // Check dependents (task4 depends on task3)
    expect(result!.dependents).toHaveLength(1);
    expect(result!.dependents[0].task_id).toEqual('task4');
    expect(result!.dependents[0].name).toEqual('Task 4');
  });

  it('should only return tasks from the same graph', async () => {
    // Create two graphs
    const graph1Result = await db.insert(graphsTable)
      .values({
        name: 'Graph 1',
        description: 'First graph',
        graph_data: JSON.stringify({})
      })
      .returning()
      .execute();

    const graph2Result = await db.insert(graphsTable)
      .values({
        name: 'Graph 2',
        description: 'Second graph',
        graph_data: JSON.stringify({})
      })
      .returning()
      .execute();

    const graph1Id = graph1Result[0].id;
    const graph2Id = graph2Result[0].id;

    // Create tasks in both graphs with same task_id
    await db.insert(tasksTable)
      .values([
        {
          graph_id: graph1Id,
          task_id: 'task1',
          name: 'Task 1 in Graph 1',
          status: 'pending'
        },
        {
          graph_id: graph2Id,
          task_id: 'task1',
          name: 'Task 1 in Graph 2',
          status: 'completed'
        }
      ])
      .execute();

    // Get task from graph 1
    const result1 = await getTaskDetails(graph1Id, 'task1');
    expect(result1).not.toBeNull();
    expect(result1!.task.name).toEqual('Task 1 in Graph 1');
    expect(result1!.task.status).toEqual('pending');

    // Get task from graph 2
    const result2 = await getTaskDetails(graph2Id, 'task1');
    expect(result2).not.toBeNull();
    expect(result2!.task.name).toEqual('Task 1 in Graph 2');
    expect(result2!.task.status).toEqual('completed');

    // Try to get task1 from graph1 but it shouldn't exist in graph2
    const result3 = await getTaskDetails(graph2Id, 'non-existent');
    expect(result3).toBeNull();
  });

  it('should handle complex dependency chains', async () => {
    // Create a graph
    const graphResult = await db.insert(graphsTable)
      .values({
        name: 'Complex Graph',
        description: 'A graph with complex dependencies',
        graph_data: JSON.stringify({})
      })
      .returning()
      .execute();

    const graphId = graphResult[0].id;

    // Create multiple tasks
    await db.insert(tasksTable)
      .values([
        { graph_id: graphId, task_id: 'a', name: 'Task A', status: 'completed' },
        { graph_id: graphId, task_id: 'b', name: 'Task B', status: 'completed' },
        { graph_id: graphId, task_id: 'c', name: 'Task C', status: 'in_progress' },
        { graph_id: graphId, task_id: 'd', name: 'Task D', status: 'pending' },
        { graph_id: graphId, task_id: 'e', name: 'Task E', status: 'pending' }
      ])
      .execute();

    // Create dependencies: c depends on a,b; d depends on c; e depends on c
    await db.insert(dependenciesTable)
      .values([
        { graph_id: graphId, task_id: 'c', depends_on_task_id: 'a' },
        { graph_id: graphId, task_id: 'c', depends_on_task_id: 'b' },
        { graph_id: graphId, task_id: 'd', depends_on_task_id: 'c' },
        { graph_id: graphId, task_id: 'e', depends_on_task_id: 'c' }
      ])
      .execute();

    const result = await getTaskDetails(graphId, 'c');

    expect(result).not.toBeNull();
    expect(result!.task.task_id).toEqual('c');

    // Task C depends on A and B
    expect(result!.dependencies).toHaveLength(2);
    const dependencyIds = result!.dependencies.map(d => d.task_id).sort();
    expect(dependencyIds).toEqual(['a', 'b']);

    // Tasks D and E depend on C
    expect(result!.dependents).toHaveLength(2);
    const dependentIds = result!.dependents.map(d => d.task_id).sort();
    expect(dependentIds).toEqual(['d', 'e']);
  });
});
