import { qrMatrix } from "@/lib/qr";

export default function QrCode({ value, size = 132 }: { value: string; size?: number }) {
  const matrix = qrMatrix(value);
  const quiet = 4;
  const dimension = matrix.length + quiet * 2;
  return <svg role="img" aria-label={`QR code for ${value}`} width={size} height={size} viewBox={`0 0 ${dimension} ${dimension}`} shapeRendering="crispEdges">
    <rect width={dimension} height={dimension} fill="white" />
    {matrix.flatMap((row, rowIndex) => row.map((dark, columnIndex) => dark ? <rect key={`${rowIndex}-${columnIndex}`} x={columnIndex + quiet} y={rowIndex + quiet} width="1" height="1" fill="black" /> : null))}
  </svg>;
}
