
import { db } from '../db';
import { graphsTable, tasksTable, dependenciesTable } from '../db/schema';
import { type CreateGraphInput, type GraphWithDetails, type GraphAnalysis } from '../schema';

// Helper function to detect cycles using DFS
function detectCycles(tasks: string[], dependencies: Map<string, string[]>): {
  hasCycles: boolean;
  cycles: string[][];
} {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(task: string, path: string[]): boolean {
    if (recursionStack.has(task)) {
      // Found a cycle - extract the cycle from the path
      const cycleStart = path.indexOf(task);
      const cycle = path.slice(cycleStart).concat([task]);
      cycles.push(cycle);
      return true;
    }

    if (visited.has(task)) {
      return false;
    }

    visited.add(task);
    recursionStack.add(task);
    path.push(task);

    const deps = dependencies.get(task) || [];
    for (const dep of deps) {
      if (dfs(dep, [...path])) {
        // Continue to find all cycles, don't return early
      }
    }

    recursionStack.delete(task);
    return false;
  }

  for (const task of tasks) {
    if (!visited.has(task)) {
      dfs(task, []);
    }
  }

  return {
    hasCycles: cycles.length > 0,
    cycles
  };
}

// Helper function to calculate topological order using Kahn's algorithm
function calculateTopologicalOrder(tasks: string[], dependsOnMap: Map<string, string[]>): string[] | null {
  // First check for cycles
  const { hasCycles } = detectCycles(tasks, dependsOnMap);
  if (hasCycles) {
    return null;
  }

  // Build reverse dependency map (what depends on each task)
  const dependentsMap = new Map<string, string[]>();
  tasks.forEach(task => dependentsMap.set(task, []));

  dependsOnMap.forEach((deps, task) => {
    deps.forEach(dep => {
      if (!dependentsMap.has(dep)) {
        dependentsMap.set(dep, []);
      }
      dependentsMap.get(dep)!.push(task);
    });
  });

  // Calculate in-degree for each task (number of dependencies)
  const inDegree = new Map<string, number>();
  tasks.forEach(task => {
    const deps = dependsOnMap.get(task) || [];
    inDegree.set(task, deps.length);
  });

  // Find tasks with no incoming edges (no dependencies)
  const queue: string[] = [];
  inDegree.forEach((degree, task) => {
    if (degree === 0) {
      queue.push(task);
    }
  });

  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    // Reduce in-degree for tasks that depend on current task
    const dependents = dependentsMap.get(current) || [];
    dependents.forEach(dependent => {
      const newDegree = (inDegree.get(dependent) || 0) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    });
  }

  return result;
}

// Helper function to calculate task levels for visualization
function calculateTaskLevels(tasks: string[], dependsOnMap: Map<string, string[]>): Record<string, number> {
  const levels: Record<string, number> = {};
  const visited = new Set<string>();

  function calculateLevel(task: string): number {
    if (levels[task] !== undefined) {
      return levels[task];
    }

    if (visited.has(task)) {
      // Cycle detected, return 0
      return 0;
    }

    visited.add(task);

    const deps = dependsOnMap.get(task) || [];
    if (deps.length === 0) {
      levels[task] = 0;
    } else {
      const maxDepLevel = Math.max(...deps.map(dep => calculateLevel(dep)));
      levels[task] = maxDepLevel + 1;
    }

    visited.delete(task);
    return levels[task];
  }

  tasks.forEach(task => calculateLevel(task));
  return levels;
}

export async function createGraph(input: CreateGraphInput): Promise<GraphWithDetails> {
  try {
    // Validate that all task_ids are unique
    const taskIds = input.tasks.map(t => t.task_id);
    const uniqueTaskIds = new Set(taskIds);
    if (taskIds.length !== uniqueTaskIds.size) {
      throw new Error('Duplicate task_id found in input');
    }

    // Validate that all dependencies reference existing tasks
    const dependsOnMap = new Map<string, string[]>();
    for (const task of input.tasks) {
      for (const depId of task.dependencies) {
        if (!uniqueTaskIds.has(depId)) {
          throw new Error(`Task ${task.task_id} depends on non-existent task ${depId}`);
        }
      }
      dependsOnMap.set(task.task_id, task.dependencies);
    }

    // Perform cycle detection
    const { hasCycles, cycles } = detectCycles(taskIds, dependsOnMap);

    // Calculate topological order
    const topologicalOrder = calculateTopologicalOrder(taskIds, dependsOnMap);

    // Calculate task levels
    const taskLevels = calculateTaskLevels(taskIds, dependsOnMap);

    // Create the graph record
    const graphResult = await db.insert(graphsTable)
      .values({
        name: input.name,
        description: input.description || null,
        graph_data: JSON.stringify(input.tasks)
      })
      .returning()
      .execute();

    const graph = graphResult[0];

    // Create task records
    const taskValues = input.tasks.map(task => ({
      graph_id: graph.id,
      task_id: task.task_id,
      name: task.name,
      status: task.status || 'pending' as const,
      description: task.description || null
    }));

    const taskResults = await db.insert(tasksTable)
      .values(taskValues)
      .returning()
      .execute();

    // Create dependency records
    const dependencyValues: Array<{
      graph_id: number;
      task_id: string;
      depends_on_task_id: string;
    }> = [];

    input.tasks.forEach(task => {
      task.dependencies.forEach(depId => {
        dependencyValues.push({
          graph_id: graph.id,
          task_id: task.task_id,
          depends_on_task_id: depId
        });
      });
    });

    let dependencyResults: any[] = [];
    if (dependencyValues.length > 0) {
      dependencyResults = await db.insert(dependenciesTable)
        .values(dependencyValues)
        .returning()
        .execute();
    }

    // Build analysis result
    const analysis: GraphAnalysis = {
      graph_id: graph.id,
      has_cycles: hasCycles,
      cycles,
      topological_order: topologicalOrder,
      task_levels: taskLevels
    };

    // Return complete graph with details
    return {
      graph: {
        id: graph.id,
        name: graph.name,
        description: graph.description,
        graph_data: graph.graph_data,
        created_at: graph.created_at,
        updated_at: graph.updated_at
      },
      tasks: taskResults.map(task => ({
        id: task.id,
        task_id: task.task_id,
        name: task.name,
        status: task.status,
        description: task.description,
        created_at: task.created_at,
        updated_at: task.updated_at
      })),
      dependencies: dependencyResults.map(dep => ({
        id: dep.id,
        task_id: dep.task_id,
        depends_on_task_id: dep.depends_on_task_id,
        created_at: dep.created_at
      })),
      analysis
    };
  } catch (error) {
    console.error('Graph creation failed:', error);
    throw error;
  }
}
