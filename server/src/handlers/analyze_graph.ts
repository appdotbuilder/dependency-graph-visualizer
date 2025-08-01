
import { db } from '../db';
import { graphsTable, tasksTable, dependenciesTable } from '../db/schema';
import { type GraphAnalysis } from '../schema';
import { eq } from 'drizzle-orm';

export async function analyzeGraph(graphId: number): Promise<GraphAnalysis | null> {
  try {
    // Check if graph exists
    const graphs = await db.select()
      .from(graphsTable)
      .where(eq(graphsTable.id, graphId))
      .execute();

    if (graphs.length === 0) {
      return null;
    }

    // Fetch all tasks for this graph
    const tasks = await db.select()
      .from(tasksTable)
      .where(eq(tasksTable.graph_id, graphId))
      .execute();

    // Fetch all dependencies for this graph
    const dependencies = await db.select()
      .from(dependenciesTable)
      .where(eq(dependenciesTable.graph_id, graphId))
      .execute();

    // Build adjacency list representation
    const adjacencyList: Map<string, string[]> = new Map();
    const allTaskIds = new Set<string>();

    // Initialize adjacency list with all tasks
    tasks.forEach(task => {
      adjacencyList.set(task.task_id, []);
      allTaskIds.add(task.task_id);
    });

    // Add dependencies to adjacency list
    dependencies.forEach(dep => {
      const dependents = adjacencyList.get(dep.depends_on_task_id) || [];
      dependents.push(dep.task_id);
      adjacencyList.set(dep.depends_on_task_id, dependents);
    });

    // Perform cycle detection using DFS with colored nodes
    const color: Map<string, 'white' | 'gray' | 'black'> = new Map();
    const cycles: string[][] = [];
    const currentPath: string[] = [];

    // Initialize all nodes as white (unvisited)
    allTaskIds.forEach(taskId => {
      color.set(taskId, 'white');
    });

    function dfsForCycles(node: string): boolean {
      color.set(node, 'gray'); // Mark as currently being processed
      currentPath.push(node);

      const neighbors = adjacencyList.get(node) || [];
      for (const neighbor of neighbors) {
        if (color.get(neighbor) === 'gray') {
          // Back edge found - we have a cycle
          const cycleStart = currentPath.indexOf(neighbor);
          const cycle = currentPath.slice(cycleStart);
          cycle.push(neighbor); // Complete the cycle
          cycles.push(cycle);
        } else if (color.get(neighbor) === 'white' && dfsForCycles(neighbor)) {
          // Cycle found in recursion
        }
      }

      currentPath.pop();
      color.set(node, 'black'); // Mark as completely processed
      return false;
    }

    // Check for cycles starting from each unvisited node
    allTaskIds.forEach(taskId => {
      if (color.get(taskId) === 'white') {
        dfsForCycles(taskId);
      }
    });

    const hasCycles = cycles.length > 0;
    let topologicalOrder: string[] | null = null;
    const taskLevels: Record<string, number> = {};

    if (!hasCycles) {
      // Calculate topological ordering using Kahn's algorithm
      const inDegree: Map<string, number> = new Map();
      
      // Initialize in-degree count
      allTaskIds.forEach(taskId => {
        inDegree.set(taskId, 0);
      });

      // Calculate in-degrees
      dependencies.forEach(dep => {
        const currentInDegree = inDegree.get(dep.task_id) || 0;
        inDegree.set(dep.task_id, currentInDegree + 1);
      });

      // Queue for nodes with no incoming edges
      const queue: string[] = [];
      allTaskIds.forEach(taskId => {
        if (inDegree.get(taskId) === 0) {
          queue.push(taskId);
        }
      });

      topologicalOrder = [];

      while (queue.length > 0) {
        const current = queue.shift()!;
        topologicalOrder.push(current);

        // Process all neighbors
        const neighbors = adjacencyList.get(current) || [];
        neighbors.forEach(neighbor => {
          const newInDegree = (inDegree.get(neighbor) || 0) - 1;
          inDegree.set(neighbor, newInDegree);
          
          if (newInDegree === 0) {
            queue.push(neighbor);
          }
        });
      }

      // Calculate task levels for visualization
      const levels: Map<string, number> = new Map();
      
      // Initialize all tasks at level 0
      allTaskIds.forEach(taskId => {
        levels.set(taskId, 0);
      });

      // Calculate levels based on dependencies
      topologicalOrder.forEach(taskId => {
        const currentLevel = levels.get(taskId) || 0;
        const neighbors = adjacencyList.get(taskId) || [];
        
        neighbors.forEach(neighbor => {
          const neighborLevel = levels.get(neighbor) || 0;
          levels.set(neighbor, Math.max(neighborLevel, currentLevel + 1));
        });
      });

      // Convert to plain object
      levels.forEach((level, taskId) => {
        taskLevels[taskId] = level;
      });
    }

    return {
      graph_id: graphId,
      has_cycles: hasCycles,
      cycles,
      topological_order: topologicalOrder,
      task_levels: taskLevels
    };

  } catch (error) {
    console.error('Graph analysis failed:', error);
    throw error;
  }
}
