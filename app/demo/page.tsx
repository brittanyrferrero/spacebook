import LandingPage from '../home/page'

export default function DemoPage() {
  return (
    <div>
      <div style={{ background: '#090d18', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '14px 24px', textAlign: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, margin: 0, lineHeight: 1.7, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
          <span style={{ color: '#fff', fontWeight: 600 }}>Spacebook</span> is a room booking tool for coworking spaces, small offices, studios, and maker spaces that share resources — rooms, call booths, desks, etc. It&apos;s built to be flexible and customizable, and allows you to own your data and hardware choices.
        </p>
      </div>
      <LandingPage showPricing={false} showIntro={false} />
    </div>
  )
}
