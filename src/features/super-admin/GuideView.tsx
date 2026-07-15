import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Monitor, Cloud, Terminal, CheckSquare, Copy, Check, ChevronDown, ChevronRight, Users, Rocket } from 'lucide-react';
import { cn } from '../../lib/utils';

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-xs overflow-x-auto font-mono leading-relaxed">
        {code}
      </pre>
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="absolute top-3 right-3 p-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-gray-300" />}
      </button>
    </div>
  );
}

function Section({ title, icon: Icon, color, children, defaultOpen = false }: {
  title: string; icon: typeof Monitor; color: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-xl", color)}>
            <Icon size={18} className="text-white" />
          </div>
          <h3 className="font-bold text-lg">{title}</h3>
        </div>
        {open ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
      </button>
      {open && <div className="px-6 pb-6 space-y-4 border-t border-gray-50 pt-4">{children}</div>}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="w-7 h-7 rounded-full bg-brand text-white text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</div>
      <div className="flex-1 space-y-2">
        <p className="font-semibold text-gray-800">{title}</p>
        {children}
      </div>
    </div>
  );
}

function Checklist({ items }: { items: string[] }) {
  const [checked, setChecked] = useState<number[]>([]);
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} onClick={() => setChecked(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
          className="flex items-center gap-3 cursor-pointer group">
          <div className={cn("w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
            checked.includes(i) ? "bg-emerald-500 border-emerald-500" : "border-gray-300 group-hover:border-emerald-400")}>
            {checked.includes(i) && <Check size={11} className="text-white" strokeWidth={3} />}
          </div>
          <span className={cn("text-sm", checked.includes(i) ? "line-through text-gray-400" : "text-gray-700")}>{item}</span>
        </div>
      ))}
      {checked.length === items.length && items.length > 0 && (
        <p className="text-emerald-600 text-sm font-bold mt-2">✅ All checks passed!</p>
      )}
    </div>
  );
}

