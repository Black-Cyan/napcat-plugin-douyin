/**
 * SM3 密码杂凑算法实现
 * 适用于生成 a_bogus 签名参数
 *
 * 参考: GB/T 32905-2016 信息安全技术 SM3 密码杂凑算法
 * Python 参考: https://github.com/Evil0ctal/Douyin_TikTok_Download_API/crawlers/douyin/web/abogus.py
 */

function rotl32(x: number, n: number): number {
    n %= 32;
    return (((x << n) >>> 0) | (x >>> (32 - n))) >>> 0;
}

function ff0(x: number, y: number, z: number): number {
    return (x ^ y ^ z) >>> 0;
}

function ff1(x: number, y: number, z: number): number {
    return ((x & y) | (x & z) | (y & z)) >>> 0;
}

function gg0(x: number, y: number, z: number): number {
    return (x ^ y ^ z) >>> 0;
}

function gg1(x: number, y: number, z: number): number {
    return (((x & y) | ((~x >>> 0) & z)) >>> 0);
}

function p0(x: number): number {
    return (x ^ rotl32(x, 9) ^ rotl32(x, 17)) >>> 0;
}

function p1(x: number): number {
    return (x ^ rotl32(x, 15) ^ rotl32(x, 23)) >>> 0;
}

const T: [number, number] = [0x79cc4519, 0x7a879d8a];

function sm3CF(V: number[], B: number[]): number[] {
    const W: number[] = new Array(68).fill(0);
    const W1: number[] = new Array(64).fill(0);

    // 消息扩展
    for (let i = 0; i < 16; i++) {
        W[i] = ((B[4 * i] << 24) | (B[4 * i + 1] << 16) | (B[4 * i + 2] << 8) | B[4 * i + 3]) >>> 0;
    }

    for (let i = 16; i < 68; i++) {
        W[i] = (p1(W[i - 16] ^ W[i - 9] ^ rotl32(W[i - 3], 15)) ^ rotl32(W[i - 13], 7) ^ W[i - 6]) >>> 0;
    }

    for (let i = 0; i < 64; i++) {
        W1[i] = (W[i] ^ W[i + 4]) >>> 0;
    }

    let A = V[0];
    let B2 = V[1];
    let C = V[2];
    let D = V[3];
    let E = V[4];
    let F = V[5];
    let G = V[6];
    let H = V[7];

    for (let i = 0; i < 16; i++) {
        const SS1 = rotl32((((rotl32(A, 12) + E) >>> 0) + rotl32(T[0], i)) >>> 0, 7);
        const SS2 = (SS1 ^ rotl32(A, 12)) >>> 0;
        const TT1 = (((ff0(A, B2, C) >>> 0) + D + SS2 + W1[i]) >>> 0);
        const TT2 = (((gg0(E, F, G) >>> 0) + H + SS1 + W[i]) >>> 0);
        D = C;
        C = rotl32(B2, 9);
        B2 = A;
        A = TT1;
        H = G;
        G = rotl32(F, 19);
        F = E;
        E = p0(TT2);
    }

    for (let i = 16; i < 64; i++) {
        const SS1 = rotl32((((rotl32(A, 12) + E) >>> 0) + rotl32(T[1], i % 32)) >>> 0, 7);
        const SS2 = (SS1 ^ rotl32(A, 12)) >>> 0;
        const TT1 = (((ff1(A, B2, C) >>> 0) + D + SS2 + W1[i]) >>> 0);
        const TT2 = (((gg1(E, F, G) >>> 0) + H + SS1 + W[i]) >>> 0);
        D = C;
        C = rotl32(B2, 9);
        B2 = A;
        A = TT1;
        H = G;
        G = rotl32(F, 19);
        F = E;
        E = p0(TT2);
    }

    return [
        (A ^ V[0]) >>> 0,
        (B2 ^ V[1]) >>> 0,
        (C ^ V[2]) >>> 0,
        (D ^ V[3]) >>> 0,
        (E ^ V[4]) >>> 0,
        (F ^ V[5]) >>> 0,
        (G ^ V[6]) >>> 0,
        (H ^ V[7]) >>> 0,
    ];
}

function pad(data: number[]): number[] {
    const l = data.length;
    const k = (55 - l) < 0 ? (119 - l) : (55 - l);
    const padded = [...data, 0x80];
    for (let i = 0; i < k; i++) {
        padded.push(0);
    }
    const bitLen = l * 8;
    for (let i = 0; i < 8; i++) {
        padded.push((bitLen >>> (56 - i * 8)) & 0xff);
    }
    return padded;
}

export function sm3Hash(input: number[] | string): number[] {
    let data: number[];
    if (typeof input === 'string') {
        data = [];
        for (let i = 0; i < input.length; i++) {
            const code = input.charCodeAt(i);
            if (code < 128) {
                data.push(code);
            } else if (code < 2048) {
                data.push((code >> 6) | 0xc0);
                data.push((code & 0x3f) | 0x80);
            } else {
                data.push((code >> 12) | 0xe0);
                data.push(((code >> 6) & 0x3f) | 0x80);
                data.push((code & 0x3f) | 0x80);
            }
        }
    } else {
        data = input;
    }

    const paddedData = pad(data);
    const n = paddedData.length / 64;

    let V: number[] = [
        0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600,
        0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e,
    ];

    for (let i = 0; i < n; i++) {
        const B = paddedData.slice(i * 64, (i + 1) * 64);
        V = sm3CF(V, B);
    }

    const hash: number[] = [];
    for (const v of V) {
        hash.push((v >>> 24) & 0xff);
        hash.push((v >>> 16) & 0xff);
        hash.push((v >>> 8) & 0xff);
        hash.push(v & 0xff);
    }

    return hash;
}
