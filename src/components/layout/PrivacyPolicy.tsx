import { ArrowLeft } from 'lucide-react';

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A]">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand mb-8"><ArrowLeft size={16} /> Back to Home</a>
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: June 2026</p>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">1. Introduction</h2>
            <p>Dhandho Management ("we", "our", "us") operates the Dhandho platform. This Privacy Policy explains how we collect, use, store, and protect your information when you use our services.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">2. Information We Collect</h2>
            <p className="mb-2"><strong>Account Information:</strong> Name, email address, phone number, company name, GST number, and address provided during registration.</p>
            <p className="mb-2"><strong>Business Data:</strong> Products, inventory, sales records, distribution records, vendor details, customer details, financial transactions, and billing information entered by tenants.</p>
            <p className="mb-2"><strong>Usage Data:</strong> Login timestamps, feature usage, and audit logs for security purposes.</p>
            <p><strong>Bill Customization:</strong> Company logos, signatures, and branding assets uploaded by tenants.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide and maintain the ERP platform</li>
              <li>To authenticate users and manage access control</li>
              <li>To generate invoices, challans, and financial reports</li>
              <li>To send WhatsApp messages and emails when requested by users</li>
              <li>To monitor platform security and prevent unauthorized access</li>
              <li>To provide customer support</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">4. Data Isolation & Multi-Tenancy</h2>
            <p>Each tenant's data is completely isolated using tenant-level access controls. No tenant can access another tenant's data. All database queries are scoped by tenant ID.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">5. Data Storage & Security</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Data is stored in PostgreSQL databases hosted on secure cloud infrastructure</li>
              <li>All connections are encrypted with SSL/TLS</li>
              <li>Passwords are hashed using bcrypt with 12 salt rounds</li>
              <li>JWT tokens are used for authentication with HS256 algorithm</li>
              <li>Rate limiting is applied to prevent brute force attacks</li>
              <li>Security headers are enforced via Helmet.js</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">6. Data Sharing</h2>
            <p>We do not sell, trade, or rent your personal or business data to third parties. Data may be shared only:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>With your explicit consent</li>
              <li>To comply with legal obligations or court orders</li>
              <li>With service providers (hosting, logging) who process data on our behalf under strict agreements</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">7. Data Retention</h2>
            <p>Your data is retained as long as your account is active. Upon account deletion or tenant removal by the super admin, all associated data is permanently deleted from our systems.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">8. Your Rights</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Access:</strong> Request a copy of your data at any time</li>
              <li><strong>Correction:</strong> Update your personal information from Settings</li>
              <li><strong>Deletion:</strong> Request account and data deletion by contacting us</li>
              <li><strong>Export:</strong> Download your data using the backup feature in Settings</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">9. Cookies</h2>
            <p>We do not use cookies. Session data (authentication tokens) is stored in your browser's localStorage, which persists until you log out or clear your browser data. It is NOT automatically cleared when you close the tab.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">10. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date. Continued use of the platform constitutes acceptance of the updated policy.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">11. Contact</h2>
            <p>For any privacy-related concerns, contact us at:</p>
            <p className="mt-2"><strong>Email:</strong> patelprathamesh007@gmail.com</p>
            <p><strong>Phone:</strong> +91 88069 07616</p>
          </section>
        </div>
      </div>
    </div>
  );
}
