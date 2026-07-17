import type { Quiz } from '@/types/domain'

/**
 * 计算题目核心内容的稳定版本号。
 *
 * 版本号用于派生调度缓存的失效检测，不承载安全用途，因此采用可在浏览器运行的
 * 非加密 cyrb53 hash，避免引入 Node.js `crypto` 依赖。
 */
export function computeContentRevision(quiz: Quiz): string {
  // 显式按固定顺序构造对象：Quiz 对象的属性插入顺序及无关字段都不应影响版本号。
  const relevantFields = {
    stem: quiz.stem,
    answer: quiz.answer,
    options: quiz.options,
    acceptableAnswers: quiz.acceptableAnswers,
  }

  return cyrb53(JSON.stringify(relevantFields)).toString(16)
}

/**
 * 计算影响 FSRS 调度结果的配置版本号。
 */
export function computeConfigRevision(config: {
  requestRetention: number
  maximumInterval: number
}): string {
  // 固定字段顺序，调用方传入对象的属性顺序不会影响版本号。
  return cyrb53(
    JSON.stringify({
      requestRetention: config.requestRetention,
      maximumInterval: config.maximumInterval,
    }),
  ).toString(16)
}

/**
 * cyrb53 是为变更检测准备的 53 位稳定非加密 hash。
 * 它只使用 ES 内建的 Math.imul，因此可在浏览器与服务端共同运行。
 */
function cyrb53(value: string): number {
  let hashA = 0xdeadbeef
  let hashB = 0x41c6ce57

  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index)
    hashA = Math.imul(hashA ^ codePoint, 2_654_435_761)
    hashB = Math.imul(hashB ^ codePoint, 1_597_334_677)
  }

  hashA =
    Math.imul(hashA ^ (hashA >>> 16), 2_246_822_507) ^
    Math.imul(hashB ^ (hashB >>> 13), 3_266_489_909)
  hashB =
    Math.imul(hashB ^ (hashB >>> 16), 2_246_822_507) ^
    Math.imul(hashA ^ (hashA >>> 13), 3_266_489_909)

  return 4_294_967_296 * (2_097_151 & hashB) + (hashA >>> 0)
}
