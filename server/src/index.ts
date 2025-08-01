
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { z } from 'zod';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';

import { 
  createGraphInputSchema, 
  updateGraphInputSchema 
} from './schema';
import { createGraph } from './handlers/create_graph';
import { getGraphs } from './handlers/get_graphs';
import { getGraphDetails } from './handlers/get_graph_details';
import { updateGraph } from './handlers/update_graph';
import { getTaskDetails } from './handlers/get_task_details';
import { analyzeGraph } from './handlers/analyze_graph';
import { deleteGraph } from './handlers/delete_graph';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),
  
  // Create a new dependency graph
  createGraph: publicProcedure
    .input(createGraphInputSchema)
    .mutation(({ input }) => createGraph(input)),
  
  // Get all graphs (basic info)
  getGraphs: publicProcedure
    .query(() => getGraphs()),
  
  // Get complete graph details with analysis
  getGraphDetails: publicProcedure
    .input(z.object({ graphId: z.number() }))
    .query(({ input }) => getGraphDetails(input.graphId)),
  
  // Update an existing graph
  updateGraph: publicProcedure
    .input(updateGraphInputSchema)
    .mutation(({ input }) => updateGraph(input)),
  
  // Delete a graph
  deleteGraph: publicProcedure
    .input(z.object({ graphId: z.number() }))
    .mutation(({ input }) => deleteGraph(input.graphId)),
  
  // Get task details with dependencies and dependents
  getTaskDetails: publicProcedure
    .input(z.object({ graphId: z.number(), taskId: z.string() }))
    .query(({ input }) => getTaskDetails(input.graphId, input.taskId)),
  
  // Analyze graph for cycles and topological ordering
  analyzeGraph: publicProcedure
    .input(z.object({ graphId: z.number() }))
    .query(({ input }) => analyzeGraph(input.graphId))
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
}

start();
