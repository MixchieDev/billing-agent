'use client';

import { useState, useRef } from 'react';
import { X, Upload, Download, FileText, Loader2, CheckCircle, AlertCircle, ArrowLeft, Eye, Pencil, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { usePartners, useCompanies, useProductTypes } from '@/lib/hooks/use-api';

// ==================== TYPES ====================

interface ImportResult {
  success: boolean;
  message: string;
  results: {
    created: number;
    updated: number;
    skipped: number;
    errors: { row: number; message: string }[];
    warnings?: { row: number; message: string }[];
  };
  parseErrors?: { row: number; message: string }[];
}

interface PreviewRow {
  rowNumber: number;
  action: 'create' | 'update' | 'skip';
  data: {
    customerId: string;
    companyName: string;
    productType: string;
    partner: string;
    billingEntity: string;
    monthlyFee: number;
    status: string;
    vatType: string;
    billingType: string;
    contactPerson?: string;
    email?: string;
    tin?: string;
    mobile?: string;
    remarks?: string;
    paymentPlan?: string;
    contractStart?: string;
    nextDueDate?: string;
  };
  existingContract?: {
    id: string;
    companyName: string;
    customerNumber: string | null;
  };
  customerNumberToAssign?: string;
  errors: string[];
  warnings: string[];
}

interface ValidateResponse {
  success: boolean;
  summary: {
    totalRows: number;
    toCreate: number;
    toUpdate: number;
    errors: number;
    warnings: number;
  };
  rows: PreviewRow[];
  parseErrors: { row: number; message: string }[];
}

type ModalStep = 'upload' | 'preview' | 'result';

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  importType: 'contracts' | 'rcbc-clients';
  title: string;
}

// ==================== COMPONENT ====================

