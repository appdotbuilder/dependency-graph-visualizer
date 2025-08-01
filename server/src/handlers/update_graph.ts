
import { db } from '../db';
import { graphsTable, tasksTable, dependenciesTable } from '../db/schema';
import { type UpdateGraphInput, type GraphWithDetails, type GraphAnalysis } from '../schema';
import { eq, and } from 'drizzle-orm';

// Cycle detection using DFS
function detectCycles(taskIds: string[], dependencies: Array<{ task_id: string; depends_on_task_id: string }>): string[][] {
  const graph = new Map<string, string[]>();
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const cycles: string[][] = [];

  // Build adjacency list
  for (const taskId of taskIds) {
    graph.set(taskId, []);
  }
  for (const dep of dependencies) {
    const deps = graph.get(dep.task_id) || [];
    deps.push(dep.depends_on_task_id);
    graph.set(dep.task_id, deps);
  }

  function dfs(node: string, path: string[]): void {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path]);
      } else if (recStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), neighbor]);
        }
      }
    }

    recStack.delete(node);
  }

  for (const taskId of taskIds) {
    if (!visited.has(taskId)) {
      dfs(taskId, []);
    }
  }

  return cycles;
}

// Topological sort using Kahn's algorithm
function topologicalSort(taskIds: string[], dependencies: Array<{ task_id: string; depends_on_task_id: string }>): string[] | null {
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  // Initialize
  for (const taskId of taskIds) {
    graph.set(taskId, []);
    inDegree.set(taskId, 0);
  }

  // Build graph and calculate in-degrees
  for (const dep of dependencies) {
    const deps = graph.get(dep.depends_on_task_id) || [];
    deps.push(dep.task_id);
    graph.set(dep.depends_on_task_id, deps);
    inDegree.set(dep.task_id, (inDegree.get(dep.task_id) || 0) + 1);
  }

  // Find nodes with no incoming edges
  const queue: string[] = [];
  for (const [taskId, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(taskId);
    }
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    const neighbors = graph.get(current) || [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return result.length === taskIds.length ? result : null;
}

// Calculate task levels for visualization
function calculateTaskLevels(taskIds: string[], dependencies: Array<{ task_id: string; depends_on_task_id: string }>): Record<string, number> {
  const levels: Record<string, number> = {};
  const graph = new Map<string, string[]>();

  // Initialize
  for (const taskId of taskIds) {
    graph.set(taskId, []);
    levels[taskId] = 0;
  }

  // Build dependency graph (reverse direction for level calculation)
  for (const dep of dependencies) {
    const deps = graph.get(dep.depends_on_task_id) || [];
    deps.push(dep.task_id);
    graph.set(dep.depends_on_task_id, deps);
  }

  // Calculate levels using BFS
  const queue: string[] = [];
  const visited = new Set<string>();

  // Find root nodes (no dependencies)
  for (const taskId of taskIds) {
    const hasDependencies = dependencies.some(dep => dep.task_id === taskId);
    if (!hasDependencies) {
      queue.push(taskId);
      visited.add(taskId);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels[current];

    const dependents = graph.get(current) || [];
    for (const dependent of dependents) {
      levels[dependent] = Math.max(levels[dependent], currentLevel + 1);
      if (!visited.has(dependent)) {
        // Check if all dependencies are processed
        const depDependencies = dependencies.filter(dep => dep.task_id === dependent);
        const allProcessed = depDependencies.every(dep => visited.has(dep.depends_on_task_id));
        if (allProcessed) {
          queue.push(dependent);
          visited.add(dependent);
        }
      }
    }
  }

  return levels;
}

export async function updateGraph(input: UpdateGraphInput): Promise<GraphWithDetails | null> {
  try {
    // Check if graph exists
    const existingGraphs = await db.select()
      .from(graphsTable)
      .where(eq(graphsTable.id, input.id))
      .execute();

    if (existingGraphs.length === 0) {
      return null;
    }

    const existingGraph = existingGraphs[0];

    // Start transaction-like operations
    let updatedGraph = existingGraph;

    // Update graph metadata if provided
    if (input.name !== undefined || input.description !== undefined) {
      const updateData: any = { updated_at: new Date() };
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;

      const updatedGraphs = await db.update(graphsTable)
        .set(updateData)
        .where(eq(graphsTable.id, input.id))
        .returning()
        .execute();
      
      updatedGraph = updatedGraphs[0];
    }

    // If tasks are provided, replace all existing tasks and dependencies
    if (input.tasks) {
      // Delete existing tasks and dependencies
      await db.delete(dependenciesTable)
        .where(eq(dependenciesTable.graph_id, input.id))
        .execute();
      
      await db.delete(tasksTable)
        .where(eq(tasksTable.graph_id, input.id))
        .execute();

      // Validate and detect cycles first
      const taskIds = input.tasks.map(t => t.task_id);
      const allDependencies = input.tasks.flatMap(task => 
        task.dependencies.map(depId => ({
          task_id: task.task_id,
          depends_on_task_id: depId
        }))
      );

      // Validate that all dependency references exist
      for (const dep of allDependencies) {
        if (!taskIds.includes(dep.depends_on_task_id)) {
          throw new Error(`Dependency reference '${dep.depends_on_task_id}' not found in task list`);
        }
      }

      const cycles = detectCycles(taskIds, allDependencies);
      const topologicalOrder = topologicalSort(taskIds, allDependencies);
      const taskLevels = calculateTaskLevels(taskIds, allDependencies);

      // Create new tasks
      if (input.tasks.length > 0) {
        await db.insert(tasksTable)
          .values(input.tasks.map(task => ({
            graph_id: input.id,
            task_id: task.task_id,
            name: task.name,
            status: task.status || 'pending',
            description: task.description || null
          })))
          .execute();
      }

      // Create new dependencies
      if (allDependencies.length > 0) {
        await db.insert(dependenciesTable)
          .values(allDependencies.map(dep => ({
            graph_id: input.id,
            task_id: dep.task_id,
            depends_on_task_id: dep.depends_on_task_id
          })))
          .execute();
      }

      // Update graph_data with new structure
      const graphData = {
        tasks: input.tasks,
        analysis: {
          has_cycles: cycles.length > 0,
          cycles,
          topological_order: topologicalOrder,
          task_levels: taskLevels
        }
      };

      const updatedGraphs = await db.update(graphsTable)
        .set({
          graph_data: JSON.stringify(graphData),
          updated_at: new Date()
        })
        .where(eq(graphsTable.id, input.id))
        .returning()
        .execute();

      updatedGraph = updatedGraphs[0];
    }

    // Fetch updated data for response
    const tasks = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.graph_id, input.id))
      .execute();

    const dependencies = await db.select()
      .from(dependenciesTable)
      .where(eq(dependenciesTable.graph_id, input.id))
      .execute();

    // Parse graph_data for analysis or calculate fresh analysis
    let analysis: GraphAnalysis;
    if (updatedGraph.graph_data) {
      try {
        const parsedData = JSON.parse(updatedGraph.graph_data);
        analysis = {
          graph_id: input.id,
          has_cycles: parsedData.analysis?.has_cycles || false,
          cycles: parsedData.analysis?.cycles || [],
          topological_order: parsedData.analysis?.topological_order || null,
          task_levels: parsedData.analysis?.task_levels || {}
        };
      } catch {
        // Fallback to fresh calculation
        const taskIds = tasks.map(t => t.task_id);
        const deps = dependencies.map(d => ({ task_id: d.task_id, depends_on_task_id: d.depends_on_task_id }));
        const cycles = detectCycles(taskIds, deps);
        const topologicalOrder = topologicalSort(taskIds, deps);
        const taskLevels = calculateTaskLevels(taskIds, deps);

        analysis = {
          graph_id: input.id,
          has_cycles: cycles.length > 0,
          cycles,
          topological_order: topologicalOrder,
          task_levels: taskLevels
        };
      }
    } else {
      // Fresh calculation
      const taskIds = tasks.map(t => t.task_id);
      const deps = dependencies.map(d => ({ task_id: d.task_id, depends_on_task_id: d.depends_on_task_id }));
      const cycles = detectCycles(taskIds, deps);
      const topologicalOrder = topologicalSort(taskIds, deps);
      const taskLevels = calculateTaskLevels(taskIds, deps);

      analysis = {
        graph_id: input.id,
        has_cycles: cycles.length > 0,
        cycles,
        topological_order: topologicalOrder,
        task_levels: taskLevels
      };
    }

    return {
      graph: updatedGraph,
      tasks,
      dependencies,
      analysis
    };

  } catch (error) {
    console.error('Graph update failed:', error);
    throw error;
  }
}
