import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
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
  Lock,
  Layers,
  Check,
  ArrowUpRight,
} from 'lucide-react';
import {
  SmartImportEntityType,
  SmartImportExtractResult,
  SmartImportFieldMapping,
} from '../../types';
import {
  SMART_ENTITY_CONFIGS,
  applyMappingsLocally,
  inferFieldMappingsLocally,
  sanitizeRowForEntity,
  tryParseStructuredTextLocally,
  validateSmartImportRow,
} from '../../utils/smartImportParser';
import { readAnyFileAsBase64, smartImportExtract } from '../../services/aiService';
import { useAuthStore } from '../../store/authStore';
import {
  canAccessFeature,
  canUseAiCall,
  getEffectivePlanQuota,
  getPlanQuota,
  incrementDailyAiUsage,
} from '../../utils/planLimits';
import { hasSectionAccess } from '../../utils/rbac';
import { useInventory } from '../../hooks/useInventory';
import { usePOS } from '../../hooks/usePOS';
import { useCustomers } from '../../hooks/useCustomers';
import { useSuppliers } from '../../hooks/useSuppliers';
import { usePurchaseOrders } from '../../hooks/usePurchaseOrders';
import { useExpenses } from '../../hooks/useExpenses';
import { downloadCsv } from '../../utils/exportCsv';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

const ACCEPTED_FILE_TYPES =
  '.csv,.tsv,.xlsx,.xlsm,.xls,.docx,.pdf,.txt,.json,.png,.jpg,.jpeg,.webp,image/*,application/pdf';

const ENTITY_LIST: SmartImportEntityType[] = [
  'products',
  'sales',
  'refunds',
  'customers',
  'suppliers',
  'purchases',
  'expenses',
];

interface ImportJobRecord {
  id: string;
  entityType: SmartImportEntityType;
  fileName: string;
  detectedFormat: string;
  importedCount: number;
  timestamp: string;
}

