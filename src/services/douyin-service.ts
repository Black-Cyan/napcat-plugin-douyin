import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';

interface DouyinVideoInfo {
    awemeId: string;
    desc: string;
    author: string;
    playUrl?: string;
    images?: string[];
    cover?: string;
    type: 'video' | 'image';
    sourceUrl: string;
}

interface DouyinApiResponse {
    item_list?: Array<{
        aweme_id?: string;
        desc?: string;
        author?: { nickname?: string };
        video?: {
            cover?: { url_list?: string[] };
            play_addr?: { url_list?: string[] };
            download_addr?: { url_list?: string[] };
        };
    }>;
}

interface MmpApiResponse {
    code?: number;
    data?: {
        type?: string;
        video_url?: string;
        video_url_HQ?: string;
        image_url?: string[];
        nickname?: string;
        desc?: string;
        aweme_id?: string;
    };
}

type DouyinVideo = NonNullable<DouyinApiResponse['item_list']>[number]['video'];

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 10; Pixel 5 Build/QQ3A.200805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0.0.0 Mobile Safari/537.36';
const dedupMap = new Map<string, number>();

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

function extractAwemeIdFromUrl(urlStr: string): string | null {
    try {
        const url = new URL(urlStr);
        const modalId = url.searchParams.get('modal_id');
        if (modalId && /^\d+$/.test(modalId)) return modalId;
    } catch {
        /* noop */
    }
    const patterns = [
        /video\/(\d+)/,
        /share\/video\/(\d+)/,
        /aweme_id=(\d+)/,
        /modal_id=(\d+)/,
    ];
    for (const reg of patterns) {
        const match = urlStr.match(reg);
        if (match?.[1]) return match[1];
    }
    return null;
}

function extractAwemeIdFromHtml(html: string): string | null {
    const match = html.match(/itemId":"(\d+)"/) || html.match(/aweme_id":"(\d+)"/);
    return match?.[1] ?? null;
}

function buildHeaders(url: string): Record<string, string> {
    return {
        'User-Agent': MOBILE_UA,
        Referer: 'https://www.douyin.com/',
        Origin: 'https://www.douyin.com',
        Host: new URL(url).hostname,
    };
}