export function GuideView() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><BookOpen size={22} /> Developer Guide</h2>
        <p className="text-sm text-gray-500 mt-1">Setup, testing, and deployment instructions for all three Dhandho delivery modes</p>
      </div>

      {/* Onboard Cloud Customer */}
      <Section title="Onboard a Cloud Customer" icon={Rocket} color="bg-brand" defaultOpen>
        <p className="text-sm text-gray-600">Customer wants cloud access — pays monthly, you host everything, works from any browser or the Cloud Electron app.</p>

        <div className="space-y-4">
          <Step n={1} title="Create the tenant">
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 text-gray-700">
              <p>Super Admin → <strong>Tenants</strong> → Create Tenant</p>
              <p>Fill: Company name, Admin email, Phone, Plan, Business type</p>
              <p>Click <strong>Create Tenant</strong></p>
            </div>
          </Step>

          <Step n={2} title="Share credentials with customer">
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 text-gray-700">
              <p>After creation, a credentials screen appears with:</p>
              <p>• Login URL: <code className="bg-gray-200 px-1 rounded">{window.location.origin}/their-slug</code></p>
              <p>• Admin email + temporary password</p>
              <p>Click <strong>Share via WhatsApp</strong> — sends everything in one message</p>
            </div>
          </Step>

          <Step n={3} title="Customer logs in">
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 text-gray-700">
              <p>Customer opens the link → logs in → prompted to change password</p>
              <p>They can also download the <strong>Cloud Electron app</strong> for a desktop experience</p>
            </div>
          </Step>

          <Step n={4} title="Configure for their business">
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 text-gray-700">
              <p>Tenants → Click tenant → <strong>Tab Customization</strong></p>
              <p>• Rename tabs (e.g. "Distribution" → "Sales")</p>
              <p>• Toggle features on/off (Warranty, Rewards, etc.)</p>
              <p>• Business type controls which tabs are visible by default</p>
            </div>
          </Step>

          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <p className="text-sm text-emerald-800 font-medium">✅ Cloud customer is live. Updates are instant — just deploy code changes.</p>
          </div>
        </div>
      </Section>

      {/* Onboard On-Prem Customer */}
      <Section title="Onboard an On-Prem Customer" icon={Users} color="bg-purple-500" defaultOpen>
        <p className="text-sm text-gray-600">Customer wants software on their own PC — pays one-time license fee, data stays with them, works offline.</p>

        <div className="space-y-4">
          <Step n={1} title="Issue a license key">
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 text-gray-700">
              <p>Super Admin → <strong>On-Prem</strong> → Issue License</p>
              <p>Fill:</p>
              <p>• <strong>Company name</strong> — Shah Seeds Pvt Ltd</p>
              <p>• <strong>Business type</strong> — manufacturer / dealer / retail / service</p>
              <p>• <strong>Admin email</strong> — optional, for password reset</p>
              <p>• <strong>Max users</strong> — 1, 3, 5, 10, unlimited</p>
              <p>• <strong>Valid until</strong> — license expiry date</p>
              <p>Click <strong>Generate License</strong></p>
            </div>
          </Step>

          <Step n={2} title="Send installer + license key to customer">
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 text-gray-700">
              <p>After generating, click <strong>Share via WhatsApp</strong></p>
              <p>Customer receives:</p>
              <p>• Download link for installer (.exe or .dmg)</p>
              <p>• Their license key: <code className="bg-gray-200 px-1 rounded font-mono">DG-XXXX-XXXX-XXXX</code></p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
              ⚠️ Windows may show a security warning on install (Unknown Publisher). Tell customer: click "More info" → "Run anyway". This is normal until you buy a code signing certificate.
            </div>
          </Step>

          <Step n={3} title="Customer installs and activates">
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 text-gray-700">
              <p>1. Customer runs the installer (.exe on Windows)</p>
              <p>2. App opens → first-run wizard appears</p>
              <p>3. Enters license key → <strong>company name loads automatically</strong></p>
              <p>4. Sets their admin password</p>
              <p>5. Clicks "Activate & Start" → full app opens</p>
            </div>
          </Step>

          <Step n={4} title="Verify in super admin">
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 text-gray-700">
              <p>On-Prem tab → their installation shows as <strong>● Online</strong></p>
              <p>You can see: app version, last seen, active users</p>
              <p>From here: suspend, revoke, push updates, transfer license</p>
            </div>
          </Step>

          <Step n={5} title="For multiple employees on the same network (LAN)">
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 text-gray-700">
              <p>The app runs as a local server on the owner's PC</p>
              <p>Other PCs in the office open their browser and go to:</p>
              <p><code className="bg-gray-200 px-1.5 py-0.5 rounded font-mono">http://192.168.1.X:3001/company-slug</code></p>
              <p>(Replace X with the owner's PC local IP)</p>
              <p>Show the LAN URL in: Settings → Profile → "Local Network URL"</p>
            </div>
          </Step>

          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <p className="text-sm text-emerald-800 font-medium">✅ On-prem customer is live. They own their data. You manage license remotely when they're online.</p>
          </div>
        </div>
      </Section>

      {/* Cloud Electron */}
      <Section title="Cloud Electron App — Testing" icon={Cloud} color="bg-blue-500">
        <p className="text-sm text-gray-600">A thin desktop wrapper (~20MB) that opens the cloud app in a dedicated window. No database or server needed.</p>

        <Step n={1} title="Compile Electron TypeScript">
          <CodeBlock code="npx tsc -p tsconfig.electron.json" />
        </Step>

        <Step n={2} title="Run the Cloud Electron app">
          <CodeBlock code="npx electron electron/cloud/main.js" />
          <p className="text-xs text-gray-500">A window opens showing the cloud app. Login, features — everything works identically to the browser version.</p>
        </Step>

        <Step n={3} title="Build installer for distribution">
          <CodeBlock code={`# Windows (.exe)\nnpm run build:electron:cloud:win\n\n# Mac (.dmg)\nnpm run build:electron:cloud:mac\n\n# Output: dist-electron/cloud/`} />
        </Step>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-sm text-blue-800 font-medium">ℹ️ Cloud Electron does not need a license key — uses existing Dhandho login.</p>
        </div>
      </Section>

      {/* On-Prem Electron */}
      <Section title="On-Prem Electron App — Testing" icon={Monitor} color="bg-purple-500">
        <p className="text-sm text-gray-600">Full local stack (~180MB). Embedded PostgreSQL + Express server runs on customer's PC. Works offline.</p>

        <Step n={1} title="Create a test license in super admin">
          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 font-mono text-gray-700">
            <p>1. Super Admin → On-Prem tab</p>
            <p>2. Click "Issue License"</p>
            <p>3. Fill: Company name, Business type, Max users, Valid until</p>
            <p>4. Click "Generate License"</p>
            <p>5. <strong>Copy the key</strong> — DG-XXXX-XXXX-XXXX</p>
          </div>
        </Step>

        <Step n={2} title="Restart backend (picks up new DB table)">
          <CodeBlock code={`# Kill existing server\nlsof -ti:3001 | xargs kill -9\n\n# Restart\nnpm run server`} />
        </Step>

        <Step n={3} title="Compile + run on-prem app">
          <CodeBlock code={`npx tsc -p tsconfig.electron.json\nDEPLOYMENT_MODE=onprem npx electron electron/onprem/main.js`} />
        </Step>

        <Step n={4} title="Complete first-run wizard">
          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 text-gray-700">
            <p>1. Wizard appears — enter the license key from Step 1</p>
            <p>2. Set admin password (min 8 characters)</p>
            <p>3. Click <strong>"Activate & Start"</strong></p>
            <p>4. App opens with full ERP</p>
          </div>
        </Step>

        <Step n={5} title="Build installer for distribution">
          <CodeBlock code={`# Windows (.exe ~180MB)\nnpm run build:electron:onprem:win\n\n# Mac (.dmg ~180MB)\nnpm run build:electron:onprem:mac\n\n# Output: dist-electron/onprem/`} />
        </Step>

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-sm text-amber-800 font-medium">⚠️ On-prem installer is large (~180MB) because it bundles PostgreSQL binaries. Normal — same approach as Tally.</p>
        </div>
      </Section>

      {/* Online Status Indicator */}
      <Section title="Online Status Indicator — Testing" icon={Terminal} color="bg-emerald-500">
        <p className="text-sm text-gray-600">The sidebar indicator shows connection status in on-prem mode. Test it in the browser without Electron.</p>

        <Step n={1} title="Enable on-prem mode in frontend">
          <p className="text-xs text-gray-500 mb-2">Add to <code className="bg-gray-100 px-1.5 py-0.5 rounded">.env</code> in project root:</p>
          <CodeBlock code="VITE_DEPLOYMENT_MODE=onprem" />
        </Step>

        <Step n={2} title="Restart dev server">
          <CodeBlock code="npm run dev" />
          <p className="text-xs text-gray-500">Bottom of sidebar shows <strong>● Online · Synced</strong> or <strong>⚪ Offline</strong></p>
        </Step>

        <Step n={3} title="Remove after testing">
          <p className="text-xs text-gray-500">Delete or comment out <code className="bg-gray-100 px-1.5 py-0.5 rounded">VITE_DEPLOYMENT_MODE=onprem</code> from <code className="bg-gray-100 px-1.5 py-0.5 rounded">.env</code> — cloud users must never see this indicator.</p>
        </Step>
      </Section>

      {/* License Management */}
      <Section title="License Management — How-To" icon={Monitor} color="bg-orange-500">
        <div className="space-y-4">
          <div>
            <h4 className="font-bold text-sm mb-2">Issue a license</h4>
            <p className="text-sm text-gray-600">On-Prem tab → Issue License → fill details → Generate. Share key + download link via WhatsApp button.</p>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-2">Suspend / Revoke</h4>
            <p className="text-sm text-gray-600">Click the license row → Manage → Suspend (temporary) or Revoke (permanent). App shows blocked message on next heartbeat (up to 60 min).</p>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-2">Transfer to new PC</h4>
            <p className="text-sm text-gray-600">Click license row → Transfer License (clears machine binding). Customer runs app on new PC → enters same key → activates.</p>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-2">Online / Offline status</h4>
            <p className="text-sm text-gray-600">● Online = heartbeat received in last 70 minutes. ⚪ Offline = no heartbeat. App works fine offline — status just reflects connectivity.</p>
          </div>
        </div>
      </Section>

      {/* Test Checklist */}
      <Section title="Testing Checklist" icon={CheckSquare} color="bg-gray-600" defaultOpen>
        <p className="text-sm text-gray-600 mb-2">Click each item to mark as done. Verify before shipping any release.</p>

        <div className="space-y-5">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Cloud Electron</p>
            <Checklist items={[
              "Cloud Electron window opens without errors",
              "Login with existing account works",
              "All tabs navigate correctly",
              "Window closes cleanly",
              "External links (WhatsApp, etc.) open in browser, not in app",
            ]} />
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase mb-2">On-Prem Electron</p>
            <Checklist items={[
              "Wizard appears on first launch",
              "Invalid license key shows clear error",
              "Valid license key loads company name automatically",
              "Admin password set → app opens",
              "App appears in super admin On-Prem tab as Online",
              "Second launch skips wizard (license cached)",
              "Suspend license → blocked message shows within 60 min",
              "Transfer license → clear machine → activate on different machine",
              "Offline mode: app works fully without internet",
              "Heartbeat auto-fires every 60 min when online",
            ]} />
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Super Admin — On-Prem Tab</p>
            <Checklist items={[
              "Issue license → key generated → WhatsApp share works",
              "Online/offline status updates correctly",
              "App version shown after first heartbeat",
              "Last seen timestamp updates",
              "Suspend → status changes to suspended",
              "Revoke → license deleted from list",
            ]} />
          </div>
        </div>
      </Section>

      {/* Build Commands Quick Reference */}
      <Section title="Build Commands — Quick Reference" icon={Terminal} color="bg-gray-700">
        <div className="space-y-3">
          {[
            { label: "Cloud Electron — Windows", cmd: "npm run build:electron:cloud:win" },
            { label: "Cloud Electron — Mac", cmd: "npm run build:electron:cloud:mac" },
            { label: "On-Prem Electron — Windows", cmd: "npm run build:electron:onprem:win" },
            { label: "On-Prem Electron — Mac", cmd: "npm run build:electron:onprem:mac" },
            { label: "Both platforms (cloud)", cmd: "npm run build:electron:cloud" },
            { label: "Both platforms (on-prem)", cmd: "npm run build:electron:onprem" },
          ].map(({ label, cmd }) => (
            <div key={label} className="flex items-center gap-4">
              <span className="text-sm text-gray-500 w-48 shrink-0">{label}</span>
              <CodeBlock code={cmd} />
            </div>
          ))}
        </div>
        <div className="bg-gray-50 rounded-xl p-4 mt-2">
          <p className="text-xs text-gray-500">Output: <code className="bg-gray-200 px-1 rounded">dist-electron/cloud/</code> and <code className="bg-gray-200 px-1 rounded">dist-electron/onprem/</code> — upload the installer files to GitHub Releases for auto-update distribution.</p>
        </div>
      </Section>
    </motion.div>
  );
}
