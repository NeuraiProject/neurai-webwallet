import React from 'react';
import qrcode from 'qrcode-generator';
import { IconNeurai } from './icons/IconNeurai';

/** Encode locally, with high error correction and a four-module quiet zone. */
export function AddressQR({address}: {address: string}) {
  const qr = React.useMemo(() => {
    const code = qrcode(0, 'H');
    code.addData(address, 'Byte');
    code.make();
    return code;
  }, [address]);
  const size = qr.getModuleCount();
  const margin = 4;
  const logo = Math.floor(size * 0.12) * 1.5;
  const center = margin + size / 2;
  const finders = [[0, 0], [size - 7, 0], [0, size - 7]];
  const dots: React.ReactNode[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (finders.some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7)) continue;
    if (qr.isDark(y, x)) dots.push(<circle key={`${x}:${y}`} cx={x + margin + 0.5} cy={y + margin + 0.5} r={0.48} fill="#000" />);
  }
  return <svg role="img" aria-label="Receive address QR" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${size + margin * 2} ${size + margin * 2}`} className="block w-full h-auto bg-white rounded-xl" shapeRendering="geometricPrecision">
    <rect width="100%" height="100%" fill="#fff" />
    {dots}
    {finders.map(([x, y]) => <g key={`${x}:${y}`} transform={`translate(${x + margin} ${y + margin})`}>
      <rect width="7" height="7" rx="1" fill="#000" />
      <rect x="1" y="1" width="5" height="5" rx="0.6" fill="#fff" />
      <rect x="2" y="2" width="3" height="3" rx="0.6" fill="#000" />
    </g>)}
    <circle cx={center} cy={center} r={logo / 2 + 0.45} fill="#fff" />
    <IconNeurai x={center - logo / 2} y={center - logo / 2} width={logo} height={logo} />
  </svg>;
}
