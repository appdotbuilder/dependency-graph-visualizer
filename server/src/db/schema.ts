
import { serial, text, pgTable, timestamp, pgEnum, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Task status enum
export const taskStatusEnum = pgEnum('task_status', ['pending', 'in_progress', 'completed', 'blocked']);

// Graphs table - stores dependency graph metadata
export const graphsTable = pgTable('graphs', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  graph_data: text('graph_data').notNull(), // JSON string of complete graph structure
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Tasks table - stores individual tasks
export const tasksTable = pgTable('tasks', {
  id: serial('id').primaryKey(),
  graph_id: integer('graph_id').references(() => graphsTable.id, { onDelete: 'cascade' }).notNull(),
  task_id: text('task_id').notNull(), // User-defined unique identifier within the graph
  name: text('name').notNull(),
  status: taskStatusEnum('status').notNull().default('pending'),
  description: text('description'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Dependencies table - stores task dependencies
export const dependenciesTable = pgTable('dependencies', {
  id: serial('id').primaryKey(),
  graph_id: integer('graph_id').references(() => graphsTable.id, { onDelete: 'cascade' }).notNull(),
  task_id: text('task_id').notNull(), // The task that has dependencies
  depends_on_task_id: text('depends_on_task_id').notNull(), // The task it depends on
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Define relations
export const graphsRelations = relations(graphsTable, ({ many }) => ({
  tasks: many(tasksTable),
  dependencies: many(dependenciesTable)
}));

export const tasksRelations = relations(tasksTable, ({ one, many }) => ({
  graph: one(graphsTable, {
    fields: [tasksTable.graph_id],
    references: [graphsTable.id]
  }),
  dependencies: many(dependenciesTable, {
    relationName: 'taskDependencies'
  }),
  dependents: many(dependenciesTable, {
    relationName: 'taskDependents'
  })
}));

export const dependenciesRelations = relations(dependenciesTable, ({ one }) => ({
  graph: one(graphsTable, {
    fields: [dependenciesTable.graph_id],
    references: [graphsTable.id]
  }),
  task: one(tasksTable, {
    fields: [dependenciesTable.task_id],
    references: [tasksTable.task_id],
    relationName: 'taskDependencies'
  }),
  dependsOnTask: one(tasksTable, {
    fields: [dependenciesTable.depends_on_task_id],
    references: [tasksTable.task_id],
    relationName: 'taskDependents'
  })
}));

// TypeScript types for the table schemas
export type Graph = typeof graphsTable.$inferSelect;
export type NewGraph = typeof graphsTable.$inferInsert;
export type Task = typeof tasksTable.$inferSelect;
export type NewTask = typeof tasksTable.$inferInsert;
export type Dependency = typeof dependenciesTable.$inferSelect;
export type NewDependency = typeof dependenciesTable.$inferInsert;

// Export all tables for proper query building
export const tables = { 
  graphs: graphsTable, 
  tasks: tasksTable, 
  dependencies: dependenciesTable 
};
