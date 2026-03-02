import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';

async function setMsgEmojiLike(
    ctx: NapCatPluginContext,
    messageId: number | string,
    emojiId: string,
): Promise<void> {
    try {
        await ctx.actions.call(
            'set_msg_emoji_like',
            { message_id: messageId, emoji_id: emojiId },
            ctx.adapterName,
            ctx.pluginManager.config,
        );
        if (pluginState.config.debug) {
            pluginState.logger.debug(`表情回复成功: message_id=${messageId}, emoji_id=${emojiId}`);
        }
    } catch (err) {
        pluginState.logger.warn('设置表情回复失败:', err);
    }
}

interface DouyinVideoInfo {
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

interface XhusApiResponse {
    code?: number;
    msg?: string;
    data?: {
        author?: string;
        uid?: string | number;
        avatar?: string;
        like?: number;
        time?: number;
        title?: string;
        cover?: string;
        images?: string[] | string;
        url?: string;
        music?: unknown;
    };
}

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 10; Pixel 5 Build/QQ3A.200805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0.0.0 Mobile Safari/537.36';
const GROUP_FILE_SIZE_LIMIT_MB = 100;
const dedupMap = new Map<string, number>();

type ParseErrorType = 'api_request' | 'api_response' | 'download';
type ParseStage = 'init' | 'requesting' | 'api_ready' | 'cache_hit' | 'downloading' | 'sending' | 'completed';
type ParseStatus = 'pending' | 'parsing' | 'success' | 'failed';

interface ParseLogEntry {
    time: number;
    message: string;
}

interface ParseRecord {
    id: string;
    url: string;
    normalizedUrl: string;
    groupId: string;
    status: ParseStatus;
    stage: ParseStage;
    progress: number;
    attempts: number;
    maxAttempts: number;
    message?: string;
    errorType?: ParseErrorType;
    createdAt: number;
    updatedAt: number;
    logs: ParseLogEntry[];
}

const PARSE_RECORD_LIMIT = 120;
const parseRecords: ParseRecord[] = [];
let parseSeq = 0;

function pushParseLog(record: ParseRecord, message: string): void {
    record.logs.push({ time: Date.now(), message });
    if (record.logs.length > 50) {
        record.logs.shift();
    }
}

function createParseRecord(url: string, groupId: string): ParseRecord {
    const now = Date.now();
    const record: ParseRecord = {
        id: `task-${now}-${++parseSeq}`,
        url,
        normalizedUrl: normalizeDouyinUrl(url),
        groupId,
        status: 'pending',
        stage: 'init',
        progress: 0,
        attempts: 0,
        maxAttempts: 3,
        message: '等待解析',
        createdAt: now,
        updatedAt: now,
        logs: [],
    };
    pushParseLog(record, '创建解析任务');
    parseRecords.unshift(record);
    if (parseRecords.length > PARSE_RECORD_LIMIT) parseRecords.pop();
    return record;
}

function updateParseRecord(record: ParseRecord, patch: Partial<ParseRecord>, logMessage?: string): void {
    Object.assign(record, patch);
    record.updatedAt = Date.now();
    if (logMessage) pushParseLog(record, logMessage);
}

function markParseSuccess(record: ParseRecord, message: string): void {
    updateParseRecord(record, { status: 'success', stage: 'completed', progress: 100, message }, message);
}

function markParseFailure(record: ParseRecord, errorType: ParseErrorType, message: string): void {
    updateParseRecord(record, { status: 'failed', stage: 'completed', progress: 100, errorType, message }, message);
}

export function getParseRecords(): ParseRecord[] {
    return parseRecords.map((r) => ({
        ...r,
        logs: [...r.logs],
    }));
}

interface CacheRecord {
    url: string;
    info: DouyinVideoInfo;
    sizeMb: number | null;
    fileSizeBytes?: number | null;
    localPath?: string;
    cachedAt: number;
}

const CACHE_FILE = 'douyin-cache.json';
const CACHE_CLEAR_TIMER_ID = 'douyin-cache-clear';
let cacheLoaded = false;
let cacheMap: Map<string, CacheRecord> = new Map();
let stringCache: Set<string> = new Set();

type VideoSendMode = 'inline' | 'text_only' | 'upload_group_file';
type SendResult = { success: boolean; errorType?: ParseErrorType; message?: string };

function getLocalVideoPath(awemeId: string): string {
    const safeId = awemeId || 'unknown';
    const ts = Date.now();
    return path.join(pluginState.ctx.dataPath, `douyin_${safeId}_${ts}.mp4`);
}

async function downloadVideoToLocal(
    url: string,
    awemeId: string,
    onProgress?: (percent: number, downloadedBytes: number, totalBytes: number | null) => void,
): Promise<{ filePath: string; sizeMb: number | null } | null> {
    if (!/^https?:\/\//i.test(url)) {
        // 已是本地文件路径则直接复用
        if (fs.existsSync(url)) {
            const stat = fs.statSync(url);
            return { filePath: url, sizeMb: stat.size / (1024 * 1024) };
        }
        pluginState.logger.warn('下载视频失败，输入既不是 URL 也不是存在的本地文件:', url);
        return null;
    }

    const filePath = getLocalVideoPath(awemeId);
    try {
        const res = await fetch(url);
        if (!res.ok || !res.body) {
            pluginState.logger.warn('下载视频失败，响应异常');
            return null;
        }
        const total = Number(res.headers.get('content-length'));
        const totalBytes = Number.isFinite(total) ? total : null;

        const tmpPath = filePath + '.downloading';
        const writable = fs.createWriteStream(tmpPath);
        const readable = Readable.fromWeb(res.body as unknown as globalThis.ReadableStream);

        let received = 0;
        await new Promise<void>((resolve, reject) => {
            readable.on('data', (chunk) => {
                const len = (chunk as Buffer).length;
                received += len;
                if (onProgress) {
                    const percent = totalBytes ? (received / totalBytes) * 100 : 0;
                    onProgress(percent, received, totalBytes);
                }
            });
            readable.on('error', reject);
            writable.on('error', reject);
            writable.on('finish', resolve);
            readable.pipe(writable);
        });

        fs.renameSync(tmpPath, filePath);
        const sizeMb = received / (1024 * 1024);
        return { filePath, sizeMb };
    } catch (err) {
        pluginState.logger.error('下载视频失败:', err);
        return null;
    }
}

function extractDouyinUrls(text: string): string[] {
    const urlMatches = text.match(/https?:\/\/[^\s]+/g) || [];
    return urlMatches
        .map((u) => u.replace(/[)>"'\]]+$/, ''))
        .filter((u) => {
            try {
                const host = new URL(u).hostname;
                return host.includes('douyin.com') || host.includes('iesdouyin.com');
            } catch {
                return false;
            }
        });
}

function normalizeDouyinUrl(raw: string): string {
    try {
        const url = new URL(raw.trim());
        url.hash = '';
        if (!url.pathname.endsWith('/')) {
            url.pathname = url.pathname + '/';
        }
        return url.toString();
    } catch {
        return raw.trim();
    }
}

function startOfDay(ts: number): number {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function isCacheExpired(cachedAt: number): boolean {
    const days = Math.max(0, pluginState.config.cacheDays || 0);
    if (days <= 0) return true;
    const today = startOfDay(Date.now());
    const cachedDay = startOfDay(cachedAt);
    const diffDays = (today - cachedDay) / (24 * 60 * 60 * 1000);
    return diffDays >= days;
}

function ensureCacheLoaded(): void {
    if (cacheLoaded) return;
    const stored = pluginState.loadDataFile<{ entries: CacheRecord[]; stringPool: string[] }>(
        CACHE_FILE,
        { entries: [], stringPool: [] },
    );
    cacheMap = new Map((stored.entries || []).map((e) => [e.url, e]));
    stringCache = new Set(stored.stringPool || []);
    cacheLoaded = true;
    pruneExpiredCache();
}

function persistCache(): void {
    pluginState.saveDataFile(CACHE_FILE, {
        entries: Array.from(cacheMap.values()),
        stringPool: Array.from(stringCache),
    });
}

function pruneExpiredCache(): void {
    ensureCacheLoaded();
    let removed = 0;
    for (const [url, entry] of cacheMap) {
        if (isCacheExpired(entry.cachedAt)) {
            cacheMap.delete(url);
            stringCache.delete(url);
            removed++;
        }
    }
    if (removed > 0) {
        persistCache();
        pluginState.logger.debug(`已移除过期抖音缓存 ${removed} 条`);
    }
}

function getCachedResource(url: string): CacheRecord | null {
    ensureCacheLoaded();
    const key = normalizeDouyinUrl(url);
    const entry = cacheMap.get(key);
    if (!entry) return null;
    if (isCacheExpired(entry.cachedAt)) {
        cacheMap.delete(key);
        stringCache.delete(key);
        persistCache();
        return null;
    }
    if (entry.localPath && !fs.existsSync(entry.localPath)) {
        entry.localPath = undefined;
    }
    return entry;
}

function cacheResource(url: string, info: DouyinVideoInfo, sizeMb: number | null): void {
    if (Math.max(0, pluginState.config.cacheDays || 0) <= 0) return;
    ensureCacheLoaded();
    const key = normalizeDouyinUrl(url);
    const record: CacheRecord = {
        url: key,
        info: { ...info, sourceUrl: info.sourceUrl || key },
        sizeMb: sizeMb ?? null,
        fileSizeBytes: sizeMb !== null ? Math.round(sizeMb * 1024 * 1024) : null,
        cachedAt: Date.now(),
    };
    cacheMap.set(key, record);
    stringCache.add(key);
    persistCache();
}

function clearCacheInternal(): void {
    ensureCacheLoaded();
    const entryCount = cacheMap.size;
    const stringCount = stringCache.size;
    cacheMap.clear();
    stringCache.clear();
    persistCache();
    pluginState.logger.info(`已清除抖音缓存资源 ${entryCount} 条，字符串池 ${stringCount} 条`);
}

function computeNextClearDelay(): number {
    const timeStr = pluginState.config.cacheClearTime || '03:00';
    const match = /^([0-1]?\d|2[0-3]):([0-5]\d)$/.exec(timeStr.trim());
    if (!match) return 24 * 60 * 60 * 1000;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const now = new Date();
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
    }
    return target.getTime() - now.getTime();
}

function scheduleDailyCacheClear(): void {
    ensureCacheLoaded();
    const existing = pluginState.timers.get(CACHE_CLEAR_TIMER_ID);
    if (existing) {
        clearTimeout(existing as NodeJS.Timeout);
        pluginState.timers.delete(CACHE_CLEAR_TIMER_ID);
    }

    const delay = computeNextClearDelay();
    const timer = setTimeout(() => {
        clearCacheInternal();
        scheduleDailyCacheClear();
    }, delay);

    pluginState.timers.set(CACHE_CLEAR_TIMER_ID, timer as never);
    pluginState.logger.info(`缓存清理任务已安排，将在 ${(delay / 60000).toFixed(1)} 分钟后执行`);
}

export function initDouyinCacheScheduler(): void {
    ensureCacheLoaded();
    scheduleDailyCacheClear();
}

export function refreshDouyinCacheSchedule(): void {
    pruneExpiredCache();
    scheduleDailyCacheClear();
}

export function clearDouyinCacheNow(): void {
    clearCacheInternal();
    scheduleDailyCacheClear();
}

export function getDouyinCachePreview(): {
    total: number;
    stringPool: number;
    entries: Array<{
        url: string;
        type: DouyinVideoInfo['type'];
        author: string;
        desc: string;
        sizeMb: number | null;
        cachedAt: number;
        sourceUrl: string;
    }>;
} {
    ensureCacheLoaded();
    pruneExpiredCache();
    const entries = Array.from(cacheMap.values())
        .sort((a, b) => b.cachedAt - a.cachedAt)
        .map((e) => ({
            url: e.url,
            type: e.info.type,
            author: e.info.author,
            desc: e.info.desc || '',
            sizeMb: e.sizeMb,
            cachedAt: e.cachedAt,
            sourceUrl: e.info.sourceUrl,
        }));
    return { total: entries.length, stringPool: stringCache.size, entries };
}

async function fetchVideoSizeMb(url: string): Promise<number | null> {
    try {
        const res = await fetch(url, { method: 'HEAD' });
        const len = res.headers.get('content-length');
        if (!len) return null;
        const bytes = Number(len);
        if (Number.isNaN(bytes) || bytes <= 0) return null;
        return bytes / (1024 * 1024);
    } catch (e) {
        if (pluginState.config.debug) pluginState.logger.debug('获取视频大小失败:', e);
        return null;
    }
}

function applyQualityToUrl(playUrl: string): string {
    try {
        const url = new URL(playUrl);
        const quality = pluginState.config.douyinVideoQuality === 'high' ? '1080p' : '720p';
        url.searchParams.set('ratio', quality);
        return url.toString();
    } catch {
        return playUrl;
    }
}

interface FetchVideoResult {
    ok: boolean;
    info?: DouyinVideoInfo;
    errorType?: ParseErrorType;
    message?: string;
}

async function fetchViaXhusApi(shareUrl: string): Promise<FetchVideoResult> {
    const api = `http://api.xhus.cn/api/douyin?url=${encodeURIComponent(shareUrl)}`;
    try {
        const res = await fetch(api, { headers: { 'User-Agent': MOBILE_UA } });
        const raw = await res.text();
        if (!res.ok) {
            const snippet = raw ? raw.slice(0, 300) : '';
            const msg = `xhus 接口响应异常: ${res.status}${snippet ? ` | body: ${snippet}` : ''}`;
            pluginState.logger.warn(msg);
            return { ok: false, errorType: 'api_request', message: msg };
        }

        const trimmed = raw.trim();
        if (trimmed.startsWith('<') || trimmed.includes('waf_js') || trimmed.includes('Please wait')) {
            const msg = '解析接口返回异常（疑似风控/HTML 验证页）';
            pluginState.logger.warn(msg, trimmed.slice(0, 200));
            return { ok: false, errorType: 'api_response', message: msg };
        }

        let json: XhusApiResponse | null = null;
        try {
            json = trimmed ? JSON.parse(trimmed) as XhusApiResponse : null;
        } catch (parseErr) {
            const msg = '解析 xhus 接口 JSON 失败';
            pluginState.logger.warn(msg + ':', parseErr, trimmed.slice(0, 200));
            return { ok: false, errorType: 'api_response', message: `${msg}: ${String(parseErr)}` };
        }
        if (!json || json.code !== 200 || !json.data) {
            const msg = `解析接口返回异常 code=${json?.code ?? 'null'} msg=${json?.msg ?? ''}`;
            pluginState.logger.warn(msg, json);
            return { ok: false, errorType: 'api_response', message: msg };
        }
        const data = json.data;
        const awemeId = String(data.uid ?? Date.now());
        const author = data.author || '抖音';
        const desc = data.title || '';
        const likeNum = typeof data.like === 'number' ? data.like : Number(data.like);
        const likes = Number.isFinite(likeNum) ? likeNum : undefined;
        const images = Array.isArray(data.images) ? data.images.filter(Boolean) as string[] : null;
        if (images && images.length) {
            return {
                ok: true,
                info: {
                    awemeId,
                    desc,
                    author,
                    images,
                    cover: data.cover,
                    likes,
                    type: 'image',
                    sourceUrl: shareUrl,
                },
            };
        }
        if (!data.url) {
            const msg = '接口未返回视频链接';
            return { ok: false, errorType: 'api_response', message: msg };
        }
        const playUrl = applyQualityToUrl(data.url);
        return {
            ok: true,
            info: {
                awemeId,
                desc,
                author,
                playUrl,
                cover: data.cover,
                likes,
                type: 'video',
                sourceUrl: shareUrl,
            },
        };
    } catch (err) {
        const msg = `调用 xhus 解析接口失败: ${String(err)}`;
        pluginState.logger.error(msg);
        return { ok: false, errorType: 'api_request', message: msg };
    }
}

interface ForwardNode {
    type: 'node';
    data: {
        nickname: string;
        user_id?: string;
        content: Array<{ type: string; data: Record<string, unknown> }>;
    };
}

async function uploadVideoToGroupFile(
    ctx: NapCatPluginContext,
    groupId: number | string,
    info: DouyinVideoInfo,
    sizeMb: number | null,
): Promise<{ success: boolean; fileName?: string; message?: string }> {
    if (!info.playUrl) return { success: false, message: '缺少视频直链' };
    const fileName = `douyin_${info.awemeId || Date.now()}.mp4`;
    try {
        await ctx.actions.call(
            'upload_group_file',
            {
                group_id: String(groupId),
                file: info.playUrl,
                name: fileName,
            },
            ctx.adapterName,
            ctx.pluginManager.config,
        );
        const sizeLabel = sizeMb !== null ? `${sizeMb.toFixed(1)}MB` : '未知大小';
        pluginState.logger.info(`视频体积 ${sizeLabel} 超过 ${GROUP_FILE_SIZE_LIMIT_MB}MB，已上传为群文件 | 群 ${groupId}`);
        return { success: true, fileName };
    } catch (err) {
        pluginState.logger.error('上传视频到群文件失败:', err);
        return { success: false, fileName, message: String(err) };
    }
}

async function sendForwardVideo(
    ctx: NapCatPluginContext,
    groupId: number | string,
    info: DouyinVideoInfo,
    mode: VideoSendMode,
    sizeMb: number | null,
    localFilePath?: string,
): Promise<SendResult> {
    const preferDirect = pluginState.config.douyinVideoSendMode === 'direct';
    const nickname = pluginState.config.douyinForwardNickname || '抖音解析';
    const selfId = pluginState.selfId || '10000';
    const descLine = info.desc || '分享的抖音视频';
    const baseTextLines = [`${info.author}：${descLine}`];
    if (typeof info.likes === 'number') {
        baseTextLines.push(`点赞: ${info.likes}`);
    }
    if (sizeMb !== null && info.type === 'video') {
        baseTextLines.push(`视频大小: ${sizeMb.toFixed(1)}MB`);
    }
    if (info.type === 'video' && info.playUrl) {
        baseTextLines.push(`视频直链: ${info.playUrl}`);
    }
    baseTextLines.push(`来源: ${info.sourceUrl}`);

    const baseSegments: Array<{ type: string; data: Record<string, unknown> }> = [
        { type: 'text', data: { text: baseTextLines.join('\n') } },
    ];
    if (info.type === 'video' && info.cover) {
        baseSegments.push({ type: 'image', data: { file: info.cover } });
    }

    const baseNode: ForwardNode = {
        type: 'node',
        data: {
            nickname,
            user_id: selfId,
            content: baseSegments,
        },
    };

    const nodes: ForwardNode[] = [baseNode];

    if (info.type === 'video' && mode === 'upload_group_file') {
        const uploadRes = await uploadVideoToGroupFile(ctx, groupId, { ...info, playUrl: localFilePath || info.playUrl }, sizeMb);
        const noticeLines = [
            `${info.author}：${descLine}`,
            typeof info.likes === 'number' ? `点赞: ${info.likes}` : undefined,
            sizeMb !== null ? `视频大小: ${sizeMb.toFixed(1)}MB` : undefined,
            uploadRes.success
                ? `已上传为群文件：${uploadRes.fileName || '视频文件'}`
                : '尝试上传群文件失败，未直接发送视频',
            info.playUrl ? '视频直链: ' + info.playUrl : undefined,
            '超过 100MB 会以群文件方式发送，超过配置但未满 100MB 的视频不会直接发送',
            `来源: ${info.sourceUrl}`,
        ].filter(Boolean) as string[];

        try {
            const messageSegments: Array<{ type: string; data: Record<string, unknown> }> = [
                { type: 'text', data: { text: noticeLines.join('\n') } },
            ];
            if (info.cover) {
                messageSegments.push({ type: 'image', data: { file: info.cover } });
            }

            await ctx.actions.call(
                'send_msg',
                {
                    message_type: 'group',
                    group_id: String(groupId),
                    message: messageSegments,
                },
                ctx.adapterName,
                ctx.pluginManager.config,
            );
            if (!uploadRes.success) {
                return { success: false, errorType: 'download', message: uploadRes.message || '上传群文件失败' };
            }
            return { success: true };
        } catch (err) {
            pluginState.logger.error('发送上传提示消息失败:', err);
            return { success: false, errorType: 'download', message: '发送上传提示消息失败' };
        }
    }

    if (info.type === 'video' && preferDirect) {
        const infoSegments = [...baseSegments];
        if (mode === 'text_only') {
            infoSegments.push({ type: 'text', data: { text: '视频大小超过配置限制，未直接发送；超过 100MB 将自动以群文件方式发送' } });
        }

        try {
            await ctx.actions.call(
                'send_msg',
                { message_type: 'group', group_id: String(groupId), message: infoSegments },
                ctx.adapterName,
                ctx.pluginManager.config,
            );
        } catch (err) {
            pluginState.logger.error('发送视频信息消息失败:', err);
            return { success: false, errorType: 'download', message: '发送视频信息消息失败' };
        }

        if (mode === 'inline') {
            try {
                await ctx.actions.call(
                    'send_msg',
                    { message_type: 'group', group_id: String(groupId), message: [{ type: 'video', data: { file: localFilePath || info.playUrl } }] },
                    ctx.adapterName,
                    ctx.pluginManager.config,
                );
            } catch (err) {
                pluginState.logger.error('直接发送视频资源失败:', err);
                return { success: false, errorType: 'download', message: '直接发送视频资源失败' };
            }
        }

        return { success: true };
    }

    if (info.type === 'video') {
        const mediaNode: ForwardNode = {
            type: 'node',
            data: {
                nickname: info.author || nickname,
                user_id: selfId,
                content: mode === 'inline' ? [
                    { type: 'video', data: { file: localFilePath || info.playUrl } },
                ] : [
                    { type: 'text', data: { text: '视频大小超过配置限制，未直接发送；超过 100MB 将自动以群文件方式发送' } },
                    ...(info.playUrl ? [{ type: 'text', data: { text: `视频直链: ${info.playUrl}` } }] : []),
                ],
            },
        };
        if (info.cover && mode === 'inline') {
            mediaNode.data.content.push({ type: 'image', data: { file: info.cover } });
        }
        nodes.push(mediaNode);
    } else if (info.type === 'image') {
        const imgs = info.images || [];
        imgs.forEach((imgUrl, idx) => {
            nodes.push({
                type: 'node',
                data: {
                    nickname: `${info.author || nickname} ${idx + 1}/${imgs.length}`,
                    user_id: selfId,
                    content: [
                        { type: 'image', data: { file: imgUrl } },
                    ],
                },
            });
        });
    }

    try {
        await ctx.actions.call(
            'send_group_forward_msg',
            { group_id: String(groupId), message: nodes },
            ctx.adapterName,
            ctx.pluginManager.config,
        );
        return { success: true };
    } catch (err) {
        pluginState.logger.warn('发送抖音合并转发失败，尝试以直链发送:', err);
        const fallbackLines = [
            `${info.author}：${descLine}`,
            `来源: ${info.sourceUrl}`,
        ];
        if (typeof info.likes === 'number') fallbackLines.splice(1, 0, `点赞: ${info.likes}`);
        if (info.type === 'video' && info.playUrl) fallbackLines.splice(1, 0, `视频直链: ${info.playUrl}`);
        if (info.type === 'image' && info.images?.length) {
            fallbackLines.push('图片直链:');
            fallbackLines.push(...info.images.map((u, i) => `${i + 1}. ${u}`));
        }
        const fallbackText = fallbackLines.join('\n');
        try {
            await ctx.actions.call(
                'send_msg',
                {
                    message_type: 'group',
                    group_id: String(groupId),
                    message: fallbackText,
                },
                ctx.adapterName,
                ctx.pluginManager.config,
            );
            pluginState.logger.info(`抖音合并转发失败，已使用直链回退发送 | 群 ${groupId}`);
            return { success: true, message: '合并转发失败，已回退文本' };
        } catch (sendErr) {
            pluginState.logger.error('抖音回退文本发送失败:', sendErr);
            return { success: false, errorType: 'download', message: '合并转发与回退文本均失败' };
        }
    }
}

async function handleSingleUrl(
    ctx: NapCatPluginContext,
    event: OB11Message,
    normalizedUrl: string,
    dedupKey: string,
): Promise<boolean> {
    const groupId = String(event.group_id);
    const record = createParseRecord(normalizedUrl, groupId);
    updateParseRecord(record, { status: 'parsing', message: '开始解析', progress: 5 }, '开始解析');

    const cached = getCachedResource(normalizedUrl);
    let latestInfo: DouyinVideoInfo | null = cached?.info ?? null;
    let cachedSize = cached?.sizeMb ?? null;
    let cachedLocalPath = cached?.localPath;
    let lastErrorType: ParseErrorType | null = null;

    for (let attempt = 1; attempt <= record.maxAttempts; attempt++) {
        updateParseRecord(record, { attempts: attempt, status: 'parsing' }, attempt === 1 ? '开始解析' : `第 ${attempt} 次重试`);

        const needApi = !latestInfo || lastErrorType === 'api_request' || lastErrorType === 'api_response';
        if (needApi) {
            updateParseRecord(record, { stage: 'requesting', progress: 25, message: `第 ${attempt} 次请求解析接口` }, `第 ${attempt} 次请求解析接口`);
            const apiRes = await fetchViaXhusApi(normalizedUrl);
            if (!apiRes.ok || !apiRes.info) {
                const errType = apiRes.errorType || 'api_request';
                const msg = apiRes.message || '解析接口返回为空';
                pluginState.logger.warn(`抖音解析接口失败: ${msg} | url=${normalizedUrl} | attempt=${attempt}`);
                if (attempt >= record.maxAttempts) {
                    markParseFailure(record, errType, msg);
                    return false;
                }
                updateParseRecord(
                    record,
                    { errorType: errType, message: msg, stage: 'requesting', progress: 30 },
                    `接口错误: ${msg}`,
                );
                lastErrorType = errType;
                continue;
            }
            latestInfo = apiRes.info;
            lastErrorType = null;
            updateParseRecord(record, { stage: 'api_ready', progress: 45, message: '接口返回正常' }, '接口返回正常');
        } else {
            updateParseRecord(record, { stage: 'downloading', progress: 45, message: '接口正常，重试下载/发送' }, '接口正常，重试下载/发送');
        }

        if (!latestInfo) {
            markParseFailure(record, 'api_response', '未获取到有效的解析数据');
            return false;
        }

        let sizeMb = cachedSize;
        let sendMode: VideoSendMode = 'inline';
        let localFilePath: string | undefined;
        if (latestInfo.type === 'video' && latestInfo.playUrl) {
            updateParseRecord(record, { stage: 'downloading', progress: 55, message: '检查视频大小' }, '检查视频大小');
            const fetchedSize = await fetchVideoSizeMb(latestInfo.playUrl);
            if (fetchedSize !== null) sizeMb = fetchedSize;
            const limitMb = pluginState.config.maxVideoSizeMb || 0;
            if (sizeMb !== null && sizeMb > GROUP_FILE_SIZE_LIMIT_MB) {
                sendMode = 'upload_group_file';
                pluginState.logger.info(`视频大小 ${sizeMb.toFixed(1)}MB 超过 ${GROUP_FILE_SIZE_LIMIT_MB}MB，优先上传到群文件 | 群 ${groupId}`);
            } else if (limitMb > 0 && sizeMb !== null && sizeMb > limitMb) {
                sendMode = 'text_only';
                pluginState.logger.info(`视频大小 ${sizeMb.toFixed(1)}MB 超出上限 ${limitMb}MB，超过配置但未满 ${GROUP_FILE_SIZE_LIMIT_MB}MB 不发送视频 | 群 ${groupId}`);
            }

            // 若缓存已有本地文件则直接使用，不重复下载
            if (cachedLocalPath && fs.existsSync(cachedLocalPath)) {
                localFilePath = cachedLocalPath;
                sizeMb = cached?.fileSizeBytes ? cached.fileSizeBytes / (1024 * 1024) : sizeMb;
                updateParseRecord(record, { stage: 'downloading', progress: 65, message: '命中本地视频文件，直接发送' }, '命中本地视频文件，直接发送');
            } else {
                // 主动下载到本地，避免平台端长时间下载不可观测
                updateParseRecord(record, { stage: 'downloading', message: '开始本地下载视频' }, '开始本地下载视频');
                const dlResult = await downloadVideoToLocal(latestInfo.playUrl, latestInfo.awemeId, (percent, downloaded, total) => {
                    const totalMb = total ? total / (1024 * 1024) : null;
                    const prog = total ? 55 + Math.min(20, (percent / 100) * 20) : 60;
                    const label = totalMb !== null
                        ? `下载中 ${percent.toFixed(1)}% (${(downloaded / 1024 / 1024).toFixed(1)} / ${totalMb.toFixed(1)} MB)`
                        : `下载中 ${(downloaded / 1024 / 1024).toFixed(1)} MB`;
                    updateParseRecord(record, { stage: 'downloading', progress: prog, message: label }, label);
                });
                if (dlResult && dlResult.filePath) {
                    localFilePath = dlResult.filePath;
                    sizeMb = dlResult.sizeMb ?? sizeMb;
                    cachedSize = sizeMb;
                } else {
                    const msg = '本地下载失败';
                    const errType: ParseErrorType = 'download';
                    if (attempt >= record.maxAttempts) {
                        markParseFailure(record, errType, msg);
                        return false;
                    }
                    lastErrorType = errType;
                    updateParseRecord(record, { errorType: errType, message: msg, progress: 60 }, `${msg}，准备重试`);
                    continue;
                }
            }
        }

        const waitingMessage = sendMode === 'inline'
            ? '已提交，平台侧正在下载视频（进度取决于网络带宽）'
            : sendMode === 'upload_group_file'
                ? '已请求上传群文件，平台可能继续下载大文件'
                : '发送文本/直链中';

        updateParseRecord(
            record,
            {
                stage: 'sending',
                progress: sendMode === 'text_only' ? 80 : 70,
                message: `发送中（模式: ${sendMode}），${waitingMessage}`,
            },
            `发送中（模式: ${sendMode}）`,
        );
        const sendRes = await sendForwardVideo(ctx, groupId, latestInfo, sendMode, sizeMb, localFilePath);
        if (sendRes.success) {
            pluginState.logger.info(`已解析抖音作品 ${latestInfo.awemeId} 并转发到群 ${groupId}`);
            pluginState.incrementProcessed();
            dedupMap.set(dedupKey, Date.now());
            markParseSuccess(record, sendRes.message || '解析完成');
            if (event.message_id) {
                await setMsgEmojiLike(ctx, event.message_id, '124');
            }

            if (!cached) {
                cacheResource(normalizedUrl, { ...latestInfo, playUrl: localFilePath || latestInfo.playUrl }, sizeMb ?? null);
            }

            const entry = cacheMap.get(normalizedUrl);
            if (entry && (localFilePath || cachedLocalPath)) {
                entry.localPath = localFilePath || cachedLocalPath;
                entry.fileSizeBytes = sizeMb !== null ? Math.round(sizeMb * 1024 * 1024) : entry.fileSizeBytes;
                persistCache();
            }
            return true;
        }

        const errType = sendRes.errorType || 'download';
        const msg = sendRes.message || '发送失败';
        if (attempt >= record.maxAttempts) {
            markParseFailure(record, errType, msg);
            return false;
        }
        lastErrorType = errType;
        updateParseRecord(record, { errorType: errType, message: msg, progress: 65 }, `发送失败：${msg}，准备重试`);
    }

    markParseFailure(record, 'download', '解析失败，已达最大重试次数');
    return false;
}

export async function processDouyinShare(
    ctx: NapCatPluginContext,
    event: OB11Message
): Promise<boolean> {
    if (event.message_type !== 'group') return false;
    if (!pluginState.config.douyinAutoParse) {
        if (pluginState.config.debug) pluginState.logger.debug('已禁用抖音自动解析，跳过');
        return false;
    }
    const groupId = event.group_id;
    if (!groupId) return false;

    const rawMessage = event.raw_message
        || (Array.isArray(event.message)
            ? event.message.map((m) => {
                if (typeof m === 'string') return m;
                const seg = m as { data?: { text?: string } };
                return seg.data?.text || '';
            }).join('')
            : '');

    if (pluginState.config.debug) {
        pluginState.logger.debug(`尝试解析群 ${groupId} 消息: ${rawMessage}`);
    }

    const urls = extractDouyinUrls(rawMessage);
    if (!urls.length) return false;

    if (event.message_id) {
        await setMsgEmojiLike(ctx, event.message_id, '10024');
    }

    if (pluginState.config.debug) {
        pluginState.logger.debug(`检测到 ${urls.length} 个抖音链接: ${urls.join(', ')}`);
    }

    pluginState.logger.info(`检测到抖音链接，开始解析 | 群 ${groupId}`);

    for (const url of urls) {
        const normalizedUrl = normalizeDouyinUrl(url);
        const dedupKey = `${groupId}:${normalizedUrl}`;
        const dedupWindow = (pluginState.config.dedupSeconds || 0) * 1000;
        if (dedupWindow > 0) {
            const last = dedupMap.get(dedupKey) || 0;
            if (Date.now() - last < dedupWindow) {
                pluginState.logger.info(`检测到重复链接，已跳过 | 群 ${groupId}`);
                continue;
            }
        }

        const sent = await handleSingleUrl(ctx, event, normalizedUrl, dedupKey);
        if (sent) return true;
    }

    pluginState.logger.debug('消息包含抖音链接，但未能解析有效视频');
    return false;
}
