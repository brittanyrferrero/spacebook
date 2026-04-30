export default function EnterPage() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#090d18', fontFamily: 'system-ui, sans-serif', gap: 12 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
        space<span style={{ color: '#db95ab', fontWeight: 300 }}>book</span>
      </div>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
        You need an invite link to access this workspace.
      </p>
    </div>
  )
}
