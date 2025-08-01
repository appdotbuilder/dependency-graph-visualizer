
import { z } from 'zod';

// Task schema
export const taskSchema = z.object({
  id: z.number(),
  task_id: z.string(), // Unique identifier for the task
  name: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']),
  description: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Task = z.infer<typeof taskSchema>;

// Dependency schema
export const dependencySchema = z.object({
  id: z.number(),
  task_id: z.string(), // The task that has dependencies
  depends_on_task_id: z.string(), // The task it depends on
  created_at: z.coerce.date()
});

export type Dependency = z.infer<typeof dependencySchema>;

// Graph schema - stores complete dependency graphs
export const graphSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  graph_data: z.string(), // JSON string of the complete graph structure
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Graph = z.infer<typeof graphSchema>;

// Input schema for creating a graph from JSON
export const createGraphInputSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  tasks: z.array(z.object({
    task_id: z.string(),
    name: z.string(),
    status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional().default('pending'),
    description: z.string().nullable().optional(),
    dependencies: z.array(z.string()) // Array of task_ids this task depends on
  }))
});

export type CreateGraphInput = z.infer<typeof createGraphInputSchema>;

// Input schema for updating graph
export const updateGraphInputSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  tasks: z.array(z.object({
    task_id: z.string(),
    name: z.string(),
    status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
    description: z.string().nullable().optional(),
    dependencies: z.array(z.string())
  })).optional()
});

export type UpdateGraphInput = z.infer<typeof updateGraphInputSchema>;

// Graph analysis result schema
export const graphAnalysisSchema = z.object({
  graph_id: z.number(),
  has_cycles: z.boolean(),
  cycles: z.array(z.array(z.string())), // Array of cycles, each cycle is an array of task_ids
  topological_order: z.array(z.string()).nullable(), // Null if cycles exist
  task_levels: z.record(z.string(), z.number()) // task_id -> level mapping for visualization
});

export type GraphAnalysis = z.infer<typeof graphAnalysisSchema>;

// Task details with dependencies schema
export const taskWithDependenciesSchema = z.object({
  task: taskSchema,
  dependencies: z.array(taskSchema), // Tasks this task depends on
  dependents: z.array(taskSchema) // Tasks that depend on this task
});

export type TaskWithDependencies = z.infer<typeof taskWithDependenciesSchema>;

// Graph with full details schema
export const graphWithDetailsSchema = z.object({
  graph: graphSchema,
  tasks: z.array(taskSchema),
  dependencies: z.array(dependencySchema),
  analysis: graphAnalysisSchema
});

export type GraphWithDetails = z.infer<typeof graphWithDetailsSchema>;