export function CSVImportModal({
  isOpen,
  onClose,
  onImportComplete,
  importType,
  title,
}: CSVImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<ModalStep>('upload');
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<ValidateResponse | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inline editing state
  const [editedRows, setEditedRows] = useState<Record<number, Partial<PreviewRow['data']>>>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [hasEdits, setHasEdits] = useState(false);

  // Reference data for dropdowns (only fetched when modal is open)
  const { data: partners } = usePartners();
  const { data: companies } = useCompanies();
  const { data: productTypes } = useProductTypes();

  if (!isOpen) return null;

  const supportsPreview = importType === 'contracts';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        setError('Please select a CSV file');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setResult(null);
      setPreview(null);
      setEditedRows({});
      setExpandedRow(null);
      setHasEdits(false);
    }
  };

  const handleDownloadTemplate = async () => {
    const endpoint = importType === 'contracts'
      ? '/api/import/contracts'
      : '/api/import/rcbc-clients';

    try {
      const response = await fetch(endpoint);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = importType === 'contracts'
        ? 'contracts-template.csv'
        : 'rcbc-clients-template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download template');
    }
  };

  const handleValidate = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import/contracts?mode=validate', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Validation failed');
      }

      setPreview(data);
      setStep('preview');
      setEditedRows({});
      setExpandedRow(null);
      setHasEdits(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsValidating(false);
    }
  };

  // Get merged row data (original + edits)
  const getMergedRows = (): PreviewRow['data'][] => {
    if (!preview) return [];
    return preview.rows.map(row => ({
      ...row.data,
      ...(editedRows[row.rowNumber] || {}),
    }));
  };

  // Re-validate after editing
  const handleRevalidate = async () => {
    if (!preview) return;

    setIsValidating(true);
    setError(null);

    try {
      const mergedRows = getMergedRows();

      const response = await fetch('/api/import/contracts?mode=validate-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: mergedRows }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Re-validation failed');
      }

      setPreview(data);
      setEditedRows({});
      setExpandedRow(null);
      setHasEdits(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsValidating(false);
    }
  };

  // Import with edits via JSON mode
  const handleImportJson = async () => {
    if (!preview) return;

    setIsUploading(true);
    setError(null);

    try {
      const mergedRows = getMergedRows();

      const response = await fetch('/api/import/contracts?mode=import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: mergedRows }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResult(data);
      setStep('result');

      if (data.results.created > 0 || data.results.updated > 0) {
        onImportComplete();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleImport = async () => {
    // If there are edits, use JSON mode
    if (hasEdits) {
      return handleImportJson();
    }

    if (!file) {
      setError('Please select a file');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const endpoint = importType === 'contracts'
        ? '/api/import/contracts?mode=import'
        : '/api/import/rcbc-clients';

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResult(data);
      setStep('result');

      if (data.results.created > 0 || data.results.updated > 0) {
        onImportComplete();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleBack = () => {
    setStep('upload');
    setPreview(null);
    setError(null);
    setEditedRows({});
    setExpandedRow(null);
    setHasEdits(false);
  };

  const handleClose = () => {
    setFile(null);
    setStep('upload');
    setPreview(null);
    setResult(null);
    setError(null);
    setEditedRows({});
    setExpandedRow(null);
    setHasEdits(false);
    onClose();
  };

  // Update a field in editedRows
  const updateRowField = (rowNumber: number, field: string, value: string | number) => {
    setEditedRows(prev => ({
      ...prev,
      [rowNumber]: {
        ...prev[rowNumber],
        [field]: value,
      },
    }));
    setHasEdits(true);
  };

  // Get the current value for a field (edited or original)
  const getRowValue = (row: PreviewRow, field: keyof PreviewRow['data']) => {
    const edited = editedRows[row.rowNumber];
    if (edited && field in edited) return edited[field];
    return row.data[field];
  };

  const hasIssues = (row: PreviewRow) => row.errors.length > 0 || row.warnings.length > 0;

  const toggleRow = (rowNumber: number) => {
    setExpandedRow(prev => prev === rowNumber ? null : rowNumber);
  };

  const actionableRows = preview?.rows.filter(r => r.action !== 'skip').length ?? 0;
  const errorRows = preview?.rows.filter(r => r.action === 'skip').length ?? 0;

  // ==================== RENDER ====================

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className={`relative bg-white rounded-lg shadow-xl mx-4 ${step === 'preview' ? 'max-w-5xl' : 'max-w-lg'} w-full max-h-[90vh] flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            {step === 'preview' ? (
              <div className="p-2 bg-amber-100 rounded-full">
                <Eye className="h-5 w-5 text-amber-600" />
              </div>
            ) : (
              <div className="p-2 bg-blue-100 rounded-full">
                <Upload className="h-5 w-5 text-blue-600" />
              </div>
            )}
            <h3 className="text-lg font-semibold text-gray-900">
              {step === 'preview' ? 'Review Findings' : title}
            </h3>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">

          {/* ==================== UPLOAD STEP ==================== */}
          {step === 'upload' && (
            <>
              {/* Template Download */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-gray-500" />
                  <span className="text-sm text-gray-700">Download CSV template</span>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
              </div>

              {/* File Upload */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
                  ${file ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">{file.name}</span>
                  </div>
                ) : (
                  <div className="text-gray-500">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">Click to select a CSV file</p>
                    <p className="text-xs text-gray-400 mt-1">or drag and drop</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ==================== PREVIEW STEP ==================== */}
          {step === 'preview' && preview && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-gray-800">{preview.summary.totalRows}</p>
                  <p className="text-xs text-gray-500">Total Rows</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-600">{preview.summary.toCreate}</p>
                  <p className="text-xs text-green-600">To Create</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-600">{preview.summary.toUpdate}</p>
                  <p className="text-xs text-blue-600">To Update</p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-red-600">{preview.summary.errors}</p>
                  <p className="text-xs text-red-600">Errors</p>
                </div>
              </div>

              {/* Editable hint */}
              {errorRows > 0 && (
                <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
                  <Pencil className="h-4 w-4 flex-shrink-0" />
                  <span>Click on error/warning rows to edit them inline, then re-validate.</span>
                </div>
              )}

              {/* Warnings summary */}
              {preview.summary.warnings > 0 && errorRows === 0 && (
                <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{preview.summary.warnings} row(s) have warnings — click to edit or import as-is</span>
                </div>
              )}

              {/* Row Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[50vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium w-8"></th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">Row</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">Company Name</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">Product</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">Partner</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">Entity</th>
                        <th className="text-right px-3 py-2 text-gray-500 font-medium">Monthly Fee</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">Action</th>
                        <th className="text-left px-3 py-2 text-gray-500 font-medium">Issues</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.rows.map((row) => {
                        const isEditable = hasIssues(row);
                        const isExpanded = expandedRow === row.rowNumber;
                        const isEdited = !!editedRows[row.rowNumber];

                        return (
                          <RowWithEditor
                            key={row.rowNumber}
                            row={row}
                            isEditable={isEditable}
                            isExpanded={isExpanded}
                            isEdited={isEdited}
                            onToggle={() => isEditable && toggleRow(row.rowNumber)}
                            getRowValue={getRowValue}
                            updateRowField={updateRowField}
                            partners={partners || []}
                            companies={companies || []}
                            productTypes={productTypes || []}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Parse errors */}
              {preview.parseErrors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-medium text-red-600 mb-1">Parse Errors (rows excluded from preview):</p>
                  <ul className="text-xs text-red-600 space-y-1">
                    {preview.parseErrors.slice(0, 5).map((err, i) => (
                      <li key={i}>Row {err.row}: {err.message}</li>
                    ))}
                    {preview.parseErrors.length > 5 && (
                      <li>...and {preview.parseErrors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* ==================== RESULT STEP ==================== */}
          {step === 'result' && result && (
            <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              <p className={`font-medium ${result.success ? 'text-green-800' : 'text-yellow-800'}`}>
                {result.message}
              </p>
              <div className="mt-2 text-sm space-y-1">
                {result.results.created > 0 && (
                  <p className="text-green-600">+ {result.results.created} created</p>
                )}
                {result.results.updated > 0 && (
                  <p className="text-blue-600">~ {result.results.updated} updated</p>
                )}
                {result.results.skipped > 0 && (
                  <p className="text-gray-600">- {result.results.skipped} skipped</p>
                )}
              </div>

              {/* Show errors if any */}
              {result.results.errors.length > 0 && (
                <div className="mt-3 max-h-32 overflow-y-auto">
                  <p className="text-sm font-medium text-red-600 mb-1">Errors:</p>
                  <ul className="text-xs text-red-600 space-y-1">
                    {result.results.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>Row {err.row}: {err.message}</li>
                    ))}
                    {result.results.errors.length > 5 && (
                      <li>...and {result.results.errors.length - 5} more errors</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Show warnings if any */}
              {result.results.warnings && result.results.warnings.length > 0 && (
                <div className="mt-3 max-h-32 overflow-y-auto">
                  <p className="text-sm font-medium text-amber-600 mb-1">Warnings:</p>
                  <ul className="text-xs text-amber-600 space-y-1">
                    {result.results.warnings.slice(0, 5).map((warn, i) => (
                      <li key={i}>Row {warn.row}: {warn.message}</li>
                    ))}
                    {result.results.warnings.length > 5 && (
                      <li>...and {result.results.warnings.length - 5} more warnings</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Error Message (shown on any step) */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-3 p-4 border-t bg-gray-50 rounded-b-lg flex-shrink-0">
          <div className="flex gap-2">
            {step === 'preview' && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
            {step === 'preview' && hasEdits && (
              <button
                onClick={handleRevalidate}
                disabled={isValidating}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100 disabled:opacity-50"
              >
                {isValidating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Re-validate
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              {step === 'result' ? 'Close' : 'Cancel'}
            </button>

            {/* Upload step: Validate or Import button */}
            {step === 'upload' && supportsPreview && (
              <button
                onClick={handleValidate}
                disabled={!file || isValidating}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    Validate
                  </>
                )}
              </button>
            )}

            {/* Upload step for non-contract imports: direct Import */}
            {step === 'upload' && !supportsPreview && (
              <button
                onClick={handleImport}
                disabled={!file || isUploading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Import
                  </>
                )}
              </button>
            )}

            {/* Preview step: Confirm Import */}
            {step === 'preview' && (
              <button
                onClick={hasEdits ? handleImportJson : handleImport}
                disabled={actionableRows === 0 || isUploading}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Confirm Import ({actionableRows})
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== INLINE ROW EDITOR ====================

function RowWithEditor({
  row,
  isEditable,
  isExpanded,
  isEdited,
  onToggle,
  getRowValue,
  updateRowField,
  partners,
  companies,
  productTypes,
}: {
  row: PreviewRow;
  isEditable: boolean;
  isExpanded: boolean;
  isEdited: boolean;
  onToggle: () => void;
  getRowValue: (row: PreviewRow, field: keyof PreviewRow['data']) => any;
  updateRowField: (rowNumber: number, field: string, value: string | number) => void;
  partners: any[];
  companies: any[];
  productTypes: { value: string; label: string }[];
}) {
  const bgClass = row.action === 'skip'
    ? 'bg-red-50/50'
    : row.warnings.length > 0
      ? 'bg-amber-50/50'
      : '';

  return (
    <>
      {/* Main row */}
      <tr
        className={`${bgClass} ${isEditable ? 'cursor-pointer hover:bg-gray-50' : ''} ${isEdited ? 'ring-1 ring-inset ring-amber-300' : ''}`}
        onClick={onToggle}
      >
        <td className="px-3 py-2 text-gray-400">
          {isEditable && (
            isExpanded
              ? <ChevronUp className="h-3.5 w-3.5" />
              : <ChevronDown className="h-3.5 w-3.5" />
          )}
        </td>
        <td className="px-3 py-2 text-gray-400">{row.rowNumber}</td>
        <td className="px-3 py-2 text-gray-900 font-medium truncate max-w-[180px]" title={String(getRowValue(row, 'companyName'))}>
          {getRowValue(row, 'companyName')}
          {isEdited && <span className="ml-1 text-amber-500 text-xs">*</span>}
        </td>
        <td className="px-3 py-2 text-gray-600">{getRowValue(row, 'productType')}</td>
        <td className="px-3 py-2 text-gray-600">{getRowValue(row, 'partner')}</td>
        <td className="px-3 py-2 text-gray-600">{getRowValue(row, 'billingEntity')}</td>
        <td className="px-3 py-2 text-gray-600 text-right">{Number(getRowValue(row, 'monthlyFee')).toLocaleString()}</td>
        <td className="px-3 py-2">
          {row.action === 'create' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
              Create
            </span>
          )}
          {row.action === 'update' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
              Update
            </span>
          )}
          {row.action === 'skip' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
              Skip
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-xs max-w-[200px]">
          {row.errors.length > 0 && (
            <div className="text-red-600" title={row.errors.join('; ')}>
              {row.errors[0]}{row.errors.length > 1 && ` (+${row.errors.length - 1})`}
            </div>
          )}
          {row.warnings.length > 0 && (
            <div className="text-amber-600" title={row.warnings.join('; ')}>
              {row.warnings[0]}{row.warnings.length > 1 && ` (+${row.warnings.length - 1})`}
            </div>
          )}
        </td>
      </tr>

      {/* Expanded edit form */}
      {isExpanded && (
        <tr>
          <td colSpan={9} className="px-3 py-3 bg-gray-50 border-t border-b border-gray-200">
            <div className="grid grid-cols-3 gap-3">
              {/* Company Name */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Company Name</label>
                <input
                  type="text"
                  value={String(getRowValue(row, 'companyName') || '')}
                  onChange={e => updateRowField(row.rowNumber, 'companyName', e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Product Type */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Product Type</label>
                <select
                  value={String(getRowValue(row, 'productType') || '')}
                  onChange={e => updateRowField(row.rowNumber, 'productType', e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">Select...</option>
                  {productTypes.map(pt => (
                    <option key={pt.value} value={pt.value}>{pt.label}</option>
                  ))}
                </select>
              </div>

              {/* Partner */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Partner</label>
                <select
                  value={String(getRowValue(row, 'partner') || '')}
                  onChange={e => updateRowField(row.rowNumber, 'partner', e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">Select...</option>
                  {partners.map((p: any) => (
                    <option key={p.code} value={p.code}>{p.code} — {p.name}</option>
                  ))}
                </select>
              </div>

              {/* Billing Entity */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Billing Entity</label>
                <select
                  value={String(getRowValue(row, 'billingEntity') || '')}
                  onChange={e => updateRowField(row.rowNumber, 'billingEntity', e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">Select...</option>
                  {companies.map((c: any) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>

              {/* Monthly Fee */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Monthly Fee</label>
                <input
                  type="number"
                  value={getRowValue(row, 'monthlyFee') || ''}
                  onChange={e => updateRowField(row.rowNumber, 'monthlyFee', parseFloat(e.target.value) || 0)}
                  onClick={e => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select
                  value={String(getRowValue(row, 'status') || 'ACTIVE')}
                  onChange={e => updateRowField(row.rowNumber, 'status', e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="STOPPED">Stopped</option>
                  <option value="NOT_STARTED">Not Started</option>
                </select>
              </div>

              {/* VAT Type */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">VAT Type</label>
                <select
                  value={String(getRowValue(row, 'vatType') || 'VAT')}
                  onChange={e => updateRowField(row.rowNumber, 'vatType', e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="VAT">VAT</option>
                  <option value="NON_VAT">Non-VAT</option>
                </select>
              </div>

              {/* Billing Type */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Billing Type</label>
                <select
                  value={String(getRowValue(row, 'billingType') || 'RECURRING')}
                  onChange={e => updateRowField(row.rowNumber, 'billingType', e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="RECURRING">Recurring</option>
                  <option value="ONE_TIME">One-Time</option>
                </select>
              </div>

              {/* Contact Person */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Contact Person</label>
                <input
                  type="text"
                  value={String(getRowValue(row, 'contactPerson') || '')}
                  onChange={e => updateRowField(row.rowNumber, 'contactPerson', e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Errors/warnings detail */}
            {(row.errors.length > 0 || row.warnings.length > 0) && (
              <div className="mt-2 pt-2 border-t border-gray-200">
                {row.errors.map((err, i) => (
                  <p key={`e-${i}`} className="text-xs text-red-600">Error: {err}</p>
                ))}
                {row.warnings.map((warn, i) => (
                  <p key={`w-${i}`} className="text-xs text-amber-600">Warning: {warn}</p>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
