# iLink Bot API 协议文档

## 1. 概述

基础域名： `https://ilinkai.weixin.qq.com`

协议：HTTP / JSON

鉴权方式：Bearer Token（bot\_token）

无需 SDK，可直接使用 fetch / axios 等 HTTP 客户端调用

## 2. 通用请求头

所有请求（除登录流程外）需携带以下 HTTP Header：

```json
{
  "Content-Type": "application/json",
  "AuthorizationType": "ilink_bot_token",
  "X-WECHAT-UIN": "<base64(random_uint32)>",
  "Authorization": "Bearer <bot_token>"
}
```

### X-WECHAT-UIN 生成规则

```javascript
const randomUint32 = () => Math.floor(Math.random() * 4294967295); // 0 ~ 2^32-1
const uinBase64 = Buffer.from(String(randomUint32())).toString("base64");
```

> ⚠️ 每次请求必须生成新的随机值，用于防重放攻击。

## 3. 鉴权流程

### 3.1 获取登录二维码

Endpoint：`GET /ilink/bot/get_bot_qrcode`

#### 请求参数

| 参数        | 类型      | 必填 | 说明             |
| :-------- | :------ | :- | :------------- |
| bot\_type | integer | 是  | Bot 类型，固定传 `3` |

#### 返回参数

| 字段     | 类型      | 说明                  |
| :----- | :------ | :------------------ |
| ret    | integer | 返回码，0 表示成功          |
| qrcode | string  | 二维码图片的 Base64 编码字符串 |
| url    | string  | 二维码对应的 weixin 协议链接  |

#### 响应示例

```json
{
  "qrcode": "base64...",
  "url": "weixin://...",
  "ret": 0
}
```

### 3.2 轮询扫码状态

Endpoint：`GET /ilink/bot/get_qrcode_status`

#### 请求参数

| 参数     | 类型     | 必填 | 说明                                              |
| :----- | :----- | :- | :---------------------------------------------- |
| qrcode | string | 是  | 上一步获取的二维码标识（即 `get_bot_qrcode` 返回的 `qrcode` 字段） |

#### 返回参数

| 字段         | 类型      | 说明                                                                     |
| :--------- | :------ | :--------------------------------------------------------------------- |
| ret        | integer | 返回码，0 表示成功                                                             |
| status     | string  | 扫码状态：`pending`（等待扫码）、`scanned`（已扫码待确认）、`confirmed`（已确认）、`expired`（已过期） |
| bot\_token | string  | 当 status 为 `confirmed` 时返回，后续所有 API 请求鉴权所需的 Token                      |
| baseurl    | string  | 当 status 为 `confirmed` 时返回，后续请求的基础域名                                   |

#### 响应示例（已确认）

```json
{
  "status": "confirmed",
  "bot_token": "xxx",
  "baseurl": "https://...",
  "ret": 0
}
```

状态未确认时，需持续长轮询（建议间隔 1\~2 秒）。

## 4. API 列表

| Endpoint                       | Method | 功能                |
| :----------------------------- | :----- | :---------------- |
| /ilink/bot/get\_bot\_qrcode    | GET    | 获取登录二维码           |
| /ilink/bot/get\_qrcode\_status | GET    | 轮询扫码状态            |
| /ilink/bot/getupdates          | POST   | 长轮询接收消息           |
| /ilink/bot/sendmessage         | POST   | 发送消息（文本/图片等）      |
| /ilink/bot/getuploadurl        | POST   | 获取 CDN 预签名上传地址    |
| /ilink/bot/getconfig           | POST   | 获取 typing\_ticket |
| /ilink/bot/sendtyping          | POST   | 发送"正在输入"状态        |

CDN 域名： `https://novac2c.cdn.weixin.qq.com/c2c`

## 5. 消息收取（长轮询）

与 Telegram Bot API 的 getUpdates 机制一致。

### 请求

```json
POST /ilink/bot/getupdates
{
  "get_updates_buf": "<上次返回的游标，首次为空字符串>",
  "base_info": {
    "channel_version": "1.0.2"
  }
}
```

#### 请求参数

| 字段                          | 类型     | 必填 | 说明                                               |
| :-------------------------- | :----- | :- | :----------------------------------------------- |
| get\_updates\_buf           | string | 是  | 消息游标。首次请求传空字符串 `""`，后续请求传入上次响应返回的新游标。用于防止消息重复接收。 |
| base\_info                  | object | 是  | 基础信息                                             |
| base\_info.channel\_version | string | 是  | 客户端版本号，当前固定传 `"1.0.2"`                           |

