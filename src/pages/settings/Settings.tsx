import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building,
  Shield,
  Smartphone,
  Printer,
  Check,
  Lock,
  CheckCircle2,
  Palette,
  Upload,
  RotateCcw,
  Trash2,
  Sparkles,
  UserCheck,
  Mail,
  RefreshCw,
  AlertTriangle,
  X,
} from 'lucide-react';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { useAuthStore } from '../../store/authStore';
import { useAuth } from '../../hooks/useAuth';
import { useTrialGuard } from '../../hooks/useTrialGuard';
import { logWorkspaceAudit } from '../../hooks/useAuditLog';
import { Tenant, TenantBranding, TenantPreferences } from '../../types';
import { stripUndefined } from '../../utils/firestoreUtils';
import { printViaThermalSerial } from '../../utils/thermalPrint';
import { handleFirestoreError, OperationType } from '../../utils/errorHandlers';
import {
  BRAND_PRESETS,
  DEFAULT_BRANDING,
  applyTenantTheme,
  compressLogoFile,
  getContrastTextColor,
  isValidHexColor,
} from '../../utils/branding';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

const SettingSection = ({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn('card p-6 sm:p-8', className)}>
    <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
      <div className="p-3 bg-primary/5 text-primary rounded-xl shrink-0">
        <Icon size={24} />
      </div>
      <div className="flex-1 w-full min-w-0">
        <h3 className="text-lg font-bold text-primary mb-1">{title}</h3>
        <p className="text-text-muted text-sm mb-6">{description}</p>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  </div>
);

const SettingItem = ({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 py-4 border-t border-border first:border-t-0">
    <div className="min-w-0">
      <p className="text-sm font-bold text-primary">{label}</p>
      <p className="text-xs text-text-muted">{description}</p>
    </div>
    <div className="w-full sm:w-auto sm:shrink-0">{children}</div>
  </div>
);

const ToggleSwitch = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={cn(
      'w-12 h-6 rounded-full relative transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30',
      checked ? 'bg-accent' : 'bg-border'
    )}
  >
    <span
      className={cn(
        'block w-4 h-4 bg-white rounded-full transition-transform absolute top-1',
        checked ? 'translate-x-7' : 'translate-x-1'
      )}
    />
  </button>
);

