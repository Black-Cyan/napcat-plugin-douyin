/**
 * A-Bogus 签名参数生成器
 * 抖音 Web API 接口签名算法
 *
 * Python 参考: https://github.com/Evil0ctal/Douyin_TikTok_Download_API/blob/main/crawlers/douyin/web/abogus.py
 * 原始算法: https://github.com/JoeanAmier/TikTokDownloader (GPL-3.0)
 */

import { sm3Hash } from './sm3';

// 随机数生成
function randFloat(): number {
    return Math.random();
}

function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 模拟 Python 的 random_list
function randomList(
    a?: number,
    b: number = 170,
    c: number = 85,
    d: number = 0,
    e: number = 0,
    f: number = 0,
    g: number = 0,
): number[] {
    const r = a ?? randFloat() * 10000;
    const v: number[] = [
        r,
        Math.floor(r) & 255,
        (Math.floor(r) >> 8) & 0xff,
    ];
    v.push((v[1] & b) | d);
    v.push((v[1] & c) | e);
    v.push((v[2] & b) | f);
    v.push((v[2] & c) | g);
    return v.slice(-4);
}

function list1(r?: number): number[] {
    return randomList(r, 170, 85, 1, 2, 5, 45 & 170);
}

function list2(r?: number): number[] {
    return randomList(r, 170, 85, 1, 0, 0, 0);
}

function list3(r?: number): number[] {
    return randomList(r, 170, 85, 1, 0, 5, 0);
}

// 字符串/字节工具
function fromCharCode(...codes: number[]): string {
    return String.fromCharCode(...codes);
}

function charCodeAt(s: string): number[] {
    const result: number[] = [];
    for (let i = 0; i < s.length; i++) {
        result.push(s.charCodeAt(i));
    }
    return result;
}

// SM3 双重哈希转整数数组
function sm3ToArray(data: string | number[]): number[] {
    const bytes = typeof data === 'string'
        ? new TextEncoder().encode(data)
        : new Uint8Array(data);
    const hash = sm3Hash(Array.from(bytes));
    return hash;
}

// 位循环
function rotl(e: number, r: number): number {
    r %= 32;
    return (((e << r) >>> 0) | (e >>> (32 - r))) >>> 0;
}

// RC4 加密
function rc4Encrypt(plaintext: string, key: string): string {
    const S = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + S[i] + key.charCodeAt(i % key.length)) % 256;
        [S[i], S[j]] = [S[j], S[i]];
    }

    let i2 = 0;
    let j2 = 0;
    const cipher: number[] = [];
    for (let k = 0; k < plaintext.length; k++) {
        i2 = (i2 + 1) % 256;
        j2 = (j2 + S[i2]) % 256;
        [S[i2], S[j2]] = [S[j2], S[i2]];
        const t = (S[i2] + S[j2]) % 256;
        cipher.push(S[t] ^ plaintext.charCodeAt(k));
    }
    return String.fromCharCode(...cipher);
}

const ENCODING_STRINGS = {
    s0: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',
    s4: 'Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe',
};

export class ABogus {
    private uaCode: number[];
    private browser: string;
    private browserLen: number;
    private browserCode: number[];

    constructor(platform?: string) {
        this.uaCode = [76, 98, 15, 131, 97, 245, 224, 133, 122, 199, 241, 166, 79, 34, 90, 191, 128, 126, 122, 98, 66, 11, 14, 40, 49, 110, 110, 173, 67, 96, 138, 252];
        this.browser = platform ? ABogus.generateBrowserInfo(platform) : '1536|742|1536|864|0|0|0|0|1536|864|1536|864|1536|742|24|24|MacIntel';
        this.browserLen = this.browser.length;
        this.browserCode = charCodeAt(this.browser);
    }

    private static generateString1(r1?: number, r2?: number, r3?: number): string {
        return fromCharCode(...list1(r1)) + fromCharCode(...list2(r2)) + fromCharCode(...list3(r3));
    }

