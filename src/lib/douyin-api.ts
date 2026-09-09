/**
 * 抖音 Web API 客户端
 * 直接调用抖音官方 Web 接口，不依赖第三方 API
 *
 * 参考: https://github.com/Evil0ctal/Douyin_TikTok_Download_API
 * 对应 Python 实现: crawlers/douyin/web/web_crawler.py
 */

import { ABogus } from './a-bogus';

// ==================== 常量 ====================

const DOUYIN_DETAIL_ENDPOINT = 'https://www.douyin.com/aweme/v1/web/aweme/detail/';

const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 10; Pixel 5 Build/QQ3A.200805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0.0.0 Mobile Safari/537.36';

// 抖音 Web API 基础请求参数（参考 models.py BaseRequestModel）
const BASE_PARAMS: Record<string, string | number> = {
    device_platform: 'webapp',
    aid: '6383',
    channel: 'channel_pc_web',
    pc_client_type: 1,
    version_code: '290100',
    version_name: '29.1.0',
    cookie_enabled: 'true',
    screen_width: 1920,
    screen_height: 1080,
    browser_language: 'zh-CN',
    browser_platform: 'Win32',
    browser_name: 'Chrome',
    browser_version: '130.0.0.0',
    browser_online: 'true',
    engine_name: 'Blink',
    engine_version: '130.0.0.0',
    os_name: 'Windows',
    os_version: '10',
    cpu_core_num: 12,
    device_memory: 8,
    platform: 'PC',
    downlink: '10',
    effective_type: '4g',
    from_user_page: '1',
    locate_query: 'false',
    need_time_list: '1',
    pc_libra_divert: 'Windows',
    publish_video_strategy_type: '2',
    round_trip_time: '0',
    show_live_replay_strategy: '1',
    time_list_query: '0',
    whale_cut_token: '',
    update_version_code: '170400',
    msToken: '',
};

// ==================== 类型 ====================

export interface DouyinVideoDetail {
    awemeId: string;
    desc: string;
    author: string;
    playUrl?: string;
    images?: string[];
    cover?: string;
    likes?: number;
    type: 'video' | 'image';
    sourceUrl: string;
}

// ==================== 日志桥接 ====================

interface LoggerLike {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
}

let appLogger: LoggerLike | null = null;

export function setDouyinApiLogger(l: LoggerLike): void {
    appLogger = l;
}

function log(level: 'debug' | 'info' | 'warn' | 'error', ...args: unknown[]): void {
    if (appLogger) {
        appLogger[level](...args);
    } else {
        const prefix = `[DouyinAPI:${level}]`;
        if (level === 'error') console.error(prefix, ...args);
        else if (level === 'warn') console.warn(prefix, ...args);
        else console.log(prefix, ...args);
    }
}

// ==================== ttwid 缓存 ====================

let cachedTtwid: string | null = null;

// ==================== 核心 API ====================

/**
 * 解析短链接/分享链接，获取 aweme_id
 * 短链接 v.douyin.com/xxx 会 302 重定向到含 aweme_id 的完整链接
 */
async function resolveAwemeId(shareUrl: string): Promise<string | null> {
    try {
        // 先用 HEAD 请求跟随重定向获取最终 URL
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(shareUrl, {
            method: 'GET',
            redirect: 'follow',
            headers: { 'User-Agent': MOBILE_UA },
            signal: controller.signal,
        });
        clearTimeout(timeout);

        const finalUrl = res.url || shareUrl;

        // 尝试多种模式提取 aweme_id（参考 utils.py AwemeIdFetcher）
        const patterns = [
            /video\/([^/?]+)/,
            /note\/([^/?]+)/,
            /[?&]vid=(\d+)/,
            /modal_id=(\d+)/,
        ];

        for (const pattern of patterns) {
            const match = pattern.exec(finalUrl);
            if (match?.[1]) return match[1];
        }

        log('warn', '无法从重定向 URL 中提取 aweme_id:', finalUrl);
        return null;
    } catch (err) {
        log('error', '解析 aweme_id 失败:', err);
        return null;
    }
}

/**
 * 生成 a_bogus 签名并构造完整 Endpoint
 */
function buildDetailEndpoint(awemeId: string): string {
    const ab = new ABogus();
    const params: Record<string, string | number> = {
        ...BASE_PARAMS,
        aweme_id: awemeId,
    };

    // 构造查询字符串（不含 a_bogus）
    const queryStr = Object.entries(params)
        .map(([k, v]) => `${k}=${v}`)
        .join('&');

    // 生成 a_bogus 签名
    const aBogus = ab.getValue(queryStr, 'GET');

    const endpoint = `${DOUYIN_DETAIL_ENDPOINT}?${queryStr}&a_bogus=${aBogus}`;
    log('warn', `[签名] aweme_id=${awemeId}, a_bogus=${aBogus.slice(0, 20)}...`);
    return endpoint;
}

