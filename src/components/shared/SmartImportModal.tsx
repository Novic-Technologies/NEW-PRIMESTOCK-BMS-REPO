import React, { useMemo, useRef, useState } from 'react';
import {
  X,
  Upload,
  Sparkles,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Download,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  ArrowRight,
  RotateCcw,
  ClipboardPaste,
} from 'lucide-react';
import {
  SmartImportEntityType,
  SmartImportExtractResult,
  SmartImportFieldMapping,
} from '../../types';
import {
  SMART_ENTITY_CONFIGS,
  applyMappingsLocally,
  sanitizeRowForEntity,
  tryParseStructuredTextLocally,
  validateSmartImportRow,
} from '../../utils/smartImportParser';
import { readAnyFileAsBase64, smartImportExtract } from '../../services/aiService';
import { useAuthStore } from '../../store/authStore';
import { canUseAiCall, incrementDailyAiUsage } from '../../utils/planLimits';
import { downloadCsv } from '../../utils/exportCsv';
import { cn } from '../../lib/utils';
import { SmartImportSkeleton } from './Skeletons';
import toast from 'react-hot-toast';

export interface SmartImportCommitOptions {
  deductStock?: boolean;
  restoreStock?: boolean;
  markReceived?: boolean;
}

interface SmartImportModalProps {
  isOpen: boolean;
  entityType: SmartImportEntityType;
  onClose: () => void;
  onCommit: (
    rows: Array<Record<string, any>>,
    options: SmartImportCommitOptions
  ) => Promise<number>;
  quotaNotice?: string;
  existingEmails?: string[];
}

const ACCEPTED_FILE_TYPES =
  '.csv,.tsv,.xlsx,.xlsm,.xls,.docx,.pdf,.txt,.json,.png,.jpg,.jpeg,.webp,image/*,application/pdf';

