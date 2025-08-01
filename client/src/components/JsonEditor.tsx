
import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { CreateGraphInput } from '../../../server/src/schema';

interface JsonEditorProps {
  value: CreateGraphInput['tasks'];
  onChange: (value: CreateGraphInput['tasks']) => void;
  placeholder?: string;
}

interface TaskInput {
  task_id: string;
  name: string;
  status?: string;
  description?: string | null;
  dependencies?: string[];
}

export function JsonEditor({ value, onChange, placeholder }: JsonEditorProps) {
  const [jsonText, setJsonText] = useState(() => 
    value.length > 0 ? JSON.stringify(value, null, 2) : ''
  );
  const [error, setError] = useState<string | null>(null);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setJsonText(text);
    setError(null);

    if (!text.trim()) {
      onChange([]);
      return;
    }

    try {
      const parsed = JSON.parse(text);
      
      // Validate structure
      if (!Array.isArray(parsed)) {
        setError('JSON must be an array of tasks');
        return;
      }

      // Basic validation for each task
      for (const task of parsed) {
        if (!task.task_id || typeof task.task_id !== 'string') {
          setError('Each task must have a task_id (string)');
          return;
        }
        if (!task.name || typeof task.name !== 'string') {
          setError('Each task must have a name (string)');
          return;
        }
        if (task.dependencies && !Array.isArray(task.dependencies)) {
          setError('Dependencies must be an array of task_ids');
          return;
        }
      }

      onChange(parsed);
    } catch {
      setError('Invalid JSON format');
    }
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const formatted = JSON.stringify(parsed, null, 2);
      setJsonText(formatted);
    } catch {
      setError('Cannot format invalid JSON');
    }
  };

  const validateDependencies = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) return;

      const taskIds = new Set(parsed.map((task: TaskInput) => task.task_id));
      const errors: string[] = [];

      parsed.forEach((task: TaskInput) => {
        if (task.dependencies) {
          task.dependencies.forEach((depId: string) => {
            if (!taskIds.has(depId)) {
              errors.push(`Task "${task.task_id}" depends on non-existent task "${depId}"`);
            }
          });
        }
      });

      if (errors.length > 0) {
        setError(errors.join(', '));
      } else {
        setError(null);
      }
    } catch {
      // JSON parsing error will be caught in handleTextChange
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button 
          type="button" 
          variant="outline" 
          size="sm" 
          onClick={formatJson}
          disabled={!jsonText.trim()}
        >
          🎨 Format
        </Button>
        <Button 
          type="button" 
          variant="outline" 
          size="sm" 
          onClick={validateDependencies}
          disabled={!jsonText.trim()}
        >
          ✅ Validate
        </Button>
      </div>

      <Textarea
        value={jsonText}
        onChange={handleTextChange}
        placeholder={placeholder || 'Enter JSON structure for your tasks...'}
        rows={12}
        className="font-mono text-sm"
      />

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-700">
            ❌ {error}
          </AlertDescription>
        </Alert>
      )}

      <div className="text-xs text-gray-500">
        💡 Tip: Use the "Validate" button to check for missing dependencies before creating the graph
      </div>
    </div>
  );
}
