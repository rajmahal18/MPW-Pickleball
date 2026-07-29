const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const SIZE = 21;
const DATA_CODEWORDS = 19;
const ECC_CODEWORDS = 7;
const GENERATOR = [127, 122, 154, 164, 11, 68, 117];

function appendBits(target: number[], value: number, length: number) {
  for (let bit = length - 1; bit >= 0; bit -= 1) target.push((value >>> bit) & 1);
}

function gfMultiply(left: number, right: number) {
  let result = 0;
  let value = left;
  let factor = right;
  while (factor > 0) {
    if (factor & 1) result ^= value;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
    factor >>>= 1;
  }
  return result;
}

function dataCodewords(value: string) {
  const normalized = value.toUpperCase();
  if (normalized.length > 25 || [...normalized].some((character) => !ALPHANUMERIC.includes(character))) {
    throw new Error("QR Version 1-L supports up to 25 alphanumeric characters.");
  }
  const bits: number[] = [];
  appendBits(bits, 0b0010, 4);
  appendBits(bits, normalized.length, 9);
  for (let index = 0; index < normalized.length; index += 2) {
    const first = ALPHANUMERIC.indexOf(normalized[index]!);
    if (index + 1 < normalized.length) {
      appendBits(bits, first * 45 + ALPHANUMERIC.indexOf(normalized[index + 1]!), 11);
    } else {
      appendBits(bits, first, 6);
    }
  }
  const capacity = DATA_CODEWORDS * 8;
  appendBits(bits, 0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) bits.push(0);
  const bytes: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | bits[index + bit]!;
    bytes.push(byte);
  }
  let pad = true;
  while (bytes.length < DATA_CODEWORDS) {
    bytes.push(pad ? 0xec : 0x11);
    pad = !pad;
  }
  return bytes;
}

function errorCorrection(data: number[]) {
  const remainder = Array<number>(ECC_CODEWORDS).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0]!;
    remainder.shift();
    remainder.push(0);
    for (let index = 0; index < ECC_CODEWORDS; index += 1) {
      remainder[index] = remainder[index]! ^ gfMultiply(GENERATOR[index]!, factor);
    }
  }
  return remainder;
}

function setFinder(matrix: (boolean | null)[][], reserved: boolean[][], top: number, left: number) {
  for (let row = -1; row <= 7; row += 1) {
    for (let column = -1; column <= 7; column += 1) {
      const targetRow = top + row;
      const targetColumn = left + column;
      if (targetRow < 0 || targetColumn < 0 || targetRow >= SIZE || targetColumn >= SIZE) continue;
      const inPattern = row >= 0 && row <= 6 && column >= 0 && column <= 6;
      const dark = inPattern && (row === 0 || row === 6 || column === 0 || column === 6 || (row >= 2 && row <= 4 && column >= 2 && column <= 4));
      matrix[targetRow]![targetColumn] = dark;
      reserved[targetRow]![targetColumn] = true;
    }
  }
}

export function qrMatrix(value: string) {
  const data = dataCodewords(value);
  const codewords = [...data, ...errorCorrection(data)];
  const bits: number[] = [];
  for (const codeword of codewords) appendBits(bits, codeword, 8);

  const matrix = Array.from({ length: SIZE }, () => Array<boolean | null>(SIZE).fill(null));
  const reserved = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));
  setFinder(matrix, reserved, 0, 0);
  setFinder(matrix, reserved, 0, SIZE - 7);
  setFinder(matrix, reserved, SIZE - 7, 0);

  for (let index = 8; index < SIZE - 8; index += 1) {
    const dark = index % 2 === 0;
    matrix[6]![index] = dark;
    matrix[index]![6] = dark;
    reserved[6]![index] = true;
    reserved[index]![6] = true;
  }
  matrix[SIZE - 8]![8] = true;
  reserved[SIZE - 8]![8] = true;

  const formatA = [[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[7,8],[8,8],[8,7],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0]];
  const formatB = [[8,20],[8,19],[8,18],[8,17],[8,16],[8,15],[8,14],[8,13],[14,8],[15,8],[16,8],[17,8],[18,8],[19,8],[20,8]];
  for (const [row, column] of [...formatA, ...formatB]) reserved[row]![column] = true;

  let bitIndex = 0;
  let upward = true;
  for (let right = SIZE - 1; right > 0; right -= 2) {
    if (right === 6) right -= 1;
    for (let offset = 0; offset < SIZE; offset += 1) {
      const row = upward ? SIZE - 1 - offset : offset;
      for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
        const column = right - columnOffset;
        if (reserved[row]![column]) continue;
        const raw = bits[bitIndex++] ?? 0;
        matrix[row]![column] = Boolean(raw ^ ((row + column) % 2 === 0 ? 1 : 0));
      }
    }
    upward = !upward;
  }

  const formatBits = 0x77c4;
  for (let index = 0; index < 15; index += 1) {
    const dark = Boolean((formatBits >>> index) & 1);
    const [rowA, columnA] = formatA[index]!;
    const [rowB, columnB] = formatB[index]!;
    matrix[rowA]![columnA] = dark;
    matrix[rowB]![columnB] = dark;
  }
  return matrix.map((row) => row.map(Boolean));
}
