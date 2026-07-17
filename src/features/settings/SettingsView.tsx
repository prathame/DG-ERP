import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LogIn,
  LogOut,
  UserPlus,
  Phone,
  MapPin,
  Building2,
  UserCog,
  Shield,
  Download,
  MessageCircle,
  FileText,
  Settings,
  Upload,
  Palette,
  Eye,
  FileCheck,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import { cn, openPrintWindow, printBillInWindow, PRINT_POPUP_BLOCKED } from '../../lib/utils';
import { api } from '../../api';
import { PasswordInput } from '../../components/ui/PasswordInput';
import type { Vendor, BillSettings } from '../../types';
import { useTranslation, LANGUAGES } from '../../i18n';
import { useToast, LoadingSpinner } from '../../components/ui';
import { session } from '../../lib/session';
import { generateSalesInvoiceHtml } from '../../lib/billTemplates';
import { useConfirm } from '../../hooks/useConfirm';
import { isServiceMobileMode } from '../../platforms/service-mobile/mode';
import { exportLocalBackupNow, restoreFromLocalBackupFile } from '../../platforms/service-mobile';

const ADMIN_ROLES = ['Admin', 'Super Admin'];
const serviceMobile = isServiceMobileMode();

const BILL_DEFAULTS: BillSettings = {
  logoBase64: null,
  primaryColor: '#F27D26',
  tagline: null,
  invoicePrefix: null,
  challanPrefix: null,
  bankAccountName: null,
  bankAccountNumber: null,
  bankName: null,
  bankBranch: null,
  bankIfsc: null,
  bankUpiId: null,
  termsAndConditions: null,
  signatoryName: null,
  signatoryDesignation: null,
  signatureBase64: null,
  showRewards: true,
  showBarcode: true,
  showWarranty: true,
  footerText: 'Powered by Dhandho Management',
};

