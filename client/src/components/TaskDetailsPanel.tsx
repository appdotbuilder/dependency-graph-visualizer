
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/utils/trpc';
import type { Task, TaskWithDependencies } from '../../../server/src/schema';

interface TaskDetailsPanelProps {
  graphId: number;
  taskId: string | null;
  tasks: Task[];
}

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  blocked: 'bg-red-100 text-red-800'
} as const;

const STATUS_EMOJIS = {
  pending: '⏳',
  in_progress: '🔄',
  completed: '✅',
  blocked: '🚫'
} as const;

export function TaskDetailsPanel({ graphId, taskId, tasks }: TaskDetailsPanelProps) {
  const [taskDetails, setTaskDetails] = useState<TaskWithDependencies | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadTaskDetails = useCallback(async (taskId: string) => {
    setIsLoading(true);
    try {
      const result = await trpc.getTaskDetails.query({ graphId, taskId });
      setTaskDetails(result);
    } catch (error) {
      console.error('Failed to load task details:', error);
      // Since backend handlers are not implemented, create placeholder details from available data
      const task = tasks.find(t => t.task_id === taskId);
      if (task) {
        setTaskDetails({
          task,
          dependencies: [], // Backend implementation required for actual dependency relationships
          dependents: [] // Backend implementation required for actual dependent relationships
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [graphId, tasks]);

  useEffect(() => {
    if (taskId) {
      loadTaskDetails(taskId);
    } else {
      setTaskDetails(null);
    }
  }, [taskId, loadTaskDetails]);

  if (!taskId) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="text-4xl mb-3">🎯</div>
          <h3 className="font-semibold mb-2">Select a Task</h3>
          <p className="text-sm text-gray-600 text-center">
            Click on any task in the graph to view its details and dependencies
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="text-4xl mb-3">⏳</div>
          <p className="text-sm text-gray-600">Loading task details...</p>
        </CardContent>
      </Card>
    );
  }

  if (!taskDetails) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="text-4xl mb-3">❌</div>
          <p className="text-sm text-red-600">Task not found</p>
        </CardContent>
      </Card>
    );
  }

  const { task } = taskDetails;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-lg">
            {STATUS_EMOJIS[task.status as keyof typeof STATUS_EMOJIS]}
          </span>
          {task.name}
        </CardTitle>
        <CardDescription>
          Task ID: {task.task_id}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div>
          <label className="text-sm font-medium text-gray-600">Status</label>
          <div className="mt-1">
            <Badge className={STATUS_COLORS[task.status as keyof typeof STATUS_COLORS]}>
              {task.status.replace('_', ' ')}
            </Badge>
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <div>
            <label className="text-sm font-medium text-gray-600">Description</label>
            <p className="mt-1 text-sm bg-gray-50 p-3 rounded-md">
              {task.description}
            </p>
          </div>
        )}

        <Separator />

        {/* Dependencies Section */}
        <div>
          <label className="text-sm font-medium text-gray-600">Dependencies</label>
          <div className="mt-2">
            {taskDetails.dependencies.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                🔓 No dependencies - can start immediately
              </p>
            ) : (
              <div className="space-y-2">
                {taskDetails.dependencies.map((dep: Task) => (
                  <div key={dep.task_id} className="flex items-center justify-between p-2 bg-blue-50 rounded-md">
                    <div>
                      <p className="font-medium text-sm">{dep.name}</p>
                      <p className="text-xs text-gray-600">{dep.task_id}</p>
                    </div>
                    <Badge className={`${STATUS_COLORS[dep.status as keyof typeof STATUS_COLORS]} text-xs`}>
                      {STATUS_EMOJIS[dep.status as keyof typeof STATUS_EMOJIS]} {dep.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dependents Section */}
        <div>
          <label className="text-sm font-medium text-gray-600">Blocks These Tasks</label>
          <div className="mt-2">
            {taskDetails.dependents.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                🎯 No dependents - this is an end task
              </p>
            ) : (
              <div className="space-y-2">
                {taskDetails.dependents.map((dep: Task) => (
                  <div key={dep.task_id} className="flex items-center justify-between p-2 bg-orange-50 rounded-md">
                    <div>
                      <p className="font-medium text-sm">{dep.name}</p>
                      <p className="text-xs text-gray-600">{dep.task_id}</p>
                    </div>
                    <Badge className={`${STATUS_COLORS[dep.status as keyof typeof STATUS_COLORS]} text-xs`}>
                      {STATUS_EMOJIS[dep.status as keyof typeof STATUS_EMOJIS]} {dep.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Timestamps */}
        <div className="space-y-2 text-xs text-gray-500">
          <div className="flex justify-between">
            <span>Created:</span>
            <span>{task.created_at.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Updated:</span>
            <span>{task.updated_at.toLocaleString()}</span>
          </div>
        </div>

        {/* Development Notice */}
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-xs text-amber-700">
            ⚠️ <strong>Development Mode:</strong> Dependency relationships shown here require backend handler implementation for full functionality.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
