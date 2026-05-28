export default function PrivacyPage() {
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
        <h1 style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 600, color: INK, margin: '0 0 8px' }}>Privacy Policy</h1>
        <p style={{ fontSize: 14, color: `${INK}66`, margin: '0 0 48px' }}>Last updated: May 2026</p>

        <Section title="Overview">
          spacebook is a room-booking platform for offices, coworking spaces, and shared studios. This policy explains what information we collect, how we use it, and your choices.
        </Section>

        <Section title="Information we collect">
          <p>When you use spacebook we collect:</p>
          <ul>
            <li><strong>Booking information</strong> — name, email address, booking times, room, and optional meeting title submitted when making a reservation.</li>
            <li><strong>Account information</strong> — email address of workspace administrators.</li>
            <li><strong>Google account data</strong> — if a workspace administrator connects a Google Calendar, we store OAuth refresh and access tokens to maintain that connection. We access the Google Calendar API only to read calendar metadata and to create, update, or delete calendar events corresponding to spacebook bookings.</li>
            <li><strong>Usage data</strong> — standard server logs (IP address, browser type, pages visited) retained for up to 30 days.</li>
          </ul>
        </Section>

        <Section title="How we use your information">
          <p>We use collected information to:</p>
          <ul>
            <li>Display room availability and manage bookings</li>
            <li>Send booking confirmation and notification emails</li>
            <li>Sync bookings with connected Google Calendars</li>
            <li>Allow workspace administrators to manage their space</li>
          </ul>
          <p>We do not sell personal information. We do not use it for advertising. We do not share it with third parties except as described below.</p>
        </Section>

        <Section title="Google Calendar integration">
          <p>spacebook's use of Google Calendar is limited to the following:</p>
          <ul>
            <li>Listing Google Calendars accessible to the authenticated administrator, so they can choose which calendar to sync with a room</li>
            <li>Creating calendar events when a booking is made in spacebook</li>
            <li>Updating calendar events when a booking is edited</li>
            <li>Deleting calendar events when a booking is cancelled</li>
            <li>Receiving push notifications when events change on a connected calendar, in order to reflect those changes in spacebook</li>
          </ul>
          <p>OAuth tokens are stored encrypted and are used solely for these purposes. No Google user data is used for advertising or shared with third parties.</p>
          <p>spacebook's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" style={{ color: INK }}>Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
          <p>Workspace administrators can revoke spacebook's access to their Google Calendar at any time by disconnecting the calendar in the spacebook admin panel, or directly through their <a href="https://myaccount.google.com/permissions" style={{ color: INK }}>Google account permissions page</a>.</p>
        </Section>

        <Section title="Data storage and security">
          <p>Booking data is stored in a managed database hosted in the United States. OAuth tokens are stored in an encrypted key-value store. We use industry-standard practices to protect data in transit and at rest.</p>
          <p>Access to workspace data is restricted to administrators of that workspace.</p>
        </Section>

        <Section title="Data retention">
          <p>Booking records are retained for as long as your workspace is active. If you delete your workspace or request deletion, we will remove your data within 30 days.</p>
        </Section>

        <Section title="Your rights">
          <p>You may request access to, correction of, or deletion of your personal data at any time by emailing us at <a href="mailto:hello@spacebook.app" style={{ color: INK }}>hello@spacebook.app</a>. We will respond within 30 days.</p>
        </Section>

        <Section title="Cookies">
          <p>spacebook uses a single session cookie to keep workspace administrators logged in. No third-party tracking or advertising cookies are used.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>If we make material changes to this policy we will update the date at the top of this page. Continued use of spacebook after changes constitutes acceptance.</p>
        </Section>

        <Section title="Contact">
          <p>Questions about this policy: <a href="mailto:hello@spacebook.app" style={{ color: INK }}>hello@spacebook.app</a></p>
        </Section>
      </div>

      <div style={{ background: INK, padding: '32px 44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <a href="/landing" style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 16, fontWeight: 600, color: CREAM, letterSpacing: '0.04em', textDecoration: 'none' }}>
          space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>
        </a>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <a href="/privacy" style={{ fontSize: 12, color: CREAM, textDecoration: 'none', letterSpacing: '0.06em' }}>Privacy</a>
          <a href="/terms" style={{ fontSize: 12, color: `${CREAM}66`, textDecoration: 'none', letterSpacing: '0.06em' }}>Terms</a>
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