### 响应

```json
{
  "ret": 0,
  "msgs": [ "...WeixinMessage[]" ],
  "get_updates_buf": "<新游标，下次请求带上>",
  "longpolling_timeout_ms": 35000
}
```

#### 返回参数

| 字段                       | 类型      | 说明                                            |
| :----------------------- | :------ | :-------------------------------------------- |
| ret                      | integer | 返回码，0 表示成功                                    |
| msgs                     | array   | 新消息列表，数组元素为 `WeixinMessage` 对象。无新消息时为空数组 `[]` |
| get\_updates\_buf        | string  | 新的消息游标。**必须持久化保存**，下次请求时作为参数传入                |
| longpolling\_timeout\_ms | integer | 长轮询超时时间（毫秒）。连接最多保持此时间，有新消息时立即返回               |

连接最多保持 35 秒，有新消息立即返回。

### 游标机制

`get_updates_buf` 类似数据库游标，必须每次更新。

不更新会导致重复接收消息。

## 6. 消息结构（WeixinMessage）

```json
{
  "from_user_id": "o9cq800kum_xxx@im.wechat",
  "to_user_id": "e06c1ceea05e@im.bot",
  "message_type": 1,
  "message_state": 2,
  "context_token": "AARzJWAFAAABAAAAAAAp...",
  "item_list": [
    {
      "type": 1,
      "text_item": { "text": "你好" }
    }
  ]
}
```

#### 字段说明

| 字段             | 类型      | 说明                         |
| :------------- | :------ | :------------------------- |
| from\_user\_id | string  | 发送者 ID                     |
| to\_user\_id   | string  | 接收者 ID（Bot 自身 ID）          |
| message\_type  | integer | 消息类型（具体枚举值参考微信文档）          |
| message\_state | integer | 消息状态（参见下方消息状态表）            |
| context\_token | string  | 对话上下文令牌，回复时必须原样携带此值        |
| item\_list     | array   | 消息内容列表，一条消息可包含多个元素（如文本+图片） |

#### item\_list 元素结构

| 字段          | 类型      | 说明                       |
| :---------- | :------ | :----------------------- |
| type        | integer | 元素类型（参见下方消息类型表）          |
| text\_item  | object  | 当 type=1 时存在，包含文本内容      |
| image\_item | object  | 当 type=2 时存在，包含图片 CDN 信息 |
| voice\_item | object  | 当 type=3 时存在，包含语音 CDN 信息 |
| file\_item  | object  | 当 type=4 时存在，包含文件 CDN 信息 |
| video\_item | object  | 当 type=5 时存在，包含视频 CDN 信息 |

### ID 格式

| 类型  | 格式              |
| :-- | :-------------- |
| 用户  | `xxx@im.wechat` |
| Bot | `xxx@im.bot`    |

### 消息状态（message\_state）

| 值  | 含义           |
| :- | :----------- |
| 2  | 完整消息（FINISH） |

## 7. 消息类型（item\_list\[].type）

| type | 说明                  |
| :--- | :------------------ |
| 1    | 文本                  |
| 2    | 图片（CDN 加密存储）        |
| 3    | 语音（silk 编码，可能附带转文字） |
| 4    | 文件附件                |
| 5    | 视频                  |

## 8. context\_token（对话关联核心）

每条收到的消息都包含 `context_token`。

> ⚠️ 回复时必须原样携带该 token，否则消息无法关联到正确对话窗口。

### 发送消息

Endpoint：`POST /ilink/bot/sendmessage`

#### 请求参数

| 字段                                | 类型      | 必填 | 说明                                   |
| :-------------------------------- | :------ | :- | :----------------------------------- |
| msg                               | object  | 是  | 待发送的消息体                              |
| msg.to\_user\_id                  | string  | 是  | 目标用户 ID                              |
| msg.message\_type                 | integer | 是  | 消息类型                                 |
| msg.message\_state                | integer | 是  | 消息状态，完整消息固定传 `2`                     |
| msg.context\_token                | string  | 是  | 对话上下文令牌，**必须从上一条收到的消息中原样获取**         |
| msg.item\_list                    | array   | 是  | 消息内容列表，结构与接收消息一致                     |
| msg.item\_list\[].type            | integer | 是  | 元素类型（1=文本, 2=图片等）                    |
| msg.item\_list\[].text\_item      | object  | 否  | 当 type=1 时必填                         |
| msg.item\_list\[].text\_item.text | string  | 是  | 文本内容                                 |
| msg.item\_list\[].image\_item     | object  | 否  | 当 type=2 时必填，携带 CDN 引用及解密密钥（参见第 9 节） |

