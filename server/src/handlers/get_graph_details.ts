
import { db } from '../db';
import { graphsTable, tasksTable, dependenciesTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { type GraphWithDetails, type Task, type Dependency, type GraphAnalysis } from '../schema';

export async function getGraphDetails(graphId: number): Promise<GraphWithDetails | null> {
  try {
    // Fetch the graph
    const graphs = await db.select()
      .from(graphsTable)
      .where(eq(graphsTable.id, graphId))
      .execute();

    if (graphs.length === 0) {
      return null;
    }

    const graph = graphs[0];

    // Fetch all tasks for this graph
    const tasksResults = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.graph_id, graphId))
      .execute();

    // Fetch all dependencies for this graph
    const dependenciesResults = await db.select()
      .from(dependenciesTable)
      .where(eq(dependenciesTable.graph_id, graphId))
      .execute();

    // Convert database results to schema types
    const tasks: Task[] = tasksResults.map(task => ({
      id: task.id,
      task_id: task.task_id,
      name: task.name,
      status: task.status,
      description: task.description,
      created_at: task.created_at,
      updated_at: task.updated_at
    }));

    const dependencies: Dependency[] = dependenciesResults.map(dep => ({
      id: dep.id,
      task_id: dep.task_id,
      depends_on_task_id: dep.depends_on_task_id,
      created_at: dep.created_at
    }));

    // Perform graph analysis
    const analysis = analyzeGraph(tasks, dependencies, graphId);

    return {
      graph: {
        id: graph.id,
        name: graph.name,
        description: graph.description,
        graph_data: graph.graph_data,
        created_at: graph.created_at,
        updated_at: graph.updated_at
      },
      tasks,
      dependencies,
      analysis
    };
  } catch (error) {
    console.error('Get graph details failed:', error);
    throw error;
  }
}

function analyzeGraph(tasks: Task[], dependencies: Dependency[], graphId: number): GraphAnalysis {
  // Build adjacency list from dependencies
  const adjList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  // Initialize all tasks
  tasks.forEach(task => {
    adjList.set(task.task_id, []);
    inDegree.set(task.task_id, 0);
  });

  // Build the graph structure
  dependencies.forEach(dep => {
    const from = dep.depends_on_task_id;
    const to = dep.task_id;
    
    if (adjList.has(from) && inDegree.has(to)) {
      adjList.get(from)!.push(to);
      inDegree.set(to, inDegree.get(to)! + 1);
    }
  });

  // Detect cycles using DFS
  const { hasCycles, cycles } = detectCycles(adjList);

  // Calculate topological order and task levels
  let topologicalOrder: string[] | null = null;
  const taskLevels: Record<string, number> = {};

  if (!hasCycles) {
    const result = calculateTopologicalOrderAndLevels(adjList, inDegree);
    topologicalOrder = result.order;
    Object.assign(taskLevels, result.levels);
  }

  return {
    graph_id: graphId,
    has_cycles: hasCycles,
    cycles,
    topological_order: topologicalOrder,
    task_levels: taskLevels
  };
}

function detectCycles(adjList: Map<string, string[]>): { hasCycles: boolean; cycles: string[][] } {
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]): void {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = adjList.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path]);
      } else if (recStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart);
          cycle.push(neighbor); // Complete the cycle
          cycles.push(cycle);
        }
      }
    }

    recStack.delete(node);
  }

  for (const node of adjList.keys()) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  return { hasCycles: cycles.length > 0, cycles };
}

function calculateTopologicalOrderAndLevels(
  adjList: Map<string, string[]>, 
  inDegree: Map<string, number>
): { order: string[]; levels: Record<string, number> } {
  const order: string[] = [];
  const levels: Record<string, number> = {};
  const queue: string[] = [];
  const inDegreeClone = new Map(inDegree);

  // Initialize queue with nodes having no dependencies
  for (const [node, degree] of inDegreeClone.entries()) {
    if (degree === 0) {
      queue.push(node);
      levels[node] = 0;
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    const neighbors = adjList.get(current) || [];
    for (const neighbor of neighbors) {
      const newDegree = inDegreeClone.get(neighbor)! - 1;
      inDegreeClone.set(neighbor, newDegree);

      // Update level for the neighbor
      const currentLevel = levels[current] || 0;
      levels[neighbor] = Math.max(levels[neighbor] || 0, currentLevel + 1);

      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return { order, levels };
}
