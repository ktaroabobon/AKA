const testMessage = {
  "destination": "xxxxxxxxxx",
  "events": [
    {
      "replyToken": "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
      "type": "message",
      "mode": "active",
      "timestamp": 1462629479859,
      "source": {
        "type": "group",
        "groupId": "Ca56f94637c...",
        "userId": "U4af4980629..."
      },
      "webhookEventId": "01FZ74A0TDDPYRVKNK77XKC3ZR",
      "deliveryContext": {
        "isRedelivery": false
      },
      "message": {
        "id": "444573844083572737",
        "type": "text",
        "text": "お昼ご飯",
        "emojis": [
          {
            "index": 29,
            "length": 6,
            "productId": "5ac1bfd5040ab15980c9b435",
            "emojiId": "001"
          }
        ],
        "mention": {
          "mentionees": [
            {
              "index": 0,
              "length": 4,
              "type": "all"
            },
            {
              "index": 5,
              "length": 8,
              "userId": BOTID,
              "type": "user"
            }
          ]
        }
      }
    }
  ]
};

// 組み込み
function testGetProperty() {
  console.log(PropertiesService.getScriptProperties().getProperty("CHANNEL_ACCESS_TOKEN"))
}

// aka.gs
function testRandomMessage() {
  const message = AKA.sayRandom()
  console.log(message)
}

function testSayHello() {
  const message = AKA.sayHello()
  console.log(message)
}

function testSayGreetings() {
  const message = AKA.sayGreetings()
  console.log(message)
}

// lineMessageApi.gs
function testLunchReply() {
  const event = JSON.stringify(testMessage);
  console.log(event);
  const message = doPost({postData: {contents: event}}, true);
  console.log(message);
}