
import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { GraphWithDetails } from '../../../server/src/schema';

interface GraphVisualizationProps {
  graphData: GraphWithDetails;
  selectedTaskId: string | null;
  onTaskSelect: (taskId: string) => void;
}

interface TaskNode {
  id: string;
  name: string;
  status: string;
  x: number;
  y: number;
  level: number;
  dependencies: string[];
}

interface Connection {
  from: string;
  to: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface TaskData {
  task_id: string;
  dependencies?: string[];
}

const STATUS_COLORS = {
  pending: '#f59e0b',
  in_progress: '#3b82f6',
  completed: '#10b981',
  blocked: '#ef4444'
} as const;

const STATUS_EMOJIS = {
  pending: '⏳',
  in_progress: '🔄',
  completed: '✅',
  blocked: '🚫'
} as const;

export function GraphVisualization({ graphData, selectedTaskId, onTaskSelect }: GraphVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [nodes, setNodes] = useState<TaskNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);

  // Calculate layout based on task levels
  const calculateLayout = useCallback(() => {
    const { tasks, analysis } = graphData;
    const taskLevels = analysis.task_levels || {};
    
    // Group tasks by level
    const levelGroups: { [level: number]: string[] } = {};
    tasks.forEach((task) => {
      const level = taskLevels[task.task_id] || 0;
      if (!levelGroups[level]) levelGroups[level] = [];
      levelGroups[level].push(task.task_id);
    });

    const nodeWidth = 200;
    const nodeHeight = 80;
    const levelHeight = 150;
    const nodeSpacing = 50;

    const newNodes: TaskNode[] = [];
    const dependencyMap: { [taskId: string]: string[] } = {};

    // Build dependency map
    tasks.forEach((task) => {
      const taskData = JSON.parse(graphData.graph.graph_data || '[]')
        .find((t: TaskData) => t.task_id === task.task_id);
      dependencyMap[task.task_id] = taskData?.dependencies || [];
    });

    // Calculate positions
    Object.entries(levelGroups).forEach(([levelStr, taskIds]) => {
      const level = parseInt(levelStr);
      const y = level * levelHeight + 100;
      const totalWidth = taskIds.length * nodeWidth + (taskIds.length - 1) * nodeSpacing;
      const startX = -totalWidth / 2;

      taskIds.forEach((taskId, index) => {
        const task = tasks.find(t => t.task_id === taskId);
        if (task) {
          const x = startX + index * (nodeWidth + nodeSpacing) + nodeWidth / 2;
          newNodes.push({
            id: task.task_id,
            name: task.name,
            status: task.status,
            x,
            y,
            level,
            dependencies: dependencyMap[task.task_id] || []
          });
        }
      });
    });

    // Calculate connections
    const newConnections: Connection[] = [];
    newNodes.forEach((node) => {
      node.dependencies.forEach((depId) => {
        const depNode = newNodes.find(n => n.id === depId);
        if (depNode) {
          newConnections.push({
            from: depNode.id,
            to: node.id,
            fromX: depNode.x,
            fromY: depNode.y + nodeHeight / 2,
            toX: node.x,
            toY: node.y - nodeHeight / 2
          });
        }
      });
    });

    setNodes(newNodes);
    setConnections(newConnections);
  }, [graphData]);