export default function Settings() {
  const { tenant, user, setTenant, setUser } = useAuthStore();
  const {
    resendVerificationEmail,
    refreshAuthSession,
    resetPassword,
    deleteAdminAccountAndWorkspace,
  } = useAuth();
  const trialState = useTrialGuard();
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [businessName, setBusinessName] = useState('');
  const [tin, setTin] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [showLogoUrlInput, setShowLogoUrlInput] = useState(false);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);

  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const [branding, setBranding] = useState<TenantBranding>({
    primaryColor: DEFAULT_BRANDING.primaryColor,
    accentColor: DEFAULT_BRANDING.accentColor,
    secondaryAccentColor: DEFAULT_BRANDING.secondaryAccentColor,
    presetId: DEFAULT_BRANDING.presetId,
    tagline: '',
    receiptHeader: '',
    supportPhone: '',
    supportEmail: '',
    website: '',
  });

  const [prefs, setPrefs] = useState<TenantPreferences>({
    mtnMomoEnabled: true,
    mtnMerchantCode: '',
    airtelMoneyEnabled: false,
    airtelMerchantCode: '',
    whatsappReceipts: true,
    thermalPrinterName: '',
    twoFactorRequired: false,
    staffPinsEnabled: false,
    receiptFooter: '',
    taxEnabled: false,
    taxRate: 18,
    taxInclusive: true,
  });

  const [showMtnConfig, setShowMtnConfig] = useState(false);
  const [showAirtelConfig, setShowAirtelConfig] = useState(false);
  const [showPrinterInput, setShowPrinterInput] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfilePhone(user.phone || '');
    }
  }, [user]);

  useEffect(() => {
    if (!tenant) return;
    setBusinessName(tenant.name || '');
    setTin(tenant.tin || '');
    setOwnerPhone(tenant.ownerPhone || '');
    setLogoUrl(tenant.logo || '');
    setBranding({
      primaryColor: tenant.branding?.primaryColor || DEFAULT_BRANDING.primaryColor,
      accentColor: tenant.branding?.accentColor || DEFAULT_BRANDING.accentColor,
      secondaryAccentColor:
        tenant.branding?.secondaryAccentColor || DEFAULT_BRANDING.secondaryAccentColor,
      presetId: tenant.branding?.presetId || DEFAULT_BRANDING.presetId,
      tagline: tenant.branding?.tagline || '',
      receiptHeader: tenant.branding?.receiptHeader || '',
      supportPhone: tenant.branding?.supportPhone || '',
      supportEmail: tenant.branding?.supportEmail || '',
      website: tenant.branding?.website || '',
    });
    setPrefs({
      mtnMomoEnabled: tenant.preferences?.mtnMomoEnabled ?? true,
      mtnMerchantCode: tenant.preferences?.mtnMerchantCode || '',
      airtelMoneyEnabled: tenant.preferences?.airtelMoneyEnabled ?? false,
      airtelMerchantCode: tenant.preferences?.airtelMerchantCode || '',
      whatsappReceipts: tenant.preferences?.whatsappReceipts ?? true,
      thermalPrinterName: tenant.preferences?.thermalPrinterName || '',
      twoFactorRequired: tenant.preferences?.twoFactorRequired ?? false,
      staffPinsEnabled: tenant.preferences?.staffPinsEnabled ?? false,
      receiptFooter: tenant.preferences?.receiptFooter || '',
      taxEnabled: tenant.preferences?.taxEnabled ?? false,
      taxRate: tenant.preferences?.taxRate ?? 18,
      taxInclusive: tenant.preferences?.taxInclusive ?? true,
    });
  }, [tenant]);

  const isAdmin = user?.role === 'admin';

  const previewPrimary = isValidHexColor(branding.primaryColor)
    ? branding.primaryColor
    : DEFAULT_BRANDING.primaryColor;
  const previewAccent = isValidHexColor(branding.accentColor)
    ? branding.accentColor
    : DEFAULT_BRANDING.accentColor;
  const previewSecondary = isValidHexColor(branding.secondaryAccentColor)
    ? branding.secondaryAccentColor
    : DEFAULT_BRANDING.secondaryAccentColor;
  const previewPrimaryText = getContrastTextColor(previewPrimary);
  const previewAccentText = getContrastTextColor(previewAccent);

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsProcessingLogo(true);
    try {
      const compressedDataUrl = await compressLogoFile(file);
      setLogoUrl(compressedDataUrl);
      toast.success('Logo optimized and ready. Click "Save All Changes" to publish.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to process logo file');
    } finally {
      setIsProcessingLogo(false);
    }
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = BRAND_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setBranding((prev) => ({
      ...prev,
      presetId: preset.id,
      primaryColor: preset.primaryColor,
      accentColor: preset.accentColor,
      secondaryAccentColor: preset.secondaryAccentColor,
    }));
  };

  const handleResetPalette = () => {
    setBranding((prev) => ({
      ...prev,
      presetId: DEFAULT_BRANDING.presetId,
      primaryColor: DEFAULT_BRANDING.primaryColor,
      accentColor: DEFAULT_BRANDING.accentColor,
      secondaryAccentColor: DEFAULT_BRANDING.secondaryAccentColor,
    }));
    toast.success('Palette reset to default theme');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    if (!isAdmin) {
      toast.error('Only business admins can update settings');
      return;
    }
    if (!navigator.onLine) {
      toast.error('Connect to the internet to save workspace settings');
      return;
    }
    if (!businessName.trim()) {
      toast.error('Business name is required');
      return;
    }

    if (
      !isValidHexColor(previewPrimary) ||
      !isValidHexColor(previewAccent) ||
      !isValidHexColor(previewSecondary)
    ) {
      toast.error('Please enter valid 6-digit hex color codes (e.g. #0A2540).');
      return;
    }

    setIsSaving(true);
    const tenantPath = `tenants/${tenant.id}`;
    const cleanedPrefs = stripUndefined<TenantPreferences>({
      ...prefs,
      mtnMerchantCode: prefs.mtnMerchantCode?.trim() || undefined,
      airtelMerchantCode: prefs.airtelMerchantCode?.trim() || undefined,
      thermalPrinterName: prefs.thermalPrinterName?.trim() || undefined,
      receiptFooter: prefs.receiptFooter?.trim() || undefined,
    });

    const cleanedBranding = stripUndefined<TenantBranding>({
      primaryColor: previewPrimary,
      accentColor: previewAccent,
      secondaryAccentColor: previewSecondary,
      presetId: branding.presetId || 'custom',
      tagline: branding.tagline?.trim() || undefined,
      receiptHeader: branding.receiptHeader?.trim() || undefined,
      supportPhone: branding.supportPhone?.trim() || undefined,
      supportEmail: branding.supportEmail?.trim() || undefined,
      website: branding.website?.trim() || undefined,
    });

    const cleanTin = tin.trim();
    const cleanLogo = logoUrl.trim();
    const cleanOwnerPhone = ownerPhone.trim();

    const firestorePayload: Record<string, unknown> = {
      name: businessName.trim(),
      tin: cleanTin ? cleanTin : deleteField(),
      ownerPhone: cleanOwnerPhone ? cleanOwnerPhone : deleteField(),
      logo: cleanLogo ? cleanLogo : deleteField(),
      branding: cleanedBranding,
      preferences: cleanedPrefs,
    };

    if (!tenant.ownerEmail && user?.email) {
      firestorePayload.ownerEmail = user.email;
    }
    if (!tenant.ownerName && user?.name) {
      firestorePayload.ownerName = user.name;
    }

    const nextTenant: Tenant = {
      ...tenant,
      name: businessName.trim(),
      branding: cleanedBranding,
      preferences: cleanedPrefs,
      ownerEmail: tenant.ownerEmail || user?.email || undefined,
      ownerName: tenant.ownerName || user?.name || undefined,
    };
    if (cleanTin) nextTenant.tin = cleanTin;
    else delete nextTenant.tin;
    if (cleanOwnerPhone) nextTenant.ownerPhone = cleanOwnerPhone;
    else delete nextTenant.ownerPhone;
    if (cleanLogo) nextTenant.logo = cleanLogo;
    else delete nextTenant.logo;

    try {
      setTenant(nextTenant);
      applyTenantTheme(nextTenant);
      await updateDoc(doc(db, 'tenants', tenant.id), firestorePayload);
      if (user) {
        void logWorkspaceAudit({
          tenantId: tenant.id,
          branchId: user.branchId,
          actorId: user.uid,
          actorName: user.name,
          actorRole: user.role,
          action: 'SETTINGS_UPDATED',
          entityType: 'settings',
          entityId: tenant.id,
          summary: `Updated branding & workspace settings for "${nextTenant.name}"`,
        });
      }
      toast.success('White-label branding and workspace settings are live!');
    } catch (error) {
      setTenant(tenant);
      applyTenantTheme(tenant);
      try {
        handleFirestoreError(error, OperationType.UPDATE, tenantPath);
      } catch (structuredErr) {
        console.error(structuredErr);
      }
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAccountProfile = async () => {
    if (!user || !tenant) return;
    const cleanName = profileName.trim();
    const cleanPhone = profilePhone.trim();
    if (!cleanName) {
      toast.error('Display name cannot be empty');
      return;
    }
    setIsSavingProfile(true);
    try {
      const payload: Record<string, unknown> = {
        name: cleanName,
        phone: cleanPhone ? cleanPhone : deleteField(),
      };
      await updateDoc(doc(db, 'users', user.uid), payload);
      await updateDoc(doc(db, `tenants/${tenant.id}/members`, user.uid), payload).catch(() => {});
      const nextUser = { ...user, name: cleanName };
      if (cleanPhone) nextUser.phone = cleanPhone;
      else delete nextUser.phone;
      setUser(nextUser);
      void logWorkspaceAudit({
        tenantId: tenant.id,
        branchId: user.branchId,
        actorId: user.uid,
        actorName: cleanName,
        actorRole: user.role,
        action: 'PROFILE_UPDATED',
        entityType: 'settings',
        entityId: user.uid,
        summary: `${cleanName} updated personal account profile`,
      });
      toast.success('Account profile updated');
    } catch (error) {
      console.error('Profile update failed:', error);
      toast.error('Failed to update account profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const isEmailVerified = Boolean(auth.currentUser?.emailVerified);
  const usesPasswordAuth = Boolean(
    auth.currentUser?.providerData?.some((p) => p.providerId === 'password')
  );
  const requiredDeleteKeyword = (tenant?.name || 'DELETE').trim();

  const handleConfirmDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || isDeletingAccount) return;
    if (deleteConfirmText.trim() !== requiredDeleteKeyword) {
      setDeleteError(`Please type "${requiredDeleteKeyword}" exactly to confirm.`);
      return;
    }
    if (usesPasswordAuth && !deletePassword) {
      setDeleteError('Enter your current password to authorize permanent deletion.');
      return;
    }
    setDeleteError(null);
    setIsDeletingAccount(true);
    const res = await deleteAdminAccountAndWorkspace(deletePassword);
    setIsDeletingAccount(false);
    if (!res.ok) {
      setDeleteError(res.error || 'Account deletion failed. Please try again.');
    } else {
      setShowDeleteModal(false);
    }
  };

  return (
    <>
    <form onSubmit={handleSave} className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">White-Label &amp; Settings</h1>
          <p className="text-text-muted mt-1">
            Customize your organization logo, name, system theme colors, receipts, and branch controls.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/billing"
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors',
              trialState.isSoftLocked
                ? 'bg-danger/10 text-danger border-danger/25'
                : trialState.isComplimentary
                ? 'bg-accent/10 text-accent border-accent/25'
                : trialState.isTrial
                ? 'bg-accent/10 text-accent border-accent/25'
                : 'bg-surface-alt text-primary border-border'
            )}
          >
            {trialState.isSoftLocked ? <Lock size={14} /> : <CheckCircle2 size={14} />}
            <span>
              {trialState.isSoftLocked
                ? trialState.isSuspended
                  ? 'Account Disabled — Review Billing'
                  : 'Subscription Required — Billing'
                : trialState.isComplimentary
                ? `Complimentary: ${(tenant?.plan || 'micro').toUpperCase()}`
                : trialState.isTrial
                ? `Trial: ${trialState.daysRemaining}d left`
                : `Pack: ${(tenant?.plan || 'micro').toUpperCase()}`}
            </span>
          </Link>
          {!isAdmin && (
            <p className="text-xs font-semibold text-text-muted bg-surface-alt px-3 py-2 rounded-lg border border-border">
              View-only mode: Admin role required to save changes
            </p>
          )}
        </div>
      </div>

      {/* White-Label Theme & Identity Studio */}
      <SettingSection
        icon={Palette}
        title="White-Label Brand & Theme Studio"
        description="Make this workspace unmistakably yours — your custom logo, brand name, and color palette flow across all branches, charts, and customer receipts."
        className="border-accent/25"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Logo + Identity Fields */}
          <div className="lg:col-span-6 space-y-4">
            <div className="p-4 rounded-xl border border-border bg-surface-alt/40 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-16 h-16 rounded-2xl border border-border bg-white flex items-center justify-center overflow-hidden shrink-0">
                {logoUrl ? (
                  <img src={logoUrl} alt="Organization logo" className="w-full h-full object-contain p-1.5" />
                ) : (
                  <span
                    className="text-xl font-extrabold"
                    style={{ color: previewPrimary }}
                  >
                    {(businessName || 'B').slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-xs font-bold text-primary">Business Logo (Sidebar, Tabs &amp; Receipts)</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isProcessingLogo}
                    onClick={() => logoInputRef.current?.click()}
                    className="btn btn-secondary text-xs gap-1.5 min-h-[36px] px-3 whitespace-nowrap"
                  >
                    <Upload size={14} />
                    {isProcessingLogo ? 'Optimizing...' : 'Upload Logo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLogoUrlInput((v) => !v)}
                    className="btn btn-secondary text-xs min-h-[36px] px-3 whitespace-nowrap"
                  >
                    {showLogoUrlInput ? 'Hide URL' : 'Paste URL'}
                  </button>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      className="btn btn-secondary text-xs text-danger border-danger/30 hover:bg-danger/5 min-h-[36px] px-2.5"
                      title="Remove Logo"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {showLogoUrlInput && (
                  <input
                    type="url"
                    className="input text-xs min-h-[40px]"
                    placeholder="https://yourbusiness.com/logo.png"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-primary mb-1">
                  General Business Name *
                </label>
                <input
                  type="text"
                  required
                  className="input"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Kampala Hardware & Supply"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary mb-1">
                  Brand Tagline
                </label>
                <input
                  type="text"
                  className="input"
                  value={branding.tagline || ''}
                  onChange={(e) => setBranding({ ...branding, tagline: e.target.value })}
                  placeholder="e.g. Quality Tools Across Uganda"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-primary mb-1">
                  Receipt / Document Header
                </label>
                <input
                  type="text"
                  className="input"
                  value={branding.receiptHeader || ''}
                  onChange={(e) => setBranding({ ...branding, receiptHeader: e.target.value })}
                  placeholder="e.g. Plot 42 Ben Kiwanuka St, Kampala"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary mb-1">
                  Support Phone
                </label>
                <input
                  type="tel"
                  className="input"
                  value={branding.supportPhone || ''}
                  onChange={(e) => setBranding({ ...branding, supportPhone: e.target.value })}
                  placeholder="+256 772 000000"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-primary mb-1">
                  Support Email
                </label>
                <input
                  type="email"
                  className="input"
                  value={branding.supportEmail || ''}
                  onChange={(e) => setBranding({ ...branding, supportEmail: e.target.value })}
                  placeholder="support@yourbusiness.ug"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary mb-1">
                  Website URL
                </label>
                <input
                  type="text"
                  className="input"
                  value={branding.website || ''}
                  onChange={(e) => setBranding({ ...branding, website: e.target.value })}
                  placeholder="www.yourbusiness.ug"
                />
              </div>
            </div>
          </div>

          {/* Right: Theme Presets, Custom Colors & Live Preview */}
          <div className="lg:col-span-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-text-muted">
                1. Choose a Curated Theme or Custom Colors
              </p>
              <button
                type="button"
                onClick={handleResetPalette}
                className="text-xs font-semibold text-text-secondary hover:text-primary inline-flex items-center gap-1"
              >
                <RotateCcw size={12} />
                Reset
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {BRAND_PRESETS.map((preset) => {
                const isSelected = branding.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset.id)}
                    className={cn(
                      'p-2.5 rounded-xl border text-left transition-all',
                      isSelected
                        ? 'border-accent bg-accent/5 ring-2 ring-accent/20'
                        : 'border-border bg-white hover:border-primary/40'
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span
                        className="w-4 h-4 rounded-full border border-black/10"
                        style={{ backgroundColor: preset.primaryColor }}
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-black/10"
                        style={{ backgroundColor: preset.accentColor }}
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-black/10"
                        style={{ backgroundColor: preset.secondaryAccentColor }}
                      />
                    </div>
                    <p className="text-xs font-bold text-primary truncate">{preset.name}</p>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl border border-border bg-surface-alt/40">
                <label className="block text-[11px] font-bold text-text-muted uppercase mb-1.5">
                  Primary Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={previewPrimary}
                    onChange={(e) =>
                      setBranding({
                        ...branding,
                        presetId: 'custom',
                        primaryColor: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-9 h-9 rounded-lg border border-border cursor-pointer p-0.5 bg-white shrink-0"
                  />
                  <input
                    type="text"
                    value={branding.primaryColor || ''}
                    onChange={(e) =>
                      setBranding({
                        ...branding,
                        presetId: 'custom',
                        primaryColor: e.target.value,
                      })
                    }
                    className="input min-h-[36px] text-xs font-mono uppercase px-2"
                    maxLength={7}
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl border border-border bg-surface-alt/40">
                <label className="block text-[11px] font-bold text-text-muted uppercase mb-1.5">
                  Action / Accent
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={previewAccent}
                    onChange={(e) =>
                      setBranding({
                        ...branding,
                        presetId: 'custom',
                        accentColor: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-9 h-9 rounded-lg border border-border cursor-pointer p-0.5 bg-white shrink-0"
                  />
                  <input
                    type="text"
                    value={branding.accentColor || ''}
                    onChange={(e) =>
                      setBranding({
                        ...branding,
                        presetId: 'custom',
                        accentColor: e.target.value,
                      })
                    }
                    className="input min-h-[36px] text-xs font-mono uppercase px-2"
                    maxLength={7}
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl border border-border bg-surface-alt/40">
                <label className="block text-[11px] font-bold text-text-muted uppercase mb-1.5">
                  Highlight Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={previewSecondary}
                    onChange={(e) =>
                      setBranding({
                        ...branding,
                        presetId: 'custom',
                        secondaryAccentColor: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-9 h-9 rounded-lg border border-border cursor-pointer p-0.5 bg-white shrink-0"
                  />
                  <input
                    type="text"
                    value={branding.secondaryAccentColor || ''}
                    onChange={(e) =>
                      setBranding({
                        ...branding,
                        presetId: 'custom',
                        secondaryAccentColor: e.target.value,
                      })
                    }
                    className="input min-h-[36px] text-xs font-mono uppercase px-2"
                    maxLength={7}
                  />
                </div>
              </div>
            </div>

            {/* Live White-Label Preview Card */}
            <div className="rounded-xl border border-border overflow-hidden shadow-sm bg-white">
              <div
                className="px-4 py-3 flex items-center justify-between gap-3"
                style={{ backgroundColor: previewPrimary, color: previewPrimaryText }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-white/95 flex items-center justify-center overflow-hidden shrink-0">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Preview logo" className="w-full h-full object-contain p-0.5" />
                    ) : (
                      <span className="text-xs font-extrabold" style={{ color: previewPrimary }}>
                        {(businessName || 'B').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: previewPrimaryText }}>
                      {businessName || 'Your Business Name'}
                    </p>
                    <p className="text-[10px] opacity-80 truncate" style={{ color: previewPrimaryText }}>
                      {branding.tagline || `${(tenant?.plan || 'micro').toUpperCase()} Edition · Branch Control`}
                    </p>
                  </div>
                </div>
                <span
                  className="px-2.5 py-1 rounded-md text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: previewAccent, color: previewAccentText }}
                >
                  Open POS
                </span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between gap-3 bg-[#F7F9FC] text-xs">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} style={{ color: previewSecondary }} />
                  <span className="font-semibold" style={{ color: previewPrimary }}>
                    Live preview across all branches &amp; receipts
                  </span>
                </div>
                <span className="text-[10px] text-text-muted">
                  Built &amp; managed by Novic Technologies
                </span>
              </div>
            </div>
          </div>
        </div>
      </SettingSection>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 sm:gap-8">
        <SettingSection
          icon={Building}
          title="Business Registration &amp; Billing Contact"
          description="Official URA tax identification and owner alert contacts."
        >
          <SettingItem label="TIN Number" description="Your Uganda Revenue Authority Tax ID.">
            <input
              type="text"
              className="input w-full sm:w-64"
              value={tin}
              onChange={(e) => setTin(e.target.value)}
              placeholder="Enter TIN"
            />
          </SettingItem>
          <SettingItem
            label="Owner WhatsApp / Phone"
            description="Receives automated subscription renewal &amp; expiry reminders."
          >
            <input
              type="tel"
              className="input w-full sm:w-64 font-mono"
              value={ownerPhone}
              onChange={(e) => setOwnerPhone(e.target.value)}
              placeholder="+256 772 123 456"
            />
          </SettingItem>
          <SettingItem
            label="Subscription Pack"
            description="Determines active branches, staff capacity, and platform features."
          >
            <Link
              to="/billing"
              className="btn btn-secondary text-xs whitespace-nowrap"
            >
              {(tenant?.plan || 'micro').toUpperCase()} Pack · Manage
            </Link>
          </SettingItem>
        </SettingSection>

        <SettingSection
          icon={Smartphone}
          title="Payment Methods"
          description="Configure how you receive payments from customers."
        >
          <SettingItem
            label="MTN Mobile Money"
            description={
              prefs.mtnMerchantCode
                ? `Merchant Code: ${prefs.mtnMerchantCode}`
                : 'Accept payments via MoMo Merchant Code.'
            }
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'text-xs font-bold',
                  prefs.mtnMomoEnabled ? 'text-accent' : 'text-text-muted'
                )}
              >
                {prefs.mtnMomoEnabled ? 'Active' : 'Disabled'}
              </span>
              <button
                type="button"
                onClick={() => setShowMtnConfig((v) => !v)}
                className="btn btn-secondary text-xs whitespace-nowrap"
              >
                Configure
              </button>
            </div>
          </SettingItem>
          {showMtnConfig && (
            <div className="p-4 bg-surface-alt/50 rounded-xl space-y-3 border border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary">Enable MTN MoMo</span>
                <ToggleSwitch
                  checked={!!prefs.mtnMomoEnabled}
                  onChange={(next) => setPrefs({ ...prefs, mtnMomoEnabled: next })}
                  label="Enable MTN Mobile Money"
                />
              </div>
              <input
                type="text"
                className="input w-full"
                placeholder="MTN MoMo Merchant Code (optional)"
                value={prefs.mtnMerchantCode || ''}
                onChange={(e) => setPrefs({ ...prefs, mtnMerchantCode: e.target.value })}
              />
            </div>
          )}

          <SettingItem
            label="Airtel Money"
            description={
              prefs.airtelMerchantCode
                ? `Merchant Code: ${prefs.airtelMerchantCode}`
                : 'Accept payments via Airtel Money.'
            }
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'text-xs font-bold',
                  prefs.airtelMoneyEnabled ? 'text-accent' : 'text-text-muted'
                )}
              >
                {prefs.airtelMoneyEnabled ? 'Active' : 'Disabled'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPrefs({ ...prefs, airtelMoneyEnabled: !prefs.airtelMoneyEnabled });
                  setShowAirtelConfig(true);
                }}
                className="btn btn-secondary text-xs whitespace-nowrap"
              >
                {prefs.airtelMoneyEnabled ? 'Configure' : 'Enable'}
              </button>
            </div>
          </SettingItem>
          {showAirtelConfig && (
            <div className="p-4 bg-surface-alt/50 rounded-xl space-y-3 border border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary">Enable Airtel Money</span>
                <ToggleSwitch
                  checked={!!prefs.airtelMoneyEnabled}
                  onChange={(next) => setPrefs({ ...prefs, airtelMoneyEnabled: next })}
                  label="Enable Airtel Money"
                />
              </div>
              <input
                type="text"
                className="input w-full"
                placeholder="Airtel Money Merchant Code (optional)"
                value={prefs.airtelMerchantCode || ''}
                onChange={(e) => setPrefs({ ...prefs, airtelMerchantCode: e.target.value })}
              />
            </div>
          )}
        </SettingSection>

        <SettingSection
          icon={Printer}
          title="Receipt Settings"
          description="Customize your printed and digital receipts."
        >
          <SettingItem
            label="Thermal Printer"
            description={
              prefs.thermalPrinterName
                ? `Configured: ${prefs.thermalPrinterName}`
                : 'Set your preferred Bluetooth/USB ESC/POS printer.'
            }
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!tenant) return;
                  const result = await printViaThermalSerial(
                    {
                      id: 'test-print',
                      tenantId: tenant.id,
                      reference: 'TEST-001',
                      userId: user?.uid || 'test',
                      items: [
                        {
                          productId: 'sample',
                          name: 'ESC/POS Thermal Printer Test',
                          quantity: 1,
                          price: 1000,
                          total: 1000,
                        },
                      ],
                      subtotal: 1000,
                      discount: 0,
                      taxAmount: 0,
                      total: 1000,
                      paymentMethod: 'Cash',
                      status: 'completed',
                      createdAt: new Date().toISOString(),
                    },
                    {
                      ...tenant,
                      name: businessName || tenant.name,
                      tin: tin || tenant.tin,
                      branding,
                    }
                  );
                  toast.success(
                    result.mode === 'serial'
                      ? 'Sent test receipt to USB/Serial thermal printer'
                      : 'Opened browser print preview for receipt'
                  );
                }}
                className="btn btn-secondary text-xs whitespace-nowrap"
              >
                Test Print
              </button>
              <button
                type="button"
                onClick={() => setShowPrinterInput((v) => !v)}
                className="btn btn-secondary text-xs whitespace-nowrap"
              >
                {prefs.thermalPrinterName ? 'Edit Printer' : 'Connect Printer'}
              </button>
            </div>
          </SettingItem>
          {showPrinterInput && (
            <div className="space-y-3">
              <input
                type="text"
                className="input w-full"
                placeholder="e.g. Epson TM-T20III or 80mm USB Thermal"
                value={prefs.thermalPrinterName || ''}
                onChange={(e) => setPrefs({ ...prefs, thermalPrinterName: e.target.value })}
              />
            </div>
          )}

          <SettingItem
            label="WhatsApp Receipts"
            description="Include customer receipt summary for quick sharing."
          >
            <ToggleSwitch
              checked={!!prefs.whatsappReceipts}
              onChange={(next) => setPrefs({ ...prefs, whatsappReceipts: next })}
              label="Toggle WhatsApp Receipts"
            />
          </SettingItem>

          <SettingItem label="Receipt Footer Note" description="Custom message printed below totals.">
            <input
              type="text"
              className="input w-full sm:w-64"
              placeholder="Thank you for your business!"
              value={prefs.receiptFooter || ''}
              onChange={(e) => setPrefs({ ...prefs, receiptFooter: e.target.value })}
            />
          </SettingItem>

          <SettingItem
            label="POS VAT / Tax Calculation"
            description="Apply Uganda URA VAT (default 18%) to POS checkout & receipts."
          >
            <ToggleSwitch
              checked={!!prefs.taxEnabled}
              onChange={(next) => setPrefs({ ...prefs, taxEnabled: next })}
              label="Enable POS VAT Calculation"
            />
          </SettingItem>

          {prefs.taxEnabled && (
            <div className="p-4 bg-surface-alt/50 rounded-xl space-y-3 border border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-primary">VAT Rate (%)</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step="0.5"
                  className="input w-full sm:w-32 font-mono tabular-nums"
                  value={prefs.taxRate ?? 18}
                  onChange={(e) =>
                    setPrefs({ ...prefs, taxRate: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-primary block">Tax-Inclusive Pricing</span>
                  <span className="text-[11px] text-text-muted">
                    When enabled, shelf prices already include VAT; when off, VAT adds at checkout.
                  </span>
                </div>
                <ToggleSwitch
                  checked={prefs.taxInclusive ?? true}
                  onChange={(next) => setPrefs({ ...prefs, taxInclusive: next })}
                  label="Toggle Tax-Inclusive Pricing"
                />
              </div>
            </div>
          )}
        </SettingSection>

        <SettingSection
          icon={Shield}
          title="Security & Roles"
          description="Manage user permissions and account security."
        >
          <SettingItem
            label="Two-Factor Auth"
            description="Require 2FA policy for admin account access."
          >
            <ToggleSwitch
              checked={!!prefs.twoFactorRequired}
              onChange={(next) => setPrefs({ ...prefs, twoFactorRequired: next })}
              label="Toggle Two-Factor Policy"
            />
          </SettingItem>
          <SettingItem label="Staff PINs" description="Enable quick POS switch for cashiers.">
            <ToggleSwitch
              checked={!!prefs.staffPinsEnabled}
              onChange={(next) => setPrefs({ ...prefs, staffPinsEnabled: next })}
              label="Toggle Staff PINs"
            />
          </SettingItem>
        </SettingSection>
        <SettingSection
          icon={UserCheck}
          title="Your Account &amp; Verification"
          description="Manage your signed-in profile, email verification, and password security."
          className="xl:col-span-2"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-bold text-primary mb-1">Full Name</label>
              <input
                type="text"
                className="input w-full"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-primary mb-1">Personal Phone</label>
              <input
                type="tel"
                className="input w-full font-mono"
                placeholder="0772 123 456"
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isSavingProfile}
                onClick={handleSaveAccountProfile}
                className="btn btn-secondary text-xs min-h-[42px] px-4 whitespace-nowrap"
              >
                {isSavingProfile ? 'Updating...' : 'Update My Profile'}
              </button>
              {user?.email && (
                <button
                  type="button"
                  onClick={() => resetPassword(user.email)}
                  className="btn btn-secondary text-xs min-h-[42px] px-4 whitespace-nowrap"
                >
                  Reset Password
                </button>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              <Mail size={16} className={isEmailVerified ? 'text-accent' : 'text-accent-alt'} />
              <div>
                <p className="font-bold text-primary">
                  {user?.email || 'No email'} ·{' '}
                  <span className={isEmailVerified ? 'text-accent' : 'text-accent-alt'}>
                    {isEmailVerified ? 'Email Verified' : 'Email Unverified'}
                  </span>
                </p>
                <p className="text-text-muted">
                  {isEmailVerified
                    ? 'Your account email is verified for full platform access.'
                    : 'Verify your email address to secure account recovery and elevated privileges.'}
                </p>
              </div>
            </div>
            {!isEmailVerified && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={resendVerificationEmail}
                  className="btn btn-secondary text-xs py-2 px-3 min-h-[36px] whitespace-nowrap"
                >
                  Send Verification Email
                </button>
                <button
                  type="button"
                  onClick={refreshAuthSession}
                  className="btn btn-primary text-xs py-2 px-3 min-h-[36px] gap-1.5 whitespace-nowrap"
                >
                  <RefreshCw size={13} />
                  Refresh Status
                </button>
              </div>
            )}
          </div>
        </SettingSection>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isSaving || !isAdmin}
          className="btn btn-primary px-8 py-3 gap-2 whitespace-nowrap"
        >
          <Check size={18} />
          {isSaving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>
    </form>

    {isAdmin && (
      <div className="mt-8 card p-6 sm:p-8 border border-danger/30 bg-danger/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-danger/10 text-danger rounded-xl shrink-0">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-danger">Danger Zone · Delete Account &amp; Workspace</h3>
              <p className="text-sm text-text-secondary mt-1 max-w-2xl">
                Permanently erase your admin account and every record belonging to{' '}
                <strong>{tenant?.name || 'your workspace'}</strong> — including all branches,
                inventory products, sales, customers, suppliers, expenses, payroll runs, staff accounts,
                invitations, and audit logs. This action cannot be undone.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setDeleteConfirmText('');
              setDeletePassword('');
              setDeleteError(null);
              setShowDeleteModal(true);
            }}
            className="btn bg-danger text-white hover:bg-danger/90 px-5 py-2.5 text-sm font-bold gap-2 whitespace-nowrap shrink-0"
          >
            <Trash2 size={16} />
            Delete Account
          </button>
        </div>
      </div>
    )}

    {showDeleteModal && isAdmin && (
      <div className="fixed inset-0 bg-primary/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-danger/25">
          <div className="p-5 bg-danger text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={20} />
              <h3 className="font-bold text-lg text-white">Permanent Workspace Deletion</h3>
            </div>
            <button
              type="button"
              disabled={isDeletingAccount}
              onClick={() => setShowDeleteModal(false)}
              className="p-1 hover:bg-white/15 rounded-lg"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleConfirmDeleteAccount} className="p-6 space-y-4">
            <div className="p-3.5 rounded-lg bg-danger/5 border border-danger/20 text-xs text-danger space-y-1">
              <p className="font-bold">All data for {tenant?.name} will be wiped permanently:</p>
              <p>
                Products, sales receipts, customer &amp; supplier ledgers, branches, staff accounts,
                invites, billing history, and your login credentials will all be erased from the system.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs font-medium">
                {deleteError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-primary mb-1.5">
                Type <span className="font-mono text-danger">{requiredDeleteKeyword}</span> to confirm
              </label>
              <input
                type="text"
                className="input w-full"
                placeholder={requiredDeleteKeyword}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                disabled={isDeletingAccount}
                required
              />
            </div>

            {usesPasswordAuth ? (
              <div>
                <label className="block text-xs font-bold text-primary mb-1.5">
                  Current Password
                </label>
                <input
                  type="password"
                  className="input w-full"
                  placeholder="Enter your password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  disabled={isDeletingAccount}
                  required
                />
              </div>
            ) : (
              <p className="text-xs text-text-muted">
                After clicking delete, you will be asked to confirm via your Google sign-in window.
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={() => setShowDeleteModal(false)}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isDeletingAccount ||
                  deleteConfirmText.trim() !== requiredDeleteKeyword ||
                  (usesPasswordAuth && !deletePassword)
                }
                className="btn bg-danger text-white hover:bg-danger/90 flex-1 font-bold disabled:opacity-50"
              >
                {isDeletingAccount ? 'Deleting Everything...' : 'Permanently Delete'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
}
