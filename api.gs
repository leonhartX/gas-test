function run_test() {
  Logger.clear();
  var param = ["0","测试", "99e"];
  Logger.log(addOutgo(param));
}

function doGet(e) {
  handleSlackMessage(e.parameter);
}

function doPost(e) {
  handleSlackMessage(e.parameter);
}

/*
 * handle message from slack
 * fomart:
 * [?] show help
 * [-] delete bill
 * [+] add bill
 */
function handleSlackMessage(param) {
  var prop = PropertiesService.getScriptProperties().getProperties();
  if (prop.verify_token != param.token) {
    return null;
  }
  if (param.user_name != "leonhart" && param.user_name != "eruxi") {
    return null;
  }
  var slackApp = SlackApp.create(prop.api_token);
  var message = "";

  var content = param.text.split(/[\s]/);
  switch(content[0]) {
    case "?":
    case "？":
      message = getHelp();
      break;
    case "-":
    case "－":
      content.shift();
      message = deleteOutgo(content);
      break;
    case "+":
    case "＋":
      content.shift();
      message = addIncome(content);
      break;
    default:
      message = addOutgo(content);
  }
  if (message == null) {
    return null;
  }
  slackApp.postMessage(prop.channel_id, message,{
    username : "记账小能手",
    icon_emoji : ":moneybag:",
    attachments    : [{"pretext": "pre-hello", "text": "text-world"}]
  });
}

/*
 * show slack message usage
 */
function getHelp() {
  return "usage:\r\n" +
         "`?` : 显示帮助\r\n" +
         "`type description amount[unit] [date]` : 添加新消费记录\r\n" +
         "`- type descripition amount[unit] [date]` : 删除消费记录\r\n" +
         "    `type` : 0:食物, 1:生活, 2:交通, 3:娱乐, 4:服饰美容美发, 5:娱乐, 6:房贷, 7:代购,8:请客送礼, 9:信用卡账单, 10:投资\r\n"　+
         "    `unit` : c:信用卡, e:电子货币\r\n" +
         "`+ type descripition amount [date]` : 添加收入记录\r\n" +
         "    `type` : 0:工资, 1:奖金, 2:利息, 3:报销, 4:借款, 5:国内资产转移, 6：投资收入， 7:其他";
}

/*
 * add a new bill to book
 */
function addOutgo(param) {
  var data = checkRecordData(param, 0);
  if (data == null) {
    return null;
  }
  var date = data.shift();
  var range = getInsertRange(date.toLocaleDateString());
  range.setValues([data]);
  return "记账成功:\r\n日期： `" + date.toLocaleDateString() + "` ,  种类： `" + data[0] + "` ,  内容： `" + data[4] + "` ,  消费金额： `" + data[1] + " `";
}

/*
 * add income
 */
function addIncome(param) {
  var data = checkRecordData(param, 1);
  if (data == null) {
    return null;
  }
  var date = data.shift();
  var range = getInsertRange(date.toLocaleDateString());
  range.setValues([data]);
  return "记账成功:\r\n日期： `" + date.toLocaleDateString() + "` ,  种类： `" + data[2] + "` ,  内容： `" + data[4] + "` ,  收入金额： `" + data[3] + " `";
}

/*
 * delete a exist bill, if not exist, return error message to slack
 */
function deleteOutgo(param) {
  var data = checkRecordData(param, 0);
  if (data == null) {
    return null;
  }
  var date = data.shift();
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("ssid"));
  var sheet = searchSheet(date.toLocaleDateString(), ss);
  var dates = sheet.getSheetValues(3, 2, sheet.getLastRow(), 1);
  var endP = sheet.getLastRow();
  for(var i = dates.length - 1; i > 0; i--) {
    if(dates[i][0].length == 0) {
      continue;
    }
    var row_date = new Date(dates[i]);
    if (row_date.getTime() < date.getTime()) {
      return "删除失败: 没有该条记录";
    } else if (row_date.getTime() == date.getTime()) {
      break;
    } else {
      endP = i + 2;
    }
  }
  var startP = i + 3;

  var compareData = sheet.getSheetValues(startP, 2, endP - startP + 1, 7);
  var found = false;
  for(i = compareData.length - 1; i >= 0; i--) {
    if (compareData[i][1] == data[0] &&
        compareData[i][2] == data[1] &&
        compareData[i][5] == data[4] &&
        compareData[i][6] == data[5]) {
      found = true;
      break;
    }
  }
  if (!found) {
    return "删除失败: 没有该条记录";
  }

  if ((i == 0) && (endP > startP)) {
    sheet.getRange(startP + 1, 2).setValue(date);
  }
  sheet.deleteRow(startP + i);
  if (startP + i > 4 && startP + i <= sheet.getLastRow()) {
    sheet.getRange(startP + i - 1 ,10).copyTo(sheet.getRange(startP + i, 10));
  }
  return "删除成功:\r\n日期： `" + date.toLocaleDateString() + "` ,  种类： `" + data[0] + "` ,  内容： `" + data[4] + "` ,  金额： `" + data[1] + "`";

}

/*
 * check the message text form slack and format to bill data
 */