async function resolveAwemeId(url: string): Promise<{ awemeId: string; finalUrl: string } | null> {
    try {
        const res = await fetch(url, { headers: buildHeaders(url) });
        const finalUrl = res.url || url;
        let awemeId = extractAwemeIdFromUrl(finalUrl);
        if (!awemeId) {
            const html = await res.text();
            awemeId = extractAwemeIdFromHtml(html);
        }
        if (!awemeId) return null;
        return { awemeId, finalUrl };
    } catch (err) {
        pluginState.logger.warn('解析抖音链接失败:', err);
        return null;
    }
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

function pickPlayUrl(video?: DouyinVideo): string | null {
    if (!video) return null;
    const urlList = video.play_addr?.url_list || video.download_addr?.url_list || [];
    if (!urlList.length) return null;
    const clean = urlList.find((u) => !u.includes('playwm')) || urlList[0];
    return clean || null;
}

async function fetchDouyinInfo(awemeId: string, sourceUrl: string): Promise<DouyinVideoInfo | null> {
    const api = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${awemeId}`;
    try {
        const res = await fetch(api, { headers: buildHeaders(api) });
        if (!res.ok) {
            pluginState.logger.warn(`抖音接口响应异常: ${res.status}`);
            return null;
        }

        const raw = await res.text();
        let json: DouyinApiResponse | null = null;
        try {
            json = raw ? JSON.parse(raw) as DouyinApiResponse : null;
        } catch (parseErr) {
            pluginState.logger.warn('解析抖音接口 JSON 失败:', parseErr);
            return null;
        }

        if (!json) return null;
        const item = json.item_list?.[0];
        if (!item) return null;
        const playUrl = pickPlayUrl(item.video as never);
        if (!playUrl) return null;
        return {
            awemeId,
            desc: item.desc || '',
            author: item.author?.nickname || '抖音',
            playUrl,
            cover: item.video?.cover?.url_list?.[0],
            type: 'video',
            sourceUrl,
        };
    } catch (err) {
        pluginState.logger.error('获取抖音视频信息失败:', err);
        return null;
    }
}

async function fetchViaMmpApi(shareUrl: string): Promise<DouyinVideoInfo | null> {
    const api = `https://api.mmp.cc/api/Jiexi?url=${encodeURIComponent(shareUrl)}`;
    try {
        const res = await fetch(api, { headers: { 'User-Agent': MOBILE_UA } });
        if (!res.ok) {
            pluginState.logger.warn(`mmp.cc 接口响应异常: ${res.status}`);
            return null;
        }

        const raw = await res.text();
        let json: MmpApiResponse | null = null;
        try {
            json = raw ? JSON.parse(raw) as MmpApiResponse : null;
        } catch (parseErr) {
            pluginState.logger.warn('解析 mmp.cc 接口 JSON 失败:', parseErr);
            return null;
        }

        const data = json?.data;
        if (!data || json?.code !== 200) return null;
        const awemeId = data.aweme_id || extractAwemeIdFromUrl(shareUrl) || 'unknown';
        if (data.type === 'image') {
            const images = Array.isArray(data.image_url) ? data.image_url.filter(Boolean) as string[] : [];
            if (!images.length) return null;
            return {
                awemeId,
                desc: data.desc || '',
                author: data.nickname || '抖音',
                images,
                type: 'image',
                sourceUrl: shareUrl,
            };
        }

        // 优先使用 video_url，HQ 仅作为兜底
        const playUrl = (data as { video_url?: string; video_url_HQ?: string }).video_url
            || (data as { video_url_HQ?: string }).video_url_HQ;
        if (!playUrl) return null;

        return {
            awemeId,
            desc: data.desc || '',
            author: data.nickname || '抖音',
            playUrl,
            type: 'video',
            sourceUrl: shareUrl,
        };
    } catch (err) {
        pluginState.logger.error('调用 mmp.cc 解析接口失败:', err);
        return null;
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

async function sendForwardVideo(
    ctx: NapCatPluginContext,
    groupId: number | string,
    info: DouyinVideoInfo,
    allowVideo: boolean
): Promise<boolean> {
    const nickname = pluginState.config.douyinForwardNickname || '抖音解析';
    const selfId = pluginState.selfId || '10000';
    const descLine = info.desc || '分享的抖音视频';
    const baseTextLines = [`${info.author}：${descLine}`];
    if (info.type === 'video' && info.playUrl) {
        baseTextLines.push(`视频直链: ${info.playUrl}`);
    }
    baseTextLines.push(`来源: ${info.sourceUrl}`);

    const baseNode: ForwardNode = {
        type: 'node',
        data: {
            nickname,
            user_id: selfId,
            content: [
                { type: 'text', data: { text: baseTextLines.join('\n') } },
            ],
        },
    };

    const nodes: ForwardNode[] = [baseNode];

    if (info.type === 'video') {
        const mediaNode: ForwardNode = {
            type: 'node',
            data: {
                nickname: info.author || nickname,
                user_id: selfId,
                content: allowVideo ? [
                    { type: 'video', data: { file: info.playUrl } },
                ] : [
                    { type: 'text', data: { text: '视频因体积超限未直接发送，请使用直链查看' } },
                ],
            },
        };
        if (info.cover && allowVideo) {
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
        return true;
    } catch (err) {
        pluginState.logger.warn('发送抖音合并转发失败，尝试以直链发送:', err);
        // 回退方案：直接发送文本 + 视频直链，避免下载受限
        const fallbackLines = [
            `${info.author}：${descLine}`,
            `来源: ${info.sourceUrl}`,
        ];
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
            return true;
        } catch (sendErr) {
            pluginState.logger.error('抖音回退文本发送失败:', sendErr);
            return false;
        }
    }
}

async function sendGroupEmojiLike(
    ctx: NapCatPluginContext,
    groupId: number | string,
    messageId: number | string | undefined,
    emojiId: string
): Promise<void> {
    if (!messageId) return;
    try {
        await ctx.actions.call(
            'group_msg_emoji_like',
            {
                group_id: String(groupId),
                message_id: String(messageId),
                emoji_id: emojiId,
            } as never,
            ctx.adapterName,
            ctx.pluginManager.config,
        );
    } catch (err) {
        pluginState.logger.warn(`发送消息表情点赞失败 emoji_id=${emojiId}:`, err);
    }
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

    if (pluginState.config.debug) {
        pluginState.logger.debug(`检测到 ${urls.length} 个抖音链接: ${urls.join(', ')}`);
    }

    // 即便未开启调试，也在检测到链接时输出一次 info，便于确认触发
    pluginState.logger.info(`检测到抖音链接，开始解析 | 群 ${groupId}`);
    await sendGroupEmojiLike(ctx, groupId, event.message_id, '10024');

    for (const url of urls) {
        // 先用 mmp.cc 接口直接解析
        let info = await fetchViaMmpApi(url);

        // 回落到官方接口解析 awemeId
        if (!info) {
            const resolved = await resolveAwemeId(url);
            if (!resolved) {
                if (pluginState.config.debug) {
                    pluginState.logger.debug('未能从链接解析 awemeId: ' + url);
                }
                continue;
            }
            info = await fetchDouyinInfo(resolved.awemeId, resolved.finalUrl);
            if (!info) {
                if (pluginState.config.debug) {
                    pluginState.logger.debug('未获取到视频信息 awemeId=' + resolved.awemeId);
                }
                continue;
            }
        }

        // 去重：同群同链接在窗口内不重复发送
        const dedupKey = `${groupId}:${url}`;
        const dedupWindow = (pluginState.config.dedupSeconds || 0) * 1000;
        if (dedupWindow > 0) {
            const last = dedupMap.get(dedupKey) || 0;
            if (Date.now() - last < dedupWindow) {
                pluginState.logger.info(`检测到重复链接，已跳过 | 群 ${groupId}`);
                continue;
            }
        }

        // 视频大小判定
        let allowVideo = true;
        if (info.type === 'video') {
            const limitMb = pluginState.config.maxVideoSizeMb || 0;
            if (limitMb > 0 && info.playUrl) {
                const sizeMb = await fetchVideoSizeMb(info.playUrl);
                if (sizeMb !== null && sizeMb > limitMb) {
                    allowVideo = false;
                    pluginState.logger.info(`视频大小 ${sizeMb.toFixed(1)}MB 超出上限 ${limitMb}MB，改为直链发送 | 群 ${groupId}`);
                }
            }
        }

        const sent = await sendForwardVideo(ctx, groupId, info, allowVideo);
        if (sent) {
            await sendGroupEmojiLike(ctx, groupId, event.message_id, '124');
            pluginState.logger.info(`已解析抖音作品 ${info.awemeId} 并转发到群 ${groupId}`);
            pluginState.incrementProcessed();
            dedupMap.set(dedupKey, Date.now());
            return true;
        }
    }

    pluginState.logger.debug('消息包含抖音链接，但未能解析有效视频');
    return false;
}
