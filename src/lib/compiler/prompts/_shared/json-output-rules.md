# JSON 输出通用规则

> 本片段被所有 9 个 Agent 在 system 段引用。引用方式：`{{> shared/json-output-rules}}`。
> Provider 层会自动启用 `response_format: {type: 'json_object'}`，本片段是**给 LLM 的指令补充**。

---

## 你必须遵守的 JSON 输出规则

1. **只输出一个合法 JSON 对象**。不要在 JSON 外添加任何文字、注释、解释、道歉。
2. **不要使用 markdown 代码块包裹**。不要输出 ` ```json ` 或 ` ``` ` 之类的标记。
3. **JSON 必须严格匹配下方"输出 Schema"**。
4. **不要输出 Schema 未定义的字段**。
5. **字符串字段必须正确转义引号**（`"` → `\"`）。
6. **数组字段即使为空，也必须输出 `[]`**，不允许省略。
7. **对象字段即使为空，也必须输出 `{}`**，不允许省略。
8. **不要输出尾随逗号**（`{"a":1,}` 是非法 JSON）。
9. **第一个字符必须是 `{`，最后一个字符必须是 `}`**。
10. **如果输出超长被截断，会导致 JSON 不完整。请控制输出长度在 maxTokens 内**。

---

## 输出 Schema

```
{{> schema/<agent-kind>}}
```

> 上述占位符在编译时被替换为对应 Agent 的 Zod Schema 的 JSON Schema 表示。
> 例如 Concept Agent 会看到：
>
> ```json
> {
>   "type": "object",
>   "properties": {
>     "concepts": {
>       "type": "array",
>       "minItems": 2,
>       "maxItems": 5,
>       "items": { ... }
>     }
>   },
>   "required": ["concepts"]
> }
> ```

---

## 反例（绝对禁止）

```
以下是非法输出：

1. 带解释：
   "好的，我帮你提取概念：\n{\"concepts\":[...]}"

2. 带 markdown 包裹：
   ```json
   {"concepts":[...]}
   ```

3. 字段缺失：
   {"concepts":[{"name":"X"}]}    // 缺 definition / type / keyPoints / parentChunkId

4. 字段超长：
   {"concepts":[{"definition":"这是一个非常非常非常非常非常非常非常非常长的定义..."}]}  // 超过 30 字

5. 尾随逗号：
   {"concepts":[{...},{...},]}

6. 错误类型：
   {"concepts":"X"}  // 应为数组
```

---

## 正例（唯一允许的格式）

```
{"concepts":[{"id":"c1","name":"检索","definition":"从大量数据中找到相关信息的过程","type":"procedure","keyPoints":["基于查询","返回相关文档"],"parentChunkId":"chunk-1"}]}
```

---

## 失败重试机制

如果你的输出未通过 Schema 校验，系统会：
1. 把校验错误信息追加到对话中
2. 给你**一次**重新输出的机会
3. 你必须**严格按照错误提示修正**

如果第二次仍失败，整个流程会中断，用户会看到错误提示。

**所以请第一次就输出符合 Schema 的合法 JSON。**
