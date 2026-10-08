import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';

const paper = '#faf9f5';
const ink = '#1f1e1d';
const soft = '#5e5a53';
const terracotta = '#d97757';
const line = '#e4e0d6';

const rise = (frame: number, start: number) =>
  interpolate(frame, [start, start + 16], [12, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

const fade = (frame: number, start: number) =>
  interpolate(frame, [start, start + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

export const DeskReel = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: paper, color: ink, fontFamily: 'Georgia, serif' }}>
      <Sequence durationInFrames={180}>
        <AbsoluteFill style={{ padding: 88, opacity: fade(frame, 8), transform: `translateY(${rise(frame, 8)}px)` }}>
          <div style={{ letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: 'Inter, sans-serif', fontSize: 14, color: soft }}>
            Ulric
          </div>
          <h1 style={{ fontWeight: 500, fontSize: 92, margin: '12px 0 16px' }}>Booking Desk</h1>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 28, color: soft, maxWidth: 760 }}>
            Five stays in Eugene, OR, near Hayward Field.
          </p>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={180} durationInFrames={330}>
        <House frame={frame - 180} />
      </Sequence>
      <Sequence from={510} durationInFrames={240}>
        <Flow frame={frame - 510} />
      </Sequence>
    </AbsoluteFill>
  );
};

const House = ({ frame }: { frame: number }) => {
  const rooms = [
    { name: '4-bed', note: 'Whole house', hot: frame > 70 },
    { name: '3-bed', note: 'Contains the 2-bed', hot: frame > 70 && frame < 150 },
    { name: '2-bed', note: 'Blocks the 3-bed and the 4-bed', hot: frame > 40 && frame < 150 },
    { name: 'Studio', note: 'Blocks the 4-bed', hot: frame >= 150 },
    { name: 'Cottage', note: 'Links to nothing', hot: false },
  ];
  return (
    <AbsoluteFill style={{ padding: 88, opacity: fade(frame, 6) }}>
      <h2 style={{ fontWeight: 500, fontSize: 64, margin: 0 }}>Nested stays</h2>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 24, color: soft }}>
        {frame < 150
          ? 'A 2-bed booking blocks the 3-bed and the 4-bed. The studio stays open.'
          : 'A studio booking blocks the 4-bed. The 3-bed and the 2-bed stay open.'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 28, marginTop: 36 }}>
        <svg viewBox="0 0 640 420" style={{ width: '100%', background: paper, borderTop: `1px solid ${line}` }}>
          <rect x="24" y="28" width="592" height="364" fill={rooms[0].hot ? '#f3d2c6' : 'transparent'} stroke={ink} />
          <rect x="44" y="84" width="348" height="284" fill={rooms[1].hot ? '#f3d2c6' : 'transparent'} stroke={ink} />
          <rect x="68" y="176" width="196" height="164" fill={rooms[2].hot ? terracotta : 'transparent'} stroke={ink} />
          <rect x="424" y="84" width="168" height="164" fill={rooms[3].hot ? terracotta : 'transparent'} stroke={ink} />
        </svg>
        <div style={{ fontFamily: 'Inter, sans-serif' }}>
          {rooms.map((room, index) => (
            <div key={room.name} style={{ borderTop: `1px solid ${line}`, padding: '16px 0', opacity: fade(frame, 12 + index * 8) }}>
              <strong style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 500 }}>{room.name}</strong>
              <div style={{ color: soft, marginTop: 4 }}>{room.note}</div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Flow = ({ frame }: { frame: number }) => {
  const steps = ['Request', 'Approve', 'Sign', 'Pay'];
  const drawn = interpolate(frame, [10, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ padding: 88, opacity: fade(frame, 4) }}>
      <h2 style={{ fontWeight: 500, fontSize: 64, margin: 0 }}>Request to paid</h2>
      <svg viewBox="0 0 1000 80" style={{ marginTop: 48 }}>
        <line x1="40" y1="30" x2={40 + 920 * drawn} y2="30" stroke={terracotta} strokeWidth="2" />
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, fontFamily: 'Inter, sans-serif' }}>
        {steps.map((step, index) => (
          <div key={step} style={{ opacity: fade(frame, 16 + index * 10), transform: `translateY(${rise(frame, 16 + index * 10)}px)` }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 40 }}>{step}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
