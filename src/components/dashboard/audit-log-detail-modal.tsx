'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  X,
  FileText,
  CheckCircle,
  XCircle,
  Mail,
  DollarSign,
  Ban,
  Edit,
  Clock,
  RefreshCw,
  Send,
  AlertCircle,
  Settings,
  Trash2,
  UserPlus,
  FilePlus,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
  user: {
    name: string | null;
    email: string;
  } | null;
}

interface AuditLogDetailModalProps {
  log: AuditLog | null;
  isOpen: boolean;
  onClose: () => void;
}

// Action to icon and color mapping
const actionConfig: Record<string, { icon: any; color: string; bgColor: string; label: string }> = {
  INVOICE_CREATED: { icon: FileText, color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'Invoice Created' },
  INVOICE_APPROVED: { icon: CheckCircle, color: 'text-green-700', bgColor: 'bg-green-100', label: 'Invoice Approved' },
  INVOICE_REJECTED: { icon: XCircle, color: 'text-red-700', bgColor: 'bg-red-100', label: 'Invoice Rejected' },
  INVOICE_SENT: { icon: Mail, color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'Invoice Sent' },
  INVOICE_PAID: { icon: DollarSign, color: 'text-green-700', bgColor: 'bg-green-100', label: 'Invoice Paid' },
  INVOICE_VOIDED: { icon: Ban, color: 'text-gray-700', bgColor: 'bg-gray-100', label: 'Invoice Voided' },
  INVOICE_UPDATED: { icon: Edit, color: 'text-yellow-700', bgColor: 'bg-yellow-100', label: 'Invoice Updated' },
  INVOICE_AUTO_SENT: { icon: Send, color: 'text-purple-700', bgColor: 'bg-purple-100', label: 'Invoice Auto-sent' },
  INVOICE_SEND_FAILED: { icon: AlertCircle, color: 'text-red-700', bgColor: 'bg-red-100', label: 'Invoice Send Failed' },
  INVOICE_PDF_GENERATED: { icon: FileText, color: 'text-gray-700', bgColor: 'bg-gray-100', label: 'PDF Generated' },
  INVOICE_EMAIL_SENT: { icon: Mail, color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'Email Sent' },
  INVOICE_REMINDER_SENT: { icon: RefreshCw, color: 'text-orange-700', bgColor: 'bg-orange-100', label: 'Reminder Sent' },
  INVOICE_GENERATED_ADHOC: { icon: FilePlus, color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'Invoice Generated (Ad-hoc)' },
  CONTRACT_SETTINGS_UPDATED: { icon: Settings, color: 'text-gray-700', bgColor: 'bg-gray-100', label: 'Contract Settings Updated' },
  CONTRACT_UPDATED: { icon: Edit, color: 'text-yellow-700', bgColor: 'bg-yellow-100', label: 'Contract Updated' },
  CONTRACT_DELETED: { icon: Trash2, color: 'text-red-700', bgColor: 'bg-red-100', label: 'Contract Deleted' },
  USER_CREATED: { icon: UserPlus, color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'User Created' },
};

const defaultActionConfig = { icon: Clock, color: 'text-gray-700', bgColor: 'bg-gray-100', label: 'Activity' };

function getActionConfig(action: string) {
  return actionConfig[action] || { ...defaultActionConfig, label: action.replace(/_/g, ' ') };
}

export function AuditLogDetailModal({ log, isOpen, onClose }: AuditLogDetailModalProps) {
  if (!isOpen || !log) return null;

  const config = getActionConfig(log.action);
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${config.bgColor}`}>
              <Icon className={`h-5 w-5 ${config.color}`} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Audit Log Details</h2>
              <p className="text-sm text-gray-600">{config.label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Timestamp */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Timestamp
            </label>
            <p className="text-gray-900">{formatDateTime(log.createdAt)}</p>
          </div>

          {/* User */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Performed By
            </label>
            <p className="text-gray-900">
              {log.user ? (log.user.name || log.user.email) : 'System'}
            </p>
            {log.user?.name && (
              <p className="text-sm text-gray-500">{log.user.email}</p>
            )}
          </div>

          {/* Entity */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Entity
            </label>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{log.entityType}</Badge>
              <span className="text-gray-900 font-mono text-sm">{log.entityId}</span>
            </div>
          </div>

          {/* IP Address */}
          {log.ipAddress && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                IP Address
              </label>
              <p className="text-gray-900 font-mono text-sm">{log.ipAddress}</p>
            </div>
          )}

          {/* Details */}
          {log.details && Object.keys(log.details).length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Details
              </label>
              <pre className="bg-gray-50 border rounded-md p-3 text-sm text-gray-800 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
