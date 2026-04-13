# 小红书扫码登录

打开小红书并执行一套可编辑的扫码登录动作。坐标需要按你的屏幕自行校准。

## Metadata
- id: xiaohongshu-login
- category: browser
- tags: 小红书, 扫码, 登录
- triggerPhrases: 打开小红书, 小红书扫码, 小红书登录
- delayMs: 800

## Skill JSON

```json
{
  "id": "xiaohongshu-login",
  "name": "小红书扫码登录",
  "category": "browser",
  "description": "打开小红书并执行一套可编辑的扫码登录动作。坐标需要按你的屏幕自行校准。",
  "tags": [
    "小红书",
    "扫码",
    "登录"
  ],
  "triggerPhrases": [
    "打开小红书",
    "小红书扫码",
    "小红书登录"
  ],
  "delayMs": 800,
  "steps": [
    {
      "type": "openUrl",
      "label": "打开小红书首页",
      "target": "",
      "text": "",
      "app": "",
      "url": "https://www.xiaohongshu.com",
      "key": "",
      "note": ""
    },
    {
      "type": "wait",
      "label": "等待首页加载",
      "target": "",
      "text": "",
      "app": "",
      "url": "",
      "key": "",
      "ms": 3000,
      "note": ""
    },
    {
      "type": "click",
      "label": "点击右上角登录按钮",
      "target": "右上角登录按钮",
      "x": 1218,
      "y": 122,
      "text": "",
      "app": "",
      "url": "",
      "key": "",
      "note": ""
    },
    {
      "type": "wait",
      "label": "等待登录弹层",
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
      "label": "切换到扫码登录",
      "target": "扫码登录标签",
      "x": 982,
      "y": 616,
      "text": "",
      "app": "",
      "url": "",
      "key": "",
      "note": ""
    },
    {
      "type": "note",
      "label": "人工扫码",
      "target": "",
      "text": "",
      "app": "",
      "url": "",
      "key": "",
      "note": "请使用手机小红书扫码。扫码完成后，如果页面有下一步按钮，继续配置下面的坐标。"
    },
    {
      "type": "click",
      "label": "扫码后确认继续",
      "target": "扫码后继续按钮",
      "x": 1006,
      "y": 735,
      "text": "",
      "app": "",
      "url": "",
      "key": "",
      "note": ""
    }
  ],
  "skillFile": "C:\\Users\\admin.DESKTOP-2EJU89O\\Desktop\\开发项目\\desktop-agent\\data\\skills\\xiaohongshu-login.skill.json"
}
```
