export default function RootPage() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#090d18', fontFamily: 'system-ui, sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;1,400&display=swap');` }} />
      <div style={{ width: '100%', maxWidth: 400, padding: '0 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 500, color: '#fff', letterSpacing: '0.02em', marginBottom: 32, fontFamily: "'Spectral', Georgia, serif" }}>
          space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>
        </div>
        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.85)', margin: '0 0 12px', lineHeight: 1.5 }}>
          How'd you end up here?
        </p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.6 }}>
          You're looking for your workspace URL — go ask your admin, you silly goose.
        </p>
      </div>
    </div>
  )
}
