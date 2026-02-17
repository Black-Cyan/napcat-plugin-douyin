/**
 * 类型定义文件
 * 定义插件内部使用的接口和类型
 *
 * 注意：OneBot 相关类型（OB11Message, OB11PostSendMsg 等）
 * 以及插件框架类型（NapCatPluginContext, PluginModule 等）
 * 均来自 napcat-types 包，无需在此重复定义。
 */

// ==================== 插件配置 ====================

/**
 * 插件主配置接口
 * 在此定义你的插件所需的所有配置项
 */
export interface PluginConfig {
    /** 全局开关：是否启用插件功能 */
    enabled: boolean;
    /** 调试模式：启用后输出详细日志 */
    debug: boolean;
    /** 是否自动解析群聊中的抖音分享链接 */
    douyinAutoParse: boolean;
    /** 合并转发时展示的昵称 */
    douyinForwardNickname: string;
    /** 抖音视频质量选择（普通/高质量） */
    douyinVideoQuality: 'standard' | 'high';
    /** 视频发送方式（合并转发/直接发送） */
    douyinVideoSendMode: 'forward' | 'direct';
    /** 视频大小上限（MB），超出仅发送文本和直链 */
    maxVideoSizeMb: number;
    /** 去重时间窗口（秒），同群同链接在窗口内不重复发送 */
    dedupSeconds: number;
    /** 按群的单独配置 */
    groupConfigs: Record<string, GroupConfig>;
}

/**
 * 群配置
 */
export interface GroupConfig {
    /** 是否启用此群的功能 */
    enabled?: boolean;
}

// ==================== API 响应 ====================

/**
 * 统一 API 响应格式
 */
export interface ApiResponse<T = unknown> {
    /** 状态码，0 表示成功，-1 表示失败 */
    code: number;
    /** 错误信息（仅错误时返回） */
    message?: string;
    /** 响应数据（仅成功时返回） */
    data?: T;
}
