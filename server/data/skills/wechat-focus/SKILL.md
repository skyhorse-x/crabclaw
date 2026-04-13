# 微信置顶联系人发送

示例技能: 打开微信，点到置顶会话，粘贴一段预设文本。

## Metadata
- id: wechat-focus
- category: browser
- tags: 微信, 聊天
- triggerPhrases: 打开微信, 发微信消息
- delayMs: 600

## Skill JSON

```json
{
  "id": "wechat-focus",
  "name": "微信置顶联系人发送",
  "category": "browser",
  "description": "示例技能: 打开微信，点到置顶会话，粘贴一段预设文本。",
  "tags": [
    "微信",
    "聊天"
  ],
  "triggerPhrases": [
    "打开微信",
    "发微信消息"
  ],
  "delayMs": 600,
  "steps": [
    {
      "type": "openApp",
      "label": "打开微信",
      "target": "",
      "text": "",
      "app": "WeChat",
      "url": "",
      "key": "",
      "note": ""
    },
    {
      "type": "wait",
      "label": "等待微信前台",
      "target": "",
      "text": "",
      "app": "",
      "url": "",
      "key": "",
      "ms": 1500,
      "note": ""
    },
    {
      "type": "click",
      "label": "点击会话列表第一项",
      "target": "会话列表第一项",
      "x": 212,
      "y": 156,
      "text": "",
      "app": "",
      "url": "",
      "key": "",
      "note": ""
    },
    {
      "type": "paste",
      "label": "粘贴消息",
      "target": "",
      "text": "这是一条可在配置里修改的自动消息。",
      "app": "",
      "url": "",
      "key": "",
      "note": ""
    },
    {
      "type": "key",
      "label": "发送消息",
      "target": "",
      "text": "",
      "app": "",
      "url": "",
      "key": "enter",
      "note": ""
    }
  ],
  "skillFile": "C:\\Users\\admin.DESKTOP-2EJU89O\\Desktop\\开发项目\\desktop-agent\\data\\skills\\wechat-focus.skill.json"
}
```