function checkRecordData(param, type)  {
  var outgoCategory = ["食物","生活","交通","娱乐","服饰美容美发","娱乐","房贷","代购","请客送礼","信用卡账单","投资"];
  var incomeCategory = ["工资", "奖金", "利息", "报销", "借款", "国内资产转移", "投资收入", "其他"];
  var category = type == 0 ? outgoCategory : incomeCategory;
  var amount;
  var payment;
  Logger.log(param);
  if (param.length < 3 || isNaN(param[0]) || parseInt(param[0]) > category.length) {
    return null;
  }
  if (!isNaN(param[2])){
    amount = param[2];
    payment = "现金";
  } else {
    amount = param[2].slice(0,-1);
    payment = param[2].slice(-1);
    if (isNaN(amount) || (payment !== 'e' && payment != 'c')) {
      return null;
    }
    payment = payment == 'c' ? "信用卡" : "电子货币"
  }
  var date = null;
  if (param.length > 3) {
    date = new Date(param[3]);
    Logger.log(date);
    if (date.toString() === "Invalid Date") {
      date = new Date(new Date().getFullYear() + "/" + param[3]);
    }
  } else {
    date = new Date(new Date().toLocaleDateString());
  }
  if (date.toString() === "Invalid Date") {
    Logger.log("Invalid Date");
    return null;
  }
  if(type == 0) {
    return [date, category[parseInt(param[0])], amount, "", "", param[1], payment, ""];
  } else {
    return [date, "", "", category[parseInt(param[0])], amount, param[1], "", ""];
  }
}


/*
 * search the sheet to operate, or create a new one
 * [INPUT]date: the localeDateString of Date object
 */
function searchSheet(dateString, spreadsheet) {
  var targetSheet = spreadsheet.getSheetByName(dateString.substr(0,7));
  if (targetSheet == null) {
    var templateSheet = spreadsheet.getSheetByName("base");
    targetSheet = spreadsheet.insertSheet(dateString.substr(0,7), 0, {template: templateSheet});
  }
  return targetSheet;
}

/*
 * get the sheet and cerate a new row for insert
 * [INPUT]dataString: the localeDateString of Date object
 */
function getInsertRange(dateString) {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("ssid"));
  var date = new Date(dateString);
  var sheet = searchSheet(dateString, ss);
  var dates = sheet.getSheetValues(3, 2, sheet.getLastRow(), 1);
  var insertPosition = sheet.getLastRow() + 1;
  var hasDate = false;
  for(var i = dates.length - 1; i >= 0; i--) {
    if(dates[i][0].length == 0) {
      continue;
    }
    var row_date = new Date(dates[i]);
    if (row_date.getTime() < date.getTime()) {
      break;
    } else if (row_date.getTime() == date.getTime()) {
      hasDate = true;
      break;
    } else {
      insertPosition = i + 3;
    }
  }
  sheet.insertRowBefore(insertPosition);
  if (!hasDate) {
     sheet.getRange(insertPosition, 2).setValue(date);
  }
  sheet.getRange(insertPosition - 1 ,10).copyTo(sheet.getRange(insertPosition, 10));
  if (sheet.getRange(insertPosition + 1 ,10).getValue() != "") {
    sheet.getRange(insertPosition, 10).copyTo(sheet.getRange(insertPosition + 1, 10));
  }
  return sheet.getRange(insertPosition, 3, 1, 7);
}

/*
 * check email from rakuten and epos, add to book
 * after add bill,add "processed" lable to the mail;
 */
function handleCreditMail() {
  var prop = PropertiesService.getScriptProperties().getProperties();
  var slackApp = SlackApp.create(prop.api_token);
  var credits = ['楽天','EPOS','Amazon'];
  var searchs = [PropertiesService.getScriptProperties().getProperty("rakuten_search"), PropertiesService.getScriptProperties().getProperty("epos_search"), PropertiesService.getScriptProperties().getProperty("amazon_search")];
  var keywords = [["■利用日: ","■利用金額: ","■利用先: "],["ご利用日時：","ご利用金額：","ご利用場所："], ["注文日： ","注文合計： ￥ "]];
  var label = GmailApp.getUserLabelByName("processed");
  var data = [];
  var str = "";
  var index = 0;
  var maxIndex = 0;
  Logger.clear();
  for (var credit = 0; credit < searchs.length; credit++) {
    var search = searchs[credit];
    var keyword = keywords[credit];
    var threads = GmailApp.search(search);
    for (var i = 0; i < threads.length; i++) {
      var messages = threads[i].getMessages();
      for (var j = 0; j < messages.length; j++) {
        var message = messages[j];
        var content = message.getPlainBody();
        Logger.log(content);
        while (content.indexOf(keyword[0]) > 0) {
          data = [credits[credit]];
          for (var k = 0; k < keyword.length; k++) {
            index = content.indexOf(keyword[k]);
            maxIndex = Math.max(index, maxIndex);
            str = content.substring(index + keyword[k].length, content.indexOf("\n", index));
            Logger.log(str);
            data.push(str);
          }
          if(credit === 2) {
            data.push(message.getSubject().replace(/.*「(.*)」.*/,"\$1"));
          }
          addCreditRecord(data, slackApp, prop.channel_id);
          content = content.substring(content.indexOf("\n", maxIndex) + 1);
          Logger.log(content);
        }
      }
      threads[i].addLabel(label);
    }
  }
}

/*
 * add a credit bill to sheet
 */
function addCreditRecord(data, slackApp, channel_id) {
  var date = data[1].replace(/[年月]/g,'/').replace(/日.*/,'').replace(/\r/,'');
  var amount = data[2].replace(/[円]/,'').replace(/\r/,'').replace(",","");
  var range = getInsertRange(date);
  var insertData = ["", amount , "", "", data[3], "信用卡", data[0]];
  range.setValues([insertData]);
  var message = "信用卡账单追加：\r\n日期： `" + date + "` , 信用卡: `" + data[0] + "` , 内容： `" + data[3].replace(/\r/,'') + "` , 金额： `" + amount + "`";
  slackApp.postMessage(channel_id, message, {
    username : "记账小能手",
    icon_emoji : ":moneybag:",
  });
}