export default function BulkImport() {
  const { tenant, user } = useAuthStore();
  const { products, bulkImportProducts } = useInventory();
  const { bulkImportSales, bulkImportRefunds } = usePOS();
  const { customers, bulkImportCustomers } = useCustomers();
  const { suppliers, bulkImportSuppliers } = useSuppliers();
  const { bulkImportPurchaseOrders } = usePurchaseOrders();
  const { bulkImportExpenses } = useExpenses();

  const [selectedTarget, setSelectedTarget] = useState<SmartImportEntityType | 'auto'>('auto');
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [pastedText, setPastedText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [extractError, setExtractError] = useState('');

  const [extractResult, setExtractResult] = useState<SmartImportExtractResult | null>(null);
  const [activeEntity, setActiveEntity] = useState<SmartImportEntityType>('products');
  const [mappings, setMappings] = useState<SmartImportFieldMapping[]>([]);
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const [deductStock, setDeductStock] = useState(false);
  const [restoreStock, setRestoreStock] = useState(false);
  const [markReceived, setMarkReceived] = useState(false);
  const [sessionJobs, setSessionJobs] = useState<ImportJobRecord[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const planQuota = getEffectivePlanQuota(tenant);

  // Check whether current user role + subscribed plan permits committing each entity type
  const entityAccess = useMemo(() => {
    const isAdminOrMgr = user?.role === 'admin' || user?.role === 'manager';
    return {
      products: isAdminOrMgr || user?.role === 'inventory' || hasSectionAccess(user, 'inventory'),
      sales: isAdminOrMgr || user?.role === 'cashier' || hasSectionAccess(user, 'sales'),
      refunds: isAdminOrMgr,
      customers: isAdminOrMgr || user?.role === 'cashier' || hasSectionAccess(user, 'customers'),
      suppliers:
        (isAdminOrMgr || user?.role === 'inventory' || hasSectionAccess(user, 'suppliers')) &&
        canAccessFeature(tenant, 'suppliersAndPOs'),
      purchases:
        (isAdminOrMgr || user?.role === 'inventory' || hasSectionAccess(user, 'purchases')) &&
        canAccessFeature(tenant, 'suppliersAndPOs'),
      expenses:
        isAdminOrMgr || user?.role === 'accountant' || hasSectionAccess(user, 'finance'),
    } as Record<SmartImportEntityType, boolean>;
  }, [user, tenant]);

  const entityTierLocked = useMemo(
    () => ({
      products: false,
      sales: false,
      refunds: false,
      customers: false,
      suppliers: !canAccessFeature(tenant, 'suppliersAndPOs'),
      purchases: !canAccessFeature(tenant, 'suppliersAndPOs'),
      expenses: false,
    }),
    [tenant]
  );

  const existingCustomerEmailSet = useMemo(
    () => new Set(customers.map((c) => (c.email || '').trim().toLowerCase()).filter(Boolean)),
    [customers]
  );
  const existingSupplierEmailSet = useMemo(
    () => new Set(suppliers.map((s) => (s.email || '').trim().toLowerCase()).filter(Boolean)),
    [suppliers]
  );

  const activeConfig = SMART_ENTITY_CONFIGS[activeEntity];

  const visibleFields = useMemo(() => {
    const mappedSet = new Set(
      mappings.filter((m) => m.targetField !== 'ignore').map((m) => m.targetField)
    );
    const prioritized = activeConfig.fields.filter(
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
    return prioritized.length > 0 ? prioritized : activeConfig.fields.slice(0, 8);
  }, [activeConfig.fields, mappings, rows]);

  const rowErrors = useMemo(() => {
    const seenBatchEmails = new Set<string>();
    const existingSet =
      activeEntity === 'customers'
        ? existingCustomerEmailSet
        : activeEntity === 'suppliers'
        ? existingSupplierEmailSet
        : null;

    return rows.map((row) => {
      const baseErr = validateSmartImportRow(activeEntity, row);
      if (baseErr) return baseErr;
      if (existingSet && row.email) {
        const cleanEmail = String(row.email).trim().toLowerCase();
        if (existingSet.has(cleanEmail) || seenBatchEmails.has(cleanEmail)) {
          return 'Duplicate email address';
        }
        seenBatchEmails.add(cleanEmail);
      }
      return null;
    });
  }, [rows, activeEntity, existingCustomerEmailSet, existingSupplierEmailSet]);

  const validSelectedRows = useMemo(
    () => rows.filter((_, idx) => selectedIndices.has(idx) && !rowErrors[idx]),
    [rows, selectedIndices, rowErrors]
  );

  const invalidSelectedCount = useMemo(
    () => rowErrors.filter((err, idx) => selectedIndices.has(idx) && Boolean(err)).length,
    [rowErrors, selectedIndices]
  );

  const remainingProductSlots = useMemo(() => {
    if (!Number.isFinite(planQuota.maxProducts)) return Infinity;
    return Math.max(0, planQuota.maxProducts - products.length);
  }, [planQuota.maxProducts, products.length]);

  const resetSession = () => {
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

  const applyExtractToWorkbench = (result: SmartImportExtractResult) => {
    setExtractResult(result);
    setActiveEntity(result.entityType);
    setMappings(result.fieldMappings || []);
    setRows(result.rows || []);
    const allIdx = new Set<number>();
    (result.rows || []).forEach((_, idx) => allIdx.add(idx));
    setSelectedIndices(allIdx);
  };

  const handleAnalyzeAndMap = async () => {
    setExtractError('');
    if (inputMode === 'file' && !selectedFile) {
      setExtractError('Choose a file (.csv, .xlsx, .docx, .pdf, or image photo) first.');
      return;
    }
    if (inputMode === 'paste' && !pastedText.trim()) {
      setExtractError('Paste a spreadsheet snippet, WhatsApp price list, or transaction log first.');
      return;
    }

    // Fast client-side path for CSV / TSV / JSON files and pasted structured tables
    if (inputMode === 'paste') {
      const localResult = tryParseStructuredTextLocally(selectedTarget, pastedText);
      if (localResult && localResult.rows.length > 0) {
        applyExtractToWorkbench(localResult);
        toast.success(
          `Auto-mapped ${localResult.rows.length} ${SMART_ENTITY_CONFIGS[localResult.entityType].title} rows`
        );
        return;
      }
    }

    if (inputMode === 'file' && selectedFile) {
      const lower = selectedFile.name.toLowerCase();
      if (
        lower.endsWith('.csv') ||
        lower.endsWith('.tsv') ||
        lower.endsWith('.json') ||
        lower.endsWith('.txt')
      ) {
        const text = await selectedFile.text();
        const localResult = tryParseStructuredTextLocally(selectedTarget, text, selectedFile.name);
        if (localResult && localResult.rows.length > 0) {
          applyExtractToWorkbench(localResult);
          toast.success(
            `Instant-mapped ${localResult.rows.length} ${SMART_ENTITY_CONFIGS[localResult.entityType].title} rows`
          );
          return;
        }
      }
    }

    // AI extraction & OCR path
    const aiQuota = canUseAiCall(tenant);
    if (!aiQuota.allowed) {
      setExtractError(
        `Daily AI allowance reached (${aiQuota.used}/${aiQuota.limit}). Upgrade your plan in Billing or upload clean CSV/TSV files directly.`
      );
      return;
    }

    setIsExtracting(true);
    try {
      let result: SmartImportExtractResult;
      if (inputMode === 'file' && selectedFile) {
        const { base64, mimeType, fileName } = await readAnyFileAsBase64(selectedFile);
        result = await smartImportExtract({
          entityType: selectedTarget,
          fileName,
          mimeType,
          fileBase64: base64,
        });
      } else {
        result = await smartImportExtract({
          entityType: selectedTarget,
          rawText: pastedText.trim(),
        });
      }

      incrementDailyAiUsage(tenant?.id);
      if (!result.rows || result.rows.length === 0) {
        const detail = result.warnings?.[0] || result.summary;
        setExtractError(
          detail
            ? `No importable records were detected (${detail}). Check that the file or text is legible and contains business records.`
            : 'No importable records were detected. Check that the file or text is legible and contains business records.'
        );
        return;
      }

      applyExtractToWorkbench(result);
      toast.success(
        `AI detected ${SMART_ENTITY_CONFIGS[result.entityType].title} (${result.rows.length} rows)`
      );
    } catch (err) {
      setExtractError(
        err instanceof Error ? err.message : 'Unable to parse and map this file. Please try again.'
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSwitchActiveEntity = (nextEntity: SmartImportEntityType) => {
    setActiveEntity(nextEntity);
    if (extractResult?.rawSpreadsheetRows && extractResult.rawSpreadsheetRows.length > 0) {
      const remapped = inferFieldMappingsLocally(nextEntity, extractResult.sourceHeaders || []);
      setMappings(remapped);
      setRows(applyMappingsLocally(nextEntity, extractResult.rawSpreadsheetRows, remapped));
    } else {
      const remapped = mappings.map((m) => {
        const validKeys = new Set(SMART_ENTITY_CONFIGS[nextEntity].fields.map((f) => f.key));
        return {
          ...m,
          targetField: validKeys.has(m.targetField) ? m.targetField : 'ignore',
        };
      });
      setMappings(remapped);
      setRows((prev) => prev.map((r) => sanitizeRowForEntity(nextEntity, r)));
    }
  };

  const handleMappingChange = (sourceHeader: string, newTargetField: string) => {
    const previousMapping = mappings.find((m) => m.sourceHeader === sourceHeader);
    const oldTargetField = previousMapping?.targetField || 'ignore';

    const updatedMappings = mappings.map((m) =>
      m.sourceHeader === sourceHeader
        ? { ...m, targetField: newTargetField, confidence: 'high' as const }
        : m
    );
    setMappings(updatedMappings);

    if (extractResult?.rawSpreadsheetRows && extractResult.rawSpreadsheetRows.length > 0) {
      const recomputed = applyMappingsLocally(
        activeEntity,
        extractResult.rawSpreadsheetRows,
        updatedMappings
      );
      setRows(recomputed);
      const nextSel = new Set<number>();
      recomputed.forEach((_, idx) => nextSel.add(idx));
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
          return sanitizeRowForEntity(activeEntity, next);
        })
      );
    }
  };

  const handleCellEdit = (rowIndex: number, fieldKey: string, value: string) => {
    setRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== rowIndex) return row;
        const fieldDef = activeConfig.fields.find((f) => f.key === fieldKey);
        const rawUpdated = {
          ...row,
          [fieldKey]: fieldDef?.type === 'number' ? value : value,
        };
        return sanitizeRowForEntity(activeEntity, rawUpdated);
      })
    );
  };

  const handleToggleRow = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
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
    const nextSel = new Set<number>();
    rows.forEach((r, idx) => {
      if (!rowErrors[idx]) {
        const newIdx = keptRows.length;
        keptRows.push(r);
        if (selectedIndices.has(idx)) nextSel.add(newIdx);
      }
    });
    setRows(keptRows);
    setSelectedIndices(nextSel);
  };

  const handleDownloadTemplate = (entity: SmartImportEntityType) => {
    const cfg = SMART_ENTITY_CONFIGS[entity];
    downloadCsv(cfg.sampleFilename, cfg.sampleHeaders, [
      cfg.sampleRow.map((v) => String(v)),
    ]);
    toast.success(`Downloaded ${cfg.sampleFilename}`);
  };

  const handleCommitImport = async () => {
    if (!entityAccess[activeEntity]) {
      toast.error(
        entityTierLocked[activeEntity]
          ? `${activeConfig.title} requires Starter plan or higher. Upgrade in Billing.`
          : `Your role does not permit importing into ${activeConfig.title}.`
      );
      return;
    }

    if (validSelectedRows.length === 0) {
      toast.error('Select at least one valid row before importing.');
      return;
    }

    setIsCommitting(true);
    try {
      let count = 0;
      const sourceLabel = selectedFile
        ? `Bulk Import (${selectedFile.name})`
        : 'Bulk Import Studio';

      if (activeEntity === 'products') {
        count = await bulkImportProducts(validSelectedRows as any, sourceLabel);
      } else if (activeEntity === 'sales') {
        count = await bulkImportSales(validSelectedRows, { deductStock });
      } else if (activeEntity === 'refunds') {
        count = await bulkImportRefunds(validSelectedRows, { restoreStock });
      } else if (activeEntity === 'customers') {
        count = await bulkImportCustomers(validSelectedRows as any);
      } else if (activeEntity === 'suppliers') {
        count = await bulkImportSuppliers(validSelectedRows as any);
      } else if (activeEntity === 'purchases') {
        count = await bulkImportPurchaseOrders(validSelectedRows, { markReceived });
      } else if (activeEntity === 'expenses') {
        count = await bulkImportExpenses(validSelectedRows as any);
      }

      if (count > 0) {
        setSessionJobs((prev) => [
          {
            id: crypto.randomUUID(),
            entityType: activeEntity,
            fileName: selectedFile?.name || 'Pasted Data',
            detectedFormat: extractResult?.detectedFormat || 'Structured Data',
            importedCount: count,
            timestamp: new Date().toISOString(),
          },
          ...prev,
        ]);
        resetSession();
      }
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F1E33] tracking-tight">Bulk Import Studio</h1>
          <p className="text-sm text-[#475569] mt-0.5">
            Upload spreadsheets, Word docs, PDFs, or receipt photos · AI auto-detects schema and maps columns to your database.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {extractResult && (
            <button
              type="button"
              onClick={resetSession}
              className="btn btn-secondary text-xs gap-1.5 whitespace-nowrap shrink-0"
            >
              <RotateCcw size={15} />
              Start New Import
            </button>
          )}
          <div className="text-xs text-[#475569] font-medium bg-[#FBFDFF] border border-[#D5DEE9] rounded-lg px-3 py-2 whitespace-nowrap">
            Plan: <strong className="text-[#0F1E33]">{planQuota.name}</strong> ·{' '}
            <span className="font-mono tabular-nums">
              {products.length}/{Number.isFinite(planQuota.maxProducts) ? planQuota.maxProducts : '∞'}
            </span>{' '}
            SKUs
          </div>
        </div>
      </div>

      {/* Step 1: Input & Target Schema Selection */}
      {!extractResult ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Target Schema Selector */}
          <div className="lg:col-span-5 bg-[#FBFDFF] border border-[#D5DEE9] rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[#0F1E33] uppercase tracking-wider">
                1. Target Schema
              </h2>
              <p className="text-xs text-[#64748B] mt-1">
                Let AI automatically classify the file, or lock a specific PrimeStock destination module.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedTarget('auto')}
              className={cn(
                'w-full text-left p-3.5 rounded-xl border transition-all flex items-start gap-3',
                selectedTarget === 'auto'
                  ? 'border-[#0F766E] bg-[#0F766E]/5'
                  : 'border-[#E2E8F0] hover:border-[#CBD5E1] bg-white'
              )}
            >
              <div
                className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                  selectedTarget === 'auto'
                    ? 'bg-[#0F766E] text-white'
                    : 'bg-[#F1F5F9] text-[#475569]'
                )}
              >
                <Sparkles size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[#0F1E33]">Auto-Detect Schema (AI)</span>
                  {selectedTarget === 'auto' && (
                    <span className="text-[11px] font-bold text-[#0F766E] whitespace-nowrap">Selected</span>
                  )}
                </div>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Automatically identifies whether your file contains Products, Sales, Refunds, Customers, Suppliers, POs, or Expenses.
                </p>
              </div>
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
              {ENTITY_LIST.map((entity) => {
                const cfg = SMART_ENTITY_CONFIGS[entity];
                const permitted = entityAccess[entity];
                const tierLocked = entityTierLocked[entity];
                const isSelected = selectedTarget === entity;
                return (
                  <div
                    key={entity}
                    className={cn(
                      'rounded-lg border p-3 transition-all flex items-center justify-between gap-3',
                      isSelected
                        ? 'border-[#0F1E33] bg-[#F8FAFC]'
                        : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]',
                      !permitted && 'opacity-65'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!permitted) {
                          toast.error(
                            tierLocked
                              ? `${cfg.title} requires Starter plan or higher.`
                              : `Your role does not allow importing ${cfg.title}.`
                          );
                          return;
                        }
                        setSelectedTarget(entity);
                      }}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#0F1E33] truncate">{cfg.title}</span>
                        {!permitted && <Lock size={12} className="text-[#94A3B8] shrink-0" />}
                      </div>
                      <p className="text-[11px] text-[#64748B] truncate mt-0.5">{cfg.description}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate(entity)}
                      className="text-[11px] font-semibold text-[#475569] hover:text-[#0F1E33] px-2 py-1 rounded border border-[#E2E8F0] hover:bg-[#F8FAFC] flex items-center gap-1 shrink-0 whitespace-nowrap"
                      title={`Download ${cfg.sampleFilename}`}
                    >
                      <Download size={12} />
                      CSV
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: File Upload / Paste Input */}
          <div className="lg:col-span-7 bg-[#FBFDFF] border border-[#D5DEE9] rounded-xl p-5 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-sm font-bold text-[#0F1E33] uppercase tracking-wider">
                    2. Source Document or Dataset
                  </h2>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Target:{' '}
                    <strong className="text-[#0F1E33]">
                      {selectedTarget === 'auto'
                        ? 'Auto-Detect with AI'
                        : SMART_ENTITY_CONFIGS[selectedTarget].title}
                    </strong>
                  </p>
                </div>

                <div className="inline-flex rounded-lg border border-[#E2E8F0] p-0.5 bg-[#F8FAFC]">
                  <button
                    type="button"
                    onClick={() => setInputMode('file')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 whitespace-nowrap',
                      inputMode === 'file' ? 'bg-white text-[#0F1E33] shadow-xs' : 'text-[#64748B]'
                    )}
                  >
                    <Upload size={14} />
                    Upload File
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('paste')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 whitespace-nowrap',
                      inputMode === 'paste' ? 'bg-white text-[#0F1E33] shadow-xs' : 'text-[#64748B]'
                    )}
                  >
                    <ClipboardPaste size={14} />
                    Paste Text / List
                  </button>
                </div>
              </div>

              {inputMode === 'file' ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      setSelectedFile(file);
                      setExtractError('');
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
                    isDragging
                      ? 'border-[#0F766E] bg-[#0F766E]/5'
                      : selectedFile
                      ? 'border-[#0F766E]/50 bg-[#F8FAFC]'
                      : 'border-[#CBD5E1] hover:border-[#94A3B8] hover:bg-[#F8FAFC]'
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_FILE_TYPES}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setSelectedFile(f);
                        setExtractError('');
                      }
                    }}
                  />
                  {selectedFile ? (
                    <div className="space-y-2">
                      <div className="w-11 h-11 rounded-xl bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center mx-auto">
                        <FileSpreadsheet size={22} />
                      </div>
                      <p className="text-sm font-bold text-[#0F1E33]">{selectedFile.name}</p>
                      <p className="text-xs text-[#64748B] font-mono tabular-nums">
                        {(selectedFile.size / 1024).toFixed(1)} KB · Click to choose a different file
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center gap-3 text-[#64748B]">
                        <FileSpreadsheet size={24} />
                        <FileText size={24} />
                        <ImageIcon size={24} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#0F1E33]">
                          Drop spreadsheet, document, PDF, or photo here
                        </p>
                        <p className="text-xs text-[#64748B] mt-1">
                          Supports Excel (.xlsx), CSV/TSV, Word (.docx), PDFs, JSON, and Camera/Receipt Images (AI OCR)
                        </p>
                      </div>
                      <span className="inline-block text-xs font-semibold text-[#0F766E]">
                        Browse device files
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    rows={10}
                    className="input w-full font-mono text-xs"
                    placeholder={
                      'Paste CSV rows, Excel columns, JSON array, or WhatsApp message text...\n\nExample:\nSugar Kakira 1kg - 50 pcs @ 4500/=\nCooking Oil 5L - 20 tins @ 42000/=\nPosho Super 2kg - 80 bags @ 5500/='
                    }
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                  />
                  <p className="text-[11px] text-[#64748B]">
                    Structured CSV/TSV/JSON maps instantaneously without consuming AI calls; unstructured text uses Gemini AI extraction.
                  </p>
                </div>
              )}

              {extractError && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <span>{extractError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAnalyzeAndMap}
                    disabled={isExtracting}
                    className="px-2.5 py-1 rounded border border-red-300 bg-white text-red-800 font-semibold hover:bg-red-100 whitespace-nowrap shrink-0"
                  >
                    {isExtracting ? 'Retrying...' : 'Retry'}
                  </button>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-[#64748B]">
                Max 500 rows per batch · Quotas &amp; role rules enforced on commit
              </div>
              <button
                type="button"
                onClick={handleAnalyzeAndMap}
                disabled={isExtracting}
                className="btn btn-primary gap-2 whitespace-nowrap shrink-0"
              >
                <Sparkles size={16} />
                <span>{isExtracting ? 'Analyzing & Mapping...' : 'Analyze & Map Fields'}</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Step 2: AI Field-Mapping Workbench & Validation Grid */
        <div className="space-y-6">
          {/* Detection & Target Schema Banner */}
          <div className="bg-[#FBFDFF] border border-[#D5DEE9] rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0F766E]">
                <Sparkles size={14} />
                <span>{extractResult.detectedFormat}</span>
                {extractResult.detectionConfidence && (
                  <span className="text-[#475569]">
                    · {extractResult.detectionConfidence} confidence
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-[#0F1E33]">
                Target Schema: {activeConfig.title}
              </h2>
              <p className="text-xs text-[#64748B]">
                {extractResult.detectionReason || extractResult.summary}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                  Destination Collection
                </label>
                <select
                  className="input-sm pr-8 font-semibold w-full sm:w-auto"
                  value={activeEntity}
                  onChange={(e) => handleSwitchActiveEntity(e.target.value as SmartImportEntityType)}
                >
                  {ENTITY_LIST.map((ent) => (
                    <option key={ent} value={ent}>
                      {SMART_ENTITY_CONFIGS[ent].title}
                      {!entityAccess[ent] ? ' (Restricted)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => handleDownloadTemplate(activeEntity)}
                className="btn btn-secondary text-xs gap-1.5 self-end whitespace-nowrap shrink-0"
              >
                <Download size={14} />
                Sample CSV
              </button>
            </div>
          </div>

          {/* Tier / Permission Notice if Target Schema is Restricted */}
          {!entityAccess[activeEntity] && (
            <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-amber-900">
                <Lock size={17} className="shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold">
                    {entityTierLocked[activeEntity]
                      ? `${activeConfig.title} requires ${getPlanQuota('starter').name} plan or higher`
                      : `Your role (${user?.role}) cannot commit records to ${activeConfig.title}`}
                  </p>
                  <p className="mt-0.5 text-amber-800">
                    {entityTierLocked[activeEntity]
                      ? 'Upgrade in Billing or switch Destination Collection above to a permitted schema.'
                      : 'Ask your Business Admin for section access or select another permitted destination.'}
                  </p>
                </div>
              </div>
              {entityTierLocked[activeEntity] && (
                <Link
                  to="/billing"
                  className="btn btn-primary text-xs gap-1 whitespace-nowrap shrink-0"
                >
                  <span>Upgrade Plan</span>
                  <ArrowUpRight size={14} />
                </Link>
              )}
            </div>
          )}

          {/* Product SKU Quota Guard */}
          {activeEntity === 'products' && Number.isFinite(remainingProductSlots) && (
            <div
              className={cn(
                'p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2',
                remainingProductSlots < validSelectedRows.length
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-[#E2E8F0] bg-white text-[#475569]'
              )}
            >
              <span>
                <strong className="text-[#0F1E33]">{planQuota.name} SKU Allowance:</strong>{' '}
                <span className="font-mono tabular-nums">{remainingProductSlots}</span> slot(s) remaining out of{' '}
                <span className="font-mono tabular-nums">{planQuota.maxProducts}</span>.{' '}
                {remainingProductSlots < validSelectedRows.length &&
                  `Only the first ${remainingProductSlots} row(s) will be imported unless you upgrade.`}
              </span>
              {remainingProductSlots < validSelectedRows.length && (
                <Link to="/billing" className="font-bold text-[#0F766E] hover:underline whitespace-nowrap">
                  Increase Quota →
                </Link>
              )}
            </div>
          )}

          {/* Interactive AI Field Mapping Matrix */}
          {mappings.length > 0 && (
            <div className="bg-[#FBFDFF] border border-[#D5DEE9] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="text-sm font-bold text-[#0F1E33] flex items-center gap-2">
                    <Layers size={16} className="text-[#0F766E]" />
                    AI Column &amp; Field Mapping ({mappings.filter((m) => m.targetField !== 'ignore').length} mapped)
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    Adjust any source-to-schema mapping below—tabular datasets re-normalize automatically.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {mappings.map((m) => (
                  <div
                    key={m.sourceHeader}
                    className="border border-[#E2E8F0] rounded-lg p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#F8FAFC]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#0F1E33] truncate" title={m.sourceHeader}>
                        {m.sourceHeader}
                      </p>
                      <p className="text-[10px] text-[#64748B] capitalize">
                        {m.confidence || 'high'} match
                      </p>
                    </div>
                    <ArrowRight size={14} className="hidden sm:block text-[#94A3B8] shrink-0" />
                    <select
                      aria-label={`Map column ${m.sourceHeader}`}
                      className="input-sm w-full sm:w-44 shrink-0 font-medium bg-white"
                      value={m.targetField}
                      onChange={(e) => handleMappingChange(m.sourceHeader, e.target.value)}
                    >
                      <option value="ignore">— Ignore Column —</option>
                      {activeConfig.fields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                          {f.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data Preview & Validation Grid */}
          <div className="bg-[#FBFDFF] border border-[#D5DEE9] rounded-xl overflow-hidden">
            <div className="p-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-bold text-[#0F1E33]">
                  Preview Records ({validSelectedRows.length} valid selected of {rows.length})
                </span>
                {invalidSelectedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleRemoveInvalid}
                    className="text-red-700 font-semibold hover:underline flex items-center gap-1"
                  >
                    <AlertTriangle size={13} />
                    Remove {invalidSelectedCount} invalid row{invalidSelectedCount === 1 ? '' : 's'}
                  </button>
                )}
              </div>

              {/* Entity-specific import switches */}
              <div className="flex flex-wrap items-center gap-4 text-xs">
                {activeEntity === 'sales' && (
                  <label className="flex items-center gap-2 cursor-pointer text-[#334155]">
                    <input
                      type="checkbox"
                      checked={deductStock}
                      onChange={(e) => setDeductStock(e.target.checked)}
                    />
                    <span>Deduct matching product stock</span>
                  </label>
                )}
                {activeEntity === 'refunds' && (
                  <label className="flex items-center gap-2 cursor-pointer text-[#334155]">
                    <input
                      type="checkbox"
                      checked={restoreStock}
                      onChange={(e) => setRestoreStock(e.target.checked)}
                    />
                    <span>Restore returned units to stock</span>
                  </label>
                )}
                {activeEntity === 'purchases' && (
                  <label className="flex items-center gap-2 cursor-pointer text-[#334155]">
                    <input
                      type="checkbox"
                      checked={markReceived}
                      onChange={(e) => setMarkReceived(e.target.checked)}
                    />
                    <span>Mark orders as Received (+Stock)</span>
                  </label>
                )}
              </div>
            </div>

            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] sticky top-0 z-10">
                  <tr>
                    <th className="p-2.5 w-9">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && selectedIndices.size === rows.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIndices(new Set(rows.map((_, i) => i)));
                          } else {
                            setSelectedIndices(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="p-2.5 font-bold text-[#475569] uppercase tracking-wider w-10">#</th>
                    {visibleFields.map((f) => (
                      <th
                        key={f.key}
                        className="p-2.5 font-bold text-[#475569] uppercase tracking-wider whitespace-nowrap"
                      >
                        {f.label}
                        {f.required && <span className="text-red-500 ml-0.5">*</span>}
                      </th>
                    ))}
                    <th className="p-2.5 font-bold text-[#475569] uppercase tracking-wider whitespace-nowrap">
                      Status
                    </th>
                    <th className="p-2.5 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {rows.map((row, rIdx) => {
                    const err = rowErrors[rIdx];
                    const checked = selectedIndices.has(rIdx);
                    return (
                      <tr
                        key={rIdx}
                        className={cn(
                          'hover:bg-[#F8FAFC]',
                          err && 'bg-red-50/50',
                          !checked && 'opacity-50'
                        )}
                      >
                        <td className="p-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleRow(rIdx)}
                          />
                        </td>
                        <td className="p-2.5 font-mono tabular-nums text-[#64748B]">{rIdx + 1}</td>
                        {visibleFields.map((f) => (
                          <td key={f.key} className="p-1.5 min-w-[120px]">
                            {f.type === 'select' && f.options ? (
                              <select
                                className="w-full px-2 py-1 text-xs border border-[#E2E8F0] rounded bg-white"
                                value={String(row[f.key] ?? f.options[0])}
                                onChange={(e) => handleCellEdit(rIdx, f.key, e.target.value)}
                              >
                                {f.options.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div>
                                <input
                                  type={f.type === 'number' ? 'number' : 'text'}
                                  className={cn(
                                    'w-full px-2 py-1 text-xs border border-[#E2E8F0] rounded bg-white',
                                    f.type === 'number' && 'font-mono tabular-nums text-right'
                                  )}
                                  value={row[f.key] ?? ''}
                                  onChange={(e) => handleCellEdit(rIdx, f.key, e.target.value)}
                                />
                                {f.key === 'itemName' && Array.isArray(row.items) && row.items.length > 1 && (
                                  <span className="block text-[10px] text-[#0F766E] font-medium mt-0.5">
                                    +{row.items.length} line items captured
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        ))}
                        <td className="p-2.5 whitespace-nowrap">
                          {err ? (
                            <span className="text-red-700 font-semibold flex items-center gap-1">
                              <AlertTriangle size={12} />
                              {err}
                            </span>
                          ) : (
                            <span className="text-[#0F766E] font-semibold flex items-center gap-1">
                              <Check size={12} />
                              Ready
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(rIdx)}
                            className="p-1 text-[#94A3B8] hover:text-red-600"
                            title="Remove row"
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

            <div className="p-4 border-t border-[#E2E8F0] bg-[#F8FAFC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-[#475569]">
                Ready to commit <strong className="text-[#0F1E33]">{validSelectedRows.length}</strong>{' '}
                valid record{validSelectedRows.length === 1 ? '' : 's'} into{' '}
                <strong className="text-[#0F1E33]">{activeConfig.title}</strong>.
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={resetSession}
                  className="btn btn-secondary text-xs whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCommitImport}
                  disabled={
                    isCommitting ||
                    validSelectedRows.length === 0 ||
                    !entityAccess[activeEntity]
                  }
                  className="btn btn-primary text-xs gap-1.5 whitespace-nowrap shrink-0"
                >
                  <CheckCircle2 size={15} />
                  <span>
                    {isCommitting
                      ? 'Importing...'
                      : `Commit ${validSelectedRows.length} Record${
                          validSelectedRows.length === 1 ? '' : 's'
                        }`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Session Import History */}
      {sessionJobs.length > 0 && (
        <div className="bg-[#FBFDFF] border border-[#D5DEE9] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#0F1E33] uppercase tracking-wider">
              Completed Imports This Session
            </h3>
            <span className="text-xs text-[#64748B] font-mono tabular-nums">
              {sessionJobs.length} batch{sessionJobs.length === 1 ? '' : 'es'}
            </span>
          </div>
          <div className="divide-y divide-[#E2E8F0]">
            {sessionJobs.map((job) => (
              <div
                key={job.id}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 size={15} className="text-[#0F766E] shrink-0" />
                  <span className="font-bold text-[#0F1E33]">
                    {SMART_ENTITY_CONFIGS[job.entityType].title}
                  </span>
                  <span className="text-[#64748B]">
                    · {job.fileName} · {job.detectedFormat}
                  </span>
                </div>
                <span className="font-mono tabular-nums font-semibold text-[#0F1E33]">
                  +{job.importedCount} committed
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