#### 返回参数

| 字段      | 类型      | 说明          |
| :------ | :------ | :---------- |
| ret     | integer | 返回码，0 表示成功  |
| msg\_id | string  | 已发送消息的唯一标识符 |

#### 发送消息示例

```json
POST /ilink/bot/sendmessage
{
  "msg": {
    "to_user_id": "o9cq800kum_xxx@im.wechat",
    "message_type": 2,
    "message_state": 2,
    "context_token": "<从收到的消息中取出>",
    "item_list": [
      { "type": 1, "text_item": { "text": "你好！" } }
    ]
  }
}
```

## 9. 媒体文件处理（AES-128-ECB）

> ⚠️ 所有 CDN 上的媒体文件均使用 AES-128-ECB 加密。

### 获取 CDN 预签名上传地址

Endpoint：`POST /ilink/bot/getuploadurl`

#### 请求参数

| 字段         | 类型      | 必填 | 说明                           |
| :--------- | :------ | :- | :--------------------------- |
| file\_name | string  | 是  | 文件名（含扩展名，如 `image.jpg`）      |
| file\_size | integer | 是  | 加密后的文件大小（字节）                 |
| file\_type | integer | 是  | 文件类型（1=图片, 3=语音, 4=文件, 5=视频） |
| md5        | string  | 是  | 加密后文件的 MD5 哈希值（十六进制字符串）      |

#### 返回参数

| 字段          | 类型      | 说明                                  |
| :---------- | :------ | :---------------------------------- |
| ret         | integer | 返回码，0 表示成功                          |
| upload\_url | string  | CDN 预签名上传地址，后续使用 PUT 方法上传加密文件       |
| file\_id    | string  | CDN 文件唯一标识，用于在 `sendmessage` 中引用该文件 |

### 发送"正在输入"状态

Endpoint：`POST /ilink/bot/sendtyping`

#### 请求参数

| 字段             | 类型     | 必填 | 说明                              |
| :------------- | :----- | :- | :------------------------------ |
| ilink\_user\_id | string | 是  | 目标用户 ID                         |
| typing\_ticket | string | 是  | 通过 `getconfig` 接口获取的凭证，用于发送状态授权 |
| status         | string | 是  | 输入状态，固定传 `"Typing"`            |

#### 返回参数

| 字段  | 类型      | 说明         |
| :-- | :------ | :--------- |
| ret | integer | 返回码，0 表示成功 |

### 获取 typing\_ticket

Endpoint：`POST /ilink/bot/getconfig`

#### 请求参数

无特殊业务参数（可能需传空 JSON 对象 `{}`）。

#### 返回参数

| 字段             | 类型      | 说明              |
| :------------- | :------ | :-------------- |
| ret            | integer | 返回码，0 表示成功      |
| typing\_ticket | string  | 用于发送"正在输入"状态的凭证 |

### 发送图片完整流程

1. 生成随机 AES-128 Key
2. 使用 AES-128-ECB 加密文件内容
3. 计算加密后文件的 MD5
4. 调用 `getuploadurl` 获取预签名 URL
5. 使用 PUT 上传加密文件到 CDN
6. 在 `sendmessage` 中携带 `aes_key`（base64）和 CDN 引用

### 加密示例（Node.js）

```javascript
const crypto = require("crypto");

const encryptAesEcb = (buffer, key) => {
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(buffer), cipher.final()]);
};
```

### 解密示例（Node.js）

```javascript
const decryptAesEcb = (buffer, key) => {
  const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(buffer), decipher.final()]);
};
```

## 10. 错误与状态码

| ret | 含义              |
| :-- | :-------------- |
| 0   | 成功              |
| 非0  | 失败（具体错误需参考微信文档） |

## 11. 注意事项总结

1. `X-WECHAT-UIN` 每次请求必须不同
2. `context_token` 必须原样回传
3. `get_updates_buf` 必须持久化并更新
4. 媒体文件必须 AES-128-ECB 加密
5. 长轮询超时时间建议 35 秒