// ── GST API Settings — E-Invoice (IRN) + E-Way Bill ──────────────────────────
function GstApiSection() {
  const { toast } = useToast();
  const [form, setForm] = useState({
    mode: 'mock',
    gstin: '',
    username: '',
    password: '',
    clientId: '',
    clientSecret: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    api.gst
      .getSettings()
      .then(s =>
        setForm(f => ({
          ...f,
          mode: s.mode || 'mock',
          gstin: s.gstin || '',
          username: s.username || '',
          clientId: s.clientId || '',
        })),
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.gst.saveSettings(form);
      toast('GST API settings saved', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const MODE_OPTIONS = [
    { value: 'mock', label: 'Mock (Dev)', desc: 'Instant fake IRNs — no credentials needed. Use during development.' },
    {
      value: 'sandbox',
      label: 'Sandbox (NIC)',
      desc: 'NIC sandbox. Use test credentials from einv-apisandbox.nic.in.',
    },
    {
      value: 'production',
      label: 'Production (Live)',
      desc: 'Real IRNs filed with government. Use your actual NIC portal credentials.',
    },
  ];

  const modeColor =
    form.mode === 'production'
      ? 'text-red-600 bg-red-50 border-red-200'
      : form.mode === 'sandbox'
        ? 'text-amber-600 bg-amber-50 border-amber-200'
        : 'text-gray-600 bg-gray-50 border-gray-200';

  if (loading) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <FileCheck size={20} /> GST API — E-Invoice &amp; E-Way Bill
        </h3>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${modeColor}`}>
          {MODE_OPTIONS.find(m => m.value === form.mode)?.label}
        </span>
      </div>
      <div className="p-6 space-y-5">
        <p className="text-sm text-gray-500">
          Connect to NIC's IRP portal to generate E-Invoice IRNs and E-Way Bills directly from distribution challans. No
          credentials needed in <strong>Mock</strong> mode — switch to <strong>Sandbox</strong> once you receive NIC
          test credentials.
        </p>

        {/* Mode dropdown */}
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase block mb-1">API Mode</label>
          <div className="relative">
            <select
              value={form.mode}
              onChange={e => setForm({ ...form, mode: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl appearance-none focus:ring-2 focus:ring-brand bg-white pr-10"
            >
              {MODE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{MODE_OPTIONS.find(m => m.value === form.mode)?.desc}</p>
        </div>

        {/* Credentials — hidden in mock mode */}
        <div
          className={`space-y-4 transition-opacity ${form.mode === 'mock' ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Seller GSTIN</label>
              <input
                value={form.gstin}
                onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl font-mono focus:ring-2 focus:ring-brand"
                placeholder="24AAAPZ9999G1ZI"
                maxLength={15}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">NIC Username</label>
              <input
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                placeholder="From NIC portal"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Client ID</label>
              <input
                value={form.clientId}
                onChange={e => setForm({ ...form, clientId: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl font-mono focus:ring-2 focus:ring-brand"
                placeholder="l7xx..."
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">
                Password{' '}
                <button
                  type="button"
                  onClick={() => setShowSecrets(!showSecrets)}
                  className="text-brand hover:underline normal-case font-normal"
                >
                  {showSecrets ? 'hide' : 'show'}
                </button>
              </label>
              <input
                type={showSecrets ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                placeholder="Leave blank to keep existing"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Client Secret</label>
              <input
                type={showSecrets ? 'text' : 'password'}
                value={form.clientSecret}
                onChange={e => setForm({ ...form, clientSecret: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl font-mono focus:ring-2 focus:ring-brand"
                placeholder="Leave blank to keep existing"
              />
            </div>
          </div>

          {form.mode === 'sandbox' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <strong>Sandbox setup:</strong> Register at{' '}
              <a
                href="https://einv-apisandbox.nic.in"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                einv-apisandbox.nic.in
              </a>{' '}
              with your PAN → get Client ID + Secret → enter above. Approval takes ~7 days. Default sandbox OTP:{' '}
              <code className="font-mono bg-amber-100 px-1 rounded">575757</code>
            </div>
          )}
          {form.mode === 'production' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
              <strong>Production mode:</strong> IRNs generated here are filed with the government. Ensure credentials
              are correct before saving.
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-brand hover:bg-brand-dark text-white rounded-xl font-bold transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save GST API Settings'}
        </button>
      </div>
    </div>
  );
}

function BillCustomizationSection() {
  const { toast } = useToast();
  const [form, setForm] = useState<BillSettings>(BILL_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banks, setBanks] = useState<
    { id: string; name: string; accountNumber?: string; bankName?: string; branch?: string; ifscCode?: string }[]
  >([]);

  useEffect(() => {
    api.settings
      .getBillSettings()
      .then(s => setForm({ ...BILL_DEFAULTS, ...s }))
      .catch(() => {})
      .finally(() => setLoading(false));
    api.banks
      .list()
      .then(setBanks)
      .catch(() => {});
  }, []);

  const handleFile = (field: 'logoBase64' | 'signatureBase64') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      toast('Image must be under 500KB', 'error');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast('Please select an image file', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm(p => ({ ...p, [field]: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (form.primaryColor && !/^#[0-9a-fA-F]{6}$/.test(form.primaryColor)) {
      toast('Invalid color format', 'error');
      return;
    }
    setSaving(true);
    try {
      const saved = await api.settings.updateBillSettings(form);
      setForm({ ...BILL_DEFAULTS, ...saved });
      toast('Bill settings saved', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = () => {
    const sampleBill = {
      id: 'SAMPLE-001',
      barcode: 'ABC12345',
      productName: 'Sample Product',
      productDescription: 'Product description',
      hsnCode: '8413',
      warrantyMonths: 12,
      salePrice: 10000,
      gstRate: 18,
      customerName: 'John Doe',
      customerPhone: '9876543210',
      customerEmail: 'john@example.com',
      purchaseDate: new Date().toISOString().split('T')[0],
      rewardPointsEarned: 50,
      company: {
        name: (() => {
          try {
            return (session.getUser() || {}).companyName || 'Your Company';
          } catch {
            return 'Your Company';
          }
        })(),
        phone: '9999999999',
        address: '123 Main St, City',
        gstNumber: '27AABCU9603R1ZM',
      },
      vendor: { name: 'Sample Vendor', phone: '8888888888', address: '456 Vendor St' },
      warranty: { status: 'Active', activationDate: new Date().toISOString().split('T')[0], expiryDate: '2027-06-25' },
      billSettings: form,
    };
    const html = generateSalesInvoiceHtml(sampleBill as never);
    const win = openPrintWindow('Preparing preview…');
    if (!win) {
      toast(PRINT_POPUP_BLOCKED, 'error');
      return;
    }
    printBillInWindow(win, html, 'Bill Preview', { autoPrint: false });
  };

  const toggleField = (field: 'showRewards' | 'showBarcode' | 'showWarranty') => (
    <button
      type="button"
      onClick={() => setForm(p => ({ ...p, [field]: !p[field] }))}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors',
        form[field] ? 'bg-green-500' : 'bg-gray-300',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md transform transition-transform',
          form[field] ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );

  if (loading)
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <LoadingSpinner />
      </div>
    );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <FileText size={20} /> Bill Customization
        </h3>
        <button
          type="button"
          onClick={handlePreview}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand border border-brand rounded-lg hover:bg-brand/5"
        >
          <Eye size={14} /> Preview
        </button>
      </div>
      <div className="p-6 space-y-6">
        {/* Branding */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-3">Branding</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Company Logo</label>
              <div className="flex items-center gap-3">
                {form.logoBase64 ? (
                  <img
                    src={form.logoBase64}
                    alt="Logo"
                    className="w-14 h-14 rounded-lg object-contain border border-gray-200"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                    <Upload size={20} />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="px-3 py-1.5 text-xs font-bold bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 text-center">
                    Choose File
                    <input
                      id="settings-field-1"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFile('logoBase64')}
                    />
                  </label>
                  {form.logoBase64 && (
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, logoBase64: null }))}
                      className="text-xs text-rose-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">PNG/JPG, max 500KB</p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Bill Color</label>
              <div className="flex items-center gap-2">
                <input
                  id="settings-field-2"
                  type="color"
                  value={form.primaryColor}
                  onChange={e => setForm(p => ({ ...p, primaryColor: e.target.value }))}
                  className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0"
                />
                <input
                  id="settings-field-3"
                  value={form.primaryColor}
                  onChange={e => setForm(p => ({ ...p, primaryColor: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-brand"
                  maxLength={7}
                />
              </div>
            </div>
            <div>
              <label htmlFor="settings-field-4" className="text-xs font-bold text-gray-500 block mb-1">
                Tagline / Subtitle
              </label>
              <input
                id="settings-field-4"
                value={form.tagline || ''}
                onChange={e => setForm(p => ({ ...p, tagline: e.target.value || null }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
                placeholder="e.g. Manufacturers of Premium Pumps"
              />
            </div>
          </div>
        </div>

        {/* Invoice Numbering */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-3">Invoice Numbering</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="settings-field-5" className="text-xs font-bold text-gray-500 block mb-1">
                Invoice Prefix
              </label>
              <input
                id="settings-field-5"
                value={form.invoicePrefix || ''}
                onChange={e => setForm(p => ({ ...p, invoicePrefix: e.target.value || null }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
                placeholder="e.g. SPL-INV-"
                maxLength={20}
              />
            </div>
            <div>
              <label htmlFor="settings-field-6" className="text-xs font-bold text-gray-500 block mb-1">
                Challan Prefix
              </label>
              <input
                id="settings-field-6"
                value={form.challanPrefix || ''}
                onChange={e => setForm(p => ({ ...p, challanPrefix: e.target.value || null }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
                placeholder="e.g. SPL-CH-"
                maxLength={20}
              />
            </div>
          </div>
        </div>

        {/* Bank Details */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-3">Bank Details (printed on bill)</p>
          {banks.length > 0 ? (
            <div className="space-y-3">
              <select
                value={form.bankAccountNumber || ''}
                onChange={e => {
                  const b = banks.find(x => x.accountNumber === e.target.value);
                  if (b)
                    setForm(p => ({
                      ...p,
                      bankAccountName: b.name,
                      bankAccountNumber: b.accountNumber || null,
                      bankName: b.bankName || null,
                      bankBranch: b.branch || null,
                      bankIfsc: b.ifscCode || null,
                    }));
                  else
                    setForm(p => ({
                      ...p,
                      bankAccountName: null,
                      bankAccountNumber: null,
                      bankName: null,
                      bankBranch: null,
                      bankIfsc: null,
                    }));
                }}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand bg-white"
              >
                <option value="">Select bank account for bill</option>
                {banks.map(b => (
                  <option key={b.id} value={b.accountNumber || b.id}>
                    {b.name} — {b.bankName || 'N/A'} {b.accountNumber ? `(${b.accountNumber})` : ''}
                  </option>
                ))}
              </select>
              {form.bankAccountName && (
                <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
                  <p>
                    <span className="text-gray-500">Account:</span> <strong>{form.bankAccountName}</strong>
                  </p>
                  {form.bankAccountNumber && (
                    <p>
                      <span className="text-gray-500">A/C No:</span>{' '}
                      <span className="font-mono">{form.bankAccountNumber}</span>
                    </p>
                  )}
                  {form.bankName && (
                    <p>
                      <span className="text-gray-500">Bank:</span> {form.bankName}
                      {form.bankBranch ? `, ${form.bankBranch}` : ''}
                    </p>
                  )}
                  {form.bankIfsc && (
                    <p>
                      <span className="text-gray-500">IFSC:</span> <span className="font-mono">{form.bankIfsc}</span>
                    </p>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">UPI ID (optional)</label>
                <input
                  value={form.bankUpiId || ''}
                  onChange={e => setForm(p => ({ ...p, bankUpiId: e.target.value || null }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
                  placeholder="company@upi"
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              No banks added yet. Go to Dashboard → Banks to add bank accounts first.
            </p>
          )}
        </div>

        {/* Terms & Conditions */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-3">Terms & Conditions</p>
          <textarea
            value={form.termsAndConditions || ''}
            onChange={e => setForm(p => ({ ...p, termsAndConditions: e.target.value || null }))}
            rows={3}
            maxLength={2000}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
            placeholder="Enter terms & conditions to appear on bills..."
          />
          <p className="text-[10px] text-gray-400 mt-1">{(form.termsAndConditions || '').length}/2000</p>
        </div>

        {/* Authorized Signatory */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-3">Authorized Signatory</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="settings-field-13" className="text-xs font-bold text-gray-500 block mb-1">
                Name
              </label>
              <input
                id="settings-field-13"
                value={form.signatoryName || ''}
                onChange={e => setForm(p => ({ ...p, signatoryName: e.target.value || null }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
                placeholder="Mr. Rajesh Kumar"
              />
            </div>
            <div>
              <label htmlFor="settings-field-14" className="text-xs font-bold text-gray-500 block mb-1">
                Designation
              </label>
              <input
                id="settings-field-14"
                value={form.signatoryDesignation || ''}
                onChange={e => setForm(p => ({ ...p, signatoryDesignation: e.target.value || null }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
                placeholder="Managing Director"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Signature Image</label>
              <div className="flex items-center gap-2">
                {form.signatureBase64 ? (
                  <img src={form.signatureBase64} alt="Signature" className="h-10 rounded border border-gray-200" />
                ) : (
                  <div className="h-10 w-20 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
                    No image
                  </div>
                )}
                <label className="px-2 py-1 text-xs font-bold bg-gray-100 rounded cursor-pointer hover:bg-gray-200">
                  Upload{' '}
                  <input
                    id="settings-field-15"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFile('signatureBase64')}
                  />
                </label>
                {form.signatureBase64 && (
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, signatureBase64: null }))}
                    className="text-xs text-rose-500"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bill Section Toggles */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-3">Bill Sections</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Show Barcode</p>
                <p className="text-xs text-gray-500">Display barcode column on bills</p>
              </div>
              {toggleField('showBarcode')}
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Show Warranty</p>
                <p className="text-xs text-gray-500">Display warranty info on sales invoice</p>
              </div>
              {toggleField('showWarranty')}
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Show Rewards</p>
                <p className="text-xs text-gray-500">Display reward points earned on invoice</p>
              </div>
              {toggleField('showRewards')}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-3">Footer Text</p>
          <input
            id="settings-field-16"
            value={form.footerText}
            onChange={e => setForm(p => ({ ...p, footerText: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
            placeholder="Powered by Dhandho Management"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-brand text-white rounded-xl font-bold hover:bg-brand-dark disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Bill Settings'}
        </button>
      </div>
    </div>
  );
}

const PERMISSION_LABELS: { id: string; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'sales', label: 'Sales Entry' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'quotations', label: 'Quotes & Orders' },
  { id: 'finance', label: 'Finance' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'warranty', label: 'Warranty' },
  { id: 'replacements', label: 'Replacements' },
  { id: 'rewards', label: 'Rewards' },
  { id: 'settings', label: 'Settings' },
];

const ROLE_PRESETS: Record<string, Record<string, string>> = {
  Admin: Object.fromEntries(PERMISSION_LABELS.map(p => [p.id, 'full'])),
  Manager: Object.fromEntries(PERMISSION_LABELS.map(p => [p.id, p.id === 'settings' ? 'view' : 'full'])),
  Staff: Object.fromEntries(PERMISSION_LABELS.map(p => [p.id, 'view'])),
  Warehouse: {
    dashboard: 'view',
    sales: 'hidden',
    distribution: 'print',
    inventory: 'view',
    purchases: 'hidden',
    quotations: 'hidden',
    finance: 'hidden',
    accounts: 'hidden',
    warranty: 'hidden',
    replacements: 'hidden',
    rewards: 'hidden',
    settings: 'hidden',
  },
  Vendor: {
    dashboard: 'view',
    sales: 'hidden',
    distribution: 'view',
    inventory: 'hidden',
    purchases: 'hidden',
    quotations: 'hidden',
    finance: 'view',
    accounts: 'hidden',
    warranty: 'hidden',
    replacements: 'hidden',
    rewards: 'hidden',
    settings: 'hidden',
  },
};

const ACCESS_LEVELS = ['hidden', 'view', 'print', 'full'] as const;

export function SettingsView({
  user,
  onUserChange,
}: {
  user: {
    id: string;
    email: string;
    name: string;
    phone?: string;
    address?: string;
    role?: string;
    companyName?: string;
    autoWhatsapp?: boolean;
  } | null;
  onUserChange: (u: typeof user) => void;
}) {
  const { toast } = useToast();
  const { confirm, ConfirmRenderer } = useConfirm();
  const { t: st, lang, setLang } = useTranslation();
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '', confirmPassword: '' });
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    address: '',
    role: 'Admin',
    companyName: '',
    gstNumber: '',
    defaultGstRate: 18,
  });
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [users, setUsers] = useState<
    { id: string; email: string; name: string; phone?: string; role?: string; permissions?: string[] | null }[]
  >([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editUserTarget, setEditUserTarget] = useState<{
    id: string;
    email: string;
    name: string;
    role?: string;
    permissions?: string[] | null;
    vendorId?: string | null;
  } | null>(null);
  const [addUserForm, setAddUserForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'Staff',
    permissions: { ...ROLE_PRESETS.Staff } as Record<string, string>,
    vendorId: '',
  });
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [editUserForm, setEditUserForm] = useState({
    role: '',
    permissions: {} as Record<string, string>,
    vendorId: '',
  });
  const [userSubmitting, setUserSubmitting] = useState(false);
  const [backupSettings, setBackupSettings] = useState<{
    enabled: boolean;
    frequency: string;
    intervalDays: number;
    lastBackupAt: string | null;
    email: string | null;
  } | null>(null);
  useEffect(() => {
    api.backup
      .settings()
      .then(setBackupSettings)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    // Load phone/address/gst from API — not kept in localStorage after privacy harden
    api.settings
      .getProfile(user.id)
      .then(fresh => {
        setProfileForm({
          name: fresh.name,
          phone: fresh.phone ?? '',
          address: fresh.address ?? '',
          role: fresh.role ?? 'Admin',
          companyName: fresh.companyName ?? '',
          gstNumber: fresh.gstNumber ?? '',
          defaultGstRate: Number(fresh.defaultGstRate) || 18,
        });
        const merged = { ...user, ...fresh };
        session.setUser(merged);
        onUserChange(merged);
      })
      .catch(() => {
        const ux = user as Record<string, unknown>;
        setProfileForm({
          name: user.name,
          phone: user.phone ?? '',
          address: user.address ?? '',
          role: user.role ?? 'Admin',
          companyName: user.companyName ?? '',
          gstNumber: (ux.gstNumber as string) ?? '',
          defaultGstRate: Number(ux.defaultGstRate) || 18,
        });
      });
  }, [user?.id]);

  const isAdmin = user && ADMIN_ROLES.includes(user.role ?? '');
  useEffect(() => {
    if (isAdmin && user) {
      setUsersLoading(true);
      api.admin
        .listUsers(user.id)
        .then(setUsers)
        .catch(() => setUsers([]))
        .finally(() => setUsersLoading(false));
    }
  }, [isAdmin, user?.id]);
  useEffect(() => {
    if (addUserOpen)
      api.vendors
        .list()
        .then(setVendors)
        .catch(() => []);
  }, [addUserOpen]);
  useEffect(() => {
    if (editUserTarget)
      api.vendors
        .list()
        .then(setVendors)
        .catch(() => []);
  }, [editUserTarget]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      const r = await api.auth.login(authForm.email, authForm.password);
      session.setToken(r.token);
      if (r.tenantId) session.setTenantId(r.tenantId);
      if (r.tenantSlug) session.setSlug(r.tenantSlug);
      const u = {
        id: r.id,
        email: r.email,
        name: r.name,
        role: r.role,
        companyName: r.companyName,
        vendorId: r.vendorId,
        autoWhatsapp: r.autoWhatsapp,
        barcodeSystemEnabled: (r as Record<string, unknown>).barcodeSystemEnabled,
        multiLanguageEnabled: (r as Record<string, unknown>).multiLanguageEnabled,
        vendorPortalEnabled: (r as Record<string, unknown>).vendorPortalEnabled,
        tabConfig: (r as Record<string, unknown>).tabConfig,
      };
      session.setUser(u);
      onUserChange(u);
      // Hydrate PII fields from profile endpoint (not returned on login)
      api.settings
        .getProfile(r.id)
        .then(fresh => {
          const merged = { ...u, ...fresh };
          session.setUser(merged);
          onUserChange(merged);
        })
        .catch(() => {});
      setAuthForm({ email: '', password: '', name: '', confirmPassword: '' });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (authForm.password !== authForm.confirmPassword) {
      setAuthError('Passwords do not match');
      return;
    }
    setAuthSubmitting(true);
    try {
      const result = await api.auth.signup({ email: authForm.email, password: authForm.password, name: authForm.name });
      session.setToken(result.token);
      if (result.tenantId) session.setTenantId(result.tenantId);
      const existing = session.getUser() || {};
      const merged = { ...existing, ...result.user };
      session.setUser(merged);
      onUserChange(merged);
      setAuthForm({ email: '', password: '', name: '', confirmPassword: '' });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    session.clearAll();
    onUserChange(null);
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileSubmitting(true);
    try {
      const u = await api.settings.updateProfile(user.id, profileForm);
      const existing = session.getUser() || {};
      const merged = { ...existing, ...u };
      session.setUser(merged);
      onUserChange(merged);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (addUserForm.role === 'Vendor' && !addUserForm.vendorId) {
      toast('Select vendor for Vendor role', 'error');
      return;
    }
    setUserSubmitting(true);
    try {
      await api.admin.createUser(user.id, {
        ...addUserForm,
        permissions: addUserForm.permissions,
        vendorId: addUserForm.role === 'Vendor' ? addUserForm.vendorId : undefined,
      });
      setAddUserOpen(false);
      setAddUserForm({
        email: '',
        password: '',
        name: '',
        role: 'Staff',
        permissions: { ...ROLE_PRESETS.Staff },
        vendorId: '',
      });
      api.admin.listUsers(user.id).then(setUsers);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create user', 'error');
    } finally {
      setUserSubmitting(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editUserTarget) return;
    if (editUserForm.role === 'Vendor' && !editUserForm.vendorId) {
      toast('Select vendor for Vendor role', 'error');
      return;
    }
    setUserSubmitting(true);
    try {
      await api.admin.updateUser(user.id, editUserTarget.id, {
        role: editUserForm.role,
        permissions: editUserForm.permissions,
        vendorId: editUserForm.role === 'Vendor' ? editUserForm.vendorId : undefined,
      });
      setEditUserTarget(null);
      api.admin.listUsers(user.id).then(setUsers);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update user', 'error');
    } finally {
      setUserSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">Settings</h2>
        <p className="text-sm text-gray-500">Manage your account and preferences</p>
      </div>

      {/* Auth Section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <LogIn size={20} /> Login & Account
          </h3>
        </div>
        <div className="p-6">
          {user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-brand to-[#FFB347] flex items-center justify-center text-white font-bold text-xl">
                  {user.name.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-lg">{user.name}</p>
                  <p className="text-sm text-gray-500">{user.email}</p>
                  <p className="text-xs text-amber-600 font-medium">{user.role ?? 'Admin'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 border border-rose-200 text-rose-600 rounded-xl font-medium hover:bg-rose-50 transition-colors"
              >
                <LogOut size={18} /> Logout
              </button>
            </div>
          ) : (
            <div className="max-w-md space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError('');
                  }}
                  className={cn(
                    'flex-1 py-2 rounded-lg font-medium transition-colors',
                    authMode === 'login' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                  )}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthError('');
                  }}
                  className={cn(
                    'flex-1 py-2 rounded-lg font-medium transition-colors',
                    authMode === 'signup' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                  )}
                >
                  Sign Up
                </button>
              </div>
              <form onSubmit={authMode === 'login' ? handleLogin : handleSignup} className="space-y-4">
                {authMode === 'signup' && (
                  <div>
                    <label htmlFor="settings-field-17" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                      Name
                    </label>
                    <input
                      id="settings-field-17"
                      required
                      value={authForm.name}
                      onChange={e => setAuthForm({ ...authForm, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                      placeholder="Full name"
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="settings-field-18" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                    Email
                  </label>
                  <input
                    id="settings-field-18"
                    type="email"
                    required
                    value={authForm.email}
                    onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="settings-field-19" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                    Password
                  </label>
                  <input
                    id="settings-field-19"
                    type="password"
                    required
                    value={authForm.password}
                    onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    placeholder="••••••••"
                  />
                </div>
                {authMode === 'signup' && (
                  <div>
                    <label htmlFor="settings-field-20" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                      Confirm Password
                    </label>
                    <input
                      id="settings-field-20"
                      type="password"
                      required
                      value={authForm.confirmPassword}
                      onChange={e => setAuthForm({ ...authForm, confirmPassword: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                      placeholder="••••••••"
                    />
                  </div>
                )}
                {authError && <p className="text-sm text-rose-600">{authError}</p>}
                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full py-3 bg-brand text-white rounded-xl font-bold"
                >
                  {authSubmitting ? 'Please wait...' : authMode === 'login' ? 'Login' : 'Sign Up'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Personal Info & Contact - only when logged in */}
      {user && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <UserPlus size={20} /> Personal Information
              </h3>
            </div>
            <form onSubmit={handleProfileSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="settings-field-21" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                    Full Name
                  </label>
                  <input
                    id="settings-field-21"
                    value={profileForm.name}
                    onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label htmlFor="settings-field-22" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                    Email
                  </label>
                  <input
                    id="settings-field-22"
                    type="email"
                    value={user.email}
                    disabled
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                  />
                </div>
                <div>
                  <label htmlFor="settings-field-23" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                    Role
                  </label>
                  <input
                    id="settings-field-23"
                    type="text"
                    value={profileForm.role}
                    disabled
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={profileSubmitting}
                className="px-6 py-2 bg-brand text-white rounded-xl font-bold"
              >
                {profileSubmitting ? 'Saving...' : 'Save'}
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Phone size={20} /> Contact Details
              </h3>
            </div>
            <form onSubmit={handleProfileSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-1 flex items-center gap-1">
                    <Phone size={12} /> Phone
                  </label>
                  <input
                    id="settings-field-24"
                    type="tel"
                    value={profileForm.phone}
                    onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-1 flex items-center gap-1">
                    <MapPin size={12} /> Address
                  </label>
                  <input
                    id="settings-field-25"
                    value={profileForm.address}
                    onChange={e => setProfileForm({ ...profileForm, address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    placeholder="Street, City, State"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={profileSubmitting}
                className="px-6 py-2 bg-brand text-white rounded-xl font-bold"
              >
                {profileSubmitting ? 'Saving...' : 'Save'}
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Building2 size={20} /> Company & Other
              </h3>
            </div>
            <form onSubmit={handleProfileSave} className="p-6 space-y-4">
              <div>
                <label htmlFor="settings-field-26" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                  Company / Business Name
                </label>
                <input
                  id="settings-field-26"
                  value={profileForm.companyName}
                  onChange={e => setProfileForm({ ...profileForm, companyName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                  placeholder="Your Company Name"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="settings-field-27" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                    GST Number (GSTIN)
                  </label>
                  <input
                    id="settings-field-27"
                    value={profileForm.gstNumber ?? ''}
                    onChange={e => setProfileForm({ ...profileForm, gstNumber: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand font-mono"
                    placeholder="e.g. 27AABCU9603R1ZM"
                    maxLength={15}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Default GST Rate (%)</label>
                  <div className="flex gap-2 mt-1">
                    {[3, 5, 12, 18, 28].map(rate => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setProfileForm({ ...profileForm, defaultGstRate: rate })}
                        className={cn(
                          'px-3 py-2 rounded-lg text-sm font-bold border transition-colors',
                          profileForm.defaultGstRate === rate
                            ? 'bg-brand text-white border-brand'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-brand',
                        )}
                      >
                        {rate}%
                      </button>
                    ))}
                    <input
                      id="settings-field-28"
                      type="number"
                      min={0}
                      max={100}
                      value={profileForm.defaultGstRate || ''}
                      onChange={e =>
                        setProfileForm({
                          ...profileForm,
                          defaultGstRate: e.target.value === '' ? 0 : Number(e.target.value),
                        })
                      }
                      className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-brand"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">CGST + SGST will split equally (e.g. 18% = 9% + 9%)</p>
                </div>
              </div>
              <button
                type="submit"
                disabled={profileSubmitting}
                className="px-6 py-2 bg-brand text-white rounded-xl font-bold"
              >
                {profileSubmitting ? 'Saving...' : 'Save'}
              </button>
            </form>
          </div>

          {/* Appearance */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Settings size={20} /> {st('settings.appearance')}
              </h3>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{st('settings.darkMode')}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{st('settings.darkModeDesc')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const html = document.documentElement;
                    const nowDark = html.classList.toggle('dark');
                    localStorage.setItem('dhandho_theme', nowDark ? 'dark' : 'light');
                    setIsDarkMode(nowDark);
                  }}
                  className={cn(
                    'relative w-14 h-7 rounded-full transition-colors',
                    isDarkMode ? 'bg-brand' : 'bg-gray-300',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform',
                      isDarkMode ? 'translate-x-7' : 'translate-x-0.5',
                    )}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{st('settings.language')}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{st('settings.languageDesc')}</p>
                </div>
                <div className="flex gap-2">
                  {LANGUAGES.map(l => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => setLang(l.code)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm font-bold border transition-colors',
                        lang === l.code
                          ? 'bg-brand text-white border-brand'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-brand',
                      )}
                    >
                      {l.nativeLabel}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Shield size={20} /> Change Password
              </h3>
            </div>
            <form
              onSubmit={async e => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const current = (form.elements.namedItem('currentPassword') as HTMLInputElement).value;
                const newPw = (form.elements.namedItem('newPassword') as HTMLInputElement).value;
                const confirm = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;
                if (newPw !== confirm) {
                  toast('New passwords do not match', 'error');
                  return;
                }
                if (newPw.length < 8) {
                  toast('Password must be at least 8 characters', 'error');
                  return;
                }
                try {
                  await api.settings.changePassword(user!.id, current, newPw);
                  toast('Password changed successfully', 'success');
                  form.reset();
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Failed', 'error');
                }
              }}
              className="p-6 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="settings-field-29" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                    Current Password
                  </label>
                  <PasswordInput
                    id="settings-field-29"
                    name="currentPassword"
                    required
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label htmlFor="settings-field-30" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                    New Password
                  </label>
                  <PasswordInput
                    id="settings-field-30"
                    name="newPassword"
                    required
                    minLength={8}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label htmlFor="settings-field-31" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                    Confirm New Password
                  </label>
                  <PasswordInput
                    id="settings-field-31"
                    name="confirmPassword"
                    required
                    minLength={8}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>
              <button type="submit" className="px-6 py-2 bg-brand text-white rounded-xl font-bold">
                Update Password
              </button>
            </form>
          </div>

          {/* Delete my account */}
          <div className="bg-white rounded-2xl border border-rose-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-100">
              <h3 className="font-bold text-lg flex items-center gap-2 text-rose-800">
                <Trash2 size={20} /> Delete Account
              </h3>
            </div>
            <form
              onSubmit={async e => {
                e.preventDefault();
                if (!user) return;
                const form = e.target as HTMLFormElement;
                const password = (form.elements.namedItem('deletePassword') as HTMLInputElement).value;
                if (
                  !(await confirm({
                    title: 'Delete your account?',
                    message: 'Your personal data will be anonymized. This cannot be undone.',
                    confirmLabel: 'Delete account',
                    variant: 'danger',
                  }))
                )
                  return;
                try {
                  await api.settings.deleteAccount(password);
                  session.clearAll();
                  onUserChange(null);
                  toast('Account deleted', 'success');
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Failed to delete account', 'error');
                }
              }}
              className="p-6 space-y-4"
            >
              <p className="text-sm text-gray-600">
                Permanently anonymizes your name, email, phone, and address. Sales history kept for business records is
                not tied to your login after this.
              </p>
              <div className="max-w-sm">
                <label htmlFor="settings-delete-pw" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                  Confirm with password
                </label>
                <PasswordInput
                  id="settings-delete-pw"
                  name="deletePassword"
                  required
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-400"
                />
              </div>
              <button type="submit" className="px-6 py-2 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700">
                Delete my account
              </button>
            </form>
          </div>

          {/* GST API — E-Invoice + E-Way Bill */}
          {isAdmin && <GstApiSection />}

          {/* Bill Customization */}
          {isAdmin && <BillCustomizationSection />}

          {/* WhatsApp Auto-Send */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold text-lg">Notifications</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-3">
                Soft chime when a new important alert appears. You can also mute from the Bell menu.
              </p>
              <button
                type="button"
                onClick={() => {
                  const scope = `${session.getTenantId() || 't'}:${user?.id || 'u'}`;
                  const key = `dg_notif_mute:${scope}`;
                  const muted = localStorage.getItem(key) === '1';
                  localStorage.setItem(key, muted ? '0' : '1');
                  toast(muted ? 'Notification sound on' : 'Notification sound muted', 'success');
                }}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                Toggle notification sound
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <MessageCircle size={20} /> WhatsApp Auto-Send
              </h3>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Automatically send bill via WhatsApp</p>
                  <p className="text-sm text-gray-500 mt-1">
                    When enabled, WhatsApp will open automatically with the bill after each sale is completed. The bill
                    includes a shareable link the customer can open to view/download.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!user) return;
                    const newVal = !user.autoWhatsapp;
                    api.settings
                      .updateProfile(user.id, { autoWhatsapp: newVal } as Record<string, unknown>)
                      .then(u => {
                        const updated = { ...user, ...u, autoWhatsapp: newVal };
                        session.setUser(updated);
                        onUserChange(updated);
                        toast(newVal ? 'Auto WhatsApp enabled' : 'Auto WhatsApp disabled', 'success');
                      })
                      .catch(err => toast(err instanceof Error ? err.message : 'Failed', 'error'));
                  }}
                  className={cn(
                    'relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors',
                    user?.autoWhatsapp ? 'bg-green-500' : 'bg-gray-300',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md transform transition-transform',
                      user?.autoWhatsapp ? 'translate-x-5' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <span
                  className={cn(
                    'text-xs font-bold px-2.5 py-1 rounded-full',
                    user?.autoWhatsapp ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
                  )}
                >
                  {user?.autoWhatsapp ? 'ON — Bills sent automatically' : 'OFF — Manual send only'}
                </span>
              </div>
            </div>
          </div>

          {/* Data Management - Admin only */}
          {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Download size={20} /> Data Management
                </h3>
              </div>
              <div className="p-6 space-y-4">
                {serviceMobile && (
                  <p className="text-sm text-gray-500 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                    Backups stay on <strong>your phone</strong> (and your Gmail if you send them). Dhando does not store
                    your business data in the cloud.
                  </p>
                )}
                <div className="flex flex-wrap gap-4 items-center">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if (serviceMobile) {
                          const { filename } = await exportLocalBackupNow({
                            openMail: Boolean(backupSettings?.email),
                          });
                          toast(`Backup saved: ${filename}`, 'success');
                          setBackupSettings(prev =>
                            prev ? { ...prev, lastBackupAt: new Date().toISOString() } : prev,
                          );
                          return;
                        }
                        const r = await fetch('/api/backup', {
                          headers: {
                            Authorization: `Bearer ${session.getToken()}`,
                            'X-Tenant-ID': session.getTenantId() || '',
                          },
                        });
                        if (!r.ok) throw new Error('Backup failed');
                        const blob = await r.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast('Backup downloaded', 'success');
                        setBackupSettings(prev => (prev ? { ...prev, lastBackupAt: new Date().toISOString() } : prev));
                      } catch (e) {
                        toast((e as Error).message, 'error');
                      }
                    }}
                    className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700"
                  >
                    <Download size={18} /> {serviceMobile ? 'Save Backup File' : 'Download Backup Now'}
                  </button>
                  <label className="flex items-center gap-2 px-5 py-3 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 cursor-pointer">
                    <Upload size={18} /> Restore from Backup
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (
                          !(await confirm({
                            title: 'Restore Backup',
                            message: 'This will REPLACE all your current data with the backup. This cannot be undone.',
                            confirmLabel: 'Restore',
                            variant: 'danger',
                          }))
                        ) {
                          e.target.value = '';
                          return;
                        }
                        try {
                          if (serviceMobile) {
                            const r = await restoreFromLocalBackupFile(file);
                            if (!r.ok) throw new Error(r.error || 'Restore failed');
                            toast('Backup restored — reloading…', 'success');
                            setTimeout(() => window.location.reload(), 600);
                            return;
                          }
                          const text = await file.text();
                          const data = JSON.parse(text);
                          const r = await fetch('/api/backup/restore', {
                            method: 'POST',
                            headers: {
                              Authorization: `Bearer ${session.getToken()}`,
                              'X-Tenant-ID': session.getTenantId() || '',
                              'Content-Type': 'application/json',
                            },
                            body: text,
                          });
                          const result = await r.json();
                          if (!r.ok) throw new Error(result.error || 'Restore failed');
                          toast(
                            `Restored ${result.restored} records from ${data._meta?.companyName || 'backup'}`,
                            'success',
                          );
                        } catch (err) {
                          toast((err as Error).message, 'error');
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {backupSettings?.lastBackupAt && (
                    <span className="text-xs text-gray-400">
                      Last backup: {new Date(backupSettings.lastBackupAt).toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center gap-3 mb-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={backupSettings?.enabled ?? false}
                        onChange={async e => {
                          const enabled = e.target.checked;
                          const freq = backupSettings?.frequency || (serviceMobile ? 'daily' : 'weekly');
                          try {
                            const r = await api.backup.updateSettings({
                              enabled,
                              frequency: freq,
                              intervalDays: backupSettings?.intervalDays,
                              email: backupSettings?.email || undefined,
                            });
                            setBackupSettings(prev => ({
                              enabled: r.enabled,
                              frequency: r.frequency,
                              intervalDays: r.intervalDays,
                              email: r.email,
                              lastBackupAt: prev?.lastBackupAt ?? null,
                            }));
                            toast(enabled ? 'Auto backup enabled' : 'Auto backup disabled', 'success');
                          } catch (err) {
                            toast((err as Error).message, 'error');
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-brand after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                    <div>
                      <span className="text-sm font-bold">Auto Backup</span>
                      {serviceMobile && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Saves a file on this phone (daily / weekly / monthly). Optional Gmail opens your mail app — we
                          never upload your data.
                        </p>
                      )}
                    </div>
                  </div>
                  {backupSettings?.enabled && (
                    <div className="flex flex-wrap gap-3 items-end ml-14">
                      <div>
                        <label className="text-xs font-bold text-gray-400 block mb-1">Frequency</label>
                        <select
                          value={
                            serviceMobile && !['daily', 'weekly', 'monthly'].includes(backupSettings.frequency)
                              ? 'daily'
                              : backupSettings.frequency
                          }
                          onChange={async e => {
                            const freq = e.target.value;
                            const days =
                              freq === 'daily'
                                ? 1
                                : freq === 'weekly'
                                  ? 7
                                  : freq === 'monthly'
                                    ? 30
                                    : backupSettings.intervalDays;
                            try {
                              const r = await api.backup.updateSettings({
                                enabled: true,
                                frequency: freq,
                                intervalDays: days,
                                email: backupSettings.email || undefined,
                              });
                              setBackupSettings(prev => ({
                                enabled: r.enabled,
                                frequency: r.frequency,
                                intervalDays: r.intervalDays,
                                email: r.email,
                                lastBackupAt: prev?.lastBackupAt ?? null,
                              }));
                              toast('Backup frequency updated', 'success');
                            } catch (err) {
                              toast((err as Error).message, 'error');
                            }
                          }}
                          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          {!serviceMobile && <option value="custom">Custom</option>}
                        </select>
                      </div>
                      {!serviceMobile && backupSettings.frequency === 'custom' && (
                        <div>
                          <label className="text-xs font-bold text-gray-400 block mb-1">Every N days</label>
                          <input
                            type="number"
                            min={1}
                            max={365}
                            value={backupSettings.intervalDays}
                            onBlur={async e => {
                              const days = Math.max(1, parseInt(e.target.value) || 7);
                              try {
                                const r = await api.backup.updateSettings({
                                  enabled: true,
                                  frequency: 'custom',
                                  intervalDays: days,
                                  email: backupSettings.email || undefined,
                                });
                                setBackupSettings(prev => ({
                                  enabled: r.enabled,
                                  frequency: r.frequency,
                                  intervalDays: r.intervalDays,
                                  email: r.email,
                                  lastBackupAt: prev?.lastBackupAt ?? null,
                                }));
                              } catch {}
                            }}
                            onChange={e =>
                              setBackupSettings(prev =>
                                prev ? { ...prev, intervalDays: parseInt(e.target.value) || 7 } : prev,
                              )
                            }
                            className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          />
                        </div>
                      )}
                      <div>
                        <label className="text-xs font-bold text-gray-400 block mb-1">
                          {serviceMobile ? 'Your Gmail (optional — opens mail app)' : 'Email backup to (optional)'}
                        </label>
                        <input
                          type="email"
                          value={backupSettings.email || ''}
                          placeholder="you@gmail.com"
                          onBlur={async e => {
                            try {
                              const r = await api.backup.updateSettings({
                                enabled: true,
                                frequency: backupSettings.frequency,
                                intervalDays: backupSettings.intervalDays,
                                email: e.target.value || undefined,
                              });
                              setBackupSettings(prev => ({
                                enabled: r.enabled,
                                frequency: r.frequency,
                                intervalDays: r.intervalDays,
                                email: r.email,
                                lastBackupAt: prev?.lastBackupAt ?? null,
                              }));
                            } catch {}
                          }}
                          onChange={e => setBackupSettings(prev => (prev ? { ...prev, email: e.target.value } : prev))}
                          className="w-60 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* User Management - Admin only */}
          {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <UserCog size={20} /> User Management
                </h3>
                <button
                  type="button"
                  onClick={() => setAddUserOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"
                >
                  <UserPlus size={16} /> Add User
                </button>
              </div>
              <div className="p-6">
                {usersLoading ? (
                  <div className="py-8">
                    <LoadingSpinner />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-50">
                          <th className="px-4 py-3">Name</th>
                          <th className="px-4 py-3">Email</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {users.map(u => (
                          <tr key={u.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{u.name}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                                {u.role ?? 'Staff'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {u.id === user?.id ? (
                                <span className="text-xs text-gray-400">You</span>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditUserTarget(u);
                                      setEditUserForm({
                                        role: u.role ?? 'Staff',
                                        permissions: (u.permissions &&
                                        typeof u.permissions === 'object' &&
                                        !Array.isArray(u.permissions)
                                          ? u.permissions
                                          : ROLE_PRESETS[u.role ?? 'Staff'] || ROLE_PRESETS.Staff) as Record<
                                          string,
                                          string
                                        >,
                                        vendorId: ((u as Record<string, unknown>).vendorId as string) ?? '',
                                      });
                                    }}
                                    className="text-sm font-bold text-brand hover:underline flex items-center gap-1"
                                  >
                                    <Shield size={14} /> Permissions
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (
                                        !(await confirm({
                                          title: 'Delete user?',
                                          message: `${u.name} will be anonymized and cannot log in.`,
                                          confirmLabel: 'Delete',
                                          variant: 'danger',
                                        }))
                                      )
                                        return;
                                      try {
                                        await api.admin.deleteUser(u.id);
                                        setUsers(prev => prev.filter(x => x.id !== u.id));
                                        toast('User deleted', 'success');
                                      } catch (err) {
                                        toast(err instanceof Error ? err.message : 'Failed', 'error');
                                      }
                                    }}
                                    className="text-sm font-bold text-rose-600 hover:underline flex items-center gap-1"
                                  >
                                    <Trash2 size={14} /> Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add User Modal */}
      <AnimatePresence>
        {addUserOpen && user && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setAddUserOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6">
                <h3 className="text-xl font-bold mb-4">Create New User</h3>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div>
                    <label htmlFor="settings-field-32" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                      Name
                    </label>
                    <input
                      id="settings-field-32"
                      required
                      value={addUserForm.name}
                      onChange={e => setAddUserForm({ ...addUserForm, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label htmlFor="settings-field-33" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                      Email
                    </label>
                    <input
                      id="settings-field-33"
                      type="email"
                      required
                      value={addUserForm.email}
                      onChange={e => setAddUserForm({ ...addUserForm, email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label htmlFor="settings-field-34" className="text-xs font-bold text-gray-400 uppercase block mb-1">
                      Password
                    </label>
                    <input
                      id="settings-field-34"
                      type="password"
                      required
                      minLength={8}
                      value={addUserForm.password}
                      onChange={e => setAddUserForm({ ...addUserForm, password: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                      placeholder="Min 8 characters"
                    />
                    {addUserForm.password && addUserForm.password.length < 8 && (
                      <p className="text-[10px] text-rose-500 mt-0.5">Password must be at least 8 characters</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Role (preset)</label>
                    <select
                      value={addUserForm.role}
                      onChange={e => {
                        const r = e.target.value;
                        setAddUserForm({
                          ...addUserForm,
                          role: r,
                          permissions: { ...(ROLE_PRESETS[r] || ROLE_PRESETS.Staff) },
                        });
                      }}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                    >
                      <option>Admin</option>
                      <option>Manager</option>
                      <option>Staff</option>
                      <option>Warehouse</option>
                      <option>Vendor</option>
                    </select>
                  </div>
                  {addUserForm.role === 'Vendor' && (
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Vendor (required)</label>
                      <select
                        required
                        value={addUserForm.vendorId}
                        onChange={e => setAddUserForm({ ...addUserForm, vendorId: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                      >
                        <option value="">Select vendor</option>
                        {vendors.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Tab Permissions</label>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase">
                            <th className="text-left px-3 py-2">Module</th>
                            <th className="text-center px-2 py-2">Hidden</th>
                            <th className="text-center px-2 py-2">View</th>
                            <th className="text-center px-2 py-2">Print</th>
                            <th className="text-center px-2 py-2">Full</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {PERMISSION_LABELS.map(p => (
                            <tr key={p.id} className="hover:bg-gray-50">
                              <td className="px-3 py-1.5 text-sm">{p.label}</td>
                              {ACCESS_LEVELS.map(level => (
                                <td key={level} className="text-center px-2 py-1.5">
                                  <input
                                    id="settings-field-35"
                                    type="radio"
                                    name={`perm-add-${p.id}`}
                                    checked={(addUserForm.permissions[p.id] || 'hidden') === level}
                                    onChange={() =>
                                      setAddUserForm({
                                        ...addUserForm,
                                        permissions: { ...addUserForm.permissions, [p.id]: level },
                                      })
                                    }
                                    className="text-brand"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setAddUserOpen(false)}
                      className="flex-1 py-2 border rounded-lg font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={userSubmitting}
                      className="flex-1 py-2 bg-brand text-white rounded-lg font-bold"
                    >
                      {userSubmitting ? 'Creating...' : 'Create User'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
        {editUserTarget && user && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setEditUserTarget(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6">
                <h3 className="text-xl font-bold mb-4">Edit Permissions: {editUserTarget.name}</h3>
                <form onSubmit={handleEditUser} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Role (preset)</label>
                    <select
                      value={editUserForm.role}
                      onChange={e => {
                        const r = e.target.value;
                        setEditUserForm({
                          ...editUserForm,
                          role: r,
                          permissions: { ...(ROLE_PRESETS[r] || ROLE_PRESETS.Staff) },
                        });
                      }}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                    >
                      <option>Admin</option>
                      <option>Manager</option>
                      <option>Staff</option>
                      <option>Warehouse</option>
                      <option>Vendor</option>
                    </select>
                  </div>
                  {editUserForm.role === 'Vendor' && (
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Vendor (required)</label>
                      <select
                        required
                        value={editUserForm.vendorId}
                        onChange={e => setEditUserForm({ ...editUserForm, vendorId: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                      >
                        <option value="">Select vendor</option>
                        {vendors.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Tab Permissions</label>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase">
                            <th className="text-left px-3 py-2">Module</th>
                            <th className="text-center px-2 py-2">Hidden</th>
                            <th className="text-center px-2 py-2">View</th>
                            <th className="text-center px-2 py-2">Print</th>
                            <th className="text-center px-2 py-2">Full</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {PERMISSION_LABELS.map(p => (
                            <tr key={p.id} className="hover:bg-gray-50">
                              <td className="px-3 py-1.5 text-sm">{p.label}</td>
                              {ACCESS_LEVELS.map(level => (
                                <td key={level} className="text-center px-2 py-1.5">
                                  <input
                                    id="settings-field-36"
                                    type="radio"
                                    name={`perm-edit-${p.id}`}
                                    checked={(editUserForm.permissions[p.id] || 'hidden') === level}
                                    onChange={() =>
                                      setEditUserForm({
                                        ...editUserForm,
                                        permissions: { ...editUserForm.permissions, [p.id]: level },
                                      })
                                    }
                                    className="text-brand"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditUserTarget(null)}
                      className="flex-1 py-2 border rounded-lg font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={userSubmitting}
                      className="flex-1 py-2 bg-brand text-white rounded-lg font-bold"
                    >
                      {userSubmitting ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {!user && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <p className="text-amber-800 font-medium">
            Sign in to view and edit your personal information, contact details and company settings.
          </p>
        </div>
      )}
      <ConfirmRenderer />
    </motion.div>
  );
}