    private generateString2List(
        urlParams: string,
        method: string = 'GET',
        startTime: number = 0,
        endTime: number = 0,
    ): number[] {
        startTime = startTime || Math.floor(Date.now());
        endTime = endTime || (startTime + randInt(4, 8));

        const paramsArray = sm3ToArray(sm3ToArray(urlParams + 'cus'));
        const methodArray = sm3ToArray(sm3ToArray(method + 'cus'));

        return ABogus.list4(
            (endTime >> 24) & 255,
            paramsArray[21],
            this.uaCode[23],
            (endTime >> 16) & 255,
            paramsArray[22],
            this.uaCode[24],
            (endTime >> 8) & 255,
            (endTime >> 0) & 255,
            (startTime >> 24) & 255,
            (startTime >> 16) & 255,
            (startTime >> 8) & 255,
            (startTime >> 0) & 255,
            methodArray[21],
            methodArray[22],
            Math.floor(endTime / 256 / 256 / 256 / 256) >> 0,
            Math.floor(startTime / 256 / 256 / 256 / 256) >> 0,
            this.browserLen,
        );
    }

    private static generateString2(
        abogus: ABogus,
        urlParams: string,
        method: string = 'GET',
        startTime: number = 0,
        endTime: number = 0,
    ): string {
        const a = abogus.generateString2List(urlParams, method, startTime, endTime);
        const e = ABogus.endCheckNum(a);
        a.push(...abogus.browserCode);
        a.push(e);
        return rc4Encrypt(fromCharCode(...a), 'y');
    }

    private static endCheckNum(a: number[]): number {
        let r = 0;
        for (const i of a) {
            r ^= i;
        }
        return r;
    }

    private static list4(
        a: number, b: number, c: number, d: number,
        e: number, f: number, g: number, h: number,
        i: number, j: number, k: number, m: number,
        n: number, o: number, p: number, q: number,
        r: number,
    ): number[] {
        return [
            44, a, 0, 0, 0, 0, 24, b, n, 0, c, d, 0, 0, 0,
            1, 0, 239, e, o, f, g, 0, 0, 0, 0, h, 0, 0, 14,
            i, j, 0, k, m, 3, p, 1, q, 1, r, 0, 0, 0,
        ];
    }

    private static generateResult(s: string, e: string = 's4'): string {
        const strMap = ENCODING_STRINGS[e as keyof typeof ENCODING_STRINGS];
        const r: string[] = [];

        for (let i = 0; i < s.length; i += 3) {
            let n: number;
            if (i + 2 < s.length) {
                n = ((s.charCodeAt(i) << 16) | (s.charCodeAt(i + 1) << 8) | s.charCodeAt(i + 2)) >>> 0;
            } else if (i + 1 < s.length) {
                n = ((s.charCodeAt(i) << 16) | (s.charCodeAt(i + 1) << 8)) >>> 0;
            } else {
                n = (s.charCodeAt(i) << 16) >>> 0;
            }

            for (const [j, k] of [
                [18, 0xFC0000], [12, 0x03F000], [6, 0x0FC0], [0, 0x3F],
            ] as [number, number][]) {
                if (j === 6 && i + 1 >= s.length) break;
                if (j === 0 && i + 2 >= s.length) break;
                r.push(strMap[(n & k) >> j]);
            }
        }

        const padLen = (4 - (r.length % 4)) % 4;
        r.push('='.repeat(padLen));
        return r.join('');
    }

    private static generateBrowserInfo(platform: string = 'Win32'): string {
        const innerWidth = randInt(1280, 1920);
        const innerHeight = randInt(720, 1080);
        const outerWidth = randInt(innerWidth, 1920);
        const outerHeight = randInt(innerHeight, 1080);
        const screenX = 0;
        const screenY = Math.random() > 0.5 ? 30 : 0;

        return [
            innerWidth, innerHeight,
            outerWidth, outerHeight,
            screenX, screenY,
            0, 0,
            outerWidth, outerHeight,
            outerWidth, outerHeight,
            innerWidth, innerHeight,
            24, 24,
            platform,
        ].join('|');
    }

    /**
     * 生成 a_bogus 签名值
     *
     * @param urlParams URL 查询参数（字典或已编码的字符串）
     * @param method HTTP 方法（默认 GET）
     * @param startTime 起始时间戳（ms），0 表示自动生成
     * @param endTime 结束时间戳（ms），0 表示自动生成
     * @returns a_bogus 签名字符串（已 URL 编码）
     */
    public getValue(
        urlParams: Record<string, string | number> | string,
        method: string = 'GET',
        startTime: number = 0,
        endTime: number = 0,
    ): string {
        const paramsStr = typeof urlParams === 'string'
            ? urlParams
            : Object.entries(urlParams)
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
                .join('&');

        const string1 = ABogus.generateString1();
        const string2 = ABogus.generateString2(this, paramsStr, method, startTime, endTime);
        const combined = string1 + string2;
        return ABogus.generateResult(combined, 's4');
    }
}