/**
 * 获取 ttwid cookie（带模块级缓存）
 * ttwid 用于标识访客身份，无此 cookie 接口会返回空数据
 * 首次请求获取后缓存在内存中，重启后自动重新获取
 */
async function getTtwid(): Promise<string | null> {
    if (cachedTtwid) return cachedTtwid;

    try {
        const res = await fetch('https://ttwid.bytedance.com/ttwid/union/register/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                region: 'cn',
                aid: 1768,
                needFid: false,
                service: 'www.ixigua.com',
                migrate_info: { ticket: '', source: 'node' },
                cbUrlProtocol: 'https',
                union: true,
            }),
            redirect: 'manual',
        });

        const cookies = res.headers.get('set-cookie') || '';
        const match = /ttwid=([^;]+)/.exec(cookies);
        if (match?.[1]) {
            cachedTtwid = match[1];
            log('warn', '[ttwid] 获取成功:', cachedTtwid.slice(0, 20));
            return cachedTtwid;
        }
        log('warn', '[ttwid] set-cookie 中无 ttwid:', cookies.slice(0, 200));
        return null;
    } catch (err) {
        log('warn', '获取 ttwid 失败:', err);
        return null;
    }
}

/**
 * 从抖音 Web API 获取作品详情
 *
 * 参考 Python: DouyinWebCrawler.fetch_one_video()
 * 需要 ttwid cookie + a_bogus 签名参数
 */
async function fetchVideoDetail(awemeId: string, ttwid?: string): Promise<Record<string, unknown> | null> {
    const endpoint = buildDetailEndpoint(awemeId);

    const headers: Record<string, string> = {
        'User-Agent': WEB_UA,
        'Referer': 'https://www.douyin.com/',
        'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
    };

    if (ttwid) {
        headers['Cookie'] = `ttwid=${ttwid};`;
    }

    try {
        const res = await fetch(endpoint, { headers, redirect: 'follow' });
        const text = await res.text();

        log('warn', `[API] 响应: status=${res.status}, 长度=${text.length}`);

        if (!res.ok) {
            log('warn', `[API] HTTP 错误: ${res.status}`, text.slice(0, 300));
            return null;
        }

        let json: Record<string, unknown>;
        try {
            json = JSON.parse(text);
        } catch (parseErr) {
            log('warn', '[API] JSON 解析失败:', text.slice(0, 300));
            return null;
        }

        log('warn', `[API] JSON: status_code=${json.status_code}, 字段=[${Object.keys(json).join(', ')}]`);

        if (json.status_code !== 0) {
            log('warn', `[API] 业务错误: status_code=${json.status_code}`, JSON.stringify(json).slice(0, 500));
            return null;
        }

        // /aweme/v1/web/aweme/detail/ 返回 { aweme_detail: {...} }
        const awemeDetail = json.aweme_detail as Record<string, unknown> | undefined;
        if (awemeDetail) {
            log('warn', `[API] aweme_detail 字段: [${Object.keys(awemeDetail).join(', ')}]`);
            return awemeDetail;
        }

        // 其他接口可能返回 { aweme_list: [{...}] }
        const awemeList = json.aweme_list as Array<Record<string, unknown>> | undefined;
        if (awemeList?.length) {
            log('warn', `[API] aweme_list[0] 字段: [${Object.keys(awemeList[0]).join(', ')}]`);
            return awemeList[0];
        }

        log('warn', '[API] 无 aweme_detail 或 aweme_list, 完整响应:', JSON.stringify(json).slice(0, 500));
        return null;
    } catch (err) {
        log('error', '请求抖音 Web API 失败:', err);
        return null;
    }
}

/**
 * 从 API 响应中提取视频播放地址（无水印）
 * 参考 Python: replace('playwm', 'play')
 */
function extractVideoPlayUrl(apiData: Record<string, unknown>): string | null {
    const video = apiData.video as Record<string, unknown> | undefined;
    if (!video) {
        log('warn', '[提取] aweme 中无 video 字段');
        return null;
    }

    const playAddr = video.play_addr as Record<string, unknown> | undefined;
    if (!playAddr) {
        log('warn', `[提取] video 字段: [${Object.keys(video).join(', ')}], 无 play_addr`);
        return null;
    }

    const urlList = playAddr.url_list as string[] | undefined;
    if (!urlList?.length) {
        log('warn', '[提取] play_addr 无 url_list, 字段:', Object.keys(playAddr).join(', '));
        return null;
    }

    // 替换 'playwm' 为 'play' 以获取无水印地址
    const wmUrl = urlList[0];
    const nwmUrl = wmUrl.replace(/playwm/g, 'play');
    log('warn', `[提取] 视频地址: ${nwmUrl.slice(0, 100)}...`);
    return nwmUrl;
}

