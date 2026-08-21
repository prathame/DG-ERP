/**
 * Email settings — SMTP config + template editor + send log.
 * Lives inside the Communication settings tab.
 */
import { useEffect, useState } from 'react';
import { fetchApi } from '../../api';

interface EmailSettings {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string | null;
  hasPassword: boolean;
  fromName: string | null;
  fromEmail: string | null;
  useSsl: boolean;
  invoiceSubject: string;
  invoiceTemplate: string;
}

interface EmailLog {
  id: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  status: 'sent' | 'failed';
  error_message: string | null;
  sent_at: string;
}

const PLACEHOLDERS = [
  { key: '{customerName}', label: 'Customer Name' },
  { key: '{invoiceNumber}', label: 'Invoice No' },
  { key: '{amount}', label: 'Amount' },
  { key: '{date}', label: 'Date' },
  { key: '{businessName}', label: 'Business Name' },
];

const PRESET_HOSTS = [
  { label: 'Gmail', host: 'smtp.gmail.com', port: 587, ssl: false },
  { label: 'Gmail (SSL)', host: 'smtp.gmail.com', port: 465, ssl: true },
  { label: 'Outlook', host: 'smtp.office365.com', port: 587, ssl: false },
  { label: 'Yahoo', host: 'smtp.mail.yahoo.com', port: 587, ssl: false },
  { label: 'Custom', host: '', port: 587, ssl: false },
];

type Tab = 'smtp' | 'template' | 'log';

export function EmailSettingsPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('smtp');
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [log, setLog] = useState<EmailLog[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchApi<EmailSettings>('/email/settings')
      .then(setSettings)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === 'log') {
      setLoadingLog(true);
      fetchApi<EmailLog[]>('/email/log')
        .then(setLog)
        .catch(() => {})
        .finally(() => setLoadingLog(false));
    }
  }, [activeTab]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const saved = await fetchApi<EmailSettings>('/email/settings', {
        method: 'PUT',
        body: JSON.stringify({ ...settings, smtpPassword: password || undefined }),
      });
      setSettings(saved);
      setPassword('');
      setSaveMsg('Saved ✅');
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      setSaveMsg(`Error: ${err instanceof Error ? err.message : 'Failed to save'}`);
    } finally {
      setSaving(false);
    }
  };

  const testEmail = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await fetchApi('/email/test', { method: 'POST', body: JSON.stringify({}) });
      setTestResult({ ok: true, msg: 'Test email sent to your inbox ✅' });
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const applyPreset = (preset: (typeof PRESET_HOSTS)[0]) => {
    if (!settings || !preset.host) return;
    setSettings(s => (s ? { ...s, smtpHost: preset.host, smtpPort: preset.port, useSsl: preset.ssl } : s));
  };

  const insertPlaceholder = (key: string) => {
    if (!settings) return;
    const ta = document.getElementById('email-template') as HTMLTextAreaElement | null;
    if (!ta) {
      setSettings(s => (s ? { ...s, invoiceTemplate: (s.invoiceTemplate || '') + key } : s));
      return;
    }
    const start = ta.selectionStart,
      end = ta.selectionEnd;
    const next = (settings.invoiceTemplate || '').slice(0, start) + key + (settings.invoiceTemplate || '').slice(end);
    setSettings(s => (s ? { ...s, invoiceTemplate: next } : s));
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + key.length, start + key.length);
    }, 0);
  };

  if (!settings) return <div className="text-sm text-gray-400 py-4">Loading…</div>;

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {(
          [
            ['smtp', 'SMTP Setup'],
            ['template', 'Template'],
            ['log', 'Log'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* SMTP tab */}
      {activeTab === 'smtp' && (
        <div className="space-y-4">
          {/* Quick presets */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Quick setup:</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_HOSTS.filter(p => p.host).map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-orange-300 hover:text-orange-600 bg-white"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">SMTP Host</label>
              <input
                value={settings.smtpHost}
                onChange={e => setSettings(s => (s ? { ...s, smtpHost: e.target.value } : s))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="smtp.gmail.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Port</label>
              <input
                type="number"
                value={settings.smtpPort}
                onChange={e => setSettings(s => (s ? { ...s, smtpPort: Number(e.target.value) } : s))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email (Gmail/SMTP user)</label>
              <input
                value={settings.smtpUser || ''}
                onChange={e => setSettings(s => (s ? { ...s, smtpUser: e.target.value } : s))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="you@gmail.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                App Password {settings.hasPassword && <span className="text-green-600">●saved</span>}
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder={settings.hasPassword ? '(leave blank to keep)' : 'Gmail App Password'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From Name</label>
              <input
                value={settings.fromName || ''}
                onChange={e => setSettings(s => (s ? { ...s, fromName: e.target.value } : s))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="Your Business Name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From Email</label>
              <input
                value={settings.fromEmail || ''}
                onChange={e => setSettings(s => (s ? { ...s, fromEmail: e.target.value } : s))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="invoices@yourbusiness.com"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.useSsl}
              onChange={e => setSettings(s => (s ? { ...s, useSsl: e.target.checked } : s))}
              className="accent-orange-500"
            />
            Use SSL (port 465)
          </label>

          <div className="bg-blue-50 rounded-lg px-4 py-3 text-xs text-blue-700">
            <strong>Gmail setup:</strong> Enable 2-Step Verification → Google Account → Security → App Passwords →
            generate one for "Mail". Use that as the password above.
          </div>

          {testResult && (
            <p className={`text-sm font-medium ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
              {testResult.msg}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? 'Saving…' : saveMsg || 'Save Settings'}
            </button>
            <button
              type="button"
              onClick={testEmail}
              disabled={testing || !settings.fromEmail}
              className="py-2.5 px-4 rounded-lg border border-gray-200 text-sm font-medium hover:border-orange-300 disabled:opacity-50"
            >
              {testing ? 'Sending…' : 'Send Test'}
            </button>
          </div>
        </div>
      )}

      {/* Template tab */}
      {activeTab === 'template' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
            <input
              value={settings.invoiceSubject}
              onChange={e => setSettings(s => (s ? { ...s, invoiceSubject: e.target.value } : s))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email Body</label>
            <textarea
              id="email-template"
              rows={8}
              value={settings.invoiceTemplate}
              onChange={e => setSettings(s => (s ? { ...s, invoiceTemplate: e.target.value } : s))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none font-mono"
            />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Insert placeholder:</p>
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDERS.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => insertPlaceholder(p.key)}
                  className="text-xs px-2 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full py-2.5 rounded-lg bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? 'Saving…' : saveMsg || 'Save Template'}
          </button>
        </div>
      )}

      {/* Log tab */}
      {activeTab === 'log' && (
        <div>
          {loadingLog ? (
            <p className="text-xs text-gray-400 py-4">Loading…</p>
          ) : log.length === 0 ? (
            <p className="text-xs text-gray-400 py-4">No emails sent yet</p>
          ) : (
            <div className="space-y-1.5">
              {log.map(e => (
                <div
                  key={e.id}
                  className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2 gap-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-gray-800">{e.to_name ? `${e.to_name} <${e.to_email}>` : e.to_email}</p>
                    <p className="text-gray-400 truncate">{e.subject}</p>
                    {e.error_message && <p className="text-red-500 truncate">{e.error_message}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`font-medium ${e.status === 'sent' ? 'text-green-600' : 'text-red-600'}`}>
                      {e.status === 'sent' ? '✅' : '❌'}
                    </span>
                    <p className="text-gray-400 mt-0.5">{new Date(e.sent_at).toLocaleDateString('en-IN')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
