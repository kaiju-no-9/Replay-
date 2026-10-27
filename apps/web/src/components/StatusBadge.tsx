import React from 'react';
import {
  Play,
  Hourglass,
  CheckCircle2,
  XCircle,
  Ban,
  Clock,
  AlertTriangle,
} from 'lucide-react';

export type StatusType =
  | 'queued'
  | 'starting'
  | 'running'
  | 'waiting_input'
  | 'stopping'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'lost'
  | 'passed'
  | 'not_run'
  | 'partial'
  | 'completed'
  | 'waiting'
  | 'Validated'
  | 'Needs Review'
  | 'Execution Failed';

interface StatusBadgeProps {
  status: StatusType | string;
  className?: string;
  size?: 'sm' | 'md';
}

const configs: Record<string, { bg: string; icon: any; label: string }> = {
  queued: { bg: 'bg-slate-800 text-slate-300 border-slate-700', icon: Clock, label: 'Queued' },
  starting: { bg: 'bg-blue-950 text-blue-300 border-blue-800', icon: Play, label: 'Starting' },
  running: { bg: 'bg-sky-950 text-sky-400 border-sky-800 animate-pulse', icon: Play, label: 'Running' },
  waiting_input: { bg: 'bg-amber-950 text-amber-300 border-amber-800', icon: Hourglass, label: 'Waiting Input' },
  waiting: { bg: 'bg-amber-950 text-amber-300 border-amber-800', icon: Hourglass, label: 'Waiting' },
  stopping: { bg: 'bg-amber-950 text-amber-300 border-amber-800', icon: Ban, label: 'Stopping' },
  succeeded: { bg: 'bg-emerald-950 text-emerald-300 border-emerald-800', icon: CheckCircle2, label: 'Succeeded' },
  completed: { bg: 'bg-emerald-950 text-emerald-300 border-emerald-800', icon: CheckCircle2, label: 'Completed' },
  passed: { bg: 'bg-emerald-950 text-emerald-300 border-emerald-800', icon: CheckCircle2, label: 'Passed' },
  failed: { bg: 'bg-rose-950 text-rose-300 border-rose-800', icon: XCircle, label: 'Failed' },
  cancelled: { bg: 'bg-slate-800 text-slate-400 border-slate-700', icon: Ban, label: 'Cancelled' },
  timed_out: { bg: 'bg-red-950 text-red-300 border-red-800', icon: AlertTriangle, label: 'Timed Out' },
  lost: { bg: 'bg-red-950 text-red-300 border-red-800', icon: AlertTriangle, label: 'Lost' },
  not_run: { bg: 'bg-slate-800 text-slate-400 border-slate-700', icon: Clock, label: 'Not Run' },
  partial: { bg: 'bg-amber-950 text-amber-300 border-amber-800', icon: AlertTriangle, label: 'Partial' },
  Validated: { bg: 'bg-emerald-900/60 text-emerald-200 border-emerald-500 font-semibold', icon: CheckCircle2, label: 'Validated' },
  'Needs Review': { bg: 'bg-amber-900/60 text-amber-200 border-amber-500 font-semibold', icon: AlertTriangle, label: 'Needs Review' },
  'Execution Failed': { bg: 'bg-rose-900/60 text-rose-200 border-rose-500 font-semibold', icon: XCircle, label: 'Execution Failed' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '', size = 'md' }) => {
  const config = configs[status] || {
    bg: 'bg-slate-800 text-slate-300 border-slate-700',
    icon: Clock,
    label: String(status),
  };
  const Icon = config.icon;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 border rounded-full ${config.bg} ${sizeClasses} ${className}`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{config.label}</span>
    </span>
  );
};
