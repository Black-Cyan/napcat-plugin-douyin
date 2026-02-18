/**
 * 插件配置模块
 * 定义默认配置值和 WebUI 配置 Schema
 */

import type { NapCatPluginContext, PluginConfigSchema } from 'napcat-types/napcat-onebot/network/plugin/types';
import type { PluginConfig } from './types';

/** 默认配置 */
export const DEFAULT_CONFIG: PluginConfig = {
    enabled: true,
    debug: false,
    douyinAutoParse: true,
    douyinForwardNickname: '抖音解析',
    douyinVideoQuality: 'standard',
    douyinVideoSendMode: 'forward',
    maxVideoSizeMb: 80,
    dedupSeconds: 300,
    cacheDays: 2,
    cacheClearTime: '03:00',
    groupConfigs: {},
};

/**
 * 构建 WebUI 配置 Schema
 *
 * 使用 ctx.NapCatConfig 提供的构建器方法生成配置界面：
 *   - boolean(key, label, defaultValue?, description?, reactive?)  → 开关
 *   - text(key, label, defaultValue?, description?, reactive?)     → 文本输入
 *   - number(key, label, defaultValue?, description?, reactive?)   → 数字输入
 *   - select(key, label, options, defaultValue?, description?)     → 下拉单选
 *   - multiSelect(key, label, options, defaultValue?, description?) → 下拉多选
 *   - html(content)     → 自定义 HTML 展示（不保存值）
 *   - plainText(content) → 纯文本说明
 *   - combine(...items)  → 组合多个配置项为 Schema
 */
export function buildConfigSchema(ctx: NapCatPluginContext): PluginConfigSchema {
    return ctx.NapCatConfig.combine(
        // 插件信息头部
        ctx.NapCatConfig.html(`
            <div style="padding: 16px; background: #FB7299; border-radius: 12px; margin-bottom: 20px; color: white;">
                <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 600;">抖音视频解析</h3>
                <p style="margin: 0; font-size: 13px; opacity: 0.85;">自动解析群聊抖音分享链接并转发无水印视频</p>
            </div>
        `),
        // 全局开关
        ctx.NapCatConfig.boolean('enabled', '启用插件', true, '是否启用此插件的功能'),
        // 调试模式
        ctx.NapCatConfig.boolean('debug', '调试模式', false, '启用后将输出详细的调试日志'),
        // 抖音解析开关
        ctx.NapCatConfig.boolean('douyinAutoParse', '自动解析抖音链接', true, '开启后自动解析群消息中的抖音分享链接并转发视频'),
        // 合并转发昵称
        ctx.NapCatConfig.text('douyinForwardNickname', '转发显示昵称', '抖音解析', '发送合并转发时展示的昵称'),
        // 视频质量选择
        ctx.NapCatConfig.select(
            'douyinVideoQuality',
            '视频质量',
            [
                { label: '普通', value: 'standard' },
                { label: '高质量', value: 'high' },
            ],
            'standard',
            '普通=720p，高质量=1080p；高质量体积更大',
        ),
        // 视频发送方式
        ctx.NapCatConfig.select(
            'douyinVideoSendMode',
            '视频发送方式',
            [
                { label: '合并转发', value: 'forward' },
                { label: '直接发送', value: 'direct' },
            ],
            'forward',
            '为解决合并转发的视频资源过期问题，可选择直接逐条发送解析结果与视频资源。图文资源仍会以合并转发形式发送',
        ),
        // 视频大小上限
        ctx.NapCatConfig.number(
            'maxVideoSizeMb',
            '视频大小上限 (MB)',
            80,
            '超过此大小仅发送文本和直链；超过 100MB 会自动改为上传群文件，超过配置但未满 100MB 则不发送视频',
        ),
        // 去重时间窗口
        ctx.NapCatConfig.number('dedupSeconds', '去重时间 (秒)', 300, '同群同链接在该时间内不会重复发送'),
        // 缓存保留天数
        ctx.NapCatConfig.number(
            'cacheDays',
            '资源缓存时间 (天)',
            2,
            '整数天，过 0 点算一天，为 0 则不缓存',
        ),
        // 每日清理时间
        ctx.NapCatConfig.text(
            'cacheClearTime',
            '每日清除缓存时间',
            '03:00',
            '24 小时制 HH:mm，定时清空缓存资源与字符串池',
        )
    );
}
