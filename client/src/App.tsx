
import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/utils/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { GraphVisualization } from '@/components/GraphVisualization';
import { TaskDetailsPanel } from '@/components/TaskDetailsPanel';
import { JsonEditor } from '@/components/JsonEditor';
import type { Graph, GraphWithDetails, CreateGraphInput } from '../../server/src/schema';

function App() {
  const [graphs, setGraphs] = useState<Graph[]>([]);
  const [selectedGraph, setSelectedGraph] = useState<GraphWithDetails | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state for creating new graphs
  const [newGraphName, setNewGraphName] = useState('');
  const [newGraphDescription, setNewGraphDescription] = useState('');
  const [jsonInput, setJsonInput] = useState<CreateGraphInput['tasks']>([]);

  const loadGraphs = useCallback(async () => {
    try {
      const result = await trpc.getGraphs.query();
      setGraphs(result);
    } catch (error) {
      console.error('Failed to load graphs:', error);
      setError('Failed to load graphs');
    }
  }, []);

  const loadGraphDetails = useCallback(async (graphId: number) => {
    setIsLoading(true);
    try {
      const result = await trpc.getGraphDetails.query({ graphId });
      setSelectedGraph(result);
      setSelectedTaskId(null);
      setError(null);
    } catch (error) {
      console.error('Failed to load graph details:', error);
      setError('Failed to load graph details');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGraphs();
  }, [loadGraphs]);

  const handleCreateGraph = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGraphName.trim()) return;

    setIsLoading(true);
    try {
      const input: CreateGraphInput = {
        name: newGraphName,
        description: newGraphDescription || null,
        tasks: jsonInput
      };

      const result = await trpc.createGraph.mutate(input);
      setGraphs((prev: Graph[]) => [...prev, result.graph]);
      setSelectedGraph(result);
      
      // Reset form
      setNewGraphName('');
      setNewGraphDescription('');
      setJsonInput([]);
      setError(null);
    } catch (error) {
      console.error('Failed to create graph:', error);
      setError('Failed to create graph');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTaskSelect = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const sampleJsonStructure = [
    {
      task_id: "task_1",
      name: "Setup Environment",
      status: "completed" as const,
      description: "Initialize project and install dependencies",
      dependencies: []
    },
    {
      task_id: "task_2", 
      name: "Design Database",
      status: "completed" as const,
      description: "Create database schema and models",
      dependencies: ["task_1"]
    },
    {
      task_id: "task_3",
      name: "Implement Backend API",
      status: "in_progress" as const,
      description: "Build REST API endpoints",
      dependencies: ["task_2"]
    },
    {
      task_id: "task_4",
      name: "Create Frontend UI",
      status: "pending" as const,
      description: "Build user interface components",
      dependencies: ["task_2"]
    },
    {
      task_id: "task_5",
      name: "Integration Testing",
      status: "pending" as const,
      description: "Test frontend and backend integration",
      dependencies: ["task_3", "task_4"]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="container mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
            🔗 Dependency Graph Visualizer
          </h1>
          <p className="text-gray-600 text-lg">
            Create and visualize task dependencies with interactive DAG visualization
          </p>
        </div>

        {/* Stub Notice */}
        <Alert className="mb-6 border-amber-200 bg-amber-50">
          <AlertDescription>
            ⚠️ <strong>Development Mode:</strong> Currently using stub data. Backend handlers need implementation for full functionality.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <AlertDescription className="text-red-700">
              {error}
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="create" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="create">📝 Create Graph</TabsTrigger>
            <TabsTrigger value="visualize">📊 Visualize</TabsTrigger>
            <TabsTrigger value="manage">📋 Manage Graphs</TabsTrigger>
          </TabsList>

          <TabsContent value="create">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Create New Dependency Graph</CardTitle>
                  <CardDescription>
                    Define your tasks and their dependencies using JSON structure
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateGraph} className="space-y-4">
                    <Input
                      placeholder="Graph name"
                      value={newGraphName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                        setNewGraphName(e.target.value)
                      }
                      required
                    />
                    <Textarea
                      placeholder="Description (optional)"
                      value={newGraphDescription}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => 
                        setNewGraphDescription(e.target.value)
                      }
                      rows={2}
                    />
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Task Structure</label>
                      <JsonEditor
                        value={jsonInput}
                        onChange={setJsonInput}
                        placeholder="Define your tasks and dependencies..."
                      />
                    </div>

                    <Button type="submit" disabled={isLoading} className="w-full">
                      {isLoading ? '⏳ Creating...' : '🚀 Create Graph'}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>📋 Sample Structure</CardTitle>
                  <CardDescription>
                    Use this example as a template for your tasks
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Button 
                      variant="outline" 
                      onClick={() => setJsonInput(sampleJsonStructure)}
                      className="w-full"
                    >
                      📥 Load Sample Data
                    </Button>
                    
                    <div className="bg-gray-50 p-4 rounded-lg text-xs font-mono overflow-auto max-h-96">
                      <pre>{JSON.stringify(sampleJsonStructure, null, 2)}</pre>
                    </div>
                    
                    <div className="space-y-2 text-sm text-gray-600">
                      <p><strong>Fields:</strong></p>
                      <ul className="list-disc list-inside space-y-1">
                        <li><code>task_id</code>: Unique identifier</li>
                        <li><code>name</code>: Display name</li>
                        <li><code>status</code>: pending, in_progress, completed, blocked</li>
                        <li><code>description</code>: Optional details</li>
                        <li><code>dependencies</code>: Array of task_ids this task depends on</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="visualize">
            {selectedGraph ? (
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                <div className="xl:col-span-3">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            🔗 {selectedGraph.graph.name}
                            {selectedGraph.analysis.has_cycles && (
                              <Badge variant="destructive">⚠️ Has Cycles</Badge>
                            )}
                          </CardTitle>
                          <CardDescription>
                            {selectedGraph.graph.description || 'No description'}
                          </CardDescription>
                        </div>
                        <div className="text-sm text-gray-500">
                          {selectedGraph.tasks.length} tasks
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <GraphVisualization
                        graphData={selectedGraph}
                        selectedTaskId={selectedTaskId}
                        onTaskSelect={handleTaskSelect}
                      />
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-6">
                  <TaskDetailsPanel
                    graphId={selectedGraph.graph.id}
                    taskId={selectedTaskId}
                    tasks={selectedGraph.tasks}
                  />
                  
                  {selectedGraph.analysis.has_cycles && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-red-600">⚠️ Cycle Detection</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-red-600 mb-2">
                          Circular dependencies detected:
                        </p>
                        {selectedGraph.analysis.cycles.map((cycle: string[], index: number) => (
                          <div key={index} className="bg-red-50 p-2 rounded text-xs">
                            {cycle.join(' → ')} → {cycle[0]}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="text-6xl mb-4">📊</div>
                  <h3 className="text-xl font-semibold mb-2">No Graph Selected</h3>
                  <p className="text-gray-600 text-center mb-6">
                    Create a new graph or select an existing one to start visualizing dependencies
                  </p>
                  <Button 
                    onClick={() => setJsonInput(sampleJsonStructure)}
                    className="mb-2"
                  >
                    📥 Try Sample Data
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="manage">
            <Card>
              <CardHeader>
                <CardTitle>📋 Saved Graphs</CardTitle>
                <CardDescription>
                  Manage your dependency graphs
                </CardDescription>
              </CardHeader>
              <CardContent>
                {graphs.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-4">📝</div>
                    <p className="text-gray-600">No graphs created yet</p>
                    <p className="text-sm text-gray-500">Create your first dependency graph to get started</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {graphs.map((graph: Graph) => (
                      <Card 
                        key={graph.id} 
                        className={`cursor-pointer transition-all hover:shadow-md ${
                          selectedGraph?.graph.id === graph.id ? 'ring-2 ring-blue-500' : ''
                        }`}
                        onClick={() => loadGraphDetails(graph.id)}
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg">
                            {graph.name}
                          </CardTitle>
                          <CardDescription className="text-sm">
                            {graph.description || 'No description'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-xs text-gray-500">
                            Created: {graph.created_at.toLocaleDateString()}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default App;