  useEffect(() => {
    calculateLayout();
  }, [calculateLayout]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Save context for transformations
      ctx.save();
      
      // Apply zoom and pan
      ctx.translate(canvas.width / 2 + offset.x, canvas.height / 2 + offset.y);
      ctx.scale(scale, scale);

      // Draw connections first (behind nodes)
      connections.forEach((conn) => {
        const isHighlighted = selectedTaskId === conn.from || selectedTaskId === conn.to;
        
        ctx.strokeStyle = isHighlighted ? '#3b82f6' : '#d1d5db';
        ctx.lineWidth = isHighlighted ? 3 : 2;
        ctx.setLineDash([]);

        // Draw curved connection
        ctx.beginPath();
        ctx.moveTo(conn.fromX, conn.fromY);
        
        const controlY = conn.fromY + (conn.toY - conn.fromY) / 2;
        ctx.bezierCurveTo(
          conn.fromX, controlY,
          conn.toX, controlY,
          conn.toX, conn.toY
        );
        
        ctx.stroke();

        // Draw arrow
        if (isHighlighted) {
          const arrowSize = 8;
          const angle = Math.atan2(conn.toY - controlY, conn.toX - conn.fromX);
          
          ctx.fillStyle = '#3b82f6';
          ctx.beginPath();
          ctx.moveTo(conn.toX, conn.toY);
          ctx.lineTo(
            conn.toX - arrowSize * Math.cos(angle - Math.PI / 6),
            conn.toY - arrowSize * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            conn.toX - arrowSize * Math.cos(angle + Math.PI / 6),
            conn.toY - arrowSize * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
        }
      });

      // Draw nodes
      nodes.forEach((node) => {
        const isSelected = selectedTaskId === node.id;
        const isConnected = selectedTaskId && (
          connections.some(c => c.from === selectedTaskId && c.to === node.id) ||
          connections.some(c => c.to === selectedTaskId && c.from === node.id)
        );
        
        const nodeWidth = 180;
        const nodeHeight = 70;
        const x = node.x - nodeWidth / 2;
        const y = node.y - nodeHeight / 2;

        // Node background
        ctx.fillStyle = isSelected ? '#dbeafe' : isConnected ? '#f0f9ff' : '#ffffff';
        ctx.strokeStyle = isSelected ? '#3b82f6' : STATUS_COLORS[node.status as keyof typeof STATUS_COLORS];
        ctx.lineWidth = isSelected ? 3 : 2;
        
        ctx.fillRect(x, y, nodeWidth, nodeHeight);
        ctx.strokeRect(x, y, nodeWidth, nodeHeight);

        // Status indicator
        ctx.fillStyle = STATUS_COLORS[node.status as keyof typeof STATUS_COLORS];
        ctx.fillRect(x, y, nodeWidth, 4);

        // Text
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        
        // Truncate long names
        let displayName = node.name;
        if (displayName.length > 20) {
          displayName = displayName.substring(0, 17) + '...';
        }
        
        ctx.fillText(displayName, node.x, node.y - 5);
        
        // Status text
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#6b7280';
        const statusText = `${STATUS_EMOJIS[node.status as keyof typeof STATUS_EMOJIS]} ${node.status.replace('_', ' ')}`;
        ctx.fillText(statusText, node.x, node.y + 15);
      });

      ctx.restore();
    };

    draw();
  }, [nodes, connections, selectedTaskId, scale, offset]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - canvas.width / 2 - offset.x) / scale;
    const y = (e.clientY - rect.top - canvas.height / 2 - offset.y) / scale;

    // Check if click is on a node
    const clickedNode = nodes.find((node) => {
      const nodeWidth = 180;
      const nodeHeight = 70;
      return (
        x >= node.x - nodeWidth / 2 &&
        x <= node.x + nodeWidth / 2 &&
        y >= node.y - nodeHeight / 2 &&
        y <= node.y + nodeHeight / 2
      );
    });

    if (clickedNode) {
      onTaskSelect(clickedNode.id);
    } else {
      onTaskSelect('');
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoom = (delta: number) => {
    const newScale = Math.max(0.3, Math.min(2, scale + delta));
    setScale(newScale);
  };

  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => handleZoom(0.1)}>🔍 Zoom In</Button>
          <Button size="sm" onClick={() => handleZoom(-0.1)}>🔍 Zoom Out</Button>
          <Button size="sm" onClick={resetView}>🎯 Reset View</Button>
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          <span>Zoom: {Math.round(scale * 100)}%</span>
          {graphData.analysis.has_cycles && (
            <Badge variant="destructive">⚠️ Has Cycles</Badge>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1">
            <div 
              className="w-3 h-3 rounded-sm" 
              style={{ backgroundColor: color }}
            />
            <span>
              {STATUS_EMOJIS[status as keyof typeof STATUS_EMOJIS]} {status.replace('_', ' ')}
            </span>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div 
        ref={containerRef}
        className="border rounded-lg overflow-hidden bg-gray-50"
        style={{ height: '600px' }}
      >
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          className="cursor-move"
          onClick={handleCanvasClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {nodes.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">📊</div>
          <p>No tasks to visualize</p>
        </div>
      )}
    </div>
  );
}
