/**
 * LLM Provider 抽象层 — 类型契约
 *
 * 对应 docs/Technical-Specification.md §3.1。
 *
 * 设计意图：
 *   - 不同 LLM 供应商（DeepSeek / GLM / 未来其他）实现同一接口
 *   - 调用方（Compiler / Feedback / FeynmanEval）只依赖此接口，不感知供应商
 *   - API Key 在请求 Header 中传入，不在此层持久化（NFR-S2）
 */

/** MVP 支持的供应商枚举（V2 可扩展） */
export type ProviderKind = 'deepseek' | 'glm'

/** 单条聊天消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * LLM 调用配置（用户在 Settings 中填入）
 */
export interface LLMConfig {
  provider: ProviderKind
  /** 用户的 API Key，仅在客户端 LocalStorage 与 HTTPS Header 中流转 */
  apiKey: string
  /** 可覆盖默认 baseURL（自部署 / 代理场景） */
  baseURL?: string
  /** 具体模型名，如 'deepseek-v4-flash' / 'glm-5.2' */
  model: string
  /** 默认温度，可被 ChatRequest 覆盖 */
  temperature?: number
  /** 默认 max tokens，可被 ChatRequest 覆盖 */
  maxTokens?: number
}

/** 单次调用请求 */
export interface ChatRequest {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  /**
   * 要求结构化输出时的 JSON Schema。
   * Provider 适配层负责翻译成该供应商的 `response_format` / `schema` 字段。
   */
  jsonSchema?: Record<string, unknown>
  /** 是否流式（编译进度反馈用） */
  stream?: boolean
}

/** 单次同步响应 */
export interface ChatResponse {
  content: string
  finishReason: 'stop' | 'length' | 'content_filter'
  usage: {
    promptTokens: number
    completionTokens: number
  }
}

/** ping 健康检查结果 */
export interface PingResult {
  ok: boolean
  /** 单次往返延迟，毫秒 */
  latencyMs: number
  /** 失败原因 / 成功提示 */
  message?: string
}

/**
 * 所有 LLM 供应商必须实现的接口
 *
 * 实现类：
 *   - OpenAICompatProvider：通用 OpenAI 兼容协议（DeepSeek / GLM 复用）
 *   - 装饰器层（未来）：缓存 / 限流 / 可观测性装饰器
 */
export interface LLMProvider {
  /** 主调用入口（同步等待完整响应） */
  chat(req: ChatRequest): Promise<ChatResponse>
  /** 流式调用（逐 token，编译进度反馈用） */
  chatStream(req: ChatRequest): AsyncIterable<ChatResponse>
  /** 健康检查（设置页 / ping 测试用） */
  ping(): Promise<PingResult>
}

/**
 * Provider 层抛出的错误类型分层
 *
 * 与 docs/Technical-Specification.md §8.1 AppError 对齐；
 * 此处只定义 Provider 内可见的子集。
 */
export type ProviderErrorKind =
  | 'llm_rate_limit' // 429
  | 'llm_unavailable' // 5xx
  | 'llm_client_error' // 4xx（除 429）
  | 'network' // 超时 / DNS / 连接拒绝
  | 'invalid_response' // 响应体无法解析

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly httpStatus?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}
