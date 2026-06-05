import LandingPage from '../landing-classic/page'

export default function DemoPage() {
  return (
    <div>
      <div style={{ background: '#090d18', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '14px 24px', textAlign: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, margin: 0, lineHeight: 1.7, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
          <span style={{ color: '#fff', fontWeight: 600 }}>Spacebook</span> is a room booking tool for coworking spaces, small offices, studios, maker spaces, and anywhere teams share spaces — rooms, call booths, desks, whatever you've got. It's built to be flexible and customizable, with no vendor lock-in and no data sold. You own everything.{' '}
          <a href="https://www.space-book.net/landing" style={{ color: '#db95ab', textDecoration: 'none', fontWeight: 500 }}>Learn more →</a>
        </p>
      </div>
      <LandingPage showPricing={false} showIntro={false} />
    </div>
  )
}
