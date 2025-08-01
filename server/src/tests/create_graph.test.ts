
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { graphsTable, tasksTable, dependenciesTable } from '../db/schema';
import { type CreateGraphInput } from '../schema';
import { createGraph } from '../handlers/create_graph';
import { eq } from 'drizzle-orm';

// Simple linear graph for basic testing
const linearGraphInput: CreateGraphInput = {
  name: 'Linear Project',
  description: 'A simple linear dependency graph',
  tasks: [
    {
      task_id: 'task1',
      name: 'First Task',
      status: 'pending',
      description: 'Starting task',
      dependencies: []
    },
    {
      task_id: 'task2',
      name: 'Second Task',
      status: 'pending',
      description: 'Depends on task1',
      dependencies: ['task1']
    },
    {
      task_id: 'task3',
      name: 'Third Task',
      status: 'completed',
      description: 'Depends on task2',
      dependencies: ['task2']
    }
  ]
};

// Complex graph with multiple dependencies
const complexGraphInput: CreateGraphInput = {
  name: 'Complex Project',
  description: null,
  tasks: [
    {
      task_id: 'A',
      name: 'Task A',
      status: 'pending',
      dependencies: []
    },
    {
      task_id: 'B',
      name: 'Task B',
      status: 'pending',
      dependencies: ['A']
    },
    {
      task_id: 'C',
      name: 'Task C',
      status: 'pending',
      dependencies: ['A']
    },
    {
      task_id: 'D',
      name: 'Task D',
      status: 'pending',
      dependencies: ['B', 'C']
    }
  ]
};

// Cyclic graph for testing cycle detection
const cyclicGraphInput: CreateGraphInput = {
  name: 'Cyclic Project',
  description: 'Graph with cycles',
  tasks: [
    {
      task_id: 'X',
      name: 'Task X',
      status: 'pending',
      dependencies: ['Z']
    },
    {
      task_id: 'Y',
      name: 'Task Y',
      status: 'pending',
      dependencies: ['X']
    },
    {
      task_id: 'Z',
      name: 'Task Z',
      status: 'pending',
      dependencies: ['Y']
    }
  ]
};