export function SmartImportModal({
  isOpen,
  entityType,
  onClose,
  onCommit,
  quotaNotice,
  existingEmails = [],
}: SmartImportModalProps) {
  const { tenant } = useAuthStore();
  const config = SMART_ENTITY_CONFIGS[entityType];

  const [step, setStep] = useState<'input' | 'review'>('input');
  const [inputTab, setInputTab] = useState<'file' | 'paste'>('file');
  const [pastedText, setPastedText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [extractError, setExtractError] = useState('');

  const [extractResult, setExtractResult] = useState<SmartImportExtractResult | null>(null);
  const [mappings, setMappings] = useState<SmartImportFieldMapping[]>([]);
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // Entity-specific commit options
  const [deductStock, setDeductStock] = useState(false);
  const [restoreStock, setRestoreStock] = useState(false);
  const [markReceived, setMarkReceived] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingEmailSet = useMemo(
    () => new Set(existingEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
    [existingEmails]
  );

  // Fields displayed in the interactive review table (keep compact, prioritize required + mapped fields)
  const visibleFields = useMemo(() => {
    const mappedSet = new Set(
      mappings.filter((m) => m.targetField !== 'ignore').map((m) => m.targetField)
    );
    const prioritized = config.fields.filter(
      (f) =>
        f.required ||
        mappedSet.has(f.key) ||
        rows.some((r) => {
          const val = r[f.key];
          if (val === undefined || val === null || val === '') return false;
          if (f.key === 'minStockLevel' && val === 5) return false;
          if ((f.key === 'category' || f.key === 'unit' || f.key === 'status') && (val === 'General' || val === 'pcs' || val === 'active')) {
            return false;
          }
          return true;
        })
    );
    return prioritized.length > 0 ? prioritized : config.fields.slice(0, 8);
  }, [config.fields, mappings, rows]);

  const rowErrors = useMemo(() => {
    const seenBatchEmails = new Set<string>();
    return rows.map((row) => {
      const baseError = validateSmartImportRow(entityType, row);
      if (baseError) return baseError;
      if ((entityType === 'customers' || entityType === 'suppliers') && row.email) {
        const cleanEmail = String(row.email).trim().toLowerCase();
        if (existingEmailSet.has(cleanEmail) || seenBatchEmails.has(cleanEmail)) {
          return 'Duplicate email address';
        }
        seenBatchEmails.add(cleanEmail);
      }
      return null;
    });
  }, [rows, entityType, existingEmailSet]);

  const validSelectedRows = useMemo(() => {
    return rows.filter((_, idx) => selectedIndices.has(idx) && !rowErrors[idx]);
  }, [rows, selectedIndices, rowErrors]);

  const invalidCount = useMemo(
    () => rowErrors.filter((err, idx) => selectedIndices.has(idx) && Boolean(err)).length,
    [rowErrors, selectedIndices]
  );

  if (!isOpen) return null;

  const resetAll = () => {
    setStep('input');
    setSelectedFile(null);
    setPastedText('');
    setExtractError('');
    setExtractResult(null);
    setMappings([]);
    setRows([]);
    setSelectedIndices(new Set());
    setDeductStock(false);
    setRestoreStock(false);
    setMarkReceived(false);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const applyExtractToReview = (result: SmartImportExtractResult) => {
    setExtractResult(result);
    setMappings(result.fieldMappings || []);
    setRows(result.rows || []);
    const initialSelected = new Set<number>();
    (result.rows || []).forEach((_, idx) => initialSelected.add(idx));
    setSelectedIndices(initialSelected);
    setStep('review');
  };

  const runAiExtraction = async (params: {
    fileName?: string;
    mimeType?: string;
    fileBase64?: string;
    rawText?: string;
  }) => {
    const aiQuota = canUseAiCall(tenant);
    if (!aiQuota.allowed) {
      setExtractError(
        `Daily AI allowance reached (${aiQuota.used}/${aiQuota.limit}). Upload a standard CSV file for instant local mapping or upgrade your plan in Billing.`
      );
      return;
    }

    setIsExtracting(true);
    setExtractError('');
    try {
      const result = await smartImportExtract({
        entityType,
        ...params,
      });
      incrementDailyAiUsage(tenant?.id);
      if (!result.rows || result.rows.length === 0) {
        const detail = result.warnings?.[0] || result.summary;
        setExtractError(
          detail
            ? `Could not detect any ${config.title.toLowerCase()} records in this source (${detail}). Try a clearer file or paste the text directly.`
            : `Could not detect any ${config.title.toLowerCase()} records in this source. Try a clearer file or paste the text directly.`
        );
        return;
      }
      applyExtractToReview(result);
    } catch (err: any) {
      setExtractError(err?.message || 'Failed to analyze document with Smart Import AI.');
    } finally {
      setIsExtracting(false);
    }
  };

  const processSelectedFile = async (file: File, forceAi = false) => {
    setSelectedFile(file);
    setExtractError('');
    const lower = file.name.toLowerCase();
    const isPlainDelimited =
      lower.endsWith('.csv') ||
      lower.endsWith('.tsv') ||
      lower.endsWith('.json') ||
      file.type === 'text/csv' ||
      file.type === 'application/json';

    if (isPlainDelimited && !forceAi) {
      try {
        const text = await file.text();
        const localResult = tryParseStructuredTextLocally(entityType, text, file.name);
        if (localResult && localResult.rows.length > 0) {
          applyExtractToReview(localResult);
          return;
        }
      } catch {
        // Fall back to AI extraction
      }
    }

    try {
      const payload = await readAnyFileAsBase64(file);
      await runAiExtraction({
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        fileBase64: payload.base64,
      });
    } catch (err: any) {
      setExtractError(err?.message || `Failed to read ${file.name}`);
    }
  };

  const handleAnalyzePastedText = async (forceAi = false) => {
    const text = pastedText.trim();
    if (!text) {
      toast.error('Paste a list, table, or message first');
      return;
    }
    setExtractError('');
    if (!forceAi) {
      const localResult = tryParseStructuredTextLocally(entityType, text);
      if (localResult && localResult.rows.length > 0) {
        applyExtractToReview(localResult);
        return;
      }
    }
    await runAiExtraction({ rawText: text });
  };

  const handleReMapColumn = (sourceHeader: string, newTargetField: string) => {
    const previousMapping = mappings.find((m) => m.sourceHeader === sourceHeader);
    const oldTargetField = previousMapping?.targetField || 'ignore';

    const nextMappings = mappings.map((m) =>
      m.sourceHeader === sourceHeader ? { ...m, targetField: newTargetField } : m
    );
    setMappings(nextMappings);
    if (extractResult?.rawSpreadsheetRows && extractResult.rawSpreadsheetRows.length > 0) {
      const remappedRows = applyMappingsLocally(
        entityType,
        extractResult.rawSpreadsheetRows,
        nextMappings
      );
      setRows(remappedRows);
      const nextSel = new Set<number>();
      remappedRows.forEach((_, i) => nextSel.add(i));
      setSelectedIndices(nextSel);
    } else if (oldTargetField !== newTargetField) {
      setRows((prev) =>
        prev.map((row) => {
          const next = { ...row };
          if (oldTargetField !== 'ignore' && newTargetField !== 'ignore') {
            next[newTargetField] = row[oldTargetField];
            delete next[oldTargetField];
          } else if (oldTargetField !== 'ignore' && newTargetField === 'ignore') {
            delete next[oldTargetField];
          }
          return sanitizeRowForEntity(entityType, next);
        })
      );
    }
  };

  const handleCellEdit = (rowIndex: number, fieldKey: string, value: string) => {
    setRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== rowIndex) return row;
        const fieldDef = config.fields.find((f) => f.key === fieldKey);
        const nextRaw = {
          ...row,
          [fieldKey]: fieldDef?.type === 'number' ? Number(value) || 0 : value,
        };
        return sanitizeRowForEntity(entityType, nextRaw);
      })
    );
  };

  const handleRemoveRow = (rowIndex: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== rowIndex));
    setSelectedIndices((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < rowIndex) next.add(i);
        else if (i > rowIndex) next.add(i - 1);
      });
      return next;
    });
  };

  const handleRemoveInvalid = () => {
    const keptRows: Array<Record<string, any>> = [];
    rows.forEach((row, idx) => {
      if (!rowErrors[idx]) keptRows.push(row);
    });
    setRows(keptRows);
    const nextSel = new Set<number>();
    keptRows.forEach((_, idx) => nextSel.add(idx));
    setSelectedIndices(nextSel);
  };

  const handleToggleAll = () => {
    if (selectedIndices.size === rows.length) {
      setSelectedIndices(new Set());
    } else {
      const all = new Set<number>();
      rows.forEach((_, i) => all.add(i));
      setSelectedIndices(all);
    }
  };

  const handleCommit = async () => {
    if (validSelectedRows.length === 0) {
      toast.error('Select at least one valid row to import');
      return;
    }
    setIsCommitting(true);
    try {
      const count = await onCommit(validSelectedRows, {
        deductStock,
        restoreStock,
        markReceived,
      });
      if (count > 0) {
        handleClose();
      }
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-primary/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#FBFDFF] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92dvh] overflow-hidden flex flex-col border border-border">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-white/10 text-accent shrink-0">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white truncate">
                Smart AI Import · {config.title}
              </h3>
              <p className="text-xs text-white/75 truncate">{config.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white"
            aria-label="Close Smart Import"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {quotaNotice && (
            <div className="p-3 rounded-xl bg-surface-alt border border-border text-xs text-text-secondary flex items-center gap-2">
              <AlertTriangle size={15} className="text-accent-alt shrink-0" />
              <span>{quotaNotice}</span>
            </div>
          )}

          {step === 'input' ? (
            <div className="space-y-5">
              {/* Format pills / capabilities strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl border border-border bg-surface-alt/50 flex items-center gap-3">
                  <FileSpreadsheet size={18} className="text-accent shrink-0" />
                  <div>
                    <p className="font-bold text-primary">Spreadsheets &amp; Data</p>
                    <p className="text-text-muted">.csv, .xlsx, .xls, .tsv, .json</p>
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-border bg-surface-alt/50 flex items-center gap-3">
                  <FileText size={18} className="text-primary shrink-0" />
                  <div>
                    <p className="font-bold text-primary">Documents &amp; Word</p>
                    <p className="text-text-muted">Word (.docx), PDF (.pdf), .txt</p>
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-border bg-surface-alt/50 flex items-center gap-3">
                  <ImageIcon size={18} className="text-accent-alt shrink-0" />
                  <div>
                    <p className="font-bold text-primary">Photo / Sheet OCR</p>
                    <p className="text-text-muted">.png, .jpg, .webp &amp; pasted notes</p>
                  </div>
                </div>
              </div>

              {/* Input Switcher */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="inline-flex p-1 bg-surface-alt border border-border rounded-lg">
                  <button
                    type="button"
                    onClick={() => setInputTab('file')}
                    className={cn(
                      'px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap',
                      inputTab === 'file'
                        ? 'bg-primary text-white'
                        : 'text-text-secondary hover:text-primary'
                    )}
                  >
                    Upload Any File / Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputTab('paste')}
                    className={cn(
                      'px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap',
                      inputTab === 'paste'
                        ? 'bg-primary text-white'
                        : 'text-text-secondary hover:text-primary'
                    )}
                  >
                    Paste Text / WhatsApp List
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      config.sampleFilename,
                      config.sampleHeaders,
                      [config.sampleRow]
                    )
                  }
                  className="btn btn-secondary text-xs py-1.5 px-3 min-h-[34px] gap-1.5 whitespace-nowrap"
                >
                  <Download size={14} />
                  Sample CSV Template
                </button>
              </div>

              {extractError && (
                <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs font-medium flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    <span>{extractError}</span>
                  </div>
                  {(selectedFile || pastedText.trim()) && (
                    <button
                      type="button"
                      disabled={isExtracting}
                      onClick={() => {
                        if (inputTab === 'file' && selectedFile) {
                          void processSelectedFile(selectedFile);
                        } else if (inputTab === 'paste' && pastedText.trim()) {
                          void handleAnalyzePastedText();
                        }
                      }}
                      className="px-2.5 py-1 rounded border border-danger/40 bg-white text-danger font-semibold hover:bg-danger/5 whitespace-nowrap shrink-0"
                    >
                      {isExtracting ? 'Retrying...' : 'Retry'}
                    </button>
                  )}
                </div>
              )}

              {inputTab === 'file' ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void processSelectedFile(f);
                  }}
                  className={cn(
                    'border-2 border-dashed rounded-2xl p-8 text-center transition-colors',
                    isDragging
                      ? 'border-accent bg-accent/5'
                      : 'border-border bg-surface-alt/30 hover:border-primary/40'
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_FILE_TYPES}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void processSelectedFile(f);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  />

                  {isExtracting ? (
                    <SmartImportSkeleton fileName={selectedFile?.name} />
                  ) : (
                    <div className="space-y-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
                        <Upload size={22} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-primary">
                          Drop a spreadsheet, Word doc, PDF, or photo here
                        </p>
                        <p className="text-xs text-text-muted mt-1">
                          AI automatically detects columns &amp; extracts every row into {config.title}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="btn btn-primary gap-2 text-xs whitespace-nowrap"
                        >
                          <Upload size={15} />
                          Choose File or Camera Photo
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-primary uppercase tracking-wider">
                    Paste price list, invoice text, WhatsApp order, or copied spreadsheet rows
                  </label>
                  <textarea
                    rows={8}
                    className="input w-full text-sm font-mono leading-relaxed"
                    placeholder={
                      entityType === 'products'
                        ? 'Example:\n20 cartons Kakira Sugar 1kg @ 3800 sell 4500\n15 tins Blue Band 500g cost 6500 retail 8000'
                        : 'Paste copied table rows, WhatsApp list, or plain-text records here...'
                    }
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                  />
                  <div className="flex flex-wrap justify-end gap-2.5">
                    <button
                      type="button"
                      disabled={isExtracting || !pastedText.trim()}
                      onClick={() => void handleAnalyzePastedText(false)}
                      className="btn btn-primary gap-2 text-xs whitespace-nowrap"
                    >
                      <ClipboardPaste size={15} />
                      {isExtracting ? 'Analyzing with AI...' : 'Detect & Preview Rows'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Bar */}
              <div className="p-3.5 rounded-xl bg-surface-alt border border-border flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CheckCircle2 size={18} className="text-accent shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-primary">
                      {extractResult?.detectedFormat} · {rows.length} row(s) extracted
                    </p>
                    <p className="text-[11px] text-text-muted truncate">{extractResult?.summary}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedFile && (
                    <button
                      type="button"
                      disabled={isExtracting}
                      onClick={() => void processSelectedFile(selectedFile, true)}
                      className="btn btn-secondary text-xs py-1.5 px-2.5 min-h-[32px] gap-1.5 whitespace-nowrap"
                    >
                      <Sparkles size={13} className="text-accent" />
                      {isExtracting ? 'Re-analyzing...' : 'Re-Parse with AI'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setStep('input');
                      setExtractError('');
                    }}
                    className="btn btn-secondary text-xs py-1.5 px-2.5 min-h-[32px] gap-1.5 whitespace-nowrap"
                  >
                    <RotateCcw size={13} />
                    Change Source
                  </button>
                </div>
              </div>

              {/* Warnings from AI */}
              {extractResult?.warnings && extractResult.warnings.length > 0 && (
                <div className="p-3 rounded-xl bg-accent-alt/10 border border-accent-alt/30 text-xs text-primary space-y-1">
                  {extractResult.warnings.map((w, idx) => (
                    <p key={idx} className="flex items-center gap-1.5">
                      <AlertTriangle size={13} className="text-accent-alt shrink-0" />
                      <span>{w}</span>
                    </p>
                  ))}
                </div>
              )}

              {/* Column Field Mapping Adjuster (for tabular datasets) */}
              {extractResult?.rawSpreadsheetRows &&
                extractResult.rawSpreadsheetRows.length > 0 &&
                mappings.length > 0 && (
                  <div className="p-3.5 rounded-xl border border-border bg-[#FBFDFF] space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-primary uppercase tracking-wider">
                        Smart Column Mapping (Verify or Adjust)
                      </p>
                      <span className="text-[11px] text-text-muted">
                        Changing a dropdown updates all {rows.length} rows instantly
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2">
                      {mappings.map((m) => (
                        <div
                          key={m.sourceHeader}
                          className="flex items-center justify-between sm:inline-flex gap-1.5 px-2.5 py-1.5 sm:py-1 rounded-lg bg-surface-alt border border-border text-xs"
                        >
                          <span className="font-semibold text-primary max-w-[130px] truncate" title={m.sourceHeader}>
                            {m.sourceHeader}
                          </span>
                          <ArrowRight size={12} className="text-text-muted shrink-0" />
                          <select
                            aria-label={`Map column ${m.sourceHeader}`}
                            value={m.targetField}
                            onChange={(e) => handleReMapColumn(m.sourceHeader, e.target.value)}
                            className="bg-white border border-border rounded px-1.5 py-1 sm:py-0.5 text-xs font-medium text-primary max-w-[160px]"
                          >
                            <option value="ignore">Ignore</option>
                            {config.fields.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Entity-Specific Import Options */}
              {entityType === 'sales' && (
                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-surface-alt/40 text-xs font-medium text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deductStock}
                    onChange={(e) => setDeductStock(e.target.checked)}
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  <span>
                    Deduct sold quantities from active branch stock for matched products (leave unchecked for historical sales backfills)
                  </span>
                </label>
              )}
              {entityType === 'refunds' && (
                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-surface-alt/40 text-xs font-medium text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restoreStock}
                    onChange={(e) => setRestoreStock(e.target.checked)}
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  <span>Restore returned item quantities back into branch stock</span>
                </label>
              )}
              {entityType === 'purchases' && (
                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-surface-alt/40 text-xs font-medium text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={markReceived}
                    onChange={(e) => setMarkReceived(e.target.checked)}
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  <span>Mark imported orders as Received &amp; automatically add quantities to branch inventory</span>
                </label>
              )}

              {/* Interactive Editable Preview Table */}
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-surface-alt/60 border-b border-border flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 font-semibold text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && selectedIndices.size === rows.length}
                        onChange={handleToggleAll}
                      />
                      <span>
                        Selected {selectedIndices.size} of {rows.length}
                      </span>
                    </label>
                    {invalidCount > 0 && (
                      <span className="text-danger font-semibold">
                        · {invalidCount} row(s) need attention
                      </span>
                    )}
                  </div>
                  {invalidCount > 0 && (
                    <button
                      type="button"
                      onClick={handleRemoveInvalid}
                      className="text-danger font-semibold hover:underline"
                    >
                      Remove Invalid Rows
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto max-h-[340px]">
                  <table className="w-full text-left border-collapse text-xs min-w-[740px]">
                    <thead className="sticky top-0 bg-surface-alt border-b border-border z-10">
                      <tr>
                        <th className="px-3 py-2.5 w-10">#</th>
                        {visibleFields.map((field) => (
                          <th key={field.key} className="px-2.5 py-2.5 font-bold text-text-muted uppercase tracking-wider">
                            {field.label}
                            {field.required ? ' *' : ''}
                          </th>
                        ))}
                        <th className="px-3 py-2.5 font-bold text-text-muted uppercase tracking-wider">Status</th>
                        <th className="px-2.5 py-2.5 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((row, idx) => {
                        const rowErr = rowErrors[idx];
                        const isChecked = selectedIndices.has(idx);
                        return (
                          <tr
                            key={idx}
                            className={cn(
                              'hover:bg-surface-alt/30',
                              rowErr && isChecked && 'bg-danger/5',
                              !isChecked && 'opacity-55'
                            )}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setSelectedIndices((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(idx)) next.delete(idx);
                                    else next.add(idx);
                                    return next;
                                  });
                                }}
                                aria-label={`Select row ${idx + 1}`}
                              />
                            </td>
                            {visibleFields.map((field) => (
                              <td key={field.key} className="px-2 py-1.5">
                                {field.type === 'select' && field.options ? (
                                  <select
                                    value={String(row[field.key] ?? field.options[0])}
                                    onChange={(e) => handleCellEdit(idx, field.key, e.target.value)}
                                    className="w-full border border-border rounded px-1.5 py-1 bg-white text-xs text-primary min-w-[96px]"
                                  >
                                    {field.options.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                    value={row[field.key] ?? ''}
                                    onChange={(e) => handleCellEdit(idx, field.key, e.target.value)}
                                    className={cn(
                                      'w-full border border-border rounded px-2 py-1 text-xs text-primary bg-white min-w-[90px]',
                                      field.type === 'number' && 'font-mono tabular-nums text-right min-w-[76px]'
                                    )}
                                  />
                                )}
                              </td>
                            ))}
                            <td className="px-3 py-2 whitespace-nowrap">
                              {rowErr ? (
                                <span className="text-danger font-semibold">{rowErr}</span>
                              ) : (
                                <span className="text-accent font-semibold">Ready</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(idx)}
                                aria-label={`Remove row ${idx + 1}`}
                                className="p-1 text-text-muted hover:text-danger rounded"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-surface-alt/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-text-muted">
            {step === 'input'
              ? 'Supports CSV, Excel (.xlsx), Word (.docx), PDF, photos (OCR), and pasted notes (up to 500 rows/batch).'
              : `${validSelectedRows.length} valid record(s) ready to import into ${config.title}.`}
          </p>
          <div className="flex items-center gap-2.5 ml-auto">
            <button type="button" onClick={handleClose} className="btn btn-secondary text-xs whitespace-nowrap">
              Cancel
            </button>
            {step === 'review' && (
              <button
                type="button"
                disabled={isCommitting || validSelectedRows.length === 0}
                onClick={handleCommit}
                className="btn btn-primary gap-1.5 text-xs whitespace-nowrap"
              >
                <CheckCircle2 size={15} />
                {isCommitting
                  ? 'Importing...'
                  : `Import ${validSelectedRows.length} Record${validSelectedRows.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
