
import { db } from '../db';
import { tasksTable, dependenciesTable } from '../db/schema';
import { type TaskWithDependencies } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function getTaskDetails(graphId: number, taskId: string): Promise<TaskWithDependencies | null> {
  try {
    // First, find the main task
    const taskResult = await db.select()
      .from(tasksTable)
      .where(and(
        eq(tasksTable.graph_id, graphId),
        eq(tasksTable.task_id, taskId)
      ))
      .execute();

    if (taskResult.length === 0) {
      return null;
    }

    const task = taskResult[0];

    // Find all tasks this task depends on (dependencies)
    const dependenciesResult = await db.select({
      task: tasksTable
    })
      .from(dependenciesTable)
      .innerJoin(tasksTable, and(
        eq(dependenciesTable.depends_on_task_id, tasksTable.task_id),
        eq(dependenciesTable.graph_id, tasksTable.graph_id)
      ))
      .where(and(
        eq(dependenciesTable.graph_id, graphId),
        eq(dependenciesTable.task_id, taskId)
      ))
      .execute();

    // Find all tasks that depend on this task (dependents)
    const dependentsResult = await db.select({
      task: tasksTable
    })
      .from(dependenciesTable)
      .innerJoin(tasksTable, and(
        eq(dependenciesTable.task_id, tasksTable.task_id),
        eq(dependenciesTable.graph_id, tasksTable.graph_id)
      ))
      .where(and(
        eq(dependenciesTable.graph_id, graphId),
        eq(dependenciesTable.depends_on_task_id, taskId)
      ))
      .execute();

    // Extract tasks from joined results
    const dependencies = dependenciesResult.map(result => result.task);
    const dependents = dependentsResult.map(result => result.task);

    return {
      task,
      dependencies,
      dependents
    };
  } catch (error) {
    console.error('Get task details failed:', error);
    throw error;
  }
}
