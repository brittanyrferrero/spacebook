export default function TermsPage() {
  const INK   = '#1c1510'
  const CREAM = '#f0ece4'

  return (
    <div style={{ fontFamily: "'Space Grotesk', sans-serif", background: CREAM, color: INK, minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,600;0,700;1,400&family=Space+Grotesk:wght@300;400;500&display=swap');` }} />

      <nav style={{ background: INK, padding: '20px 44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/landing" style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 18, fontWeight: 600, color: CREAM, textDecoration: 'none', letterSpacing: '0.04em' }}>
          space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>
        </a>
      </nav>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px 80px' }}>
        <h1 style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 600, color: INK, margin: '0 0 8px' }}>Terms of Service</h1>
        <p style={{ fontSize: 14, color: `${INK}66`, margin: '0 0 48px' }}>Last updated: May 2026</p>

        <Section title="Acceptance">
          By accessing or using spacebook you agree to these terms. If you are using spacebook on behalf of an organisation, you represent that you have authority to bind that organisation.
        </Section>

        <Section title="The service">
          <p>spacebook provides room-booking software for shared spaces. We offer both a hosted service (managed by us) and self-hosted software. These terms apply to the hosted service at space-book.net and its subdomains.</p>
          <p>We reserve the right to modify, suspend, or discontinue any part of the service at any time with reasonable notice.</p>
        </Section>

        <Section title="Your account">
          <p>Workspace administrators are responsible for maintaining the security of their login credentials and for all activity that occurs under their account.</p>
          <p>You must provide accurate information when setting up a workspace. You may not use the service for unlawful purposes or in ways that violate these terms.</p>
        </Section>

        <Section title="Acceptable use">
          <p>You agree not to:</p>
          <ul>
            <li>Use the service to send unsolicited messages or spam</li>
            <li>Attempt to gain unauthorised access to any part of the service</li>
            <li>Interfere with or disrupt the integrity or performance of the service</li>
            <li>Use the service in violation of any applicable law or regulation</li>
            <li>Collect or harvest data from the service without authorisation</li>
          </ul>
        </Section>

        <Section title="Your data">
          <p>You retain ownership of all data you submit to spacebook. We process it only to provide the service, as described in our <a href="/privacy" style={{ color: INK }}>Privacy Policy</a>.</p>
          <p>You are responsible for ensuring you have the right to submit any personal data (such as booking names and emails) to the service.</p>
        </Section>

        <Section title="Google Calendar integration">
          <p>The Google Calendar integration is an optional feature. By connecting a Google Calendar, you authorise spacebook to read and write calendar events on your behalf as described in our Privacy Policy. You can revoke this access at any time.</p>
        </Section>

        <Section title="Payments and trials">
          <p>Paid plans are billed monthly or annually as selected. Annual plans are billed once per year. A 14-day free trial is available with no credit card required.</p>
          <p>You may cancel your subscription at any time. Refunds are not provided for partial billing periods except where required by law.</p>
        </Section>

        <Section title="Disclaimer of warranties">
          <p>The service is provided "as is" without warranties of any kind, express or implied. We do not warrant that the service will be uninterrupted, error-free, or suitable for any particular purpose.</p>
        </Section>

        <Section title="Limitation of liability">
          <p>To the maximum extent permitted by law, spacebook's liability to you for any claim arising out of or related to these terms or the service is limited to the amount you paid us in the three months preceding the claim. We are not liable for indirect, incidental, special, or consequential damages.</p>
        </Section>

        <Section title="Governing law">
          <p>These terms are governed by the laws of California, United States, without regard to conflict of law principles.</p>
        </Section>

        <Section title="Changes">
          <p>We may update these terms from time to time. Material changes will be notified by email or by a notice on the service. Continued use after changes constitutes acceptance.</p>
        </Section>

        <Section title="Contact">
          <p>Questions: <a href="mailto:hello@spacebook.app" style={{ color: INK }}>hello@spacebook.app</a></p>
        </Section>
      </div>

      <div style={{ background: INK, padding: '32px 44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <a href="/landing" style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 16, fontWeight: 600, color: CREAM, letterSpacing: '0.04em', textDecoration: 'none' }}>
          space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>
        </a>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <a href="/privacy" style={{ fontSize: 12, color: `${CREAM}66`, textDecoration: 'none', letterSpacing: '0.06em' }}>Privacy</a>
          <a href="/terms" style={{ fontSize: 12, color: CREAM, textDecoration: 'none', letterSpacing: '0.06em' }}>Terms</a>
          <a href="mailto:hello@spacebook.app" style={{ fontSize: 12, color: `${CREAM}66`, textDecoration: 'none', letterSpacing: '0.06em' }}>hello@spacebook.app</a>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const INK = '#1c1510'
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 20, fontWeight: 600, color: INK, margin: '0 0 12px', paddingBottom: 10, borderBottom: `1px solid ${INK}22` }}>{title}</h2>
      <div style={{ fontSize: 15, color: `${INK}cc`, lineHeight: 1.75 }}>{children}</div>
    </div>
  )
}
