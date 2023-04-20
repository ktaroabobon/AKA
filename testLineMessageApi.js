// lineMessageApi.gsのテスト

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


function testLunchReply() {
  const event = JSON.stringify(testMessage);
  console.log(event);
  const message = doPost({postData: {contents: event}}, true);
  console.log(message);
}

function testIsBotMentioned() {
  // Test Case 1: Group chat with a mention
  const testEvent1 = {
    message: {
      mention: {
        mentionees: [
          {
            type: 'user',
            userId: BOTID,
          },
        ],
      },
      text: 'あか、おはようございます。',
    },
    source: {
      type: 'group',
    },
  };
  const result1 = isBotMentioned(testEvent1);
  if (result1.isBotMentioned && result1.userMessage === 'おはようございます。') {
    console.log('Test Case 1: Passed');
  } else {
    console.log('Test Case 1: Failed');
  }

  // Test Case 2: Group chat without a mention
  const testEvent2 = {
    message: {
      text: 'おはようございます',
    },
    source: {
      type: 'group',
    },
  };
  const result2 = isBotMentioned(testEvent2);
  if (!result2.isBotMentioned && result2.userMessage === 'おはようございます') {
    console.log('Test Case 2: Passed');
  } else {
    console.log('Test Case 2: Failed');
  }

  // Test Case 3: Private chat without a mention
  const testEvent3 = {
    message: {
      text: 'おはようございます',
    },
    source: {
      type: 'user',
    },
  };
  const result3 = isBotMentioned(testEvent3);
  if (result3.isBotMentioned && result3.userMessage === 'おはようございます') {
    console.log('Test Case 3: Passed');
  } else {
    console.log('Test Case 3: Failed');
  }

  // Test Case 4: Message starts with a mention phrase
  const testEvent4 = {
    message: {
      text: 'あか、おはよう',
    },
    source: {
      type: 'group',
    },
  };
  const result4 = isBotMentioned(testEvent4);
  if (result4.isBotMentioned && result4.userMessage === 'おはよう') {
    console.log('Test Case 4: Passed');
  } else {
    console.log('Test Case 4: Failed');
  }

  // Test Case 4: Message starts with two mention phrases
  const testEvent5 = {
    message: {
      text: 'あか、あか、おはよう',
    },
    source: {
      type: 'group',
    },
  };
  const result5 = isBotMentioned(testEvent5);
  if (result5.isBotMentioned && result5.userMessage === 'あか、おはよう') {
    console.log('Test Case 5: Passed');
  } else {
    console.log('Test Case 5: Failed');
  }
}
