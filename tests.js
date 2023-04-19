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