/**
 * 从 API 响应中提取图片列表（图集）
 */
function extractImageList(apiData: Record<string, unknown>): string[] | null {
    const images = apiData.images as Array<Record<string, unknown>> | undefined;
    if (!images?.length) return null;

    const urls: string[] = [];
    for (const img of images) {
        const urlList = img.url_list as string[] | undefined;
        if (urlList?.length) {
            urls.push(urlList[0]);
        }
    }
    return urls.length > 0 ? urls : null;
}

/**
 * 从 API 响应中提取封面图
 */
function extractCover(apiData: Record<string, unknown>): string | undefined {
    const video = apiData.video as Record<string, unknown> | undefined;
    const cover = video?.cover as Record<string, unknown> | undefined;
    const urlList = cover?.url_list as string[] | undefined;
    return urlList?.[0];
}

/**
 * 对视频播放地址应用质量参数
 */
function applyQuality(playUrl: string, quality: 'standard' | 'high'): string {
    try {
        const url = new URL(playUrl);
        const ratio = quality === 'high' ? '1080p' : '720p';
        url.searchParams.set('ratio', ratio);
        return url.toString();
    } catch {
        return playUrl;
    }
}

// ==================== 对外接口 ====================

export interface FetchDouyinResult {
    ok: boolean;
    info?: DouyinVideoDetail;
    errorType?: 'api_request' | 'api_response' | 'download';
    message?: string;
}

/**
 * 解析抖音分享链接，获取视频/图集信息
 *
 * 流程：
 *   1. 从分享链接解析出 aweme_id
 *   2. 获取 ttwid cookie
 *   3. 构造带 a_bogus 签名的请求地址
 *   4. 调用抖音 Web API 获取作品详情
 *   5. 提取无水印视频地址或图片列表
 *
 * @param shareUrl 抖音分享链接（短链接或长链接均可）
 * @param videoQuality 视频质量 'standard' (720p) | 'high' (1080p)
 * @returns 解析结果
 */
export async function fetchDouyinVideoInfo(
    shareUrl: string,
    videoQuality: 'standard' | 'high' = 'standard',
): Promise<FetchDouyinResult> {
    // 1. 解析 aweme_id
    log('warn', '[入口] 开始解析, shareUrl:', shareUrl);
    const awemeId = await resolveAwemeId(shareUrl);
    if (!awemeId) {
        log('warn', '[失败] 无法提取 aweme_id');
        return { ok: false, errorType: 'api_request', message: '无法从分享链接中提取 aweme_id' };
    }
    log('warn', '[步骤1] aweme_id:', awemeId);

    // 2. 获取 ttwid
    const ttwid = await getTtwid();
    log('warn', '[步骤2] ttwid:', ttwid ? `${ttwid.slice(0, 20)}...` : 'null');

    // 3. 调用 Web API
    log('warn', '[步骤3] 开始调用 Web API...');
    const apiData = await fetchVideoDetail(awemeId, ttwid || undefined);
    if (!apiData) {
        log('warn', '[失败] fetchVideoDetail 返回 null');
        return { ok: false, errorType: 'api_response', message: '抖音 Web API 返回为空或异常' };
    }
    log('warn', '[步骤3] Web API 返回成功, 字段:', Object.keys(apiData).join(', '));
    const desc = (apiData.desc as string) || '';
    const authorInfo = apiData.author as Record<string, unknown> | undefined;
    const author = (authorInfo?.nickname as string) || '抖音';
    const statistics = apiData.statistics as Record<string, unknown> | undefined;
    const likes = typeof statistics?.digg_count === 'number' ? statistics.digg_count : undefined;
    const cover = extractCover(apiData);

    // 5. 判断类型：图集或视频
    const imageList = extractImageList(apiData);
    if (imageList && imageList.length > 0) {
        log('info', `解析到图集: ${imageList.length} 张图片`);
        return {
            ok: true,
            info: {
                awemeId,
                desc,
                author,
                images: imageList,
                cover,
                likes,
                type: 'image',
                sourceUrl: shareUrl,
            },
        };
    }

    // 视频类型
    const rawPlayUrl = extractVideoPlayUrl(apiData);
    if (!rawPlayUrl) {
        return { ok: false, errorType: 'api_response', message: '接口未返回视频播放地址' };
    }

    const playUrl = applyQuality(rawPlayUrl, videoQuality);
    log('info', '解析到视频播放地址');

    return {
        ok: true,
        info: {
            awemeId,
            desc,
            author,
            playUrl,
            cover,
            likes,
            type: 'video',
            sourceUrl: shareUrl,
        },
    };
}