describe('createGraph', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a simple linear graph', async () => {
    const result = await createGraph(linearGraphInput);

    // Verify graph creation
    expect(result.graph.name).toEqual('Linear Project');
    expect(result.graph.description).toEqual('A simple linear dependency graph');
    expect(result.graph.id).toBeDefined();
    expect(result.graph.created_at).toBeInstanceOf(Date);
    expect(result.graph.updated_at).toBeInstanceOf(Date);

    // Verify tasks
    expect(result.tasks).toHaveLength(3);
    const task1 = result.tasks.find(t => t.task_id === 'task1');
    const task2 = result.tasks.find(t => t.task_id === 'task2');
    const task3 = result.tasks.find(t => t.task_id === 'task3');

    expect(task1?.name).toEqual('First Task');
    expect(task1?.status).toEqual('pending');
    expect(task2?.name).toEqual('Second Task');
    expect(task3?.status).toEqual('completed');

    // Verify dependencies
    expect(result.dependencies).toHaveLength(2);
    const deps = result.dependencies;
    expect(deps.some(d => d.task_id === 'task2' && d.depends_on_task_id === 'task1')).toBe(true);
    expect(deps.some(d => d.task_id === 'task3' && d.depends_on_task_id === 'task2')).toBe(true);

    // Verify analysis
    expect(result.analysis.has_cycles).toBe(false);
    expect(result.analysis.cycles).toHaveLength(0);
    expect(result.analysis.topological_order).toEqual(['task1', 'task2', 'task3']);
    expect(result.analysis.task_levels).toEqual({
      'task1': 0,
      'task2': 1,
      'task3': 2
    });
  });

  it('should save graph data to database correctly', async () => {
    const result = await createGraph(linearGraphInput);

    // Verify graph in database
    const graphs = await db.select()
      .from(graphsTable)
      .where(eq(graphsTable.id, result.graph.id))
      .execute();

    expect(graphs).toHaveLength(1);
    expect(graphs[0].name).toEqual('Linear Project');
    expect(JSON.parse(graphs[0].graph_data)).toEqual(linearGraphInput.tasks);

    // Verify tasks in database
    const tasks = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.graph_id, result.graph.id))
      .execute();

    expect(tasks).toHaveLength(3);
    expect(tasks.every(t => t.graph_id === result.graph.id)).toBe(true);

    // Verify dependencies in database
    const dependencies = await db.select()
      .from(dependenciesTable)
      .where(eq(dependenciesTable.graph_id, result.graph.id))
      .execute();

    expect(dependencies).toHaveLength(2);
    expect(dependencies.every(d => d.graph_id === result.graph.id)).toBe(true);
  });

  it('should handle complex dependency graphs', async () => {
    const result = await createGraph(complexGraphInput);

    expect(result.graph.name).toEqual('Complex Project');
    expect(result.graph.description).toBeNull();
    expect(result.tasks).toHaveLength(4);
    expect(result.dependencies).toHaveLength(4); // A->B, A->C, B->D, C->D

    // Verify topological order is valid (any valid order is acceptable)
    const order = result.analysis.topological_order!;
    expect(order).toContain('A');
    expect(order).toContain('B');
    expect(order).toContain('C');
    expect(order).toContain('D');
    
    // A should come before B and C
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('C'));
    // B and C should come before D
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));

    // Verify task levels
    expect(result.analysis.task_levels['A']).toEqual(0);
    expect(result.analysis.task_levels['B']).toEqual(1);
    expect(result.analysis.task_levels['C']).toEqual(1);
    expect(result.analysis.task_levels['D']).toEqual(2);
  });

  it('should detect cycles correctly', async () => {
    const result = await createGraph(cyclicGraphInput);

    expect(result.analysis.has_cycles).toBe(true);
    expect(result.analysis.cycles.length).toBeGreaterThan(0);
    expect(result.analysis.topological_order).toBeNull();

    // Verify the cycle is detected (should contain X, Y, Z in some order)
    const cycle = result.analysis.cycles[0];
    expect(cycle).toContain('X');
    expect(cycle).toContain('Y');
    expect(cycle).toContain('Z');
  });

  it('should handle graphs with no dependencies', async () => {
    const input: CreateGraphInput = {
      name: 'Independent Tasks',
      description: 'No dependencies between tasks',
      tasks: [
        { task_id: 'solo1', name: 'Solo Task 1', status: 'pending', dependencies: [] },
        { task_id: 'solo2', name: 'Solo Task 2', status: 'pending', dependencies: [] }
      ]
    };

    const result = await createGraph(input);

    expect(result.dependencies).toHaveLength(0);
    expect(result.analysis.has_cycles).toBe(false);
    expect(result.analysis.topological_order).toHaveLength(2);
    expect(result.analysis.task_levels['solo1']).toEqual(0);
    expect(result.analysis.task_levels['solo2']).toEqual(0);
  });

  it('should reject duplicate task_ids', async () => {
    const invalidInput: CreateGraphInput = {
      name: 'Duplicate Test',
      description: null,
      tasks: [
        { task_id: 'duplicate', name: 'Task 1', status: 'pending', dependencies: [] },
        { task_id: 'duplicate', name: 'Task 2', status: 'pending', dependencies: [] }
      ]
    };

    await expect(createGraph(invalidInput)).rejects.toThrow(/duplicate task_id/i);
  });

  it('should reject invalid dependency references', async () => {
    const invalidInput: CreateGraphInput = {
      name: 'Invalid Deps',
      description: null,
      tasks: [
        { task_id: 'valid', name: 'Valid Task', status: 'pending', dependencies: ['nonexistent'] }
      ]
    };

    await expect(createGraph(invalidInput)).rejects.toThrow(/non-existent task/i);
  });

  it('should apply default values correctly', async () => {
    const inputWithDefaults: CreateGraphInput = {
      name: 'Default Test',
      description: null,
      tasks: [
        {
          task_id: 'default_task',
          name: 'Task with defaults',
          status: 'pending', // Explicitly providing status since it's required
          dependencies: []
          // description not specified - should be null
        }
      ]
    };

    const result = await createGraph(inputWithDefaults);

    const task = result.tasks.find(t => t.task_id === 'default_task');
    expect(task?.status).toEqual('pending');
    expect(task?.description).toBeNull();
  });
});
