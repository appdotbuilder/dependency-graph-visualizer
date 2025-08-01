
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { graphsTable, tasksTable, dependenciesTable } from '../db/schema';
import { type UpdateGraphInput } from '../schema';
import { updateGraph } from '../handlers/update_graph';
import { eq } from 'drizzle-orm';

describe('updateGraph', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper to create initial graph manually
  const createInitialGraph = async () => {
    // Create graph
    const graphs = await db.insert(graphsTable)
      .values({
        name: 'Original Graph',
        description: 'Original description',
        graph_data: JSON.stringify({
          tasks: [
            {
              task_id: 'task1',
              name: 'Task 1',
              status: 'pending',
              description: 'First task',
              dependencies: []
            },
            {
              task_id: 'task2',
              name: 'Task 2',
              status: 'in_progress',
              description: 'Second task',
              dependencies: ['task1']
            }
          ]
        })
      })
      .returning()
      .execute();

    const graph = graphs[0];

    // Create tasks
    await db.insert(tasksTable)
      .values([
        {
          graph_id: graph.id,
          task_id: 'task1',
          name: 'Task 1',
          status: 'pending',
          description: 'First task'
        },
        {
          graph_id: graph.id,
          task_id: 'task2',
          name: 'Task 2',
          status: 'in_progress',
          description: 'Second task'
        }
      ])
      .execute();

    // Create dependencies
    await db.insert(dependenciesTable)
      .values([
        {
          graph_id: graph.id,
          task_id: 'task2',
          depends_on_task_id: 'task1'
        }
      ])
      .execute();

    return { graph };
  };

  it('should return null for non-existent graph', async () => {
    const input: UpdateGraphInput = {
      id: 999,
      name: 'Updated Name'
    };

    const result = await updateGraph(input);
    expect(result).toBeNull();
  });

  it('should update graph metadata only', async () => {
    const initialGraph = await createInitialGraph();

    const input: UpdateGraphInput = {
      id: initialGraph.graph.id,
      name: 'Updated Graph Name',
      description: 'Updated description'
    };

    const result = await updateGraph(input);
    
    expect(result).not.toBeNull();
    expect(result!.graph.name).toEqual('Updated Graph Name');
    expect(result!.graph.description).toEqual('Updated description');
    
    // Tasks should remain unchanged
    expect(result!.tasks).toHaveLength(2);
    expect(result!.tasks.map(t => t.task_id).sort()).toEqual(['task1', 'task2']);
    expect(result!.dependencies).toHaveLength(1);
  });

  it('should replace all tasks and dependencies', async () => {
    const initialGraph = await createInitialGraph();

    const input: UpdateGraphInput = {
      id: initialGraph.graph.id,
      tasks: [
        {
          task_id: 'new_task1',
          name: 'New Task 1',
          status: 'completed',
          description: 'New first task',
          dependencies: []
        },
        {
          task_id: 'new_task2',
          name: 'New Task 2',
          status: 'pending',
          description: 'New second task',
          dependencies: ['new_task1']
        },
        {
          task_id: 'new_task3',
          name: 'New Task 3',
          status: 'blocked',
          description: null,
          dependencies: ['new_task1', 'new_task2']
        }
      ]
    };

    const result = await updateGraph(input);
    
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(3);
    expect(result!.dependencies).toHaveLength(3);
    
    // Verify new tasks
    const taskIds = result!.tasks.map(t => t.task_id).sort();
    expect(taskIds).toEqual(['new_task1', 'new_task2', 'new_task3']);
    
    // Verify task details
    const task1 = result!.tasks.find(t => t.task_id === 'new_task1');
    expect(task1?.name).toEqual('New Task 1');
    expect(task1?.status).toEqual('completed');
    
    const task3 = result!.tasks.find(t => t.task_id === 'new_task3');
    expect(task3?.description).toBeNull();
    expect(task3?.status).toEqual('blocked');
    
    // Verify dependencies
    const deps = result!.dependencies.map(d => ({ task: d.task_id, dep: d.depends_on_task_id }));
    expect(deps).toContainEqual({ task: 'new_task2', dep: 'new_task1' });
    expect(deps).toContainEqual({ task: 'new_task3', dep: 'new_task1' });
    expect(deps).toContainEqual({ task: 'new_task3', dep: 'new_task2' });
  });

  it('should update both metadata and tasks', async () => {
    const initialGraph = await createInitialGraph();

    const input: UpdateGraphInput = {
      id: initialGraph.graph.id,
      name: 'Combined Update',
      description: 'Both metadata and tasks updated',
      tasks: [
        {
          task_id: 'combined_task',
          name: 'Combined Task',
          status: 'in_progress',
          description: 'Single task after update',
          dependencies: []
        }
      ]
    };

    const result = await updateGraph(input);
    
    expect(result).not.toBeNull();
    expect(result!.graph.name).toEqual('Combined Update');
    expect(result!.graph.description).toEqual('Both metadata and tasks updated');
    expect(result!.tasks).toHaveLength(1);
    expect(result!.tasks[0].task_id).toEqual('combined_task');
    expect(result!.dependencies).toHaveLength(0);
  });

  it('should handle empty task list', async () => {
    const initialGraph = await createInitialGraph();

    const input: UpdateGraphInput = {
      id: initialGraph.graph.id,
      tasks: []
    };

    const result = await updateGraph(input);
    
    expect(result).not.toBeNull();
    expect(result!.tasks).toHaveLength(0);
    expect(result!.dependencies).toHaveLength(0);
    expect(result!.analysis.topological_order).toEqual([]);
    expect(result!.analysis.has_cycles).toBe(false);
  });

  it('should detect cycles in updated tasks', async () => {
    const initialGraph = await createInitialGraph();

    const input: UpdateGraphInput = {
      id: initialGraph.graph.id,
      tasks: [
        {
          task_id: 'A',
          name: 'Task A',
          status: 'pending',
          description: null,
          dependencies: ['B']
        },
        {
          task_id: 'B',
          name: 'Task B',
          status: 'pending',
          description: null,
          dependencies: ['C']
        },
        {
          task_id: 'C',
          name: 'Task C',
          status: 'pending',
          description: null,
          dependencies: ['A']
        }
      ]
    };

    const result = await updateGraph(input);
    
    expect(result).not.toBeNull();
    expect(result!.analysis.has_cycles).toBe(true);
    expect(result!.analysis.cycles.length).toBeGreaterThan(0);
    expect(result!.analysis.topological_order).toBeNull();
  });

  it('should calculate topological order for acyclic graph', async () => {
    const initialGraph = await createInitialGraph();

    const input: UpdateGraphInput = {
      id: initialGraph.graph.id,
      tasks: [
        {
          task_id: 'start',
          name: 'Start Task',
          status: 'completed',
          description: null,
          dependencies: []
        },
        {
          task_id: 'middle',
          name: 'Middle Task',
          status: 'in_progress',
          description: null,
          dependencies: ['start']
        },
        {
          task_id: 'end',
          name: 'End Task',
          status: 'pending',
          description: null,
          dependencies: ['middle']
        }
      ]
    };

    const result = await updateGraph(input);
    
    expect(result).not.toBeNull();
    expect(result!.analysis.has_cycles).toBe(false);
    expect(result!.analysis.topological_order).toEqual(['start', 'middle', 'end']);
    expect(result!.analysis.task_levels).toEqual({
      'start': 0,
      'middle': 1,
      'end': 2
    });
  });

  it('should throw error for invalid dependency reference', async () => {
    const initialGraph = await createInitialGraph();

    const input: UpdateGraphInput = {
      id: initialGraph.graph.id,
      tasks: [
        {
          task_id: 'valid_task',
          name: 'Valid Task',
          status: 'pending',
          description: null,
          dependencies: ['non_existent_task']
        }
      ]
    };

    expect(updateGraph(input)).rejects.toThrow(/Dependency reference.*not found/i);
  });

  it('should persist changes to database', async () => {
    const initialGraph = await createInitialGraph();

    const input: UpdateGraphInput = {
      id: initialGraph.graph.id,
      name: 'Persisted Update',
      tasks: [
        {
          task_id: 'persisted_task',
          name: 'Persisted Task',
          status: 'completed',
          description: 'This should be saved',
          dependencies: []
        }
      ]
    };

    await updateGraph(input);

    // Verify changes persisted to database
    const graphs = await db.select()
      .from(graphsTable)
      .where(eq(graphsTable.id, initialGraph.graph.id))
      .execute();
    
    expect(graphs).toHaveLength(1);
    expect(graphs[0].name).toEqual('Persisted Update');

    const tasks = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.graph_id, initialGraph.graph.id))
      .execute();
    
    expect(tasks).toHaveLength(1);
    expect(tasks[0].task_id).toEqual('persisted_task');
    expect(tasks[0].name).toEqual('Persisted Task');
    expect(tasks[0].description).toEqual('This should be saved');

    const dependencies = await db.select()
      .from(dependenciesTable)
      .where(eq(dependenciesTable.graph_id, initialGraph.graph.id))
      .execute();
    
    expect(dependencies).toHaveLength(0);
  });
});
