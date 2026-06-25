import { ArrowLeft } from 'lucide-react';

export function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A]">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-[#F27D26] mb-8"><ArrowLeft size={16} /> Back to Home</a>
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: June 2026</p>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">1. Acceptance of Terms</h2>
            <p>By accessing or using the DG ERP Management platform ("Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">2. Service Description</h2>
            <p>DG ERP is a multi-tenant cloud-based Enterprise Resource Planning platform that provides inventory management, sales tracking, distribution management, billing, vendor finance, warranty tracking, and related business management tools.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">3. Account Registration</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Tenant accounts are created by the platform administrator (Super Admin)</li>
              <li>You are responsible for maintaining the confidentiality of your login credentials</li>
              <li>You must provide accurate and complete information during registration</li>
              <li>You must notify us immediately of any unauthorized use of your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">4. Subscription Plans</h2>
            <p className="mb-2">Access to the Service is provided through subscription plans (Trial, Starter, Professional, Enterprise). Each plan has specific limits on products, vendors, users, and features.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Trial plans are valid for 14 days from registration</li>
              <li>Paid plans are billed monthly or annually as selected</li>
              <li>We reserve the right to change pricing with 30 days prior notice</li>
              <li>Exceeding plan limits may result in restricted functionality until upgraded</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Use the Service for any illegal or unauthorized purpose</li>
              <li>Attempt to access other tenants' data or bypass security measures</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
              <li>Upload malicious code, viruses, or harmful content</li>
              <li>Use the Service to send spam or unsolicited messages</li>
              <li>Exceed rate limits or abuse API endpoints</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">6. Data Ownership</h2>
            <p className="mb-2">You retain full ownership of all business data you enter into the platform. We do not claim any ownership rights over your data.</p>
            <p>You may export your data at any time using the backup feature. Upon account termination, we will delete your data within 30 days unless legally required to retain it.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">7. Service Availability</h2>
            <p>We strive to maintain 99.9% uptime but do not guarantee uninterrupted service. Scheduled maintenance will be communicated in advance. We are not liable for downtime caused by factors beyond our control (hosting provider outages, network issues, force majeure).</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">8. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, DG ERP Management shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service. Our total liability shall not exceed the amount paid by you in the 12 months preceding the claim.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">9. Account Suspension & Termination</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>We may suspend or terminate your account for violation of these Terms</li>
              <li>You may request account termination at any time by contacting us</li>
              <li>Upon termination, your data will be deleted within 30 days</li>
              <li>Suspended accounts may be reactivated by contacting the platform administrator</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">10. Intellectual Property</h2>
            <p>The DG ERP platform, including its design, code, logos, and documentation, is the intellectual property of DG ERP Management. You are granted a limited, non-exclusive, non-transferable license to use the Service during your subscription period.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">11. Governing Law</h2>
            <p>These Terms shall be governed by and construed in accordance with the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in Maharashtra, India.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">12. Changes to Terms</h2>
            <p>We may modify these Terms at any time. Changes will be posted on this page. Continued use of the Service after changes constitutes acceptance. Material changes will be communicated via email.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">13. Contact</h2>
            <p>For questions about these Terms, contact us at:</p>
            <p className="mt-2"><strong>Email:</strong> patelprathamesh007@gmail.com</p>
            <p><strong>Phone:</strong> +91 88069 07616</p>
          </section>
        </div>
      </div>
    </div>
  );
}
