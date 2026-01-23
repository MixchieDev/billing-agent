'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import {
  X,
  Upload,
  Download,
  Trash2,
  Loader2,
  Mail,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  File,
  AlertCircle,
  CreditCard,
} from 'lucide-react';

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

interface SendInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: {
    id: string;
    billingNo: string | null;
    customerName: string;
    customerEmail?: string | null;
    customerEmails?: string | null;
    netAmount: number;
  };
  onSent: () => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 5;
const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx'];

export function SendInvoiceModal({ isOpen, onClose, invoice, onSent }: SendInvoiceModalProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [includePaymentLink, setIncludePaymentLink] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch existing attachments
  const fetchAttachments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/invoices/${invoice.id}/attachments`);
      if (!res.ok) throw new Error('Failed to fetch attachments');
      const data = await res.json();
      setAttachments(data);
      setError(null);
    } catch (err) {
      setError('Failed to load attachments');
    } finally {
      setLoading(false);
    }
  }, [invoice.id]);

  useEffect(() => {
    if (isOpen) {
      fetchAttachments();
    }
  }, [isOpen, fetchAttachments]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setError(null);

    // Check file count limit
    if (attachments.length + files.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} attachments allowed`);
      return;
    }

    setUploading(true);

    for (const file of Array.from(files)) {
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name} exceeds maximum size of 5MB`);
        continue;
      }

      // Validate file type
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
        setError(`${file.name} has unsupported format`);
        continue;
      }

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch(`/api/invoices/${invoice.id}/attachments`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Upload failed');
        }

        const newAttachment = await res.json();
        setAttachments((prev) => [...prev, newAttachment]);
      } catch (err: any) {
        setError(err.message);
      }
    }

    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (!confirm('Delete this attachment?')) return;

    try {
      const res = await fetch(
        `/api/invoices/${invoice.id}/attachments/${attachmentId}`,
        { method: 'DELETE' }
      );

      if (!res.ok) throw new Error('Failed to delete attachment');

      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch (err) {
      setError('Failed to delete attachment');
    }
  };

  const handleDownload = (attachmentId: string, filename: string) => {
    const link = document.createElement('a');
    link.href = `/api/invoices/${invoice.id}/attachments/${attachmentId}`;
    link.download = filename;
    link.click();
  };

  const handleSend = async () => {
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ includePaymentLink }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send invoice');
      }

      const data = await res.json();
      alert(`Invoice sent successfully to ${data.sentTo}`);
      onSent();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/pdf') return <FileText className="h-4 w-4 text-red-500" />;
    if (mimeType.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-blue-500" />;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel'))
      return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
    if (mimeType.includes('word') || mimeType.includes('document'))
      return <FileText className="h-4 w-4 text-blue-600" />;
    return <File className="h-4 w-4 text-gray-500" />;
  };

  if (!isOpen) return null;

  const emailDisplay = invoice.customerEmails || invoice.customerEmail || 'No email configured';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Send Invoice</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100"
            disabled={sending}
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Invoice details */}
          <div className="rounded-lg bg-gray-50 p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Invoice</span>
              <span className="text-sm font-medium">{invoice.billingNo || invoice.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">To</span>
              <span className="text-sm font-medium">{invoice.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Email</span>
              <span className="text-sm text-gray-700 max-w-[250px] truncate" title={emailDisplay}>
                {emailDisplay}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Amount</span>
              <span className="text-sm font-medium">{formatCurrency(invoice.netAmount)}</span>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Attachments section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Attachments ({attachments.length}/{MAX_FILES})
              </span>
              {uploading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
            </div>

            {/* Attachment list */}
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : attachments.length > 0 ? (
              <div className="rounded-lg border divide-y mb-3">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between px-3 py-2 hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getFileIcon(att.mimeType)}
                      <span className="text-sm truncate max-w-[200px]" title={att.filename}>
                        {att.filename}
                      </span>
                      <span className="text-xs text-gray-400">
                        ({formatFileSize(att.size)})
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDownload(att.id, att.filename)}
                        className="rounded p-1 hover:bg-gray-100"
                        title="Download"
                      >
                        <Download className="h-4 w-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(att.id)}
                        className="rounded p-1 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Upload area */}
            {attachments.length < MAX_FILES && (
              <div
                className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
                  dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => handleUpload(e.target.files)}
                  disabled={uploading}
                />
                <Upload className="mx-auto h-8 w-8 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">
                  Drop files here or click to upload
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  PDF, Images, Word, Excel (max 5MB each)
                </p>
              </div>
            )}
          </div>

          {/* Payment link option */}
          <div className="flex items-center gap-3 rounded-lg bg-blue-50 px-4 py-3">
            <input
              type="checkbox"
              id="includePaymentLink"
              checked={includePaymentLink}
              onChange={(e) => setIncludePaymentLink(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="includePaymentLink" className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <CreditCard className="h-4 w-4 text-blue-500" />
              Include payment link (HitPay)
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || loading}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send Invoice
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
